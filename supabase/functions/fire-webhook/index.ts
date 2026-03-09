import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Fire outbound webhooks for a given event.
 * Called internally by other edge functions when events occur.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { org_id, event, payload } = await req.json();

    if (!org_id || !event || !payload) {
      return new Response(JSON.stringify({ error: "org_id, event, and payload required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find active webhooks for this org + event
    const { data: webhooks } = await supabase
      .from("outbound_webhooks")
      .select("*")
      .eq("org_id", org_id)
      .eq("status", "active")
      .contains("events", [event]);

    if (!webhooks || webhooks.length === 0) {
      return new Response(JSON.stringify({ success: true, detail: "No webhooks for this event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const webhook of webhooks) {
      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(webhook.headers || {}),
      };

      // HMAC signature if secret is set
      if (webhook.secret) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(webhook.secret);
        const key = await crypto.subtle.importKey(
          "raw",
          keyData,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
        const hexSig = Array.from(new Uint8Array(signature))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        headers["X-Webhook-Signature"] = `sha256=${hexSig}`;
      }

      let responseStatus = 0;
      let responseBody = "";
      let success = false;

      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });
        responseStatus = res.status;
        responseBody = (await res.text()).substring(0, 1000);
        success = res.ok;
      } catch (err) {
        responseBody = (err as Error).message;
      }

      // Log delivery
      await supabase.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        event,
        payload,
        response_status: responseStatus,
        response_body: responseBody,
        success,
      });

      results.push({ webhook_id: webhook.id, success, status: responseStatus });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fire-webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
