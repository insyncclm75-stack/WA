// Temporary diagnostic function to test webhook processing step-by-step
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

  const steps: string[] = [];
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    steps.push(`env: url=${supabaseUrl ? "SET" : "MISSING"}, key=${supabaseServiceKey ? "SET" : "MISSING"}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check orgs
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, slug")
      .order("created_at", { ascending: true })
      .limit(3);
    steps.push(`orgs: ${JSON.stringify(orgs?.map(o => ({ id: o.id?.slice(0,8), name: o.name, slug: o.slug })))} err=${orgErr?.message || "none"}`);

    // Check org_credentials
    const { data: creds, error: credErr } = await supabase
      .from("org_credentials")
      .select("org_id, exotel_sender_number, phone_numbers")
      .limit(3);
    steps.push(`creds: ${JSON.stringify(creds?.map(c => ({ org: c.org_id?.slice(0,8), sender: c.exotel_sender_number, phones: c.phone_numbers })))} err=${credErr?.message || "none"}`);

    // Check contacts with phone like 9033888423
    const { data: contacts, error: contactErr } = await supabase
      .from("contacts")
      .select("id, phone_number, name, org_id")
      .or("phone_number.like.%9033888423%,phone_number.like.%903388842%")
      .limit(5);
    steps.push(`contacts_9033: ${JSON.stringify(contacts?.map(c => ({ id: c.id?.slice(0,8), phone: c.phone_number, org: c.org_id?.slice(0,8) })))} err=${contactErr?.message || "none"}`);

    // Check conversations
    const { data: convos, error: convoErr } = await supabase
      .from("conversations")
      .select("id, phone_number, contact_id, last_message_preview, status")
      .order("created_at", { ascending: false })
      .limit(5);
    steps.push(`convos: ${JSON.stringify(convos?.map(c => ({ id: c.id?.slice(0,8), phone: c.phone_number, preview: c.last_message_preview?.slice(0,30), status: c.status })))} err=${convoErr?.message || "none"}`);

    // Check recent messages
    const { data: msgs, error: msgErr } = await supabase
      .from("messages")
      .select("id, direction, status, content, created_at, conversation_id, exotel_message_id")
      .order("created_at", { ascending: false })
      .limit(5);
    steps.push(`recent_msgs: ${JSON.stringify(msgs?.map(m => ({ id: m.id?.slice(0,8), dir: m.direction, status: m.status, content: m.content?.slice(0,30), exotel_id: m.exotel_message_id })))} err=${msgErr?.message || "none"}`);

    // Check inbound messages specifically
    const { data: inbound, error: inErr } = await supabase
      .from("messages")
      .select("id, content, created_at")
      .eq("direction", "inbound")
      .limit(5);
    steps.push(`inbound_msgs: count=${inbound?.length || 0} err=${inErr?.message || "none"}`);

    // Check EXOTEL env vars
    steps.push(`exotel_env: sender=${Deno.env.get("EXOTEL_SENDER_NUMBER") || "MISSING"}`);

    // Now simulate processing an inbound message
    const testFrom = "919033888423";
    const testTo = Deno.env.get("EXOTEL_SENDER_NUMBER") || "unknown";
    steps.push(`test_simulate: from=${testFrom} to=${testTo}`);

    // Try contact lookup
    function normalizePhone(raw: string): string {
      let num = raw.replace(/[\s\-\+\(\)]/g, "");
      num = num.replace(/^0+/, "");
      if (/^\d{10}$/.test(num)) num = "91" + num;
      return num;
    }

    const phoneCandidates = [...new Set([
      testFrom,
      "+" + testFrom,
      testFrom.startsWith("91") ? testFrom.slice(2) : null,
    ].filter(Boolean) as string[])];

    for (const candidate of phoneCandidates) {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, phone_number")
        .eq("phone_number", candidate)
        .limit(1);
      steps.push(`contact_lookup "${candidate}": ${JSON.stringify(data)} err=${error?.message || "none"}`);
    }

    return new Response(JSON.stringify({ steps }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    steps.push(`FATAL: ${(err as Error).message}`);
    return new Response(JSON.stringify({ steps }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
