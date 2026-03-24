import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const { data: { user }, error: authErr } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { automation_id, contacts, org_id } = await req.json();
    if (!automation_id || !contacts?.length || !org_id) {
      throw new Error("Missing automation_id, contacts, or org_id");
    }

    // 1. Upsert contacts (service role key bypasses RLS)
    const contactRows = contacts.map((c: any) => ({
      phone_number: c.phone_number,
      name: c.name || null,
      org_id,
      user_id: user.id,
      source: "automation_csv",
      custom_fields: {},
    }));

    const { error: upsertErr } = await supabase
      .from("contacts")
      .upsert(contactRows, { onConflict: "phone_number,org_id", ignoreDuplicates: true });

    if (upsertErr) throw new Error(`Contact upsert failed: ${upsertErr.message}`);

    // 2. Query contact IDs by phone numbers
    const phones = contacts.map((c: any) => c.phone_number);
    const { data: found, error: findErr } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", org_id)
      .in("phone_number", phones);

    if (findErr) throw new Error(`Contact query failed: ${findErr.message}`);
    if (!found || found.length === 0) throw new Error("No contacts found after upsert");

    // 3. Link contacts to automation
    const links = found.map((c: any) => ({
      automation_id,
      contact_id: c.id,
    }));

    const { error: linkErr } = await supabase
      .from("automation_contacts")
      .insert(links);

    if (linkErr) throw new Error(`Linking failed: ${linkErr.message}`);

    return new Response(
      JSON.stringify({ success: true, linked: found.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
