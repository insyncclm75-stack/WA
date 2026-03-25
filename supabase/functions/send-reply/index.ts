import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getExotelCreds } from "../_shared/get-exotel-creds.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, content, media_url, message_type, interactive_data } = await req.json();
    if (!conversation_id || (!content && message_type !== "interactive_buttons" && message_type !== "interactive_list")) {
      return new Response(JSON.stringify({ error: "conversation_id and content are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load conversation with contact join
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .eq("id", conversation_id)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is a member of the conversation's org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("org_id", conversation.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check 24-hour free reply window
    const lastInbound = conversation.last_inbound_at
      ? new Date(conversation.last_inbound_at).getTime()
      : 0;
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (!conversation.last_inbound_at || now - lastInbound > twentyFourHours) {
      return new Response(
        JSON.stringify({
          error: "Reply window expired. The 24-hour free reply window has closed. Use a template message instead.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send message via Exotel WhatsApp API
    const creds = await getExotelCreds(supabase, conversation.org_id);
    const exotelUrl = `https://${creds.apiKey}:${creds.apiToken}@${creds.subdomain}/v2/accounts/${creds.accountSid}/messages`;

    const contact = conversation.contact;

    let messageContent: Record<string, unknown>;

    if (message_type === "interactive_buttons" && interactive_data) {
      // Interactive reply buttons (up to 3)
      messageContent = {
        recipient_type: "individual",
        type: "interactive",
        interactive: {
          type: "button",
          ...(interactive_data.header ? { header: { type: "text", text: interactive_data.header } } : {}),
          body: { text: content || interactive_data.body || "" },
          ...(interactive_data.footer ? { footer: { text: interactive_data.footer } } : {}),
          action: {
            buttons: (interactive_data.buttons as any[]).map((btn: any) => ({
              type: "reply",
              reply: { id: btn.id, title: btn.title },
            })),
          },
        },
      };
    } else if (message_type === "interactive_list" && interactive_data) {
      // Interactive list message
      messageContent = {
        recipient_type: "individual",
        type: "interactive",
        interactive: {
          type: "list",
          ...(interactive_data.header ? { header: { type: "text", text: interactive_data.header } } : {}),
          body: { text: content || interactive_data.body || "" },
          ...(interactive_data.footer ? { footer: { text: interactive_data.footer } } : {}),
          action: {
            button: interactive_data.button_text || "Select",
            sections: interactive_data.sections,
          },
        },
      };
    } else if (media_url) {
      // Detect media type from URL extension
      let mediaType = "image";
      const ext = media_url.split("?")[0].split(".").pop()?.toLowerCase();
      if (["mp4", "3gpp"].includes(ext)) mediaType = "video";
      else if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(ext)) mediaType = "document";
      messageContent = {
        recipient_type: "individual",
        type: mediaType,
        [mediaType]: mediaType === "document"
          ? { link: media_url, caption: content, filename: media_url.split("/").pop()?.split("?")[0] || "file" }
          : { link: media_url, caption: content },
      };
    } else {
      messageContent = {
        recipient_type: "individual",
        type: "text",
        text: { preview_url: false, body: content },
      };
    }

    const payload = {
      whatsapp: {
        messages: [
          {
            from: creds.senderNumber,
            to: contact.phone_number,
            content: messageContent,
            statusCallback: {
              httpMethod: "POST",
              url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`,
            },
          },
        ],
      },
    };

    const exotelResponse = await fetch(exotelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await exotelResponse.json();
    const msgData = result?.response?.whatsapp?.messages?.[0];
    const exotelMessageId = msgData?.data?.sid || null;
    const sendSuccess = exotelResponse.ok && msgData?.status === "success";

    // Insert outbound message
    const { data: insertedMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        direction: "outbound",
        campaign_id: null,
        contact_id: conversation.contact_id,
        conversation_id,
        org_id: conversation.org_id,
        content: content || null,
        media_url: media_url || null,
        message_type: message_type || "text",
        interactive_data: interactive_data || null,
        status: sendSuccess ? "sent" : "failed",
        exotel_message_id: exotelMessageId,
        sent_at: sendSuccess ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: "Failed to save message" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update conversation
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
      })
      .eq("id", conversation_id);

    // NO wallet debit - replies within 24hr window are free

    if (!sendSuccess) {
      return new Response(
        JSON.stringify({ error: "Failed to send message via Exotel", details: result }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message_id: insertedMessage.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
