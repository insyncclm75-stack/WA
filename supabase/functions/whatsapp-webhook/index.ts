import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const body = await req.json();

    // ── Parse inbound messages ──
    // Handle nested format: { response: { whatsapp: { messages: [...] } } }
    // and flat format where the body IS the message array
    let messages: any[] = [];
    if (body?.response?.whatsapp?.messages) {
      messages = body.response.whatsapp.messages;
    } else if (body?.whatsapp?.messages) {
      messages = body.whatsapp.messages;
    } else if (Array.isArray(body)) {
      messages = body;
    } else if (body?.messages) {
      messages = body.messages;
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ success: true, detail: "No messages to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const msg of messages) {
      try {
        // ── Extract fields ──
        const fromNumber = msg.from; // customer phone
        const toNumber = msg.to;     // business phone / sender number
        const contentType = msg.content?.type || "text";
        const textBody =
          msg.content?.text?.body ||
          msg.content?.caption ||
          "";
        const mediaUrl =
          msg.content?.image?.link ||
          msg.content?.video?.link ||
          msg.content?.document?.link ||
          msg.content?.image?.url ||
          msg.content?.video?.url ||
          msg.content?.document?.url ||
          null;

        if (!fromNumber) continue;

        // ── Resolve org by sender number ──
        let orgId: string | null = null;

        if (toNumber) {
          // Check org_credentials.exotel_sender_number
          const { data: credsBySender } = await supabase
            .from("org_credentials")
            .select("org_id")
            .eq("exotel_sender_number", toNumber)
            .maybeSingle();

          if (credsBySender) {
            orgId = credsBySender.org_id;
          }

          // Check org_credentials.phone_numbers array
          if (!orgId) {
            const { data: credsByPhone } = await supabase
              .from("org_credentials")
              .select("org_id")
              .contains("phone_numbers", [toNumber])
              .maybeSingle();

            if (credsByPhone) {
              orgId = credsByPhone.org_id;
            }
          }
        }

        // Fallback: match via EXOTEL_SENDER_NUMBER env var for default org
        if (!orgId) {
          const envSenderNumber = Deno.env.get("EXOTEL_SENDER_NUMBER");
          if (envSenderNumber && toNumber === envSenderNumber) {
            const { data: defaultOrg } = await supabase
              .from("organizations")
              .select("id")
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (defaultOrg) {
              orgId = defaultOrg.id;
            }
          }
        }

        // Single-tenant fallback: pick any org
        if (!orgId) {
          const { data: anyOrg } = await supabase
            .from("organizations")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (anyOrg) {
            orgId = anyOrg.id;
          }
        }

        if (!orgId) {
          console.error("No org found for inbound message to:", toNumber);
          continue;
        }

        // ── Find or create contact ──
        let contactId: string;

        const { data: existingContact } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone_number", fromNumber)
          .eq("org_id", orgId)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
        } else {
          // Get org creator to set as user_id (required field)
          const { data: orgRow } = await supabase
            .from("organizations")
            .select("created_by")
            .eq("id", orgId)
            .single();

          const { data: newContact, error: contactError } = await supabase
            .from("contacts")
            .insert({
              phone_number: fromNumber,
              org_id: orgId,
              name: fromNumber,
              source: "inbound",
              user_id: orgRow?.created_by,
            })
            .select("id")
            .single();

          if (contactError || !newContact) {
            console.error("Failed to create contact:", contactError?.message);
            continue;
          }
          contactId = newContact.id;
        }

        // ── Find or create conversation ──
        let conversationId: string;
        let aiEnabled = true;

        const messagePreview = textBody
          ? textBody.substring(0, 100)
          : `[${contentType}]`;

        const now = new Date().toISOString();

        const { data: existingConvo } = await supabase
          .from("conversations")
          .select("id, ai_enabled, unread_count")
          .eq("org_id", orgId)
          .eq("contact_id", contactId)
          .maybeSingle();

        if (existingConvo) {
          conversationId = existingConvo.id;
          aiEnabled = existingConvo.ai_enabled;

          await supabase
            .from("conversations")
            .update({
              last_message_at: now,
              last_message_preview: messagePreview,
              last_inbound_at: now,
              unread_count: (existingConvo.unread_count || 0) + 1,
              status: "open",
              updated_at: now,
            })
            .eq("id", existingConvo.id);
        } else {
          const { data: newConvo, error: convoError } = await supabase
            .from("conversations")
            .insert({
              org_id: orgId,
              contact_id: contactId,
              phone_number: fromNumber,
              last_message_at: now,
              last_message_preview: messagePreview,
              last_inbound_at: now,
              unread_count: 1,
              status: "open",
              ai_enabled: true,
            })
            .select("id, ai_enabled")
            .single();

          if (convoError || !newConvo) {
            console.error("Failed to create conversation:", convoError?.message);
            continue;
          }
          conversationId = newConvo.id;
          aiEnabled = newConvo.ai_enabled;
        }

        // ── Insert message ──
        await supabase.from("messages").insert({
          direction: "inbound",
          campaign_id: null,
          contact_id: contactId,
          conversation_id: conversationId,
          org_id: orgId,
          content: textBody || null,
          media_url: mediaUrl,
          status: "delivered",
          sent_at: now,
        });

        // ── Check AI and trigger reply ──
        if (aiEnabled) {
          const { data: aiConfig } = await supabase
            .from("ai_config")
            .select("enabled")
            .eq("org_id", orgId)
            .maybeSingle();

          if (aiConfig?.enabled) {
            // Fire-and-forget call to ai-reply edge function
            fetch(`${supabaseUrl}/functions/v1/ai-reply`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                org_id: orgId,
              }),
            }).catch((err) => {
              console.error("Failed to call ai-reply:", err.message);
            });
          }
        }
      } catch (msgErr) {
        console.error("Error processing message:", (msgErr as Error).message);
        // Continue processing remaining messages
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", (err as Error).message);
    // Always return 200 for webhooks
    return new Response(JSON.stringify({ success: true, error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
