import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Settings as SettingsIcon, MessageSquare, Trash2, CheckCircle2, Clock, XCircle, RefreshCw, Loader2, Upload, Image, Video, FileWarning } from "lucide-react";

interface TemplateRow {
  id: string;
  name: string;
  content: string;
  category: string | null;
  language: string | null;
  status: string | null;
  exotel_template_id: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  example?: { body_text?: string[][]; header_handle?: string[] };
}

const statusColors: Record<string, string> = {
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

type HeaderType = "none" | "text" | "image" | "video";

const defaultForm = {
  name: "",
  category: "MARKETING",
  language: "en",
  headerType: "none" as HeaderType,
  headerText: "",
  body: "",
  footer: "",
  buttonType: "none" as "none" | "url" | "phone" | "quick_reply",
  buttonText: "",
  buttonValue: "",
  exampleValues: "",
};

const sampleTemplate = {
  name: "order_confirmation_01",
  category: "UTILITY",
  language: "en",
  headerType: "text" as HeaderType,
  headerText: "Order Update",
  body: "Hi {{1}}, your order {{2}} has been confirmed and will be delivered by {{3}}. Thank you for shopping with us!",
  footer: "Reply STOP to opt out",
  buttonType: "url" as "none" | "url" | "phone" | "quick_reply",
  buttonText: "Track Order",
  buttonValue: "https://example.com/track/{{1}}",
  exampleValues: "John, ORD-12345, March 15",
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 16 * 1024 * 1024; // 16 MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const ALLOWED_VIDEO_TYPES = ["video/mp4"];

function resolveBody(body: string, exampleValues: string): string {
  if (!exampleValues.trim()) return body;
  const vals = exampleValues.split(",").map(v => v.trim());
  let resolved = body;
  vals.forEach((val, i) => {
    resolved = resolved.replace(`{{${i + 1}}}`, val || `{{${i + 1}}}`);
  });
  return resolved;
}

// ── WhatsApp Preview ──
function WhatsAppPreview({
  form,
  mediaPreviewUrl,
}: {
  form: typeof defaultForm;
  mediaPreviewUrl: string | null;
}) {
  const resolvedBody = resolveBody(form.body, form.exampleValues);
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col items-center">
      {/* Phone frame */}
      <div className="w-[260px] rounded-[2rem] border-4 border-foreground/20 bg-[hsl(142,30%,95%)] p-2 shadow-lg">
        {/* Notch */}
        <div className="mx-auto mb-2 h-5 w-20 rounded-b-xl bg-foreground/10" />
        {/* Chat area */}
        <div className="min-h-[280px] space-y-1 rounded-xl bg-[hsl(142,30%,90%)] p-3">
          {/* Bubble */}
          <div className="max-w-full rounded-lg rounded-tl-none bg-card p-2 shadow-sm">
            {/* Header */}
            {form.headerType === "text" && form.headerText.trim() && (
              <p className="mb-1 text-xs font-bold text-foreground">{form.headerText}</p>
            )}
            {form.headerType === "image" && (
              <div className="mb-1 flex h-28 items-center justify-center rounded bg-muted">
                {mediaPreviewUrl ? (
                  <img src={mediaPreviewUrl} alt="Header" className="h-full w-full rounded object-cover" />
                ) : (
                  <Image className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>
            )}
            {form.headerType === "video" && (
              <div className="mb-1 flex h-28 items-center justify-center rounded bg-muted">
                {mediaPreviewUrl ? (
                  <video src={mediaPreviewUrl} className="h-full w-full rounded object-cover" muted />
                ) : (
                  <Video className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>
            )}

            {/* Body */}
            <p className="whitespace-pre-wrap text-xs text-foreground">
              {resolvedBody || <span className="italic text-muted-foreground">Message body...</span>}
            </p>

            {/* Footer + time */}
            <div className="mt-1 flex items-end justify-between gap-2">
              {form.footer.trim() && (
                <p className="text-[10px] text-muted-foreground">{form.footer}</p>
              )}
              <span className="ml-auto text-[9px] text-muted-foreground">{time}</span>
            </div>
          </div>

          {/* Buttons */}
          {form.buttonType !== "none" && form.buttonText.trim() && (
            <div className="rounded-lg bg-card p-1 shadow-sm">
              <button className="w-full rounded py-1 text-center text-xs font-medium text-primary">
                {form.buttonText}
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Live Preview</p>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });

  // Media upload state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ variant: "destructive", title: "Error fetching templates", description: error.message });
    } else {
      setTemplates((data as unknown as TemplateRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast({ variant: "destructive", title: "Error fetching templates", description: error.message });
      } else {
        setTemplates((data as unknown as TemplateRow[]) || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentOrg]);

  // Clear media when header type changes
  useEffect(() => {
    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [form.headerType]);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMediaError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (form.headerType === "image") {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setMediaError("Only JPG and PNG images are allowed.");
        e.target.value = "";
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        setMediaError(`Image must be under 5 MB. Selected file is ${sizeMB} MB.`);
        e.target.value = "";
        return;
      }
    } else if (form.headerType === "video") {
      if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
        setMediaError("Only MP4 videos are allowed.");
        e.target.value = "";
        return;
      }
      if (file.size > MAX_VIDEO_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        setMediaError(`Video must be under 16 MB. Selected file is ${sizeMB} MB.`);
        e.target.value = "";
        return;
      }
    }

    setMediaFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));
  };

  const uploadMedia = async (): Promise<string | null> => {
    if (!mediaFile || !user) return null;
    setUploadingMedia(true);
    try {
      const ext = mediaFile.name.split(".").pop();
      const path = `${currentOrg?.id ?? "default"}/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("template-media").upload(path, mediaFile);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("template-media").getPublicUrl(path);
      return urlData.publicUrl;
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: err.message });
      return null;
    } finally {
      setUploadingMedia(false);
    }
  };

  const buildComponents = (mediaUrl?: string | null): TemplateComponent[] => {
    const components: TemplateComponent[] = [];

    if (form.headerType === "text" && form.headerText.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: form.headerText });
    } else if (form.headerType === "image" && mediaUrl) {
      components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [mediaUrl] } });
    } else if (form.headerType === "video" && mediaUrl) {
      components.push({ type: "HEADER", format: "VIDEO", example: { header_handle: [mediaUrl] } });
    }

    const bodyComp: TemplateComponent = { type: "BODY", text: form.body };
    const placeholders = form.body.match(/\{\{\d+\}\}/g);
    if (placeholders && form.exampleValues.trim()) {
      const examples = form.exampleValues.split(",").map(v => v.trim());
      bodyComp.example = { body_text: [examples] };
    }
    components.push(bodyComp);

    if (form.footer.trim()) {
      components.push({ type: "FOOTER", text: form.footer });
    }

    if (form.buttonType !== "none" && form.buttonText.trim()) {
      const btn: any = { type: form.buttonType === "url" ? "URL" : form.buttonType === "phone" ? "PHONE_NUMBER" : "QUICK_REPLY", text: form.buttonText };
      if (form.buttonType === "url") {
        btn.url = form.buttonValue;
        if (form.buttonValue.includes("{{")) {
          btn.example = [form.buttonValue.replace(/\{\{\d+\}\}/g, "12345")];
        }
      }
      if (form.buttonType === "phone") btn.phone_number = form.buttonValue;
      components.push({ type: "BUTTONS", buttons: [btn] });
    }

    return components;
  };

  const handleSubmitTemplate = async () => {
    if (!user) return;
    if (!form.name || !form.body) {
      toast({ variant: "destructive", title: "Validation Error", description: "Template name and body are required." });
      return;
    }

    if ((form.headerType === "image" || form.headerType === "video") && !mediaFile) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please upload a media file for the header." });
      return;
    }

    setSubmitting(true);
    try {
      let mediaUrl: string | null = null;
      if (mediaFile) {
        mediaUrl = await uploadMedia();
        if (!mediaUrl) throw new Error("Media upload failed");
      }

      const { data, error } = await supabase.functions.invoke("manage-templates", {
        body: {
          action: "submit",
          org_id: currentOrg!.id,
          name: form.name,
          category: form.category,
          language: form.language,
          components: buildComponents(mediaUrl),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error + (data.details ? `: ${JSON.stringify(data.details)}` : ""));

      toast({ title: "Template submitted", description: "Your template has been sent to WhatsApp for approval. Status: pending." });
      setIsDialogOpen(false);
      setForm({ ...defaultForm });
      setMediaFile(null);
      setMediaPreviewUrl(null);
      fetchTemplates();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission failed", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncStatus = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-templates", {
        body: { action: "sync", org_id: currentOrg!.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Sync complete", description: `Updated ${data.synced} template(s) from Exotel.` });
      fetchTemplates();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Sync failed", description: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const deleteTemplate = async (id: string, name: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-templates", {
        body: { action: "delete", org_id: currentOrg!.id, template_id: id, template_name: name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Template deleted" });
      fetchTemplates();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    }
  };

  const loadSample = () => {
    setForm({ ...sampleTemplate });
    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaError(null);
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings & Templates</h1>
        <p className="mt-1 text-muted-foreground">Manage your WhatsApp message templates and API configuration</p>
      </div>

      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> API Config
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">WhatsApp Templates</h2>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={handleSyncStatus} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync Status
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setForm({ ...defaultForm });
                  setMediaFile(null);
                  setMediaPreviewUrl(null);
                  setMediaError(null);
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Plus className="h-4 w-4" /> Submit New Template</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Submit WhatsApp Template</DialogTitle>
                    <DialogDescription>
                      Fill in your template details. The live preview on the right shows how it will appear on WhatsApp.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex gap-6">
                    {/* ── Form (left) ── */}
                    <div className="flex-1 space-y-4 min-w-0">
                      {/* Load sample */}
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={loadSample}>
                        <FileWarning className="h-3.5 w-3.5" /> Load Sample Template
                      </Button>

                      {/* Name */}
                      <div className="grid gap-1.5">
                        <Label htmlFor="tpl-name">Template Name *</Label>
                        <Input id="tpl-name" placeholder="order_confirmation_01" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and underscores only.</p>
                      </div>

                      {/* Category + Language */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                          <Label>Category *</Label>
                          <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MARKETING">Marketing</SelectItem>
                              <SelectItem value="UTILITY">Utility</SelectItem>
                              <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label>Language *</Label>
                          <Select value={form.language} onValueChange={v => setForm({ ...form, language: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="en">English (en)</SelectItem>
                              <SelectItem value="en_US">English US (en_US)</SelectItem>
                              <SelectItem value="hi">Hindi (hi)</SelectItem>
                              <SelectItem value="es">Spanish (es)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Header */}
                      <div className="grid gap-1.5">
                        <Label>Header (optional)</Label>
                        <Select value={form.headerType} onValueChange={(v: HeaderType) => setForm({ ...form, headerType: v, headerText: "" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Header</SelectItem>
                            <SelectItem value="text">Text Header</SelectItem>
                            <SelectItem value="image">Image Header</SelectItem>
                            <SelectItem value="video">Video Header</SelectItem>
                          </SelectContent>
                        </Select>
                        {form.headerType === "text" && (
                          <Input placeholder="e.g., Order Update" value={form.headerText} onChange={e => setForm({ ...form, headerText: e.target.value })} />
                        )}
                        {form.headerType === "image" && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="h-3.5 w-3.5" /> Choose Image
                              </Button>
                              {mediaFile && <span className="truncate text-xs text-muted-foreground">{mediaFile.name}</span>}
                            </div>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".jpg,.jpeg,.png"
                              className="hidden"
                              onChange={handleMediaSelect}
                            />
                            <p className="text-xs text-muted-foreground">JPG or PNG only. Max 5 MB.</p>
                            {mediaError && <p className="text-xs font-medium text-destructive">{mediaError}</p>}
                          </div>
                        )}
                        {form.headerType === "video" && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="h-3.5 w-3.5" /> Choose Video
                              </Button>
                              {mediaFile && <span className="truncate text-xs text-muted-foreground">{mediaFile.name}</span>}
                            </div>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".mp4"
                              className="hidden"
                              onChange={handleMediaSelect}
                            />
                            <p className="text-xs text-muted-foreground">MP4 only. Max 16 MB.</p>
                            {mediaError && <p className="text-xs font-medium text-destructive">{mediaError}</p>}
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="grid gap-1.5">
                        <Label>Body *</Label>
                        <Textarea
                          placeholder="Hi {{1}}, your order {{2}} has been confirmed and will be delivered by {{3}}."
                          rows={4}
                          value={form.body}
                          onChange={e => setForm({ ...form, body: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Use {"{{1}}"}, {"{{2}}"}, etc. for dynamic placeholders.
                        </p>
                      </div>

                      {/* Example values */}
                      {form.body.match(/\{\{\d+\}\}/) && (
                        <div className="grid gap-1.5">
                          <Label>Example Values (required for approval)</Label>
                          <Input
                            placeholder="John, ORD-12345, March 15"
                            value={form.exampleValues}
                            onChange={e => setForm({ ...form, exampleValues: e.target.value })}
                          />
                          <p className="text-xs text-muted-foreground">
                            One value per placeholder, comma-separated. These appear in the preview.
                          </p>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="grid gap-1.5">
                        <Label>Footer (optional)</Label>
                        <Input placeholder="Reply STOP to opt out" value={form.footer} onChange={e => setForm({ ...form, footer: e.target.value })} />
                      </div>

                      {/* Buttons */}
                      <div className="grid gap-1.5">
                        <Label>Button (optional)</Label>
                        <Select value={form.buttonType} onValueChange={(v: any) => setForm({ ...form, buttonType: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Button</SelectItem>
                            <SelectItem value="url">URL Button</SelectItem>
                            <SelectItem value="phone">Phone Number Button</SelectItem>
                            <SelectItem value="quick_reply">Quick Reply Button</SelectItem>
                          </SelectContent>
                        </Select>
                        {form.buttonType !== "none" && (
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder={form.buttonType === "url" ? "e.g., Visit Website" : form.buttonType === "phone" ? "e.g., Call Us" : "e.g., Yes, I'm interested"}
                              value={form.buttonText}
                              onChange={e => setForm({ ...form, buttonText: e.target.value })}
                            />
                            {form.buttonType !== "quick_reply" && (
                              <Input
                                placeholder={form.buttonType === "url" ? "https://example.com" : "+91XXXXXXXXXX"}
                                value={form.buttonValue}
                                onChange={e => setForm({ ...form, buttonValue: e.target.value })}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Preview (right) ── */}
                    <div className="hidden sm:flex flex-col items-center pt-8">
                      <WhatsAppPreview form={form} mediaPreviewUrl={mediaPreviewUrl} />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmitTemplate} disabled={submitting || uploadingMedia}>
                      {(submitting || uploadingMedia) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit for Approval
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <Card key={i} className="animate-pulse border-border bg-card/50">
                  <CardHeader className="h-24 bg-muted/20" />
                  <CardContent className="h-20" />
                </Card>
              ))
            ) : templates.length === 0 ? (
              <Card className="col-span-full border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No templates yet. Submit your first template for WhatsApp approval.</p>
                </CardContent>
              </Card>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className="group relative overflow-hidden border-border transition-all hover:border-primary/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <Badge variant="outline" className={statusColors[template.status || "pending"]}>
                        {template.status === "approved" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {template.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                        {template.status === "rejected" && <XCircle className="mr-1 h-3 w-3" />}
                        {template.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={() => deleteTemplate(template.id, template.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardTitle className="mt-2 text-base font-bold">{template.name}</CardTitle>
                    <CardDescription className="flex gap-2">
                      <span className="text-xs uppercase">{template.category}</span>
                      <span className="text-xs uppercase">• {template.language}</span>
                      {template.exotel_template_id && (
                        <span className="text-xs text-muted-foreground">• ID: {template.exotel_template_id.slice(0, 8)}…</span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                      {template.content}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="config">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>API Configuration</CardTitle>
              <CardDescription>
                These settings are used to connect to your Exotel WhatsApp Business account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Exotel Subdomain</Label>
                  <Input disabled value="api.exotel.com" className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">Managed in environment secrets.</p>
                </div>
                <div className="space-y-2">
                  <Label>Sender Number (WhatsApp)</Label>
                  <Input disabled value="+91 XXXXX XXXXX" className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">Your verified WhatsApp Business number.</p>
                </div>
              </div>

              <div className="rounded-lg border border-warning/20 bg-warning/5 p-4">
                <h4 className="flex items-center gap-2 font-medium text-warning">
                  <SettingsIcon className="h-4 w-4" /> Secure Storage
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your Exotel API Key, Token, and WABA ID are stored securely in Supabase Edge Function secrets and are only accessed by backend functions.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button disabled variant="outline">Update Credentials</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
