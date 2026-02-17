import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify auth
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

    const apiKey = Deno.env.get("EXOTEL_API_KEY")!;
    const apiToken = Deno.env.get("EXOTEL_API_TOKEN")!;
    const subdomain = Deno.env.get("EXOTEL_SUBDOMAIN")!;
    const wabaId = Deno.env.get("EXOTEL_WABA_ID")!;
    const accountSid = Deno.env.get("EXOTEL_ACCOUNT_SID")!;
    const exotelAuth = `Basic ${btoa(`${apiKey}:${apiToken}`)}`;
    const baseUrl = `https://${subdomain}/v2/accounts/${accountSid}/templates`;

    const body = await req.json();
    const { action } = body;

    // ── SUBMIT ──
    if (action === "submit") {
      const { name, category, language, components } = body;

      // Call Exotel to submit template
      const exotelRes = await fetch(`${baseUrl}?waba_id=${wabaId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: exotelAuth,
        },
        body: JSON.stringify({
          whatsapp: {
            templates: [{ name, category, language, components }],
          },
        }),
      });

      const exotelData = await exotelRes.json();

      if (!exotelRes.ok) {
        return new Response(JSON.stringify({ error: "Exotel API error", details: exotelData }), {
          status: exotelRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const exotelTemplateId = exotelData?.id || exotelData?.data?.id || null;

      // Build a readable content string from components for DB storage
      const bodyComp = (components || []).find((c: any) => c.type === "BODY");
      const headerComp = (components || []).find((c: any) => c.type === "HEADER");
      let contentText = bodyComp?.text || name;

      // Include header info in content for display
      if (headerComp?.format === "IMAGE") {
        contentText = "[Image Header]\n" + contentText;
      } else if (headerComp?.format === "VIDEO") {
        contentText = "[Video Header]\n" + contentText;
      } else if (headerComp?.format === "TEXT" && headerComp?.text) {
        contentText = headerComp.text + "\n\n" + contentText;
      }

      // Save to DB as pending
      const { data: inserted, error: dbError } = await supabase
        .from("templates")
        .insert({
          user_id: user.id,
          name,
          content: contentText,
          category,
          language,
          status: "pending",
          exotel_template_id: exotelTemplateId,
        })
        .select()
        .single();

      if (dbError) {
        return new Response(JSON.stringify({ error: "DB error", details: dbError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, template: inserted, exotel: exotelData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SYNC ──
    if (action === "sync") {
      const exotelRes = await fetch(`${baseUrl}?waba_id=${wabaId}`, {
        method: "GET",
        headers: { Authorization: exotelAuth },
      });

      const exotelData = await exotelRes.json();

      if (!exotelRes.ok) {
        return new Response(JSON.stringify({ error: "Exotel API error", details: exotelData }), {
          status: exotelRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const exotelTemplates = exotelData?.data || exotelData?.templates || exotelData || [];
      let updatedCount = 0;

      const { data: dbTemplates } = await supabase
        .from("templates")
        .select("id, name, exotel_template_id, status")
        .eq("user_id", user.id);

      for (const dbTpl of (dbTemplates || [])) {
        const match = Array.isArray(exotelTemplates)
          ? exotelTemplates.find((et: any) =>
              (dbTpl.exotel_template_id && et.id === dbTpl.exotel_template_id) ||
              et.name === dbTpl.name
            )
          : null;

        if (match) {
          const newStatus = (match.status || "").toLowerCase();
          if (["approved", "rejected", "pending"].includes(newStatus) && newStatus !== dbTpl.status) {
            await supabase
              .from("templates")
              .update({ status: newStatus, exotel_template_id: match.id || dbTpl.exotel_template_id })
              .eq("id", dbTpl.id);
            updatedCount++;
          }
        }
      }

      return new Response(JSON.stringify({ success: true, synced: updatedCount, exotel_count: Array.isArray(exotelTemplates) ? exotelTemplates.length : 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ──
    if (action === "delete") {
      const { template_id, template_name } = body;

      const exotelRes = await fetch(`${baseUrl}?waba_id=${wabaId}&name=${encodeURIComponent(template_name)}`, {
        method: "DELETE",
        headers: { Authorization: exotelAuth },
      });

      const { error: dbError } = await supabase
        .from("templates")
        .delete()
        .eq("id", template_id);

      if (dbError) {
        return new Response(JSON.stringify({ error: "DB delete error", details: dbError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, exotel_status: exotelRes.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: submit, sync, delete" }), {
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
