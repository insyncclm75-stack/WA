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

      // Sanitize template name: lowercase letters, numbers, and underscores only
      const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

      // For media headers, upload to Facebook Graph API to get a handle
      const processedComponents = [...components];
      for (let i = 0; i < processedComponents.length; i++) {
        const comp = processedComponents[i];
        if (
          comp.type === "HEADER" &&
          ["IMAGE", "VIDEO", "DOCUMENT"].includes(comp.format) &&
          comp.example?.header_handle?.[0]
        ) {
          const mediaUrl = comp.example.header_handle[0];
          console.log("Processing media header, URL:", mediaUrl);

          const fbAccessToken = Deno.env.get("FB_ACCESS_TOKEN");
          const fbAppId = Deno.env.get("FB_APP_ID");

          if (!fbAccessToken || !fbAppId) {
            // No Facebook credentials — try submitting with header_url as fallback
            console.log("No FB credentials, trying header_url fallback");
            processedComponents[i] = {
              ...comp,
              example: { header_url: [mediaUrl] },
            };
            continue;
          }

          try {
            // Fetch media to get size and type
            const mediaRes = await fetch(mediaUrl);
            if (!mediaRes.ok) {
              return new Response(JSON.stringify({ error: "Failed to fetch media file from storage" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            const mediaBytes = await mediaRes.arrayBuffer();
            const mediaBuffer = new Uint8Array(mediaBytes);
            const contentType = mediaRes.headers.get("content-type") || "application/octet-stream";
            const fileSize = mediaBuffer.length;
            console.log("Media size:", fileSize, "type:", contentType);

            // Step 1: Create upload session on Facebook Graph API
            const sessionUrl = `https://graph.facebook.com/v21.0/${fbAppId}/uploads?file_length=${fileSize}&file_type=${encodeURIComponent(contentType)}&access_token=${fbAccessToken}`;
            const sessionRes = await fetch(sessionUrl, { method: "POST" });
            const sessionText = await sessionRes.text();
            console.log("FB upload session response:", sessionRes.status, sessionText);

            let sessionData: any;
            try { sessionData = JSON.parse(sessionText); } catch { sessionData = { raw: sessionText }; }

            if (!sessionRes.ok || !sessionData?.id) {
              return new Response(JSON.stringify({ error: "Facebook media upload session failed", details: sessionData }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            // Step 2: Upload media bytes
            const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${sessionData.id}`, {
              method: "POST",
              headers: {
                Authorization: `OAuth ${fbAccessToken}`,
                file_offset: "0",
              },
              body: mediaBuffer,
            });
            const uploadText = await uploadRes.text();
            console.log("FB media upload response:", uploadRes.status, uploadText);

            let uploadData: any;
            try { uploadData = JSON.parse(uploadText); } catch { uploadData = { raw: uploadText }; }

            if (!uploadRes.ok || !uploadData?.h) {
              return new Response(JSON.stringify({ error: "Facebook media upload failed", details: uploadData }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            processedComponents[i] = {
              ...comp,
              example: { header_handle: [uploadData.h] },
            };
            console.log("Got FB media handle:", uploadData.h);
          } catch (mediaErr) {
            console.error("Media upload error:", (mediaErr as Error).message);
            return new Response(JSON.stringify({
              error: "Media processing failed: " + (mediaErr as Error).message,
            }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      // Call Exotel to submit template
      const exotelPayload = {
        whatsapp: {
          templates: [{ template: { name: sanitizedName, category, language, components: processedComponents } }],
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
      console.log("Exotel submit response status:", exotelRes.status);
      console.log("Exotel submit response:", JSON.stringify(exotelData, null, 2));

      if (!exotelRes.ok) {
        // Return 200 so the frontend can read the error details
        return new Response(JSON.stringify({ error: "Exotel API error", details: exotelData, exotel_status: exotelRes.status }), {
          status: 200,
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
      } else if (headerComp?.format === "DOCUMENT") {
        contentText = "[Document Header]\n" + contentText;
      } else if (headerComp?.format === "TEXT" && headerComp?.text) {
        contentText = headerComp.text + "\n\n" + contentText;
      }

      // Extract buttons from components for DB storage
      const buttonsComp = (components || []).find((c: any) => c.type === "BUTTONS");
      const buttonsData = buttonsComp?.buttons || [];

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
          buttons: buttonsData,
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

      // Scope DB query to org — only update templates the org created
      const { data: dbTemplates } = await supabase
        .from("templates")
        .select("id, name, exotel_template_id, status")
        .eq("org_id", org_id);

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

      return new Response(JSON.stringify({ success: true, synced: updatedCount, exotel_count: exotelTemplates.length }), {
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
