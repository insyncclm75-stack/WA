import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Play, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-info/10 text-info",
  running: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

export default function Campaigns() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Tables<"campaigns">[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [templates, setTemplates] = useState<Tables<"templates">[]>([]);
  const [form, setForm] = useState({ name: "", description: "", template_id: "", template_message: "" });

  const fetchCampaigns = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    setCampaigns(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false });
      if (!cancelled) { setCampaigns(data ?? []); setLoading(false); }
    })();
    (async () => {
      const { data } = await supabase.from("templates").select("*").eq("status", "approved").eq("org_id", currentOrg.id);
      if (!cancelled) setTemplates(data || []);
    })();
    return () => { cancelled = true; };
  }, [currentOrg]);

  const createCampaign = async () => {
    if (!user || !currentOrg || !form.name) return;
    const { error } = await supabase.from("campaigns").insert({
      user_id: user.id,
      org_id: currentOrg.id,
      name: form.name,
      description: form.description || null,
      template_id: form.template_id || null,
      template_message: form.template_message || null,
    });
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Campaign created" });
      setForm({ name: "", description: "", template_id: "", template_message: "" });
      setCreateOpen(false);
      fetchCampaigns();
    }
  };

  const launchCampaign = async (id: string) => {
    const { count } = await supabase
      .from("campaign_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id);

    if (!count || count === 0) {
      toast({ variant: "destructive", title: "No contacts", description: "Assign contacts to this campaign first." });
      return;
    }

    const { error } = await supabase
      .from("campaigns")
      .update({ status: "running" })
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Campaign launched!" });
      supabase.functions.invoke("send-campaign", { body: { campaign_id: id } });
      fetchCampaigns();
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Campaigns</h1>
          <p className="text-muted-foreground">Create and manage WhatsApp campaigns</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Campaign</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Campaign Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Summer Offer 2026" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <Label>WhatsApp Template</Label>
                <Select
                  value={form.template_id}
                  onValueChange={(id) => {
                    const t = templates.find(x => x.id === id);
                    setForm({ ...form, template_id: id, template_message: t?.content || "" });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an approved template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Message Preview</Label>
                <Textarea value={form.template_message} readOnly className="bg-muted/50" rows={4} />
              </div>
              <Button onClick={createCampaign} className="w-full">Create Campaign</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No campaigns yet. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Card key={c.id} className="border-border">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{c.name}</CardTitle>
                  {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
                </div>
                <Badge className={statusColor[c.status] || ""}>{c.status}</Badge>
              </CardHeader>
              <CardContent>
                {c.template_message && (
                  <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{c.template_message}</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  {c.status === "draft" && (
                    <Button size="sm" className="gap-1" onClick={() => launchCampaign(c.id)}>
                      <Play className="h-3.5 w-3.5" /> Launch
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
