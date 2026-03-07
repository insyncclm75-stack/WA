import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, invitationEmailHtml } from "../_shared/resend.ts";

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

    // Check caller is admin of this org (or super_admin)
    const { data: callerMembership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: isSuperAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });

    if (!isSuperAdmin && callerMembership?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: org admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST ──
    if (action === "list") {
      // Get org memberships
      const { data: memberships } = await supabase
        .from("org_memberships")
        .select("user_id, role")
        .eq("org_id", org_id);

      if (!memberships || memberships.length === 0) {
        return new Response(JSON.stringify({ success: true, users: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch auth user details for each member
      const userIds = memberships.map(m => m.user_id);
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();

      const roleMap: Record<string, string> = {};
      for (const m of memberships) {
        roleMap[m.user_id] = m.role;
      }

      const users = (authUsers || [])
        .filter((u: any) => userIds.includes(u.id))
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          role: roleMap[u.id] || "member",
          created_at: u.created_at,
          email_confirmed_at: u.email_confirmed_at,
          last_sign_in_at: u.last_sign_in_at,
        }));

      return new Response(JSON.stringify({ success: true, users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE ──
    if (action === "create") {
      const { email, password, role } = body;

      if (!email || !password || !role) {
        return new Response(JSON.stringify({ error: "email, password, and role are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        return new Response(JSON.stringify({ error: "Failed to create user", details: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert org membership
      const { error: memberError } = await supabase
        .from("org_memberships")
        .insert({ org_id, user_id: newUser.user.id, role });

      if (memberError) {
        // Rollback: delete the created user
        await supabase.auth.admin.deleteUser(newUser.user.id);
        return new Response(JSON.stringify({ error: "Failed to assign role, user creation rolled back", details: memberError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Send invitation email (best effort — don't fail the operation if email fails)
      try {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", org_id)
          .single();

        const siteUrl = Deno.env.get("SITE_URL") || "https://wa.in-sync.co.in";
        const orgName = org?.name || "your organization";

        await sendEmail({
          to: email,
          subject: `You've been invited to ${orgName} on InSync`,
          html: invitationEmailHtml(orgName, email, password, `${siteUrl}/login`),
        });
      } catch (emailErr) {
        console.error("Failed to send invitation email:", emailErr);
      }

      return new Response(JSON.stringify({ success: true, user: { id: newUser.user.id, email: newUser.user.email, role } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE ROLE ──
    if (action === "update_role") {
      const { user_id, role } = body;

      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id and role are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Block self-modification
      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot modify your own role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: roleError } = await supabase
        .from("org_memberships")
        .update({ role })
        .eq("org_id", org_id)
        .eq("user_id", user_id);

      if (roleError) {
        return new Response(JSON.stringify({ error: "Failed to update role", details: roleError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ──
    if (action === "delete") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Block self-deletion
      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove membership from this org
      await supabase
        .from("org_memberships")
        .delete()
        .eq("org_id", org_id)
        .eq("user_id", user_id);

      // Check if user has other org memberships
      const { count } = await supabase
        .from("org_memberships")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id);

      // If no other orgs, delete auth user entirely
      if (!count || count === 0) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);
        if (deleteError) {
          return new Response(JSON.stringify({ error: "Failed to delete user", details: deleteError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: list, create, update_role, delete" }), {
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
