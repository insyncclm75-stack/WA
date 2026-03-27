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

    // ── Detect Exotel webhook callbacks (inbound messages / DLR statuses) ──
    // Exotel ISV sends ALL events to this URL, but inbound messages and
    // status updates should be handled by whatsapp-webhook instead.
    const hasMessages =
      body?.response?.whatsapp?.messages ||
      body?.whatsapp?.messages ||
      body?.messages ||
      body?.response?.whatsapp?.statuses ||
      body?.whatsapp?.statuses ||
      body?.statuses;
    const isExotelCallback = hasMessages && !body.action;

    if (isExotelCallback) {
      // Forward to whatsapp-webhook for processing
      const webhookRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const webhookResult = await webhookRes.text();
      return new Response(webhookResult, {
        status: webhookRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Below is the admin setup flow — requires auth ──
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

    const { action, org_id } = body;

    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is admin of this org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GENERATE EXOTEL ISV ONBOARDING LINK ──
    if (action === "generate_link") {
      const apiKey = Deno.env.get("EXOTEL_API_KEY")!;
      const apiToken = Deno.env.get("EXOTEL_API_TOKEN")!;
      const subdomain = Deno.env.get("EXOTEL_SUBDOMAIN")!;
      const accountSid = Deno.env.get("EXOTEL_ACCOUNT_SID")!;

      const isvUrl = `https://${subdomain}/v2/accounts/${accountSid}/isv`;
      const auth = `Basic ${btoa(`${apiKey}:${apiToken}`)}`;

      // Get org info for context
      const { data: org } = await supabase
        .from("organizations")
        .select("name, website")
        .eq("id", org_id)
        .single();

      const isvRes = await fetch(isvUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({
          whatsapp: {
            isv: {
              Url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-onboarding`,
            },
          },
        }),
      });

      const isvText = await isvRes.text();
      console.log("Exotel ISV response:", isvRes.status, isvText);

      let isvData: any;
      try { isvData = JSON.parse(isvText); } catch { isvData = { raw: isvText }; }

      if (!isvRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to generate onboarding link", details: isvData }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, data: isvData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SAVE DEFAULT SETUP (phone numbers) ──
    if (action === "save_numbers") {
      const { phone_numbers } = body;

      if (!phone_numbers || !Array.isArray(phone_numbers) || phone_numbers.length === 0) {
        return new Response(JSON.stringify({ error: "At least one phone number is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (phone_numbers.length > 4) {
        return new Response(JSON.stringify({ error: "Maximum 4 phone numbers allowed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { phone_logos } = body;

      // Save phone numbers, logos, and mark setup type as default
      const { error: credError } = await supabase
        .from("org_credentials")
        .upsert({
          org_id,
          phone_numbers,
          phone_logos: phone_logos || {},
          setup_type: "default",
          exotel_sender_number: phone_numbers[0],
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id" });

      if (credError) {
        return new Response(JSON.stringify({ error: "Failed to save numbers", details: credError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SAVE FACEBOOK SETUP ──
    if (action === "save_facebook") {
      const { error: credError } = await supabase
        .from("org_credentials")
        .upsert({
          org_id,
          setup_type: "facebook",
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id" });

      if (credError) {
        return new Response(JSON.stringify({ error: "Failed to save setup", details: credError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE WHATSAPP PROFILE PICTURES ──
    if (action === "update_profile_pictures") {
      const systemToken = Deno.env.get("META_SYSTEM_USER_TOKEN");
      const fbAppId = Deno.env.get("FB_APP_ID");
      const wabaId = Deno.env.get("EXOTEL_WABA_ID");

      if (!systemToken || !fbAppId) {
        return new Response(JSON.stringify({ error: "Meta System User Token not configured" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get org credentials with phone logos
      const { data: creds } = await supabase
        .from("org_credentials")
        .select("phone_numbers, phone_logos")
        .eq("org_id", org_id)
        .maybeSingle();

      if (!creds?.phone_numbers?.length) {
        return new Response(JSON.stringify({ error: "No phone numbers found for this org" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const logos: Record<string, string> = creds.phone_logos || {};
      const results: Record<string, any> = {};

      // Get all phone numbers registered on the WABA
      const phoneListRes = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${systemToken}`
      );
      const phoneListData = await phoneListRes.json();
      console.log("WABA phone numbers:", JSON.stringify(phoneListData));

      const registeredPhones: any[] = phoneListData?.data || [];

      for (const number of creds.phone_numbers) {
        const logoUrl = logos[number];
        if (!logoUrl) {
          results[number] = { skipped: "no logo" };
          continue;
        }

        // Find the phone_number_id for this number
        const cleanNumber = number.replace(/[^0-9]/g, "");
        const phoneEntry = registeredPhones.find((p: any) => {
          const registeredClean = (p.display_phone_number || "").replace(/[^0-9]/g, "");
          return registeredClean === cleanNumber || registeredClean.endsWith(cleanNumber) || cleanNumber.endsWith(registeredClean);
        });

        if (!phoneEntry?.id) {
          results[number] = { skipped: "not found on WABA" };
          continue;
        }

        try {
          // Step 1: Download the logo
          const logoRes = await fetch(logoUrl);
          if (!logoRes.ok) {
            results[number] = { error: "Failed to download logo" };
            continue;
          }
          const logoBytes = await logoRes.arrayBuffer();
          const logoBuffer = new Uint8Array(logoBytes);
          const contentType = logoRes.headers.get("content-type") || "image/jpeg";
          const fileSize = logoBuffer.length;

          // Step 2: Upload to Meta via Resumable Upload API
          const sessionUrl = `https://graph.facebook.com/v21.0/${fbAppId}/uploads?file_length=${fileSize}&file_type=${encodeURIComponent(contentType)}&access_token=${systemToken}`;
          const sessionRes = await fetch(sessionUrl, { method: "POST" });
          const sessionData = await sessionRes.json();

          if (!sessionData?.id) {
            results[number] = { error: "Upload session failed", details: sessionData };
            continue;
          }

          const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${sessionData.id}`, {
            method: "POST",
            headers: {
              Authorization: `OAuth ${systemToken}`,
              file_offset: "0",
            },
            body: logoBuffer,
          });
          const uploadData = await uploadRes.json();

          if (!uploadData?.h) {
            results[number] = { error: "Upload failed", details: uploadData };
            continue;
          }

          // Step 3: Update WhatsApp Business profile with the picture handle
          const profileRes = await fetch(
            `https://graph.facebook.com/v21.0/${phoneEntry.id}/whatsapp_business_profile`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${systemToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                profile_picture_handle: uploadData.h,
              }),
            }
          );
          const profileData = await profileRes.json();
          console.log(`Profile update for ${number}:`, JSON.stringify(profileData));

          results[number] = profileRes.ok
            ? { success: true }
            : { error: "Profile update failed", details: profileData };
        } catch (err) {
          results[number] = { error: (err as Error).message };
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: generate_link, save_numbers, save_facebook, update_profile_pictures" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
