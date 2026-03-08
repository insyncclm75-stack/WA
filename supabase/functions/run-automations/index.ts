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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all active automations
    const { data: automations } = await supabase
      .from("automations")
      .select("*")
      .eq("status", "active");

    if (!automations || automations.length === 0) {
      return new Response(JSON.stringify({ message: "No active automations" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, { sent: number; advanced: number; completed: number; errors: number }> = {};

    for (const automation of automations) {
      const stats = { sent: 0, advanced: 0, completed: 0, errors: 0 };
      results[automation.id] = stats;

      // Get all steps for this automation
      const { data: steps } = await supabase
        .from("automation_steps")
        .select("*")
        .eq("automation_id", automation.id)
        .order("step_order", { ascending: true });

      if (!steps || steps.length === 0) continue;

      const maxStep = Math.max(...steps.map((s: any) => s.step_order));

      // Get Exotel creds for this org
      let creds: any;
      try {
        creds = await getExotelCreds(supabase, automation.org_id);
      } catch {
        console.error(`No creds for org ${automation.org_id}`);
        continue;
      }
      const exotelUrl = `https://${creds.apiKey}:${creds.apiToken}@${creds.subdomain}/v2/accounts/${creds.accountSid}/messages`;

      // ── Phase 1: Process contacts in 'waiting' state whose wait period expired ──
      const { data: waitingContacts } = await supabase
        .from("automation_contacts")
        .select("*")
        .eq("automation_id", automation.id)
        .eq("status", "waiting")
        .lte("next_action_at", new Date().toISOString());

      for (const ac of waitingContacts ?? []) {
        const currentStep = steps.find((s: any) => s.step_order === ac.current_step_order);
        if (!currentStep) continue;

        if (currentStep.step_type === "wait") {
          // Wait is over — check if next step is a condition or send
          const nextStepOrder = ac.current_step_order + 1;
          const nextStep = steps.find((s: any) => s.step_order === nextStepOrder);

          if (!nextStep) {
            // No more steps — mark completed
            await supabase
              .from("automation_contacts")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", ac.id);
            stats.completed++;
            continue;
          }

          // Move to next step
          await supabase
            .from("automation_contacts")
            .update({
              current_step_order: nextStepOrder,
              status: "in_progress",
              step_entered_at: new Date().toISOString(),
              next_action_at: null,
            })
            .eq("id", ac.id);

          // Process the next step inline
          await processStep(supabase, automation, nextStep, ac, steps, maxStep, creds, exotelUrl, stats);
        }
      }

      // ── Phase 2: Pick new 'pending' contacts up to daily_limit ──
      // Count how many were already sent today for this automation
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { count: sentToday } = await supabase
        .from("automation_contacts")
        .select("*", { count: "exact", head: true })
        .eq("automation_id", automation.id)
        .neq("status", "pending")
        .gte("step_entered_at", todayStart.toISOString());

      const remaining = Math.max(0, automation.daily_limit - (sentToday ?? 0));
      if (remaining <= 0) continue;

      const { data: pendingContacts } = await supabase
        .from("automation_contacts")
        .select("*")
        .eq("automation_id", automation.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(remaining);

      for (const ac of pendingContacts ?? []) {
        const firstStep = steps.find((s: any) => s.step_order === 1);
        if (!firstStep) continue;

        // Mark as in_progress
        await supabase
          .from("automation_contacts")
          .update({
            status: "in_progress",
            step_entered_at: new Date().toISOString(),
            current_step_order: 1,
          })
          .eq("id", ac.id);

        await processStep(supabase, automation, firstStep, ac, steps, maxStep, creds, exotelUrl, stats);
      }

      // ── Phase 3: Process contacts in 'in_progress' for condition steps ──
      const { data: inProgressContacts } = await supabase
        .from("automation_contacts")
        .select("*")
        .eq("automation_id", automation.id)
        .eq("status", "in_progress");

      for (const ac of inProgressContacts ?? []) {
        const currentStep = steps.find((s: any) => s.step_order === ac.current_step_order);
        if (!currentStep || currentStep.step_type !== "condition") continue;

        await processStep(supabase, automation, currentStep, ac, steps, maxStep, creds, exotelUrl, stats);
      }

      // Update automation processed count
      const { count: processedCount } = await supabase
        .from("automation_contacts")
        .select("*", { count: "exact", head: true })
        .eq("automation_id", automation.id)
        .neq("status", "pending");

      const { count: totalCount } = await supabase
        .from("automation_contacts")
        .select("*", { count: "exact", head: true })
        .eq("automation_id", automation.id);

      await supabase
        .from("automations")
        .update({
          processed_contacts: processedCount ?? 0,
          updated_at: new Date().toISOString(),
          ...(processedCount === totalCount && (totalCount ?? 0) > 0
            ? { status: "completed" }
            : {}),
        })
        .eq("id", automation.id);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("run-automations error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processStep(
  supabase: any,
  automation: any,
  step: any,
  ac: any,
  allSteps: any[],
  maxStep: number,
  creds: any,
  exotelUrl: string,
  stats: any
) {
  const orgId = automation.org_id;

  if (step.step_type === "send_template") {
    // Fetch template
    const { data: template } = await supabase
      .from("templates")
      .select("*")
      .eq("id", step.template_id)
      .single();

    if (!template) {
      await supabase
        .from("automation_contacts")
        .update({ status: "failed" })
        .eq("id", ac.id);
      stats.errors++;
      return;
    }

    // Fetch contact
    const { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", ac.contact_id)
      .single();

    if (!contact) {
      await supabase
        .from("automation_contacts")
        .update({ status: "failed" })
        .eq("id", ac.id);
      stats.errors++;
      return;
    }

    // Strip content markers and personalize for DB record
    let message = (template.content || "")
      .replace(/^\[(Image|Video|Document) Header\]\n?/, "")
      .trim();
    message = message.replace(/\{\{name\}\}/g, contact.name || "Customer");
    message = message.replace(
      /\{\{phone_number\}\}/g,
      contact.phone_number || ""
    );

    // Build WhatsApp template message (same format as send-campaign)
    const sanitizedName = template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const templateLanguage = template.language || "en";

    // Detect media type from raw template content
    const rawContent = template.content || "";
    let headerMediaType: string | null = null;
    if (rawContent.startsWith("[Image Header]")) headerMediaType = "image";
    else if (rawContent.startsWith("[Video Header]")) headerMediaType = "video";
    else if (rawContent.startsWith("[Document Header]")) headerMediaType = "document";

    // Build template components
    const components: Record<string, unknown>[] = [];

    // Extract {{N}} style variables and resolve them
    const varMatches = rawContent.match(/\{\{(\d+)\}\}/g);
    if (varMatches) {
      const varNums = [...new Set(varMatches)].map((v) => v.replace(/\D/g, "")).sort((a, b) => parseInt(a) - parseInt(b));
      const bodyParams = varNums.map((num) => {
        // Simple mapping: {{1}} = name, {{2}} = phone
        if (num === "1") return { type: "text", text: contact.name || "Customer" };
        if (num === "2") return { type: "text", text: contact.phone_number || "" };
        return { type: "text", text: "" };
      });
      components.push({ type: "body", parameters: bodyParams });
    }

    const content: Record<string, unknown> = {
      type: "template",
      template: {
        name: sanitizedName,
        language: { code: templateLanguage, policy: "deterministic" },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    const payload = {
      whatsapp: {
        messages: [
          {
            from: creds.senderNumber,
            to: contact.phone_number,
            content,
          },
        ],
      },
    };

    try {
      // Balance check
      const RATES: Record<string, number> = {
        marketing: 1.0,
        utility: 0.2,
        authentication: 0.2,
      };
      const GST_RATE = 0.18;
      const category = template.category?.toLowerCase() || "marketing";
      const ratePerMsg = RATES[category] || 1.0;

      const { data: wallet } = await supabase
        .from("org_wallets")
        .select("balance")
        .eq("org_id", orgId)
        .maybeSingle();

      const costPerMsg = ratePerMsg * (1 + GST_RATE);
      if ((wallet?.balance ?? 0) < costPerMsg) {
        // Insufficient balance — pause automation
        await supabase
          .from("automations")
          .update({ status: "paused", updated_at: new Date().toISOString() })
          .eq("id", automation.id);
        return;
      }

      const exotelResponse = await fetch(exotelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await exotelResponse.json();
      const msgData = result?.response?.whatsapp?.messages?.[0];

      // Insert message record
      const { data: msgRecord } = await supabase
        .from("messages")
        .insert({
          contact_id: contact.id,
          content: message,
          status:
            exotelResponse.ok && msgData?.status === "success"
              ? "sent"
              : "failed",
          org_id: orgId,
          direction: "outbound",
          sent_at:
            exotelResponse.ok && msgData?.status === "success"
              ? new Date().toISOString()
              : null,
          exotel_message_id: msgData?.data?.sid || null,
          error_message:
            exotelResponse.ok && msgData?.status === "success"
              ? null
              : JSON.stringify(result).slice(0, 500),
        })
        .select("id")
        .single();

      if (exotelResponse.ok && msgData?.status === "success") {
        // Debit wallet
        const categoryMap: Record<string, string> = {
          marketing: "marketing_message",
          utility: "utility_message",
          authentication: "auth_message",
        };
        const gstAmount = Math.round(ratePerMsg * GST_RATE * 100) / 100;

        await supabase.rpc("debit_wallet", {
          _org_id: orgId,
          _amount: ratePerMsg,
          _category: categoryMap[category] || "marketing_message",
          _description: `Automation: ${automation.name} → ${contact.phone_number}`,
          _reference_id: automation.id,
        });
        if (gstAmount > 0) {
          await supabase.rpc("debit_wallet", {
            _org_id: orgId,
            _amount: gstAmount,
            _category: "gst",
            _description: `GST on automation message`,
            _reference_id: automation.id,
          });
        }

        stats.sent++;

        // Advance to next step
        const nextStepOrder = step.step_order + 1;
        const nextStep = allSteps.find(
          (s: any) => s.step_order === nextStepOrder
        );

        if (!nextStep || nextStepOrder > maxStep) {
          await supabase
            .from("automation_contacts")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              last_message_id: msgRecord?.id,
              last_message_status: "sent",
            })
            .eq("id", ac.id);
          stats.completed++;
        } else if (nextStep.step_type === "wait") {
          const waitMs = (nextStep.wait_hours || 24) * 3600000;
          await supabase
            .from("automation_contacts")
            .update({
              current_step_order: nextStepOrder,
              status: "waiting",
              step_entered_at: new Date().toISOString(),
              next_action_at: new Date(Date.now() + waitMs).toISOString(),
              last_message_id: msgRecord?.id,
              last_message_status: "sent",
            })
            .eq("id", ac.id);
        } else {
          await supabase
            .from("automation_contacts")
            .update({
              current_step_order: nextStepOrder,
              status: "in_progress",
              step_entered_at: new Date().toISOString(),
              last_message_id: msgRecord?.id,
              last_message_status: "sent",
            })
            .eq("id", ac.id);
        }
      } else {
        await supabase
          .from("automation_contacts")
          .update({
            status: "failed",
            last_message_id: msgRecord?.id,
            last_message_status: "failed",
          })
          .eq("id", ac.id);
        stats.errors++;
      }
    } catch (err) {
      console.error("Send error:", err);
      await supabase
        .from("automation_contacts")
        .update({ status: "failed" })
        .eq("id", ac.id);
      stats.errors++;
    }
  } else if (step.step_type === "wait") {
    // Set waiting status with next_action_at
    const waitMs = (step.wait_hours || 24) * 3600000;
    await supabase
      .from("automation_contacts")
      .update({
        status: "waiting",
        step_entered_at: new Date().toISOString(),
        next_action_at: new Date(Date.now() + waitMs).toISOString(),
      })
      .eq("id", ac.id);
  } else if (step.step_type === "condition") {
    // Evaluate condition based on last message status
    // First, refresh last_message_status from the messages table
    if (ac.last_message_id) {
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("status")
        .eq("id", ac.last_message_id)
        .single();

      if (lastMsg) {
        ac.last_message_status = lastMsg.status;
        await supabase
          .from("automation_contacts")
          .update({ last_message_status: lastMsg.status })
          .eq("id", ac.id);
      }
    }

    // Check if there's been a reply (inbound message from this contact after the last outbound)
    let hasReplied = false;
    if (ac.last_message_id) {
      const { data: lastSent } = await supabase
        .from("messages")
        .select("sent_at")
        .eq("id", ac.last_message_id)
        .single();

      if (lastSent?.sent_at) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("phone_number")
          .eq("id", ac.contact_id)
          .single();

        if (contact) {
          const { count: replyCount } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("org_id", automation.org_id)
            .eq("direction", "inbound")
            .eq("contact_id", ac.contact_id)
            .gt("created_at", lastSent.sent_at);

          hasReplied = (replyCount ?? 0) > 0;
        }
      }
    }

    const currentStatus = hasReplied ? "replied" : ac.last_message_status || "sent";
    const rules = (step.rules as { status: string; goto_step: number }[]) || [];

    // Find matching rule
    let matchedGoto: number | null = null;
    for (const rule of rules) {
      if (rule.status === currentStatus) {
        matchedGoto = rule.goto_step;
        break;
      }
    }

    // Fallback: check for "no_response" if nothing matched
    if (matchedGoto === null) {
      const noResponseRule = rules.find((r) => r.status === "no_response");
      if (noResponseRule) {
        matchedGoto = noResponseRule.goto_step;
      }
    }

    if (matchedGoto === null || matchedGoto > maxStep) {
      // No matching rule or out of bounds — complete
      await supabase
        .from("automation_contacts")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", ac.id);
      stats.completed++;
      return;
    }

    // If goto_step is 0, it means "stop / remove from automation"
    if (matchedGoto === 0) {
      await supabase
        .from("automation_contacts")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", ac.id);
      stats.completed++;
      return;
    }

    const targetStep = allSteps.find((s: any) => s.step_order === matchedGoto);
    if (!targetStep) {
      await supabase
        .from("automation_contacts")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", ac.id);
      stats.completed++;
      return;
    }

    // Move to the target step
    await supabase
      .from("automation_contacts")
      .update({
        current_step_order: matchedGoto,
        status: "in_progress",
        step_entered_at: new Date().toISOString(),
        next_action_at: null,
      })
      .eq("id", ac.id);

    stats.advanced++;

    // Process the target step
    await processStep(
      supabase,
      automation,
      targetStep,
      { ...ac, current_step_order: matchedGoto },
      allSteps,
      maxStep,
      creds,
      exotelUrl,
      stats
    );
  }
}
