import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Find campaigns that are scheduled and due
    const now = new Date().toISOString();
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ launched: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let launched = 0;
    for (const campaign of campaigns) {
      // Atomically transition to running
      const { data: transitioned } = await supabase.rpc("transition_campaign_status", {
        _campaign_id: campaign.id,
        _from_status: "scheduled",
        _to_status: "running",
      });

      if (!transitioned) continue;

      // Fire send-campaign
      fetch(`${supabaseUrl}/functions/v1/send-campaign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaign_id: campaign.id }),
      }).catch((err) => {
        console.error(`Failed to launch campaign ${campaign.id}:`, err.message);
      });

      launched++;
    }

    return new Response(JSON.stringify({ launched }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("launch-scheduled error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
