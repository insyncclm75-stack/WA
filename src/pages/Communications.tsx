import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MessageWithRelations {
  id: string;
  content: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  error_message: string | null;
  campaigns: { name: string } | null;
  contacts: { name: string | null; phone_number: string } | null;
}

const statusBadge: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sent: "bg-info/10 text-info",
  delivered: "bg-success/10 text-success",
  read: "bg-primary/10 text-primary",
  failed: "bg-destructive/10 text-destructive",
};

export default function Communications() {
  const [messages, setMessages] = useState<MessageWithRelations[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchMessages = async () => {
    setLoading(true);
    let query = supabase
      .from("messages")
      .select("id, content, status, sent_at, created_at, error_message, campaigns(name), contacts(name, phone_number)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    setMessages((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchMessages(); }, [filter]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [filter]);

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Communications Hub</h1>
          <p className="text-muted-foreground">Real-time message delivery log</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading...</p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No messages found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.campaigns?.name || "—"}</TableCell>
                    <TableCell>{m.contacts?.name || "—"}</TableCell>
                    <TableCell>{m.contacts?.phone_number}</TableCell>
                    <TableCell>
                      <Badge className={statusBadge[m.status] || ""}>{m.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.sent_at ? new Date(m.sent_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                      {m.error_message || ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
