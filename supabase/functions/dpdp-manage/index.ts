import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * DPDP Compliance Management:
 * - Set/rotate encryption key (stored encrypted in pii_encryption_keys)
 * - Check key status
 * - Encrypt existing contacts
 * - Export contact data (data subject access request)
 * - Handle erasure requests
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, org_id, ...params } = await req.json();

    // Verify org membership
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SET ENCRYPTION KEY ──
    if (action === "set_encryption_key") {
      if (membership.role !== "admin") {
        return jsonRes({ error: "Admin only" }, 403);
      }

      const { encryption_key } = params;
      if (!encryption_key || encryption_key.length < 16) {
        return jsonRes({ error: "Encryption key must be at least 16 characters" }, 400);
      }

      // Master passphrase for wrapping the org key
      const masterPass = `dpdp-insync-${org_id}`;

      // Encrypt the org's key with the master passphrase using pgcrypto
      const { data: encrypted, error: encErr } = await supabase.rpc("pgp_sym_encrypt_rpc", {
        plaintext: encryption_key,
        passphrase: masterPass,
      });

      // If RPC doesn't exist, use raw SQL
      let keyCiphertext: string;
      if (encErr) {
        // Direct SQL approach
        const { data: sqlResult, error: sqlErr } = await supabase
          .from("pii_encryption_keys")
          .select("id")
          .eq("org_id", org_id)
          .eq("status", "active")
          .maybeSingle();

        // Deactivate existing key
        if (sqlResult) {
          await supabase
            .from("pii_encryption_keys")
            .update({ status: "rotated", rotated_at: new Date().toISOString() })
            .eq("id", sqlResult.id);
        }

        // Use edge function to call raw SQL for encryption
        const { data: encResult } = await supabase.rpc("encrypt_key_for_storage", {
          p_org_id: org_id,
          p_key: encryption_key,
          p_master: masterPass,
          p_user_id: user.id,
          p_hint: encryption_key.slice(-4),
        });

        if (encResult) {
          // Enable DPDP for the org
          await supabase
            .from("organizations")
            .update({ dpdp_enabled: true })
            .eq("id", org_id);

          return jsonRes({ success: true, message: "Encryption key set and DPDP enabled" });
        }

        // Final fallback: insert via service role with raw RPC
        // The encrypt_key_for_storage function handles this
        return jsonRes({ error: "Failed to store encryption key. Ensure pgcrypto is enabled." }, 500);
      }

      return jsonRes({ success: true });
    }

    // ── CHECK KEY STATUS ──
    if (action === "check_key_status") {
      const { data: keyRow } = await supabase
        .from("pii_encryption_keys")
        .select("id, key_hint, status, created_at, rotated_at")
        .eq("org_id", org_id)
        .eq("status", "active")
        .maybeSingle();

      const { data: org } = await supabase
        .from("organizations")
        .select("dpdp_enabled, dpo_email, dpo_phone, privacy_policy_url, data_retention_days")
        .eq("id", org_id)
        .single();

      const { count: encryptedCount } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org_id)
        .eq("pii_encrypted", true);

      const { count: totalContacts } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org_id);

      const { count: consentCount } = await supabase
        .from("consent_records")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org_id)
        .is("withdrawn_at", null);

      const { count: pendingRequests } = await supabase
        .from("data_requests")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org_id)
        .eq("status", "pending");

      const { count: piiAccessCount } = await supabase
        .from("pii_access_log")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org_id);

      return jsonRes({
        key_active: !!keyRow,
        key_hint: keyRow?.key_hint || null,
        key_created_at: keyRow?.created_at || null,
        dpdp_enabled: org?.dpdp_enabled || false,
        dpo_email: org?.dpo_email || null,
        dpo_phone: org?.dpo_phone || null,
        privacy_policy_url: org?.privacy_policy_url || null,
        data_retention_days: org?.data_retention_days || 730,
        encrypted_contacts: encryptedCount ?? 0,
        total_contacts: totalContacts ?? 0,
        active_consents: consentCount ?? 0,
        pending_requests: pendingRequests ?? 0,
        pii_access_count: piiAccessCount ?? 0,
      });
    }

    // ── UPDATE DPDP SETTINGS ──
    if (action === "update_settings") {
      if (membership.role !== "admin") {
        return jsonRes({ error: "Admin only" }, 403);
      }

      const { dpo_email, dpo_phone, privacy_policy_url, data_retention_days } = params;
      await supabase
        .from("organizations")
        .update({
          dpo_email: dpo_email || null,
          dpo_phone: dpo_phone || null,
          privacy_policy_url: privacy_policy_url || null,
          data_retention_days: data_retention_days || 730,
        })
        .eq("id", org_id);

      return jsonRes({ success: true });
    }

    // ── ENCRYPT EXISTING CONTACTS ──
    if (action === "encrypt_existing") {
      if (membership.role !== "admin") {
        return jsonRes({ error: "Admin only" }, 403);
      }

      // Fetch unencrypted contacts
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, email, custom_fields")
        .eq("org_id", org_id)
        .or("pii_encrypted.is.null,pii_encrypted.eq.false")
        .limit(500);

      if (!contacts || contacts.length === 0) {
        return jsonRes({ success: true, encrypted: 0, message: "No unencrypted contacts" });
      }

      let encrypted = 0;
      for (const contact of contacts) {
        // Trigger-based: just update with same data to fire the trigger
        const { error } = await supabase
          .from("contacts")
          .update({
            name: contact.name,
            email: contact.email,
            custom_fields: contact.custom_fields,
            updated_at: new Date().toISOString(),
          })
          .eq("id", contact.id);

        if (!error) encrypted++;
      }

      return jsonRes({ success: true, encrypted, total: contacts.length });
    }

    // ── EXPORT CONTACT DATA (Data Subject Access Request) ──
    if (action === "export_contact_data") {
      const { contact_id } = params;
      if (!contact_id) return jsonRes({ error: "contact_id required" }, 400);

      // Get decrypted contact data
      const { data: decrypted } = await supabase.rpc("get_contact_decrypted", {
        p_contact_id: contact_id,
        p_purpose: "data_subject_access_request",
      });

      // Get messages
      const { data: messages } = await supabase
        .from("messages")
        .select("content, direction, status, created_at")
        .eq("contact_id", contact_id)
        .eq("org_id", org_id)
        .order("created_at", { ascending: true });

      // Get consent records
      const { data: consents } = await supabase
        .from("consent_records")
        .select("purpose, consent_version, consented_at, withdrawn_at")
        .eq("contact_id", contact_id);

      // Log the data request
      await supabase.from("data_requests").insert({
        org_id,
        contact_id,
        request_type: "access",
        status: "completed",
        completed_at: new Date().toISOString(),
        details: { exported_by: user.id },
      });

      return jsonRes({
        contact: decrypted || {},
        messages: messages || [],
        consents: consents || [],
        exported_at: new Date().toISOString(),
      });
    }

    // ── HANDLE ERASURE REQUEST ──
    if (action === "process_erasure") {
      if (membership.role !== "admin") {
        return jsonRes({ error: "Admin only" }, 403);
      }

      const { request_id } = params;
      const { data: request } = await supabase
        .from("data_requests")
        .select("*")
        .eq("id", request_id)
        .eq("org_id", org_id)
        .single();

      if (!request || request.request_type !== "erasure") {
        return jsonRes({ error: "Invalid erasure request" }, 400);
      }

      if (request.contact_id) {
        // Anonymize contact data
        await supabase
          .from("contacts")
          .update({
            name: "[ERASED]",
            email: null,
            name_encrypted: null,
            email_encrypted: null,
            custom_fields: {},
            custom_fields_encrypted: null,
            tags: [],
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.contact_id);

        // Delete message content (keep metadata for billing records)
        await supabase
          .from("messages")
          .update({ content: "[ERASED]", media_url: null })
          .eq("contact_id", request.contact_id)
          .eq("org_id", org_id);
      }

      // Mark request as completed
      await supabase
        .from("data_requests")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          admin_notes: `Processed by ${user.email}`,
        })
        .eq("id", request_id);

      return jsonRes({ success: true });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("dpdp-manage error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}
