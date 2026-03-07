import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, confirmationEmailHtml, resetPasswordEmailHtml } from "../_shared/resend.ts";

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
    const body = await req.json();
    const { type } = body;

    // ── Registration confirmation ──
    if (type === "register") {
      const { email, password } = body;
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "email and password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const siteUrl = Deno.env.get("SITE_URL") || "https://wa.in-sync.co.in";

      // generateLink creates the user (if new) AND returns a confirmation link
      // without sending Supabase's built-in email
      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: "signup",
          email,
          password,
          options: { redirectTo: `${siteUrl}/login` },
        });

      if (linkError) {
        return new Response(
          JSON.stringify({ error: linkError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const confirmLink = linkData?.properties?.action_link;
      if (!confirmLink) {
        return new Response(
          JSON.stringify({ error: "Failed to generate confirmation link" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await sendEmail({
        to: email,
        subject: "Confirm your InSync account",
        html: confirmationEmailHtml(confirmLink),
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Password reset ──
    if (type === "reset_password") {
      const { email } = body;
      if (!email) {
        return new Response(
          JSON.stringify({ error: "email is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const siteUrl = Deno.env.get("SITE_URL") || "https://wa.in-sync.co.in";

      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${siteUrl}/reset-password` },
        });

      if (linkError) {
        // Don't reveal whether the email exists — always return success
        console.error("Password reset link error:", linkError.message);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const resetLink = linkData?.properties?.action_link;
      if (resetLink) {
        await sendEmail({
          to: email,
          subject: "Reset your InSync password",
          html: resetPasswordEmailHtml(resetLink),
        });
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid type. Use: register, reset_password" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
