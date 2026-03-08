import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getExotelCreds } from "../_shared/get-exotel-creds.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 30 messages/minute = 2s gap between sends. 10 per batch keeps each invocation ~25-30s.
const BATCH_SIZE = 10;
const SEND_DELAY_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { campaign_id, offset = 0 } = body;
    const isChainedCall = offset > 0;

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Auth: only check JWT for the initial call; chained calls use service role key ──
    if (!isChainedCall) {
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
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Fetch campaign ──
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Atomic status check ──
    // For the initial call, atomically transition draft→running (prevents double-launch).
    // For chained calls, just verify it's still running.
    if (!isChainedCall) {
      const { data: transitioned } = await supabase.rpc("transition_campaign_status", {
        _campaign_id: campaign_id,
        _from_status: "running",
        _to_status: "running",
      });
      if (!transitioned) {
        return new Response(JSON.stringify({ error: "Campaign is not running", status: campaign.status }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (campaign.status !== "running") {
      return new Response(JSON.stringify({ error: "Campaign is not running", status: campaign.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = campaign.org_id;
    const messageCategory = campaign.message_category || "marketing";
    const RATES: Record<string, number> = { marketing: 1.0, utility: 0.2, authentication: 0.2 };
    const GST_RATE = 0.18;
    const ratePerMsg = RATES[messageCategory] || 1.0;
    const costPerMsg = ratePerMsg * (1 + GST_RATE);

    // ── Balance check (per batch) ──
    const { data: wallet } = await supabase
      .from("org_wallets")
      .select("balance")
      .eq("org_id", orgId)
      .maybeSingle();

    const currentBalance = wallet?.balance ?? 0;
    const batchCost = Math.round(BATCH_SIZE * costPerMsg * 100) / 100;

    if (currentBalance < batchCost) {
      // Not enough for a full batch — check if we can send at least one
      if (currentBalance < costPerMsg) {
        await supabase.rpc("transition_campaign_status", { _campaign_id: campaign_id, _from_status: "running", _to_status: "failed" });
        return new Response(JSON.stringify({
          error: "Insufficient balance",
          required: batchCost,
          current_balance: currentBalance,
          shortfall: Math.round((batchCost - currentBalance) * 100) / 100,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Fetch template for WhatsApp API ──
    let templateName = "";
    let templateLanguage = "en";
    let tplContent = "";
    if (campaign.template_id) {
      const { data: tpl } = await supabase
        .from("templates")
        .select("name, language, content")
        .eq("id", campaign.template_id)
        .single();
      if (tpl) {
        templateName = tpl.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        templateLanguage = tpl.language || "en";
        tplContent = tpl.content || "";
      }
    }

    if (!templateName) {
      await supabase.rpc("transition_campaign_status", { _campaign_id: campaign_id, _from_status: "running", _to_status: "failed" });
      return new Response(JSON.stringify({ error: "Template not found for campaign" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect media type from template content markers (raw content with markers)
    let headerMediaType: "image" | "video" | "document" | null = null;
    if (tplContent.startsWith("[Image Header]")) headerMediaType = "image";
    else if (tplContent.startsWith("[Video Header]")) headerMediaType = "video";
    else if (tplContent.startsWith("[Document Header]")) headerMediaType = "document";

    // Extract variable numbers from template content
    const varMatches = tplContent.match(/\{\{(\d+)\}\}/g);
    const varNums = varMatches
      ? [...new Set(varMatches)].map((v) => v.replace(/\D/g, "")).sort((a, b) => parseInt(a) - parseInt(b))
      : [];

    // ── Fetch this batch of contacts using range ──
    const { data: assignments } = await supabase
      .from("campaign_contacts")
      .select("contact_id, contacts(id, phone_number, name, custom_fields)")
      .eq("campaign_id", campaign_id)
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    const contacts = (assignments ?? [])
      .map((a: any) => a.contacts)
      .filter(Boolean);

    // ── No contacts in this range — campaign is done ──
    if (contacts.length === 0) {
      // Count sent vs failed to determine final status
      const { count: sentCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .eq("status", "sent");

      const { count: failedCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .eq("status", "failed");

      const finalStatus = (sentCount ?? 0) === 0 ? "failed" : "completed";
      await supabase.rpc("transition_campaign_status", { _campaign_id: campaign_id, _from_status: "running", _to_status: finalStatus });

      return new Response(JSON.stringify({
        success: true,
        done: true,
        sent: sentCount ?? 0,
        failed: failedCount ?? 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Resolve Exotel credentials ──
    const creds = await getExotelCreds(supabase, orgId);
    const exotelUrl = `https://${creds.apiKey}:${creds.apiToken}@${creds.subdomain}/v2/accounts/${creds.accountSid}/messages`;

    const mapping = campaign.variable_mapping as Record<string, string> | null;

    let batchSent = 0;
    let batchFailed = 0;

    // ── Process this batch (rate-limited to 30 msgs/min) ──
    for (let ci = 0; ci < contacts.length; ci++) {
      if (ci > 0) await sleep(SEND_DELAY_MS);
      const contact = contacts[ci];
      const resolveField = (field: string): string => {
        if (field === "name") return contact.name || "Customer";
        if (field === "phone_number") return contact.phone_number || "";
        if (field === "email") return (contact as any).email || "";
        return (contact.custom_fields as Record<string, string>)?.[field] || "";
      };

      // Build personalized message for the DB record
      let message = tplContent.replace(/^\[(Image|Video|Document) Header\]\n?/, "").trim();
      if (mapping) {
        for (const [varNum, field] of Object.entries(mapping)) {
          message = message.replaceAll(`{{${varNum}}}`, resolveField(field));
        }
      }

      // Create message record
      const { data: msgRecord, error: msgInsertErr } = await supabase
        .from("messages")
        .insert({
          campaign_id,
          contact_id: contact.id,
          content: message,
          media_url: campaign.media_url,
          status: "pending",
          org_id: orgId,
        })
        .select("id")
        .single();

      if (msgInsertErr || !msgRecord) {
        console.error("Failed to create message record:", msgInsertErr?.message);
        batchFailed++;
        continue;
      }

      try {
        // ── Pre-debit wallet (atomic base + GST) before sending ──
        const gstAmount = Math.round(ratePerMsg * GST_RATE * 100) / 100;
        const categoryMap: Record<string, string> = {
          marketing: "marketing_message",
          utility: "utility_message",
          authentication: "auth_message",
        };

        const { data: debitResult } = await supabase.rpc("debit_wallet_with_gst", {
          _org_id: orgId,
          _base_amount: ratePerMsg,
          _gst_amount: gstAmount,
          _category: categoryMap[messageCategory] || "marketing_message",
          _description: `${messageCategory} message to ${contact.phone_number}`,
          _reference_id: campaign_id,
        });

        if (debitResult === -1) {
          // Insufficient balance — mark message failed, stop campaign
          await supabase.from("messages").update({ status: "failed", error_message: "Insufficient balance" }).eq("id", msgRecord.id);
          batchFailed++;
          // Finalize campaign as we can't send more
          const { count: totalSent } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id).eq("status", "sent");
          const finalStatus = (totalSent ?? 0) === 0 ? "failed" : "completed";
          await supabase.rpc("transition_campaign_status", { _campaign_id: campaign_id, _from_status: "running", _to_status: finalStatus });
          return new Response(JSON.stringify({ success: true, batch_sent: batchSent, batch_failed: batchFailed, stopped: "insufficient_balance" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Build template components for WhatsApp API
        const components: Record<string, unknown>[] = [];

        if (headerMediaType && campaign.media_url) {
          const headerParam: Record<string, unknown> = { type: headerMediaType };
          headerParam[headerMediaType] = { link: campaign.media_url };
          components.push({ type: "header", parameters: [headerParam] });
        }

        if (varNums.length > 0 && mapping) {
          const bodyParams = varNums.map((num) => ({
            type: "text",
            text: resolveField(mapping[num] || ""),
          }));
          components.push({ type: "body", parameters: bodyParams });
        }

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

        if (exotelResponse.ok && msgData?.status === "success") {
          await supabase
            .from("messages")
            .update({
              status: "sent",
              exotel_message_id: msgData?.data?.sid || null,
              sent_at: new Date().toISOString(),
            })
            .eq("id", msgRecord.id);

          batchSent++;
        } else {
          await supabase
            .from("messages")
            .update({
              status: "failed",
              error_message: JSON.stringify(result).slice(0, 500),
            })
            .eq("id", msgRecord.id);
          // Refund pre-debited amount on send failure
          await supabase.rpc("credit_wallet", {
            _org_id: orgId,
            _amount: ratePerMsg + Math.round(ratePerMsg * GST_RATE * 100) / 100,
            _category: "refund",
            _description: `Refund: failed send to ${contact.phone_number}`,
            _reference_id: campaign_id,
          });
          batchFailed++;
        }
      } catch (err) {
        // Refund pre-debited amount on exception
        await supabase.rpc("credit_wallet", {
          _org_id: orgId,
          _amount: ratePerMsg + Math.round(ratePerMsg * GST_RATE * 100) / 100,
          _category: "refund",
          _description: `Refund: error sending to ${contact.phone_number}`,
          _reference_id: campaign_id,
        });
        await supabase
          .from("messages")
          .update({
            status: "failed",
            error_message: (err as Error).message,
          })
          .eq("id", msgRecord.id);
        batchFailed++;
      }
    }

    // ── Self-chain: if we got a full batch, there may be more contacts ──
    if (contacts.length === BATCH_SIZE) {
      const nextOffset = offset + BATCH_SIZE;
      console.log(`Batch done (sent=${batchSent}, failed=${batchFailed}). Chaining to offset ${nextOffset}`);

      // Chain to next batch — on failure, mark campaign as failed so it doesn't stay stuck
      fetch(`${supabaseUrl}/functions/v1/send-campaign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ campaign_id, offset: nextOffset }),
      }).catch(async (err) => {
        console.error("Self-chain failed:", err.message);
        await supabase.rpc("transition_campaign_status", { _campaign_id: campaign_id, _from_status: "running", _to_status: "failed" });
      });
    } else {
      // This was the last batch — finalize campaign
      console.log(`Final batch done (sent=${batchSent}, failed=${batchFailed}). Finalizing campaign.`);

      const { count: totalSent } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .eq("status", "sent");

      const finalStatus = (totalSent ?? 0) === 0 ? "failed" : "completed";
      await supabase.rpc("transition_campaign_status", { _campaign_id: campaign_id, _from_status: "running", _to_status: finalStatus });
    }

    return new Response(
      JSON.stringify({ success: true, batch_sent: batchSent, batch_failed: batchFailed, offset }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-campaign error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
