import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();

    // Validate: 10-digit Indian mobile
    const clean = (phone || "").replace(/\D/g, "");
    if (clean.length !== 10 || !/^[6-9]/.test(clean)) {
      return new Response(
        JSON.stringify({ error: "Invalid mobile number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalized = `+91${clean}`;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit: max 5 OTPs per phone per hour
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count } = await supabase
      .from("public_otp_verifications")
      .select("*", { count: "exact", head: true })
      .eq("identifier", normalized)
      .gte("created_at", oneHourAgo);

    if ((count || 0) >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Generate & store OTP
    const otpCode = generateOtp();
    const { data: otpRecord, error: insertErr } = await supabase
      .from("public_otp_verifications")
      .insert({ identifier: normalized, identifier_type: "phone", otp_code: otpCode })
      .select("session_id")
      .single();

    if (insertErr || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Failed to create OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load Exotel config
    const { data: config } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!config?.exotel_sid) {
      // Test mode: return OTP directly when WhatsApp isn't configured
      return new Response(
        JSON.stringify({
          success: true,
          sessionId: otpRecord.session_id,
          isTestMode: true,
          testOtp: otpCode,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send WhatsApp template message via Exotel
    const toPhone = normalized.replace("+", "");
    const fromNumber = config.whatsapp_source_number.replace("+", "");
    const subdomain = config.exotel_subdomain || "api.exotel.com";

    const payload = {
      custom_data: toPhone,
      whatsapp: {
        messages: [
          {
            from: fromNumber,
            to: toPhone,
            content: {
              type: "template",
              template: {
                name: "otp",
                language: { code: "en" },
                components: [
                  {
                    type: "body",
                    parameters: [{ type: "text", text: otpCode }],
                  },
                  {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [{ type: "text", text: otpCode }],
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const exotelUrl = `https://${config.exotel_api_key}:${config.exotel_api_token}@${subdomain}/v2/accounts/${config.exotel_sid}/messages`;

    const res = await fetch(exotelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Exotel error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: otpRecord.session_id,
        message: "OTP sent to your WhatsApp",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
