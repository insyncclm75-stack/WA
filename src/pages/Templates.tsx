import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const CATEGORIES = ["marketing", "utility", "authentication"] as const;
const LANGUAGES = ["en", "hi", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa"] as const;

const statusStyles: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600 border-0",
  pending: "bg-amber-500/10 text-amber-600 border-0",
  rejected: "bg-red-500/10 text-red-600 border-0",
};

const categoryStyles: Record<string, string> = {
  marketing: "text-emerald-600",
  utility: "text-sky-600",
  authentication: "text-violet-600",
};

interface TemplateForm {
  name: string;
  content: string;
  category: string;
  language: string;
}

const emptyForm: TemplateForm = { name: "", content: "", category: "marketing", language: "en" };

export default function Templates() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Tables<"templates">[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [filterCategory, setFilterCategory] = useState("all");

  const fetchTemplates = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("templates")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    setTemplates(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("templates")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false });
      if (!cancelled) { setTemplates(data ?? []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [currentOrg]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: Tables<"templates">) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      content: t.content,
      category: t.category || "marketing",
      language: t.language || "en",
    });
    setDialogOpen(true);
  };

  const saveTemplate = async () => {
    if (!user || !currentOrg || !form.name.trim() || !form.content.trim()) {
      toast({ variant: "destructive", title: "Validation", description: "Name and content are required." });
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from("templates")
        .update({
          name: form.name.trim(),
          content: form.content.trim(),
          category: form.category,
          language: form.language,
        })
        .eq("id", editingId);
      if (error) {
        toast({ variant: "destructive", title: "Error", description: error.message });
        return;
      }
      toast({ title: "Template updated" });
    } else {
      const { error } = await supabase.from("templates").insert({
        user_id: user.id,
        org_id: currentOrg.id,
        name: form.name.trim(),
        content: form.content.trim(),
        category: form.category,
        language: form.language,
        status: "pending",
      });
      if (error) {
        toast({ variant: "destructive", title: "Error", description: error.message });
        return;
      }
      toast({ title: "Template created" });
    }

    setDialogOpen(false);
    setForm(emptyForm);
    setEditingId(null);
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Template deleted" });
      fetchTemplates();
    }
  };

  const filtered =
    filterCategory === "all"
      ? templates
      : templates.filter((t) => t.category === filterCategory);

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Templates</h1>
          <p className="text-muted-foreground">Manage your WhatsApp message templates</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={openCreate}>
                <Plus className="h-4 w-4" /> New Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Template" : "Create Template"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Template Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="order_confirmation"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <Select
                      value={form.category}
                      onValueChange={(v) => setForm({ ...form, category: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Language</Label>
                    <Select
                      value={form.language}
                      onValueChange={(v) => setForm({ ...form, language: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Content *</Label>
                  <Textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="Hello {{1}}, your order {{2}} has been confirmed..."
                    rows={5}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use {"{{1}}"}, {"{{2}}"} etc. for variable placeholders
                  </p>
                </div>
                <Button onClick={saveTemplate} className="w-full">
                  {editingId ? "Update Template" : "Create Template"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {templates.length === 0
                ? "No templates yet. Create your first one!"
                : "No templates match the selected filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-medium capitalize ${
                          categoryStyles[t.category ?? ""] ?? "text-muted-foreground"
                        }`}
                      >
                        {t.category ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="uppercase text-xs">{t.language ?? "en"}</TableCell>
                    <TableCell>
                      <Badge className={statusStyles[t.status ?? "pending"] ?? ""}>
                        {t.status ?? "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                      {t.content}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteTemplate(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
