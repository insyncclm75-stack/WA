import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  Bot,
  Zap,
  Users,
  Clock,
} from "lucide-react";

interface ChatbotFlow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_value: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function Chatbots() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [flows, setFlows] = useState<ChatbotFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});

  const fetchFlows = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("chatbot_flows")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("updated_at", { ascending: false });
    setFlows((data as any) ?? []);
    setLoading(false);

    // Fetch session counts
    if (data && data.length > 0) {
      const counts: Record<string, number> = {};
      for (const f of data) {
        const { count } = await supabase
          .from("chatbot_sessions")
          .select("*", { count: "exact", head: true })
          .eq("flow_id", f.id);
        counts[f.id] = count ?? 0;
      }
      setSessionCounts(counts);
    }
  }, [currentOrg]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const toggleStatus = async (flow: ChatbotFlow) => {
    const newStatus = flow.status === "active" ? "paused" : "active";
    await supabase
      .from("chatbot_flows")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", flow.id);
    fetchFlows();
    toast({ title: `Chatbot ${newStatus}` });
  };

  const deleteFlow = async (id: string) => {
    await supabase.from("chatbot_flows").delete().eq("id", id);
    fetchFlows();
    toast({ title: "Chatbot deleted" });
  };

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  };

  const triggerLabel: Record<string, string> = {
    keyword: "Keyword trigger",
    first_message: "First message trigger",
    all_messages: "All messages trigger",
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Chatbot Builder</h1>
          <p className="text-muted-foreground">Visual drag-and-drop chatbot flows for automated conversations</p>
        </div>
        <Button onClick={() => navigate("/chatbot/new")}>
          <Plus className="mr-2 h-4 w-4" /> New Chatbot
        </Button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">No chatbots yet. Build your first automated flow.</p>
            <Button onClick={() => navigate("/chatbot/new")} variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Create Chatbot
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => (
            <Card key={flow.id} className="overflow-hidden transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold">{flow.name}</h3>
                    </div>
                    {flow.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{flow.description}</p>
                    )}
                  </div>
                  <Badge className={cn("ml-2 text-xs", statusColor[flow.status])}>
                    {flow.status}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {triggerLabel[flow.trigger_type] || flow.trigger_type}
                    {flow.trigger_value && `: "${flow.trigger_value}"`}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {sessionCounts[flow.id] || 0} sessions
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(flow.updated_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate(`/chatbot/${flow.id}`)}
                  >
                    <Edit className="mr-1 h-3 w-3" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleStatus(flow)}
                  >
                    {flow.status === "active" ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteFlow(flow.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
