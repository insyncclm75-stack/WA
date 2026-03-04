import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { subDays, startOfMonth, subMonths, format } from "date-fns";

export interface OrgKpis {
  messagesSentMTD: number;
  messagesPrevMonth: number;
  deliveryRate: number;
  deliveryRatePrev: number;
  readRate: number;
  readRatePrev: number;
  totalContacts: number;
  totalContactsPrev: number;
}

export interface WeeklyChartPoint {
  day: string;
  sent: number;
  delivered: number;
  read: number;
}

export interface RecentCampaign {
  id: string;
  name: string;
  status: string;
  category: string | null;
  sent: number;
  delivered: number;
  readRate: number;
  createdAt: string;
}

export interface MessageMixSlice {
  name: string;
  value: number;
}

export interface OrgDashboardData {
  kpis: OrgKpis;
  weeklyChart: WeeklyChartPoint[];
  recentCampaigns: RecentCampaign[];
  messageMix: MessageMixSlice[];
}

const EMPTY_DATA: OrgDashboardData = {
  kpis: {
    messagesSentMTD: 0,
    messagesPrevMonth: 0,
    deliveryRate: 0,
    deliveryRatePrev: 0,
    readRate: 0,
    readRatePrev: 0,
    totalContacts: 0,
    totalContactsPrev: 0,
  },
  weeklyChart: [],
  recentCampaigns: [],
  messageMix: [],
};

export function useOrgDashboard() {
  const { currentOrg } = useOrg();
  const [data, setData] = useState<OrgDashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const orgId = currentOrg?.id ?? null;

  const fetchAll = useCallback(async (signal: { cancelled: boolean }) => {
    if (!orgId) {
      setData(EMPTY_DATA);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const prevMonthStart = startOfMonth(subMonths(now, 1)).toISOString();
      const prevMonthEnd = startOfMonth(now).toISOString();
      const sevenDaysAgo = subDays(now, 6);

      const [contactsRes, campaignsRes, messagesRes, messagesPrevRes, templatesRes] =
        await Promise.all([
          supabase
            .from("contacts")
            .select("id, created_at", { count: "exact" })
            .eq("org_id", orgId),
          supabase
            .from("campaigns")
            .select("id, name, status, template_id, created_at")
            .eq("org_id", orgId)
            .order("created_at", { ascending: false }),
          supabase
            .from("messages")
            .select("id, status, created_at, read_at, campaign_id")
            .eq("org_id", orgId),
          supabase
            .from("messages")
            .select("id, status, read_at")
            .eq("org_id", orgId)
            .gte("created_at", prevMonthStart)
            .lt("created_at", prevMonthEnd),
          supabase
            .from("templates")
            .select("id, category")
            .eq("org_id", orgId),
        ]);

      if (signal.cancelled) return;

      const contacts = contactsRes.data ?? [];
      const campaigns = campaignsRes.data ?? [];
      const messages = messagesRes.data ?? [];
      const messagesPrev = messagesPrevRes.data ?? [];
      const templates = templatesRes.data ?? [];

      const currentMonthMsgs = messages.filter((m) => m.created_at >= monthStart);
      const messagesSentMTD = currentMonthMsgs.length;
      const messagesPrevMonth = messagesPrev.length;

      const delivered = messages.filter(
        (m) => m.status === "delivered" || m.status === "read"
      ).length;
      const failed = messages.filter((m) => m.status === "failed").length;
      const totalDeliverable = delivered + failed;
      const deliveryRate =
        totalDeliverable > 0 ? Math.round((delivered / totalDeliverable) * 100) : 0;

      const prevDelivered = messagesPrev.filter(
        (m) => m.status === "delivered" || m.status === "read"
      ).length;
      const prevFailed = messagesPrev.filter((m) => m.status === "failed").length;
      const prevTotal = prevDelivered + prevFailed;
      const deliveryRatePrev =
        prevTotal > 0 ? Math.round((prevDelivered / prevTotal) * 100) : 0;

      const readCount = messages.filter((m) => m.status === "read").length;
      const readRate = delivered > 0 ? Math.round((readCount / delivered) * 100) : 0;

      const prevReadCount = messagesPrev.filter((m) => m.status === "read").length;
      const readRatePrev =
        prevDelivered > 0 ? Math.round((prevReadCount / prevDelivered) * 100) : 0;

      const totalContacts = contactsRes.count ?? contacts.length;
      const totalContactsPrev = contacts.filter(
        (c) => c.created_at < monthStart
      ).length;

      const kpis: OrgKpis = {
        messagesSentMTD,
        messagesPrevMonth,
        deliveryRate,
        deliveryRatePrev,
        readRate,
        readRatePrev,
        totalContacts,
        totalContactsPrev,
      };

      // Weekly Chart
      const weeklyBuckets = new Map<string, WeeklyChartPoint>();
      for (let i = 0; i < 7; i++) {
        const d = subDays(now, 6 - i);
        const key = format(d, "yyyy-MM-dd");
        weeklyBuckets.set(key, { day: format(d, "EEE"), sent: 0, delivered: 0, read: 0 });
      }
      for (const msg of messages) {
        const msgDate = format(new Date(msg.created_at), "yyyy-MM-dd");
        const bucket = weeklyBuckets.get(msgDate);
        if (!bucket) continue;
        bucket.sent++;
        if (msg.status === "delivered" || msg.status === "read") bucket.delivered++;
        if (msg.status === "read") bucket.read++;
      }
      const weeklyChart = Array.from(weeklyBuckets.values());

      // Recent Campaigns
      const templateMap = new Map(templates.map((t) => [t.id, t]));
      const recentCampaigns: RecentCampaign[] = campaigns.slice(0, 5).map((c) => {
        const campaignMsgs = messages.filter((m) => m.campaign_id === c.id);
        const cSent = campaignMsgs.length;
        const cDelivered = campaignMsgs.filter(
          (m) => m.status === "delivered" || m.status === "read"
        ).length;
        const cRead = campaignMsgs.filter((m) => m.status === "read").length;
        const cReadRate = cDelivered > 0 ? Math.round((cRead / cDelivered) * 100) : 0;
        const tpl = c.template_id ? templateMap.get(c.template_id) : null;
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          category: tpl?.category ?? null,
          sent: cSent,
          delivered: cDelivered,
          readRate: cReadRate,
          createdAt: c.created_at,
        };
      });

      // Message Mix
      const campaignCategoryMap = new Map<string, string>();
      for (const c of campaigns) {
        if (c.template_id) {
          const tpl = templateMap.get(c.template_id);
          if (tpl?.category) campaignCategoryMap.set(c.id, tpl.category);
        }
      }
      const mixCounts: Record<string, number> = {};
      for (const msg of messages) {
        const cat = campaignCategoryMap.get(msg.campaign_id) ?? "uncategorized";
        mixCounts[cat] = (mixCounts[cat] || 0) + 1;
      }
      const messageMix: MessageMixSlice[] = Object.entries(mixCounts)
        .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
        .sort((a, b) => b.value - a.value);

      if (signal.cancelled) return;
      setData({ kpis, weeklyChart, recentCampaigns, messageMix });
    } catch (err) {
      console.error("Org dashboard fetch error:", err);
      if (!signal.cancelled) setData(EMPTY_DATA);
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, [orgId]);

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
