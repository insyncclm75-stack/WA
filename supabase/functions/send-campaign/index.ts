import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getExotelCreds } from "../_shared/get-exotel-creds.ts";

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

    // Check admin
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract org_id from campaign record
    const orgId = campaign.org_id;
    const messageCategory = campaign.message_category || "marketing";

    // Message rate based on category
    const RATES: Record<string, number> = { marketing: 1.0, utility: 0.2, authentication: 0.2 };
    const GST_RATE = 0.18;
    const ratePerMsg = RATES[messageCategory] || 1.0;

    // Get assigned contacts
    const { data: assignments } = await supabase
      .from("campaign_contacts")
      .select("contact_id, contacts(id, phone_number, name)")
      .eq("campaign_id", campaign_id);

    const contacts = (assignments ?? [])
      .map((a: any) => a.contacts)
      .filter(Boolean);

    if (contacts.length === 0) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "No contacts assigned" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Balance check ──
    const costPerMsg = ratePerMsg * (1 + GST_RATE); // rate + GST
    const estimatedCost = Math.round(contacts.length * costPerMsg * 100) / 100;

    const { data: wallet } = await supabase
      .from("org_wallets")
      .select("balance")
      .eq("org_id", orgId)
      .maybeSingle();

    const currentBalance = wallet?.balance ?? 0;
    if (currentBalance < estimatedCost) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaign_id);
      return new Response(JSON.stringify({
        error: "Insufficient balance",
        required: estimatedCost,
        current_balance: currentBalance,
        shortfall: Math.round((estimatedCost - currentBalance) * 100) / 100,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve Exotel credentials (per-org or platform defaults)
    const creds = await getExotelCreds(supabase, orgId);
    const exotelUrl = `https://${creds.apiKey}:${creds.apiToken}@${creds.subdomain}/v2/accounts/${creds.accountSid}/messages`;

    let successCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      // Personalize message
      const message = (campaign.template_message || "")
        .replace(/\{\{name\}\}/g, contact.name || "Customer");

      // Create message record with org_id
      const { data: msgRecord } = await supabase
        .from("messages")
        .insert({
          campaign_id,
          contact_id: contact.id,
          content: message,
          media_url: campaign.media_url,
          status: "pending",
          org_id: orgId,
        })
        .select("id")
        .single();

      try {
        // Build Exotel WhatsApp API payload
        const content: Record<string, unknown> = campaign.media_url
          ? {
              recipient_type: "individual",
              type: "image",
              image: { link: campaign.media_url, caption: message },
            }
          : {
              recipient_type: "individual",
              type: "text",
              text: { preview_url: false, body: message },
            };

        const payload = {
          whatsapp: {
            messages: [
              {
                from: creds.senderNumber,
                to: contact.phone_number,
                content,
              },
            ],
          },
        };

        const exotelResponse = await fetch(exotelUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await exotelResponse.json();
        const msgData = result?.response?.whatsapp?.messages?.[0];

        if (exotelResponse.ok && msgData?.status === "success") {
          await supabase
            .from("messages")
            .update({
              status: "sent",
              exotel_message_id: msgData?.data?.sid || null,
              sent_at: new Date().toISOString(),
            })
            .eq("id", msgRecord!.id);

          // Debit wallet: message charge + GST
          const gstAmount = Math.round(ratePerMsg * GST_RATE * 100) / 100;
          const categoryMap: Record<string, string> = {
            marketing: "marketing_message",
            utility: "utility_message",
            authentication: "auth_message",
          };
          await supabase.rpc("debit_wallet", {
            _org_id: orgId,
            _amount: ratePerMsg,
            _category: categoryMap[messageCategory] || "marketing_message",
            _description: `${messageCategory} message to ${contact.phone_number}`,
            _reference_id: campaign_id,
          });
          // Debit GST separately
          if (gstAmount > 0) {
            await supabase.rpc("debit_wallet", {
              _org_id: orgId,
              _amount: gstAmount,
              _category: "gst",
              _description: `GST on ${messageCategory} message`,
              _reference_id: campaign_id,
            });
          }

          successCount++;
        } else {
          await supabase
            .from("messages")
            .update({
              status: "failed",
              error_message: JSON.stringify(result).slice(0, 500),
            })
            .eq("id", msgRecord!.id);
          failCount++;
        }
      } catch (err) {
        await supabase
          .from("messages")
          .update({
            status: "failed",
            error_message: (err as Error).message,
          })
          .eq("id", msgRecord!.id);
        failCount++;
      }
    }

    // Update campaign status
    const finalStatus = failCount === contacts.length ? "failed" : "completed";
    await supabase.from("campaigns").update({ status: finalStatus }).eq("id", campaign_id);

    return new Response(
      JSON.stringify({ success: true, sent: successCount, failed: failCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
