import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { Tables } from "@/integrations/supabase/types";

const COLORS = ["hsl(142,70%,40%)", "hsl(210,100%,50%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)", "hsl(220,10%,46%)"];

export default function Reports() {
  const { currentOrg } = useOrg();
  const [campaigns, setCampaigns] = useState<Tables<"campaigns">[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    supabase.from("campaigns").select("*").eq("org_id", currentOrg.id).order("created_at", { ascending: false }).then(({ data }) => {
      if (!cancelled) setCampaigns(data ?? []);
    });
    return () => { cancelled = true; };
  }, [currentOrg]);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    const fetchReport = async () => {
      setLoading(true);
      let query = supabase.from("messages").select("status").eq("org_id", currentOrg.id);
      if (selectedCampaign !== "all") {
        query = query.eq("campaign_id", selectedCampaign);
      }
      const { data } = await query;
      if (cancelled) return;
      const msgs = data ?? [];
      const counts: Record<string, number> = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
      msgs.forEach((m) => { counts[m.status] = (counts[m.status] || 0) + 1; });
      setStatusData(Object.entries(counts).map(([name, value]) => ({ name, value })));
      setLoading(false);
    };
    fetchReport();
    return () => { cancelled = true; };
  }, [selectedCampaign, currentOrg]);

  const totalMessages = statusData.reduce((s, d) => s + d.value, 0);

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports</h1>
          <p className="text-muted-foreground">Campaign delivery analytics</p>
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : totalMessages === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No message data available yet.</CardContent></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Status Breakdown</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(142,70%,40%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Delivery Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statusData.filter((d) => d.value > 0)} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {statusData.map((d, i) => (
                  <div key={d.name} className="rounded-lg border border-border p-4 text-center">
                    <p className="text-sm capitalize text-muted-foreground">{d.name}</p>
                    <p className="mt-1 text-2xl font-bold" style={{ color: COLORS[i % COLORS.length] }}>{d.value}</p>
                    <p className="text-xs text-muted-foreground">{totalMessages > 0 ? ((d.value / totalMessages) * 100).toFixed(1) : 0}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
