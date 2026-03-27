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

    // ── Normalize phone number: strip +, spaces, dashes; ensure 91 prefix for Indian numbers ──
    function normalizePhone(raw: string): string {
      let num = raw.replace(/[\s\-\+\(\)]/g, "");
      // Remove leading zeros
      num = num.replace(/^0+/, "");
      // If 10 digits (Indian local), prepend 91
      if (/^\d{10}$/.test(num)) {
        num = "91" + num;
      }
      return num;
    }

    // ── Handle outbound message status updates (DLRs) ──
    let statuses: any[] = [];
    if (body?.response?.whatsapp?.statuses) {
      statuses = body.response.whatsapp.statuses;
    } else if (body?.whatsapp?.statuses) {
      statuses = body.whatsapp.statuses;
    } else if (body?.statuses) {
      statuses = body.statuses;
    }

    if (statuses.length > 0) {
      for (const s of statuses) {
        const sid = s.id || s.message_id || s.sid;
        const newStatus = s.status?.toLowerCase();
        if (!sid || !newStatus) continue;

        // Map Exotel statuses to our status values
        const statusMap: Record<string, string> = {
          sent: "sent",
          delivered: "delivered",
          read: "read",
          failed: "failed",
          undelivered: "failed",
        };
        const mappedStatus = statusMap[newStatus];
        if (!mappedStatus) continue;

        // Only advance status (sent → delivered → read), never go backward
        const statusRank: Record<string, number> = { failed: 0, sent: 1, delivered: 2, read: 3 };
        const { data: existing } = await supabase
          .from("messages")
          .select("id, status")
          .eq("exotel_message_id", sid)
          .maybeSingle();

        if (existing && (statusRank[mappedStatus] ?? 0) > (statusRank[existing.status] ?? 0)) {
          await supabase
            .from("messages")
            .update({ status: mappedStatus })
            .eq("id", existing.id);
        }
      }

      return new Response(JSON.stringify({ success: true, statuses_processed: statuses.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        const rawFrom = msg.from; // customer phone
        const rawTo = msg.to;     // business phone / sender number
        const fromNumber = rawFrom ? normalizePhone(rawFrom) : "";
        const toNumber = rawTo ? normalizePhone(rawTo) : "";
        const exotelMsgId = msg.id || msg.sid || msg.data?.sid || null;
        const contentType = msg.content?.type || "text";
        let textBody =
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

        // Detect interactive responses (button clicks, list selections)
        const buttonReply =
          msg.content?.interactive?.button_reply ||
          msg.content?.button?.payload && { id: msg.content.button.payload, title: msg.content.button.text } ||
          null;
        const listReply =
          msg.content?.interactive?.list_reply ||
          null;

        let messageType = "text";
        let interactiveData: Record<string, unknown> | null = null;

        if (buttonReply) {
          messageType = "button_response";
          interactiveData = {
            button_id: buttonReply.id,
            button_text: buttonReply.title,
          };
          if (!textBody) textBody = buttonReply.title || "";
        } else if (listReply) {
          messageType = "list_response";
          interactiveData = {
            list_item_id: listReply.id,
            list_item_title: listReply.title,
            list_item_description: listReply.description || null,
          };
          if (!textBody) textBody = listReply.title || "";
        }

        // Detect CTWA (Click-to-WhatsApp Ads) referral data
        const referral = msg.referral || msg.context?.referral || null;
        const ctwaSource = referral?.source_type || referral?.source || null;
        const ctwaAdId = referral?.ad_id || referral?.headline || null;
        const ctwaClid = referral?.ctwa_clid || referral?.body || null;

        if (!fromNumber) continue;

        // ── Dedup: skip if we've already processed this exotel message ──
        if (exotelMsgId) {
          const { count } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("exotel_message_id", exotelMsgId);
          if ((count ?? 0) > 0) {
            console.log(`Skipping duplicate webhook message: ${exotelMsgId}`);
            continue;
          }
        }

        // ── Resolve org by sender number ──
        // Multiple orgs may share the same sender number (different formats).
        // Collect ALL matching org IDs, then pick the one that owns the contact.
        let orgId: string | null = null;
        const matchedOrgIds: string[] = [];

        // Build candidate formats for the business number
        const toCandidates = [...new Set([
          toNumber,
          rawTo,
          "+" + toNumber,
          toNumber.startsWith("91") ? toNumber.slice(2) : null,
        ].filter(Boolean) as string[])];

        for (const toCandidate of toCandidates) {
          // Check org_credentials.exotel_sender_number (may return multiple)
          const { data: credsBySender } = await supabase
            .from("org_credentials")
            .select("org_id")
            .eq("exotel_sender_number", toCandidate);

          if (credsBySender) {
            for (const c of credsBySender) {
              if (!matchedOrgIds.includes(c.org_id)) matchedOrgIds.push(c.org_id);
            }
          }

          // Check org_credentials.phone_numbers array
          const { data: credsByPhone } = await supabase
            .from("org_credentials")
            .select("org_id")
            .contains("phone_numbers", [toCandidate]);

          if (credsByPhone) {
            for (const c of credsByPhone) {
              if (!matchedOrgIds.includes(c.org_id)) matchedOrgIds.push(c.org_id);
            }
          }
        }

        // Fallback: match via EXOTEL_SENDER_NUMBER env var
        if (matchedOrgIds.length === 0) {
          const envSenderNumber = Deno.env.get("EXOTEL_SENDER_NUMBER");
          const envMatch = envSenderNumber && toCandidates.some(
            (c) => c === envSenderNumber || normalizePhone(envSenderNumber) === c
          );
          if (envMatch) {
            // Add all orgs as candidates (env var is shared)
            const { data: allOrgs } = await supabase
              .from("organizations")
              .select("id")
              .order("created_at", { ascending: true });
            if (allOrgs) {
              for (const o of allOrgs) matchedOrgIds.push(o.id);
            }
          }
        }

        // Single-tenant fallback: pick any org
        if (matchedOrgIds.length === 0) {
          const { data: anyOrg } = await supabase
            .from("organizations")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (anyOrg) matchedOrgIds.push(anyOrg.id);
        }

        if (matchedOrgIds.length === 0) {
          console.error("No org found for inbound message to:", toNumber);
          continue;
        }

        // If multiple orgs matched, pick the one that owns the sender contact
        if (matchedOrgIds.length === 1) {
          orgId = matchedOrgIds[0];
        } else {
          // Build phone candidates for the sender
          const fromCandidates = [...new Set([
            fromNumber,
            rawFrom,
            "+" + fromNumber,
            fromNumber.startsWith("91") ? fromNumber.slice(2) : null,
          ].filter(Boolean) as string[])];

          for (const candidate of fromCandidates) {
            if (orgId) break;
            const { data: contactMatch } = await supabase
              .from("contacts")
              .select("org_id")
              .eq("phone_number", candidate)
              .in("org_id", matchedOrgIds)
              .limit(1)
              .maybeSingle();

            if (contactMatch) {
              orgId = contactMatch.org_id;
            }
          }

          // If still no match, use first matched org
          if (!orgId) orgId = matchedOrgIds[0];
        }

        // ── Find or create contact ──
        // Try multiple phone formats to match existing contacts
        let contactId: string;

        // Build candidate phone formats: normalized, raw, with +, without country code
        const phoneCandidates = [...new Set([
          fromNumber,
          rawFrom,
          "+" + fromNumber,
          fromNumber.startsWith("91") ? fromNumber.slice(2) : null,
        ].filter(Boolean) as string[])];

        let existingContact: { id: string } | null = null;
        for (const candidate of phoneCandidates) {
          const { data } = await supabase
            .from("contacts")
            .select("id")
            .eq("phone_number", candidate)
            .eq("org_id", orgId)
            .maybeSingle();
          if (data) {
            existingContact = data;
            break;
          }
        }

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
              source: ctwaSource ? "ctwa_ad" : "inbound",
              user_id: orgRow?.created_by,
              ...(ctwaSource ? { ctwa_source: ctwaSource } : {}),
              ...(ctwaAdId ? { ctwa_ad_id: ctwaAdId } : {}),
              ...(ctwaClid ? { ctwa_clid: ctwaClid } : {}),
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
          ? (messageType === "button_response" ? `[Button] ${textBody}` : messageType === "list_response" ? `[List] ${textBody}` : textBody).substring(0, 100)
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
              ...(ctwaSource ? { ctwa_source: ctwaSource } : {}),
              ...(ctwaAdId ? { ctwa_ad_id: ctwaAdId } : {}),
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
          message_type: messageType,
          interactive_data: interactiveData,
          status: "delivered",
          sent_at: now,
          exotel_message_id: exotelMsgId,
        });

        // ── Check for active chatbot session or matching flow trigger ──
        let handledByFlow = false;

        // Check for active chatbot session for this contact
        const { data: activeSession } = await supabase
          .from("chatbot_sessions")
          .select("id, flow_id")
          .eq("org_id", orgId)
          .eq("contact_id", contactId)
          .eq("status", "active")
          .gt("expires_at", now)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeSession) {
          // Resume existing chatbot session
          fetch(`${supabaseUrl}/functions/v1/execute-flow`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: activeSession.id,
              conversation_id: conversationId,
              contact_id: contactId,
              org_id: orgId,
              inbound_message: textBody || null,
              inbound_interactive: interactiveData,
            }),
          }).catch((err) => console.error("Failed to resume flow:", err.message));
          handledByFlow = true;
        } else {
          // Check for matching flow triggers
          const { data: activeFlows } = await supabase
            .from("chatbot_flows")
            .select("id, trigger_type, trigger_value")
            .eq("org_id", orgId)
            .eq("status", "active");

          if (activeFlows && activeFlows.length > 0) {
            const lowerText = (textBody || "").toLowerCase().trim();
            for (const flow of activeFlows) {
              let triggered = false;
              if (flow.trigger_type === "all_messages") {
                triggered = true;
              } else if (flow.trigger_type === "first_message" && !existingConvo) {
                triggered = true;
              } else if (flow.trigger_type === "keyword" && flow.trigger_value) {
                const keywords = flow.trigger_value.split(",").map((k: string) => k.trim().toLowerCase());
                triggered = keywords.some((kw: string) => lowerText === kw || lowerText.includes(kw));
              }

              if (triggered) {
                fetch(`${supabaseUrl}/functions/v1/execute-flow`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${supabaseServiceKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    flow_id: flow.id,
                    conversation_id: conversationId,
                    contact_id: contactId,
                    org_id: orgId,
                    inbound_message: textBody || null,
                    inbound_interactive: interactiveData,
                  }),
                }).catch((err) => console.error("Failed to start flow:", err.message));
                handledByFlow = true;
                break; // Only trigger first matching flow
              }
            }
          }
        }

        // ── Check AI and trigger reply (only if no chatbot flow handled it) ──
        if (!handledByFlow && aiEnabled) {
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

        // ── Fire outbound webhooks for inbound message event ──
        fetch(`${supabaseUrl}/functions/v1/fire-webhook`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            org_id: orgId,
            event: "message.inbound",
            payload: {
              contact_id: contactId,
              conversation_id: conversationId,
              phone_number: fromNumber,
              content: textBody,
              media_url: mediaUrl,
              message_type: messageType,
              interactive_data: interactiveData,
              timestamp: now,
            },
          }),
        }).catch((err) => console.error("Failed to fire webhook:", err.message));
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
