import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, otp } = await req.json();

    if (!sessionId || !otp) {
      return new Response(
        JSON.stringify({ error: "sessionId and otp are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the OTP record: must be unverified and not expired
    const { data: record, error: fetchErr } = await supabase
      .from("public_otp_verifications")
      .select("*")
      .eq("session_id", sessionId)
      .is("verified_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (fetchErr || !record) {
      return new Response(
        JSON.stringify({ error: "OTP expired or invalid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (record.attempts >= record.max_attempts) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Request a new OTP." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (record.otp_code !== otp) {
      // Increment attempt count
      await supabase
        .from("public_otp_verifications")
        .update({ attempts: record.attempts + 1 })
        .eq("id", record.id);

      return new Response(
        JSON.stringify({ error: "Incorrect OTP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark as verified
    await supabase
      .from("public_otp_verifications")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", record.id);

    return new Response(
      JSON.stringify({ verified: true, identifier: record.identifier }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
