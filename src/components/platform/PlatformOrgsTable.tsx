import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, ArrowUpDown, IndianRupee, Loader2, Trash2, Eye } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import type { OrgRow } from "@/hooks/usePlatformDashboard";

interface Props {
  organizations: OrgRow[];
}

type SortKey = "name" | "members" | "contacts" | "campaigns" | "messages" | "deliveryRate" | "lastActivity";

export function PlatformOrgsTable({ organizations }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Credit dialog state
  const [creditOrg, setCreditOrg] = useState<OrgRow | null>(null);
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditDescription, setCreditDescription] = useState("");
  const [crediting, setCrediting] = useState(false);

  // Delete dialog state
  const ALLOWED_DELETE_EMAILS = ["amina@in-sync.co.in", "a@in-sync.co.in"];
  const canDeleteOrg = user?.email ? ALLOWED_DELETE_EMAILS.includes(user.email.toLowerCase()) : false;
  const [deleteOrg, setDeleteOrg] = useState<OrgRow | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Org details dialog state
  const [detailOrg, setDetailOrg] = useState<OrgRow | null>(null);
  const [detailMembers, setDetailMembers] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const viewOrgDetails = async (org: OrgRow) => {
    setDetailOrg(org);
    setDetailLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "list", org_id: org.id },
      });
      if (error) throw error;
      setDetailMembers(data?.users || []);
    } catch {
      setDetailMembers([]);
    }
    setDetailLoading(false);
  };

  const handleCredit = async () => {
    if (!creditOrg) return;
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Invalid amount" });
      return;
    }
    setCrediting(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing", {
        body: {
          action: "manual_credit",
          org_id: creditOrg.id,
          amount,
          description: creditDescription || `Manual credit for ${creditOrg.name}`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Credit added", description: `₹${amount} credited to ${creditOrg.name}. New balance: ₹${data.new_balance}` });
      setCreditOrg(null);
      setCreditAmount("100");
      setCreditDescription("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setCrediting(false);
  };

  const handleDelete = async () => {
    if (!deleteOrg || deleteConfirmName !== deleteOrg.name) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-org", {
        body: { action: "delete", org_id: deleteOrg.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Organization deleted", description: `${deleteOrg.name} has been permanently deleted.` });
      setDeleteOrg(null);
      setDeleteConfirmName("");
      window.location.reload();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setDeleting(false);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let rows = organizations.filter(
      (o) => o.name.toLowerCase().includes(q) || (o.industry ?? "").toLowerCase().includes(q)
    );

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "lastActivity") {
        cmp = (a.lastActivity ?? "").localeCompare(b.lastActivity ?? "");
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortAsc ? cmp : -cmp;
    });

    return rows;
  }, [organizations, search, sortKey, sortAsc]);

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </span>
    </TableHead>
  );

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>All Organizations</CardTitle>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search orgs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Name" field="name" />
                <TableHead>Industry</TableHead>
                <SortHeader label="Members" field="members" />
                <SortHeader label="Contacts" field="contacts" />
                <SortHeader label="Campaigns" field="campaigns" />
                <SortHeader label="Messages" field="messages" />
                <SortHeader label="Delivery Rate" field="deliveryRate" />
                <SortHeader label="Last Activity" field="lastActivity" />
                <TableHead>Onboarding</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    No organizations found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">
                      <button
                        className="text-left hover:underline hover:text-primary transition-colors"
                        onClick={() => viewOrgDetails(org)}
                      >
                        {org.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{org.industry ?? "—"}</TableCell>
                    <TableCell>{org.members}</TableCell>
                    <TableCell>{org.contacts}</TableCell>
                    <TableCell>{org.campaigns}</TableCell>
                    <TableCell>{org.messages}</TableCell>
                    <TableCell>
                      <span className={org.deliveryRate >= 80 ? "text-success font-medium" : org.deliveryRate >= 50 ? "text-warning font-medium" : "text-destructive font-medium"}>
                        {org.messages > 0 ? `${org.deliveryRate}%` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {org.lastActivity
                        ? formatDistanceToNow(new Date(org.lastActivity), { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.onboarding_completed ? "default" : "secondary"}>
                        {org.onboarding_completed ? "Complete" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setCreditOrg(org)}
                        >
                          <IndianRupee className="h-3.5 w-3.5" /> Credit
                        </Button>
                        {canDeleteOrg && org.contacts === 0 && org.campaigns === 0 && org.messages === 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteOrg(org)}
                            title="Delete organization"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

      {/* Credit Dialog */}
      <Dialog open={!!creditOrg} onOpenChange={(open) => !open && setCreditOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Credit</DialogTitle>
            <DialogDescription>
              Manually credit wallet for <span className="font-semibold">{creditOrg?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount (Rs)</Label>
              <Input
                type="number"
                min="1"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="100"
              />
            </div>
            <div className="flex gap-2">
              {[100, 500, 1000, 5000].map((amt) => (
                <Button
                  key={amt}
                  variant={creditAmount === String(amt) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCreditAmount(String(amt))}
                >
                  Rs {amt.toLocaleString("en-IN")}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={creditDescription}
                onChange={(e) => setCreditDescription(e.target.value)}
                placeholder="e.g. Payment received via bank transfer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditOrg(null)}>Cancel</Button>
            <Button onClick={handleCredit} disabled={crediting} className="gap-2">
              {crediting ? <><Loader2 className="h-4 w-4 animate-spin" /> Crediting...</> : <>Credit Rs {parseFloat(creditAmount) || 0}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteOrg} onOpenChange={(open) => { if (!open) { setDeleteOrg(null); setDeleteConfirmName(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteOrg?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will permanently delete <strong>{deleteOrg?.name}</strong> and all its data including members, contacts, campaigns, templates, messages, and credentials.
              </span>
              <span className="block font-medium text-destructive">This action cannot be undone.</span>
              <span className="block">
                Type <strong>{deleteOrg?.name}</strong> to confirm:
              </span>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Organization name"
                className="mt-2"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteOrg(null); setDeleteConfirmName(""); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfirmName !== deleteOrg?.name || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Org Details Dialog */}
      <Dialog open={!!detailOrg} onOpenChange={(open) => { if (!open) setDetailOrg(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailOrg?.name}</DialogTitle>
            <DialogDescription>Organization details and members</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Industry</p>
                <p className="font-medium">{detailOrg?.industry || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Onboarding</p>
                <Badge variant={detailOrg?.onboarding_completed ? "default" : "secondary"}>
                  {detailOrg?.onboarding_completed ? "Complete" : "Pending"}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Contacts</p>
                <p className="font-medium">{detailOrg?.contacts}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Campaigns</p>
                <p className="font-medium">{detailOrg?.campaigns}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Messages</p>
                <p className="font-medium">{detailOrg?.messages}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">
                  {detailOrg?.created_at ? formatDistanceToNow(new Date(detailOrg.created_at), { addSuffix: true }) : "—"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Members</p>
              {detailLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : detailMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members found</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Last Sign In</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailMembers.map((m: any) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm">{m.email}</TableCell>
                          <TableCell>
                            <Badge variant={m.role === "admin" ? "default" : "secondary"} className="text-xs">
                              {m.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {m.last_sign_in_at
                              ? formatDistanceToNow(new Date(m.last_sign_in_at), { addSuffix: true })
                              : "Never"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
