import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, Plus, Trash2, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function Contacts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Tables<"contacts">[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone_number: "", email: "" });

  const fetchContacts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });
    setContacts(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchContacts(); }, []);

  const addContact = async () => {
    if (!user || !newContact.phone_number) return;
    const { error } = await supabase.from("contacts").insert({
      user_id: user.id,
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
    fetchContacts();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Upload to storage
    const path = `${user.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("contact-lists")
      .upload(path, file);

    if (uploadError) {
      toast({ variant: "destructive", title: "Upload failed", description: uploadError.message });
      return;
    }

    // Process CSV client-side for now
    if (file.name.endsWith(".csv")) {
      const text = await file.text();
      const lines = text.split("\n").filter(Boolean);
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
        return {
          user_id: user.id,
          phone_number: cols[phoneIdx] || "",
          name: nameIdx >= 0 ? cols[nameIdx] || null : null,
          email: emailIdx >= 0 ? cols[emailIdx] || null : null,
          source: "csv_upload",
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
    } else {
      toast({ title: "File uploaded", description: "CSV files are auto-imported. Other formats will be processed." });
    }
    setUploadOpen(false);
  };

  const filtered = contacts.filter(
    (c) =>
      (c.name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      c.phone_number.includes(search) ||
      (c.email?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Contacts</h1>
          <p className="text-muted-foreground">Manage your audience</p>
        </div>
        <div className="flex gap-2">
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
                  Upload a CSV file with columns: name, phone/mobile, email
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
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No contacts found. Add or upload contacts to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">{contact.name || "—"}</TableCell>
                    <TableCell>{contact.phone_number}</TableCell>
                    <TableCell>{contact.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{contact.source || "—"}</TableCell>
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
