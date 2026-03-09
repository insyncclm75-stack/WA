import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getExotelCreds } from "../_shared/get-exotel-creds.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Accept service role key via Authorization header OR internal call
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token && token !== supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversation_id, org_id } = await req.json();
    if (!conversation_id || !org_id) {
      return new Response(
        JSON.stringify({ error: "conversation_id and org_id required" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Load conversation with contact info
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, contacts(id, phone_number, name)")
      .eq("id", conversation_id)
      .single();

    if (convError || !conversation) {
      console.error("Conversation not found:", convError);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Load org's ai_config
    const { data: aiConfig, error: aiConfigError } = await supabase
      .from("ai_config")
      .select("system_prompt, knowledge_base, enabled, model, max_history")
      .eq("org_id", org_id)
      .maybeSingle();

    if (aiConfigError) {
      console.error("Error loading ai_config:", aiConfigError);
      return new Response(
        JSON.stringify({ error: "Failed to load AI config" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. If AI not enabled, return early
    if (!aiConfig?.enabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "ai_not_enabled" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Check the 24-hour free reply window
    const lastInbound = conversation.last_inbound_at
      ? new Date(conversation.last_inbound_at)
      : null;
    const now = new Date();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    if (!lastInbound || now.getTime() - lastInbound.getTime() > twentyFourHoursMs) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "window_expired" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Load last N messages for this conversation
    const maxHistory = aiConfig.max_history || 20;
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("direction, content, message_type, interactive_data")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(maxHistory);

    if (msgError) {
      console.error("Error loading messages:", msgError);
      return new Response(
        JSON.stringify({ error: "Failed to load messages" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 6. Build Claude API messages array
    const systemParts: string[] = [];
    if (aiConfig.system_prompt) systemParts.push(aiConfig.system_prompt);
    if (aiConfig.knowledge_base) systemParts.push(aiConfig.knowledge_base);
    const systemPrompt = systemParts.join("\n\n");

    const claudeMessages = (messages || [])
      .filter((m: any) => m.content)
      .map((m: any) => {
        let msgContent = m.content;
        if (m.message_type === "button_response" && m.interactive_data) {
          msgContent = `[User clicked button: "${m.interactive_data.button_text}"] ${m.content || ""}`;
        } else if (m.message_type === "list_response" && m.interactive_data) {
          msgContent = `[User selected from list: "${m.interactive_data.list_item_title}"] ${m.content || ""}`;
        }
        return {
          role: m.direction === "inbound" ? "user" : "assistant",
          content: msgContent,
        };
      });

    if (claudeMessages.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_messages" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 7. Call Claude API
    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: aiConfig.model || "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: systemPrompt,
          messages: claudeMessages,
        }),
      }
    );

    const result = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      console.error("Claude API error:", JSON.stringify(result));
      return new Response(
        JSON.stringify({ error: "AI generation failed", details: result }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 8. Extract reply text
    const replyText = result.content[0].text;

    // 9. Send reply via Exotel WhatsApp API
    const creds = await getExotelCreds(supabase, org_id);
    const exotelUrl = `https://${creds.apiKey}:${creds.apiToken}@${creds.subdomain}/v2/accounts/${creds.accountSid}/messages`;

    const phoneNumber = conversation.contacts?.phone_number || conversation.phone_number;

    const exotelPayload = {
      whatsapp: {
        messages: [
          {
            from: creds.senderNumber,
            to: phoneNumber,
            content: {
              recipient_type: "individual",
              type: "text",
              text: { preview_url: false, body: replyText },
            },
          },
        ],
      },
    };

    const exotelResponse = await fetch(exotelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exotelPayload),
    });

    const exotelResult = await exotelResponse.json();
    const exotelMsg = exotelResult?.response?.whatsapp?.messages?.[0];
    const sendOk = exotelResponse.ok && exotelMsg?.status === "success";
    const exotelMessageId = exotelMsg?.data?.sid || null;

    // 10. Insert the outbound message into messages
    await supabase.from("messages").insert({
      direction: "outbound",
      campaign_id: null,
      contact_id: conversation.contact_id,
      conversation_id,
      org_id,
      content: replyText,
      status: sendOk ? "sent" : "failed",
      sent_at: sendOk ? new Date().toISOString() : null,
      exotel_message_id: exotelMessageId,
    });

    // 11. Update conversation: last_message_at, last_message_preview
    const preview =
      replyText.length > 100 ? replyText.substring(0, 100) : replyText;

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
      })
      .eq("id", conversation_id);

    // 12. NO wallet debit - AI replies are free, cost absorbed by platform

    // 13. Return success
    return new Response(
      JSON.stringify({
        success: true,
        reply: replyText,
        status: sendOk ? "sent" : "failed",
        exotel_message_id: exotelMessageId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("ai-reply error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
