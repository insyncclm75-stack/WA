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

    const { conversation_id, template_id } = await req.json();
    if (!conversation_id || !template_id) {
      return new Response(JSON.stringify({ error: "conversation_id and template_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load conversation with contact
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

    // Verify user is a member of the org
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

    // Load template
    const { data: template, error: tplError } = await supabase
      .from("templates")
      .select("*")
      .eq("id", template_id)
      .eq("org_id", conversation.org_id)
      .eq("status", "approved")
      .single();

    if (tplError || !template) {
      return new Response(JSON.stringify({ error: "Approved template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build template name (same logic as send-campaign)
    const templateName = template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const templateLanguage = template.language || "en";
    const tplContent = template.content || "";

    // Detect media type
    let headerMediaType: "image" | "video" | "document" | null = null;
    if (tplContent.startsWith("[Image Header]")) headerMediaType = "image";
    else if (tplContent.startsWith("[Video Header]")) headerMediaType = "video";
    else if (tplContent.startsWith("[Document Header]")) headerMediaType = "document";

    // Build components
    const components: Record<string, unknown>[] = [];

    if (headerMediaType && template.media_url) {
      const headerParam: Record<string, unknown> = { type: headerMediaType };
      headerParam[headerMediaType] = { link: template.media_url };
      components.push({ type: "header", parameters: [headerParam] });
    }

    // Replace variables with contact data
    const contact = conversation.contact;
    const varMatches = tplContent.match(/\{\{(\d+)\}\}/g);
    if (varMatches) {
      const varNums = [...new Set(varMatches)].map((v) => v.replace(/\D/g, "")).sort((a, b) => parseInt(a) - parseInt(b));
      const bodyParams = varNums.map(() => ({
        type: "text",
        text: contact.name || "Customer",
      }));
      components.push({ type: "body", parameters: bodyParams });
    }

    // Clean content for DB record
    const messageContent = tplContent.replace(/^\[(Image|Video|Document) Header\]\n?/, "").trim();

    // Send via Exotel
    const creds = await getExotelCreds(supabase, conversation.org_id);
    const exotelUrl = `https://${creds.apiKey}:${creds.apiToken}@${creds.subdomain}/v2/accounts/${creds.accountSid}/messages`;

    const content: Record<string, unknown> = {
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage, policy: "deterministic" },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    const payload = {
      whatsapp: {
        messages: [{
          from: creds.senderNumber,
          to: contact.phone_number,
          content,
          statusCallback: {
            httpMethod: "POST",
            url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`,
          },
        }],
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

    // Insert outbound message record
    const { data: insertedMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        direction: "outbound",
        campaign_id: null,
        contact_id: conversation.contact_id,
        conversation_id,
        org_id: conversation.org_id,
        content: messageContent,
        message_type: "template",
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
        last_message_preview: `[Template] ${template.name}`,
      })
      .eq("id", conversation_id);

    // Debit wallet for template message
    const GST_RATE = 0.18;
    const { data: rateRow } = await supabase
      .from("message_rates")
      .select("rate_per_message")
      .eq("category", template.category?.toLowerCase() || "marketing")
      .maybeSingle();
    const ratePerMsg = rateRow?.rate_per_message ?? 0.50;
    const gstAmount = Math.round(ratePerMsg * GST_RATE * 100) / 100;
    const categoryMap: Record<string, string> = {
      marketing: "marketing_message",
      utility: "utility_message",
      authentication: "auth_message",
    };

    await supabase.rpc("debit_wallet_with_gst", {
      _org_id: conversation.org_id,
      _base_amount: ratePerMsg,
      _gst_amount: gstAmount,
      _category: categoryMap[template.category?.toLowerCase() || "marketing"] || "marketing_message",
      _description: `Template "${template.name}" to ${contact.phone_number}`,
      _reference_id: conversation_id,
    });

    if (!sendSuccess) {
      return new Response(
        JSON.stringify({ error: "Failed to send template via Exotel", details: result }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
