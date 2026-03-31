// message-status-callback edge function
// Receives delivery/read status callbacks from Exotel for outbound WhatsApp messages
// and updates message status accordingly (sent → delivered → read / failed)

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
    console.log("Status callback received:", JSON.stringify(body));

    // ── Parse status updates from various Exotel callback formats ──
    let statusUpdates: any[] = [];

    if (body?.response?.whatsapp?.messages) {
      statusUpdates = body.response.whatsapp.messages;
    } else if (body?.whatsapp?.messages) {
      statusUpdates = body.whatsapp.messages;
    } else if (body?.messages) {
      statusUpdates = body.messages;
    } else if (Array.isArray(body)) {
      statusUpdates = body;
    } else if (body?.sid || body?.id || body?.data?.sid) {
      // Single status update
      statusUpdates = [body];
    }

    if (!statusUpdates || statusUpdates.length === 0) {
      return new Response(JSON.stringify({ success: true, detail: "No status updates to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;

    for (const update of statusUpdates) {
      try {
        // Extract message ID and status from various Exotel payload formats
        const exotelMessageId =
          update.data?.sid ||
          update.sid ||
          update.id ||
          update.message_id ||
          update.messageId ||
          null;

        const rawStatus = (
          update.data?.status ||
          update.status ||
          update.event_type ||
          update.eventType ||
          ""
        ).toLowerCase();

        if (!exotelMessageId) {
          console.log("Skipping status update with no message ID:", JSON.stringify(update));
          skipped++;
          continue;
        }

        // Map Exotel status values to our internal statuses
        let newStatus: string | null = null;
        if (["delivered", "delivery_ack", "delivered_to_handset"].includes(rawStatus)) {
          newStatus = "delivered";
        } else if (["read", "seen"].includes(rawStatus)) {
          newStatus = "read";
        } else if (["failed", "rejected", "undelivered", "expired"].includes(rawStatus)) {
          newStatus = "failed";
        } else if (["sent", "enqueued", "queued", "submitted"].includes(rawStatus)) {
          // Already marked as sent when we called the API — skip
          skipped++;
          continue;
        } else {
          console.log(`Unknown status "${rawStatus}" for message ${exotelMessageId}`);
          skipped++;
          continue;
        }

        // Find the message by exotel_message_id
        const { data: message } = await supabase
          .from("messages")
          .select("id, status, conversation_id, org_id, campaign_id")
          .eq("exotel_message_id", exotelMessageId)
          .maybeSingle();

        if (!message) {
          console.log(`Message not found for exotel_message_id: ${exotelMessageId}`);
          skipped++;
          continue;
        }

        // Only advance status forward: sent → delivered → read, or any → failed
        const statusOrder: Record<string, number> = {
          pending: 0,
          sent: 1,
          delivered: 2,
          read: 3,
          failed: -1,
        };

        const currentOrder = statusOrder[message.status] ?? 0;
        const newOrder = statusOrder[newStatus] ?? 0;

        // Allow failed from any state, otherwise only advance forward
        if (newStatus !== "failed" && newOrder <= currentOrder) {
          skipped++;
          continue;
        }

        // Build the update payload
        const updateData: Record<string, unknown> = { status: newStatus };
        const now = new Date().toISOString();

        if (newStatus === "delivered") {
          updateData.delivered_at = now;
        } else if (newStatus === "read") {
          // If jumping from sent to read, also set delivered_at
          if (!message.status || message.status === "sent") {
            updateData.delivered_at = now;
          }
          updateData.read_at = now;
        } else if (newStatus === "failed") {
          updateData.error_message =
            update.data?.error_message ||
            update.error_message ||
            update.reason ||
            update.data?.reason ||
            `Status callback: ${rawStatus}`;
        }

        const { error: updateError } = await supabase
          .from("messages")
          .update(updateData)
          .eq("id", message.id);

        if (updateError) {
          console.error(`Failed to update message ${message.id}:`, updateError.message);
          skipped++;
          continue;
        }

        // ── Bill on delivery: charge wallet when message first reaches delivered/read ──
        const wasPreDelivery = ["pending", "sent"].includes(message.status);
        const isNowDelivered = ["delivered", "read"].includes(newStatus);
        if (wasPreDelivery && isNowDelivered && message.org_id) {
          try {
            const MSG_RATE = 0.20;
            const GST_RATE = 0.18;
            const gst = Math.round(MSG_RATE * GST_RATE * 100) / 100;

            // Determine billing category from campaign (default marketing)
            let billingCategory = "marketing_message";
            if (message.campaign_id) {
              const { data: campaign } = await supabase
                .from("campaigns")
                .select("message_category")
                .eq("id", message.campaign_id)
                .maybeSingle();
              const cat = campaign?.message_category || "marketing";
              const catMap: Record<string, string> = {
                marketing: "marketing_message",
                utility: "utility_message",
                authentication: "auth_message",
              };
              billingCategory = catMap[cat] || "marketing_message";
            }

            await supabase.rpc("debit_wallet_on_delivery", {
              _org_id: message.org_id,
              _base_amount: MSG_RATE,
              _gst_amount: gst,
              _category: billingCategory,
              _description: `Message delivered`,
              _reference_id: message.id,
            });
          } catch (billingErr) {
            console.error(`Billing failed for message ${message.id}:`, (billingErr as Error).message);
          }
        }

        // Fire outbound webhook for status change event
        if (message.org_id) {
          fetch(`${supabaseUrl}/functions/v1/fire-webhook`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              org_id: message.org_id,
              event: "message.status",
              payload: {
                message_id: message.id,
                exotel_message_id: exotelMessageId,
                conversation_id: message.conversation_id,
                old_status: message.status,
                new_status: newStatus,
                timestamp: now,
              },
            }),
          }).catch((err) => console.error("Failed to fire status webhook:", err.message));
        }

        processed++;
        console.log(`Updated message ${message.id}: ${message.status} → ${newStatus}`);
      } catch (msgErr) {
        console.error("Error processing status update:", (msgErr as Error).message);
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Status callback error:", (err as Error).message);
    // Always return 200 for callbacks to prevent retries
    return new Response(
      JSON.stringify({ success: true, error: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
