import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, startOfDay } from "date-fns";

// --- Types ---

export interface PlatformSummary {
  totalOrgs: number;
  totalUsers: number;
  uniqueUserOrgs: number;
  totalCampaigns: number;
  recentCampaigns: number;
  totalMessagesSent: number;
  todayMessages: number;
  deliveryRate: number;
  delivered: number;
  totalDeliverable: number;
  templatesApproved: number;
  templatesPending: number;
}

export interface OrgRow {
  id: string;
  name: string;
  industry: string | null;
  onboarding_completed: boolean;
  created_at: string;
  members: number;
  contacts: number;
  campaigns: number;
  messages: number;
  delivered: number;
  deliveryRate: number;
  lastActivity: string | null;
}

export interface MessageTimePoint {
  date: string;
  delivered: number;
  failed: number;
  pending: number;
}

export interface TemplateStats {
  approved: number;
  pending: number;
  rejected: number;
  orgsPending: { orgName: string; count: number }[];
  orgsRejected: { orgName: string; count: number }[];
}

export interface ErrorPattern {
  category: string;
  count: number;
  sample: string;
}

export interface IssuesAnalysis {
  patterns: ErrorPattern[];
  summary: string;
  recommendations: string[];
}

export interface ActivityItem {
  id: string;
  type: "org_created" | "campaign_created" | "achievement_unlocked";
  orgName: string;
  detail: string;
  timestamp: string;
}

export interface PlatformDashboardData {
  summary: PlatformSummary;
  organizations: OrgRow[];
  messageTimeSeries: MessageTimePoint[];
  templateStats: TemplateStats;
  issues: IssuesAnalysis;
  activityFeed: ActivityItem[];
}

const EMPTY_DATA: PlatformDashboardData = {
  summary: {
    totalOrgs: 0, totalUsers: 0, uniqueUserOrgs: 0,
    totalCampaigns: 0, recentCampaigns: 0,
    totalMessagesSent: 0, todayMessages: 0,
    deliveryRate: 0, delivered: 0, totalDeliverable: 0,
    templatesApproved: 0, templatesPending: 0,
  },
  organizations: [],
  messageTimeSeries: [],
  templateStats: { approved: 0, pending: 0, rejected: 0, orgsPending: [], orgsRejected: [] },
  issues: { patterns: [], summary: "", recommendations: [] },
  activityFeed: [],
};

// --- Error categorization ---

function categorizeError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid") && lower.includes("phone")) return "Invalid Phone Numbers";
  if (lower.includes("template") && (lower.includes("not approved") || lower.includes("unapproved"))) return "Unapproved Templates";
  if (lower.includes("rate") && lower.includes("limit")) return "API Rate Limiting";
  if (lower.includes("balance") || lower.includes("credit")) return "Insufficient Balance";
  if (lower.includes("opt") && lower.includes("out")) return "Opted-Out Recipients";
  if (lower.includes("timeout")) return "API Timeouts";
  if (lower.includes("media") && (lower.includes("large") || lower.includes("size"))) return "Media Size Issues";
  return "Other Errors";
}

function buildRecommendations(patterns: ErrorPattern[]): string[] {
  const recs: string[] = [];
  for (const p of patterns) {
    switch (p.category) {
      case "Invalid Phone Numbers":
        recs.push("Validate phone number formats before importing contacts (E.164 format recommended).");
        break;
      case "Unapproved Templates":
        recs.push("Ensure all templates are approved in the WhatsApp Business Manager before sending campaigns.");
        break;
      case "API Rate Limiting":
        recs.push("Reduce sending speed or stagger campaigns to avoid API rate limits.");
        break;
      case "Insufficient Balance":
        recs.push("Top up API credits for affected organizations to resume message delivery.");
        break;
      case "Opted-Out Recipients":
        recs.push("Remove opted-out contacts from campaign lists to improve delivery rates.");
        break;
      case "API Timeouts":
        recs.push("Check API provider status and consider retry mechanisms for timed-out messages.");
        break;
      case "Media Size Issues":
        recs.push("Compress media files to meet WhatsApp size limits (16MB for media, 100MB for documents).");
        break;
      case "Other Errors":
        recs.push("Review unclassified errors in the message logs for additional troubleshooting.");
        break;
    }
  }
  return recs;
}

// --- Hook ---

export function usePlatformDashboard() {
  const [data, setData] = useState<PlatformDashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const todayStart = startOfDay(new Date()).toISOString();

      const [
        orgsRes,
        membershipsRes,
        contactsRes,
        campaignsRes,
        messagesRes,
        messagesChartRes,
        messagesFailedRes,
        templatesRes,
        achievementsRes,
      ] = await Promise.all([
        supabase.from("organizations").select("*"),
        supabase.from("org_memberships").select("org_id, user_id"),
        supabase.from("contacts").select("org_id"),
        supabase.from("campaigns").select("id, name, org_id, status, created_at"),
        supabase.from("messages").select("org_id, status, created_at"),
        supabase.from("messages").select("status, created_at").gte("created_at", thirtyDaysAgo),
        supabase.from("messages").select("error_message, created_at, org_id").eq("status", "failed").limit(200),
        supabase.from("templates").select("id, name, status, org_id"),
        supabase.from("org_achievements").select("org_id, achievement_id, unlocked_at").order("unlocked_at", { ascending: false }).limit(20),
      ]);

      if (signal?.cancelled) return;

      const orgs = orgsRes.data ?? [];
      const memberships = membershipsRes.data ?? [];
      const contacts = contactsRes.data ?? [];
      const campaigns = campaignsRes.data ?? [];
      const messages = messagesRes.data ?? [];
      const messagesChart = messagesChartRes.data ?? [];
      const messagesFailed = messagesFailedRes.data ?? [];
      const templates = templatesRes.data ?? [];
      const achievements = achievementsRes.data ?? [];

      const orgMap = new Map(orgs.map(o => [o.id, o]));

      // --- Summary ---
      const uniqueUsers = new Set(memberships.map(m => m.user_id));
      const uniqueUserOrgs = new Set(memberships.map(m => m.org_id)).size;
      const recentCampaigns = campaigns.filter(c => c.created_at >= sevenDaysAgo).length;
      const todayMessages = messages.filter(m => m.created_at >= todayStart).length;
      const delivered = messages.filter(m => m.status === "delivered" || m.status === "read").length;
      const failed = messages.filter(m => m.status === "failed").length;
      const totalDeliverable = delivered + failed;
      const deliveryRate = totalDeliverable > 0 ? Math.round((delivered / totalDeliverable) * 100) : 0;
      const templatesApproved = templates.filter(t => t.status === "approved").length;
      const templatesPending = templates.filter(t => t.status === "pending" || t.status === null).length;

      const summary: PlatformSummary = {
        totalOrgs: orgs.length,
        totalUsers: uniqueUsers.size,
        uniqueUserOrgs,
        totalCampaigns: campaigns.length,
        recentCampaigns,
        totalMessagesSent: messages.length,
        todayMessages,
        deliveryRate,
        delivered,
        totalDeliverable,
        templatesApproved,
        templatesPending,
      };

      // --- Org rows ---
      const orgRows: OrgRow[] = orgs.map(o => {
        const orgMsgs = messages.filter(m => m.org_id === o.id);
        const orgDelivered = orgMsgs.filter(m => m.status === "delivered" || m.status === "read").length;
        const orgFailed = orgMsgs.filter(m => m.status === "failed").length;
        const orgTotal = orgDelivered + orgFailed;
        const orgCampaigns = campaigns.filter(c => c.org_id === o.id);

        // Last activity = most recent message or campaign
        const dates = [
          ...orgMsgs.map(m => m.created_at),
          ...orgCampaigns.map(c => c.created_at),
        ];
        const lastActivity = dates.length > 0 ? dates.sort().reverse()[0] : null;

        return {
          id: o.id,
          name: o.name,
          industry: o.industry,
          onboarding_completed: o.onboarding_completed,
          created_at: o.created_at,
          members: memberships.filter(m => m.org_id === o.id).length,
          contacts: contacts.filter(c => c.org_id === o.id).length,
          campaigns: orgCampaigns.length,
          messages: orgMsgs.length,
          delivered: orgDelivered,
          deliveryRate: orgTotal > 0 ? Math.round((orgDelivered / orgTotal) * 100) : 0,
          lastActivity,
        };
      });

      // --- Message time series (last 30 days) ---
      const buckets = new Map<string, { delivered: number; failed: number; pending: number }>();
      for (let i = 29; i >= 0; i--) {
        const key = format(subDays(new Date(), i), "MMM dd");
        buckets.set(key, { delivered: 0, failed: 0, pending: 0 });
      }
      for (const msg of messagesChart) {
        const key = format(new Date(msg.created_at), "MMM dd");
        const bucket = buckets.get(key);
        if (!bucket) continue;
        if (msg.status === "delivered" || msg.status === "read") bucket.delivered++;
        else if (msg.status === "failed") bucket.failed++;
        else bucket.pending++;
      }
      const messageTimeSeries: MessageTimePoint[] = Array.from(buckets.entries()).map(([date, v]) => ({
        date,
        ...v,
      }));

      // --- Template stats ---
      const approved = templates.filter(t => t.status === "approved").length;
      const pending = templates.filter(t => t.status === "pending" || t.status === null).length;
      const rejected = templates.filter(t => t.status === "rejected").length;

      const pendingByOrg = new Map<string, number>();
      const rejectedByOrg = new Map<string, number>();
      for (const t of templates) {
        if (t.status === "pending" || t.status === null) {
          pendingByOrg.set(t.org_id, (pendingByOrg.get(t.org_id) ?? 0) + 1);
        }
        if (t.status === "rejected") {
          rejectedByOrg.set(t.org_id, (rejectedByOrg.get(t.org_id) ?? 0) + 1);
        }
      }

      const templateStats: TemplateStats = {
        approved,
        pending,
        rejected,
        orgsPending: Array.from(pendingByOrg.entries()).map(([orgId, count]) => ({
          orgName: orgMap.get(orgId)?.name ?? "Unknown",
          count,
        })),
        orgsRejected: Array.from(rejectedByOrg.entries()).map(([orgId, count]) => ({
          orgName: orgMap.get(orgId)?.name ?? "Unknown",
          count,
        })),
      };

      // --- Issues / AI Analysis ---
      const errorGroups = new Map<string, { count: number; sample: string }>();
      for (const m of messagesFailed) {
        const raw = m.error_message || "Unknown error";
        const cat = categorizeError(raw);
        const existing = errorGroups.get(cat);
        if (existing) {
          existing.count++;
        } else {
          errorGroups.set(cat, { count: 1, sample: raw });
        }
      }
      const patterns: ErrorPattern[] = Array.from(errorGroups.entries())
        .map(([category, v]) => ({ category, count: v.count, sample: v.sample }))
        .sort((a, b) => b.count - a.count);

      let issueSummary = "";
      if (patterns.length > 0) {
        const topIssues = patterns.slice(0, 3).map(p => `${p.category} (${p.count})`).join(", ");
        issueSummary = `Across all organizations, the top failure reasons are: ${topIssues}. These account for ${patterns.slice(0, 3).reduce((s, p) => s + p.count, 0)} of ${messagesFailed.length} recent failed messages.`;
      }

      const issues: IssuesAnalysis = {
        patterns,
        summary: issueSummary,
        recommendations: buildRecommendations(patterns),
      };

      // --- Activity feed ---
      const feed: ActivityItem[] = [];

      // Org creations
      for (const o of orgs) {
        feed.push({
          id: `org-${o.id}`,
          type: "org_created",
          orgName: o.name,
          detail: `${o.name} was created`,
          timestamp: o.created_at,
        });
      }

      // Recent campaigns
      const recentCampaignsList = campaigns
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10);
      for (const c of recentCampaignsList) {
        const orgName = orgMap.get(c.org_id)?.name ?? "Unknown";
        feed.push({
          id: `campaign-${c.id}`,
          type: "campaign_created",
          orgName,
          detail: `${orgName} created campaign "${c.name}"`,
          timestamp: c.created_at,
        });
      }

      // Achievements
      for (const a of achievements) {
        const orgName = orgMap.get(a.org_id)?.name ?? "Unknown";
        feed.push({
          id: `ach-${a.org_id}-${a.achievement_id}`,
          type: "achievement_unlocked",
          orgName,
          detail: `${orgName} unlocked "${a.achievement_id}"`,
          timestamp: a.unlocked_at,
        });
      }

      feed.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const activityFeed = feed.slice(0, 20);

      if (signal?.cancelled) return;
      setData({
        summary,
        organizations: orgRows,
        messageTimeSeries,
        templateStats,
        issues,
        activityFeed,
      });
    } catch (err) {
      console.error("Platform dashboard fetch error:", err);
      if (!signal?.cancelled) setData(EMPTY_DATA);
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    fetchAll(signal);
    return () => { signal.cancelled = true; };
  }, [fetchAll]);

  const refresh = useCallback(() => {
    fetchAll({ cancelled: false });
  }, [fetchAll]);

  return { data, loading, refresh };
}
