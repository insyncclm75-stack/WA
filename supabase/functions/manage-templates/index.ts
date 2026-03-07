import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getExotelCreds } from "../_shared/get-exotel-creds.ts";

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

    const body = await req.json();
    const { action, org_id } = body;

    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve Exotel credentials for this org
    const creds = await getExotelCreds(supabase, org_id);
    const exotelAuth = `Basic ${btoa(`${creds.apiKey}:${creds.apiToken}`)}`;
    const baseUrl = `https://${creds.subdomain}/v2/accounts/${creds.accountSid}/templates`;

    // ── SUBMIT ──
    if (action === "submit") {
      const { name, category, language, components } = body;

      // Sanitize template name: Exotel only allows lowercase letters and underscores
      const sanitizedName = name.toLowerCase().replace(/[^a-z_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

      // Call Exotel to submit template
      const exotelPayload = {
        whatsapp: {
          templates: [{ template: { name: sanitizedName, category, language, components } }],
        },
      };
      console.log("Exotel request URL:", `${baseUrl}?waba_id=${creds.wabaId}`);
      console.log("Exotel payload:", JSON.stringify(exotelPayload, null, 2));

      const exotelRes = await fetch(`${baseUrl}?waba_id=${creds.wabaId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: exotelAuth,
        },
        body: JSON.stringify(exotelPayload),
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

      // Save to DB as pending, scoped to org
      const { data: inserted, error: dbError } = await supabase
        .from("templates")
        .insert({
          user_id: user.id,
          org_id,
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
      const exotelRes = await fetch(`${baseUrl}?waba_id=${creds.wabaId}`, {
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

      // Exotel response: { response: { whatsapp: { templates: [{ data: { name, status, id, ... } }] } } }
      const rawTemplates = exotelData?.response?.whatsapp?.templates || [];
      const exotelTemplates = rawTemplates
        .filter((t: any) => t.data)
        .map((t: any) => t.data);

      let updatedCount = 0;
      let importedCount = 0;

      // Scope DB query to org
      const { data: dbTemplates } = await supabase
        .from("templates")
        .select("id, name, exotel_template_id, status")
        .eq("org_id", org_id);

      const dbNames = new Set((dbTemplates || []).map((t: any) => t.name?.toLowerCase()));
      const dbExotelIds = new Set((dbTemplates || []).filter((t: any) => t.exotel_template_id).map((t: any) => t.exotel_template_id));

      // Update existing DB templates with Exotel status
      for (const dbTpl of (dbTemplates || [])) {
        const match = exotelTemplates.find((et: any) =>
          (dbTpl.exotel_template_id && et.id === dbTpl.exotel_template_id) ||
          et.name?.toLowerCase() === dbTpl.name?.toLowerCase()
        );

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

      // Import templates from Exotel that don't exist in DB
      for (const et of exotelTemplates) {
        if (!et.name) continue;
        const alreadyExists = dbNames.has(et.name.toLowerCase()) || dbExotelIds.has(et.id);
        if (alreadyExists) continue;

        // Build content from components
        const bodyComp = (et.components || []).find((c: any) => c.type === "BODY");
        const headerComp = (et.components || []).find((c: any) => c.type === "HEADER");
        let contentText = bodyComp?.text || et.name;
        if (headerComp?.format === "IMAGE") contentText = "[Image Header]\n" + contentText;
        else if (headerComp?.format === "VIDEO") contentText = "[Video Header]\n" + contentText;
        else if (headerComp?.format === "TEXT" && headerComp?.text) contentText = headerComp.text + "\n\n" + contentText;

        await supabase.from("templates").insert({
          user_id: user.id,
          org_id,
          name: et.name,
          content: contentText,
          category: (et.category || "MARKETING").toLowerCase(),
          language: et.language || "en",
          status: (et.status || "pending").toLowerCase(),
          exotel_template_id: et.id || null,
        });
        importedCount++;
      }

      return new Response(JSON.stringify({ success: true, synced: updatedCount, imported: importedCount, exotel_count: exotelTemplates.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ──
    if (action === "delete") {
      const { template_id, template_name } = body;

      const exotelRes = await fetch(`${baseUrl}?waba_id=${creds.wabaId}&name=${encodeURIComponent(template_name)}`, {
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
