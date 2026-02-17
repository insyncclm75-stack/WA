import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Megaphone, MessageSquare, CheckCircle, Clock, XCircle } from "lucide-react";

interface Stats {
  totalContacts: number;
  totalCampaigns: number;
  totalMessages: number;
  sentMessages: number;
  deliveredMessages: number;
  failedMessages: number;
}

export default function Index() {
  const [stats, setStats] = useState<Stats>({
    totalContacts: 0,
    totalCampaigns: 0,
    totalMessages: 0,
    sentMessages: 0,
    deliveredMessages: 0,
    failedMessages: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const [contacts, campaigns, messages] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase.from("campaigns").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id, status"),
      ]);

      const msgs = messages.data || [];
      setStats({
        totalContacts: contacts.count ?? 0,
        totalCampaigns: campaigns.count ?? 0,
        totalMessages: msgs.length,
        sentMessages: msgs.filter((m) => m.status === "sent" || m.status === "delivered" || m.status === "read").length,
        deliveredMessages: msgs.filter((m) => m.status === "delivered" || m.status === "read").length,
        failedMessages: msgs.filter((m) => m.status === "failed").length,
      });
    };
    fetchStats();
  }, []);

  const cards = [
    { title: "Total Contacts", value: stats.totalContacts, icon: Users, color: "text-info" },
    { title: "Campaigns", value: stats.totalCampaigns, icon: Megaphone, color: "text-primary" },
    { title: "Messages Sent", value: stats.sentMessages, icon: MessageSquare, color: "text-success" },
    { title: "Delivered", value: stats.deliveredMessages, icon: CheckCircle, color: "text-success" },
    { title: "Pending", value: stats.totalMessages - stats.sentMessages - stats.failedMessages, icon: Clock, color: "text-warning" },
    { title: "Failed", value: stats.failedMessages, icon: XCircle, color: "text-destructive" },
  ];

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Overview of your WhatsApp campaigns</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
