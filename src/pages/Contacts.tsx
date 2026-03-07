import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Upload, Plus, Trash2, Search, Megaphone, Tag, Filter, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Contact {
  id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  tags: string[];
  source: string | null;
  custom_fields: Record<string, string>;
  created_at: string;
}

export default function Contacts() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone_number: "", email: "" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [sourceFilter, setSourceFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  const fetchContacts = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    setContacts((data as any) ?? []);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Unique sources and tags for filter dropdowns
  const sources = useMemo(() => {
    const s = new Set(contacts.map((c) => c.source).filter(Boolean));
    return [...s] as string[];
  }, [contacts]);

  const allTags = useMemo(() => {
    const t = new Set(contacts.flatMap((c) => c.tags || []));
    return [...t];
  }, [contacts]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      // Search
      if (search) {
        const s = search.toLowerCase();
        const matchesSearch =
          (c.name?.toLowerCase().includes(s) ?? false) ||
          c.phone_number.includes(s) ||
          (c.email?.toLowerCase().includes(s) ?? false);
        if (!matchesSearch) return false;
      }
      // Source filter
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      // Tag filter
      if (tagFilter !== "all" && !(c.tags || []).includes(tagFilter)) return false;
      return true;
    });
  }, [contacts, search, sourceFilter, tagFilter]);

  const addContact = async () => {
    if (!user || !currentOrg || !newContact.phone_number) return;
    const { error } = await supabase.from("contacts").insert({
      user_id: user.id,
      org_id: currentOrg.id,
      name: newContact.name || null,
      phone_number: newContact.phone_number,
      email: newContact.email || null,
      source: "manual",
    });
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Contact added" });
      setNewContact({ name: "", phone_number: "", email: "" });
      setAddOpen(false);
      fetchContacts();
    }
  };

  const deleteContact = async (id: string) => {
    await supabase.from("contacts").delete().eq("id", id);
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    fetchContacts();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !currentOrg) return;

    if (file.name.endsWith(".csv")) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("mobile") || h.includes("number"));
      const nameIdx = headers.findIndex((h) => h.includes("name"));
      const emailIdx = headers.findIndex((h) => h.includes("email"));

      if (phoneIdx === -1) {
        toast({ variant: "destructive", title: "Invalid CSV", description: "No phone/mobile column found." });
        return;
      }

      const rows = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim());
        const customFields: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (i !== phoneIdx && i !== nameIdx && i !== emailIdx && cols[i]) {
            customFields[h] = cols[i];
          }
        });
        return {
          user_id: user.id,
          org_id: currentOrg.id,
          phone_number: cols[phoneIdx] || "",
          name: nameIdx >= 0 ? cols[nameIdx] || null : null,
          email: emailIdx >= 0 ? cols[emailIdx] || null : null,
          source: "csv_upload",
          custom_fields: customFields,
        };
      }).filter((r) => r.phone_number);

      if (rows.length > 0) {
        const { error } = await supabase.from("contacts").insert(rows);
        if (error) {
          toast({ variant: "destructive", title: "Import error", description: error.message });
        } else {
          toast({ title: `${rows.length} contacts imported` });
          fetchContacts();
        }
      }
    }
    setUploadOpen(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  };

  const clearFilters = () => {
    setSearch("");
    setSourceFilter("all");
    setTagFilter("all");
  };

  const hasFilters = search || sourceFilter !== "all" || tagFilter !== "all";

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Contacts</h1>
          <p className="text-muted-foreground">Manage your audience</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="default" className="gap-2" onClick={() => {
              // Navigate to campaigns with pre-selected contacts in state
              navigate("/campaigns", { state: { selectedContactIds: [...selectedIds] } });
            }}>
              <Megaphone className="h-4 w-4" /> Campaign ({selectedIds.size})
            </Button>
          )}
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" /> Upload CSV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Contact List</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload a CSV file with columns: name, phone/mobile, email. Extra columns are saved as custom fields.
                </p>
                <Input type="file" accept=".csv" onChange={handleFileUpload} />
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Contact</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                </div>
                <div>
                  <Label>Phone Number *</Label>
                  <Input value={newContact.phone_number} onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value })} placeholder="+91..." required />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                </div>
                <Button onClick={addContact} className="w-full">Add Contact</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {sources.length > 0 && (
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-36">
                  <Filter className="mr-1 h-3 w-3" />
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {allTags.length > 0 && (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="w-36">
                  <Tag className="mr-1 h-3 w-3" />
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allTags.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No contacts found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((contact) => (
                  <TableRow key={contact.id} className={selectedIds.has(contact.id) ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => toggleSelect(contact.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{contact.name || "—"}</TableCell>
                    <TableCell>{contact.phone_number}</TableCell>
                    <TableCell>{contact.email || "—"}</TableCell>
                    <TableCell>
                      {contact.source && (
                        <Badge variant="outline" className="text-[10px]">{contact.source}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(contact.tags || []).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteContact(contact.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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
