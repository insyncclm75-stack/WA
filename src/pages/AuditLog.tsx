import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Shield,
  ChevronLeft,
  ChevronRight,
  User,
  FileText,
  MessageSquare,
  Settings,
  Users,
  Megaphone,
} from "lucide-react";

interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

const actionColors: Record<string, string> = {
  created: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  deleted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  launched: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  login: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const resourceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  campaign: Megaphone,
  template: FileText,
  contact: Users,
  conversation: MessageSquare,
  settings: Settings,
  user: User,
};

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(actionColors)) {
    if (action.includes(key)) return color;
  }
  return "bg-muted text-muted-foreground";
}

export default function AuditLog() {
  const { currentOrg } = useOrg();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // Fetch user emails for display
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});

  const fetchLogs = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    let query = supabase
      .from("audit_logs")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (actionFilter !== "all") {
      query = query.ilike("action", `%${actionFilter}%`);
    }
    if (search) {
      query = query.or(`action.ilike.%${search}%,resource_type.ilike.%${search}%`);
    }

    const { data } = await query;
    setEntries((data as any) ?? []);

    // Fetch user emails
    const userIds = [...new Set((data || []).map((e: any) => e.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);
      const emailMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        emailMap[p.id] = p.email;
      });
      setUserEmails(emailMap);
    }

    setLoading(false);
  }, [currentOrg, page, actionFilter, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Audit Log</h1>
        <p className="text-muted-foreground">Track all actions and changes in your organization</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search actions..."
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
            <SelectItem value="launched">Launched</SelectItem>
            <SelectItem value="login">Login</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading...</p>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">No audit entries found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const Icon = resourceIcons[entry.resource_type || ""] || Shield;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.user_id ? (userEmails[entry.user_id] || entry.user_id.slice(0, 8)) : "System"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${getActionColor(entry.action)}`}>
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{entry.resource_type || "—"}</span>
                          {entry.resource_id && (
                            <span className="text-xs text-muted-foreground">({entry.resource_id.slice(0, 8)})</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {Object.keys(entry.details || {}).length > 0 ? (
                          <code className="text-[11px] text-muted-foreground">
                            {JSON.stringify(entry.details).substring(0, 80)}
                            {JSON.stringify(entry.details).length > 80 ? "..." : ""}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page + 1}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={entries.length < PAGE_SIZE}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
