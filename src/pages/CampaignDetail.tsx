import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<Tables<"campaigns"> | null>(null);
  const [allContacts, setAllContacts] = useState<Tables<"contacts">[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<(Tables<"messages"> & { contacts: { name: string | null; phone_number: string } | null })[]>([]);

  useEffect(() => {
    if (!id || !currentOrg) return;
    let cancelled = false;
    const load = async () => {
      const [campRes, contactsRes, assignedRes, msgsRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).eq("org_id", currentOrg.id).maybeSingle(),
        supabase.from("contacts").select("*").eq("org_id", currentOrg.id),
        supabase.from("campaign_contacts").select("contact_id").eq("campaign_id", id),
        supabase.from("messages").select("*, contacts(name, phone_number)").eq("campaign_id", id).eq("org_id", currentOrg.id).order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setCampaign(campRes.data);
      setAllContacts(contactsRes.data ?? []);
      const ids = new Set((assignedRes.data ?? []).map((a) => a.contact_id));
      setAssignedIds(ids);
      setSelectedIds(new Set(ids));
      setMessages((msgsRes.data as any) ?? []);
    };
    load();
    return () => { cancelled = true; };
  }, [id, currentOrg]);

  const toggleContact = (contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const saveAssignments = async () => {
    if (!id || !currentOrg) return;
    const toRemove = [...assignedIds].filter((cid) => !selectedIds.has(cid));
    const toAdd = [...selectedIds].filter((cid) => !assignedIds.has(cid));

    if (toRemove.length > 0) {
      await supabase.from("campaign_contacts").delete().eq("campaign_id", id).in("contact_id", toRemove);
    }
    if (toAdd.length > 0) {
      await supabase.from("campaign_contacts").insert(
        toAdd.map((contact_id) => ({ campaign_id: id, contact_id, org_id: currentOrg.id }))
      );
    }

    setAssignedIds(new Set(selectedIds));
    toast({ title: "Contacts updated" });
  };

  if (!campaign) return <DashboardLayout><p className="py-8 text-center text-muted-foreground">Loading...</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{campaign.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge>{campaign.status}</Badge>
          {campaign.description && <span className="text-muted-foreground">{campaign.description}</span>}
        </div>
      </div>

      {campaign.template_message && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">Message Template</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{campaign.template_message.replace(/^\[(Image|Video|Document) Header\]\n?/, "").trim()}</p></CardContent>
        </Card>
      )}

      {campaign.status === "draft" && (
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm"><UserPlus className="h-4 w-4" /> Assign Contacts ({selectedIds.size})</CardTitle>
            <Button size="sm" onClick={saveAssignments}>Save</Button>
          </CardHeader>
          <CardContent>
            {allContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts available. Add contacts first.</p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {allContacts.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-accent">
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleContact(c.id)} />
                    <span className="text-sm font-medium">{c.name || c.phone_number}</span>
                    <span className="text-xs text-muted-foreground">{c.phone_number}</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Message Log</CardTitle></CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No messages sent yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.contacts?.name || "—"}</TableCell>
                    <TableCell>{m.contacts?.phone_number}</TableCell>
                    <TableCell><Badge variant="outline">{m.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{m.sent_at ? new Date(m.sent_at).toLocaleString() : "—"}</TableCell>
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
