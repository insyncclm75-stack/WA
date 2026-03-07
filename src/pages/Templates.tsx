import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Loader2,
  Upload,
  Image,
  Video,
  FileText,
  Type,
  ArrowLeft,
  Phone,
  Link2,
  MessageSquare,
  Copy,
  Workflow,
  X,
  Bold,
  Italic,
  Strikethrough,
} from "lucide-react";

// ─── Constants ───

const CATEGORIES = [
  { value: "MARKETING", label: "Marketing" },
  { value: "UTILITY", label: "Utility" },
  { value: "AUTHENTICATION", label: "Authentication" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" },
  { value: "bn", label: "Bengali" },
  { value: "gu", label: "Gujarati" },
  { value: "pa", label: "Punjabi" },
  { value: "ur", label: "Urdu" },
  { value: "ar", label: "Arabic" },
  { value: "es", label: "Spanish" },
  { value: "pt_BR", label: "Portuguese (BR)" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "id", label: "Indonesian" },
];

type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

const HEADER_OPTIONS: { value: HeaderType; label: string; icon: typeof Type | null }[] = [
  { value: "NONE", label: "None", icon: null },
  { value: "TEXT", label: "Text", icon: Type },
  { value: "IMAGE", label: "Image", icon: Image },
  { value: "VIDEO", label: "Video", icon: Video },
  { value: "DOCUMENT", label: "Document", icon: FileText },
];

type ButtonType = "URL" | "PHONE_NUMBER" | "QUICK_REPLY" | "COPY_CODE" | "FLOW";

const BUTTON_TYPE_OPTIONS: { value: ButtonType; label: string; icon: typeof Link2 }[] = [
  { value: "QUICK_REPLY", label: "Quick Reply", icon: MessageSquare },
  { value: "URL", label: "Visit Website", icon: Link2 },
  { value: "PHONE_NUMBER", label: "Call Phone", icon: Phone },
  { value: "COPY_CODE", label: "Copy Code", icon: Copy },
  { value: "FLOW", label: "Flow", icon: Workflow },
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 16 * 1024 * 1024;
const MAX_DOC_SIZE = 100 * 1024 * 1024;

const statusColors: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
};

// ─── Types ───

interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
  flow_id?: string;
  flow_action?: string;
}

interface BuilderForm {
  name: string;
  category: string;
  language: string;
  headerType: HeaderType;
  headerText: string;
  bodyText: string;
  footerText: string;
  buttons: TemplateButton[];
  sampleValues: string[];
}

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

const emptyForm: BuilderForm = {
  name: "",
  category: "MARKETING",
  language: "en",
  headerType: "NONE",
  headerText: "",
  bodyText: "",
  footerText: "",
  buttons: [],
  sampleValues: [],
};

// ─── Helpers ───

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  const unique = [...new Set(matches)];
  unique.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""));
    const numB = parseInt(b.replace(/\D/g, ""));
    return numA - numB;
  });
  return unique;
}

function resolveText(text: string, samples: string[]): string {
  let resolved = text;
  samples.forEach((val, i) => {
    if (val) resolved = resolved.replaceAll(`{{${i + 1}}}`, val);
  });
  return resolved;
}

function formatWhatsAppText(text: string): JSX.Element[] {
  // Simple formatter for bold (*text*), italic (_text_), strikethrough (~text~)
  const parts: JSX.Element[] = [];
  const regex = /(\*[^*]+\*|_[^_]+_|~[^~]+~)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  const str = text;
  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{str.slice(lastIndex, match.index)}</span>);
    }
    const m = match[0];
    if (m.startsWith("*") && m.endsWith("*")) {
      parts.push(<strong key={key++}>{m.slice(1, -1)}</strong>);
    } else if (m.startsWith("_") && m.endsWith("_")) {
      parts.push(<em key={key++}>{m.slice(1, -1)}</em>);
    } else if (m.startsWith("~") && m.endsWith("~")) {
      parts.push(<s key={key++}>{m.slice(1, -1)}</s>);
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < str.length) {
    parts.push(<span key={key++}>{str.slice(lastIndex)}</span>);
  }
  return parts;
}

// ─── WhatsApp Preview ───

function WhatsAppPreview({
  form,
  mediaPreviewUrl,
}: {
  form: BuilderForm;
  mediaPreviewUrl: string | null;
}) {
  const bodyVars = extractVariables(form.bodyText);
  const resolvedBody = resolveText(form.bodyText, form.sampleValues);
  const resolvedHeader = resolveText(form.headerText, form.sampleValues);
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const ctaButtons = form.buttons.filter(
    (b) => b.type === "URL" || b.type === "PHONE_NUMBER" || b.type === "FLOW" || b.type === "COPY_CODE"
  );
  const quickReplies = form.buttons.filter((b) => b.type === "QUICK_REPLY");

  return (
    <div className="flex flex-col items-center">
      {/* Phone frame */}
      <div className="w-[280px] rounded-[2rem] border-[3px] border-foreground/15 bg-[#e5ddd5] shadow-xl overflow-hidden">
        {/* Status bar */}
        <div className="flex items-center justify-between bg-[#075e54] px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20" />
            <div>
              <p className="text-xs font-medium text-white">Business</p>
              <p className="text-[10px] text-white/60">online</p>
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className="min-h-[360px] space-y-1 p-3" style={{ backgroundImage: "url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMC41IiBmaWxsPSIjYzNiNmE0IiBvcGFjaXR5PSIwLjMiLz48L3N2Zz4=')" }}>
          {/* Message bubble */}
          <div className="max-w-[240px] rounded-lg rounded-tl-none bg-white shadow-sm overflow-hidden">
            {/* Header */}
            {form.headerType === "TEXT" && form.headerText.trim() && (
              <p className="px-2.5 pt-2 text-[13px] font-bold text-gray-900">{resolvedHeader}</p>
            )}
            {form.headerType === "IMAGE" && (
              <div className="flex h-32 items-center justify-center bg-gray-100">
                {mediaPreviewUrl ? (
                  <img src={mediaPreviewUrl} alt="Header" className="h-full w-full object-cover" />
                ) : (
                  <Image className="h-10 w-10 text-gray-300" />
                )}
              </div>
            )}
            {form.headerType === "VIDEO" && (
              <div className="flex h-32 items-center justify-center bg-gray-900">
                {mediaPreviewUrl ? (
                  <video src={mediaPreviewUrl} className="h-full w-full object-cover" muted />
                ) : (
                  <Video className="h-10 w-10 text-gray-500" />
                )}
              </div>
            )}
            {form.headerType === "DOCUMENT" && (
              <div className="flex h-16 items-center gap-2 bg-gray-100 px-3">
                <FileText className="h-8 w-8 text-red-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-700">document.pdf</p>
                  <p className="text-[10px] text-gray-400">PDF</p>
                </div>
              </div>
            )}

            {/* Body */}
            <div className="px-2.5 pt-1.5 pb-1">
              <p className="whitespace-pre-wrap text-[13px] leading-[18px] text-gray-900">
                {resolvedBody ? (
                  formatWhatsAppText(resolvedBody)
                ) : (
                  <span className="italic text-gray-400">Message body...</span>
                )}
              </p>
            </div>

            {/* Footer + time */}
            <div className="flex items-end justify-between gap-2 px-2.5 pb-1.5">
              {form.footerText.trim() ? (
                <p className="text-[11px] text-gray-400">{form.footerText}</p>
              ) : <span />}
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{time}</span>
            </div>
          </div>

          {/* CTA Buttons */}
          {ctaButtons.length > 0 && (
            <div className="max-w-[240px] space-y-px rounded-lg bg-white shadow-sm overflow-hidden">
              {ctaButtons.map((btn, i) => (
                <button
                  key={i}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-gray-100 py-2 text-[13px] font-medium text-[#00a5f4] first:border-t-0"
                >
                  {btn.type === "URL" && <Link2 className="h-3.5 w-3.5" />}
                  {btn.type === "PHONE_NUMBER" && <Phone className="h-3.5 w-3.5" />}
                  {btn.type === "COPY_CODE" && <Copy className="h-3.5 w-3.5" />}
                  {btn.type === "FLOW" && <Workflow className="h-3.5 w-3.5" />}
                  {btn.text || "Button"}
                </button>
              ))}
            </div>
          )}

          {/* Quick Reply Buttons */}
          {quickReplies.length > 0 && (
            <div className="flex max-w-[240px] flex-wrap gap-1">
              {quickReplies.map((btn, i) => (
                <button
                  key={i}
                  className="flex-1 rounded-lg bg-white py-2 text-center text-[13px] font-medium text-[#00a5f4] shadow-sm min-w-[70px]"
                >
                  {btn.text || "Reply"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">Live Preview</p>
    </div>
  );
}

// ─── Template Builder ───

function TemplateBuilder({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();

  const [form, setForm] = useState<BuilderForm>({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const bodyVariables = useMemo(() => extractVariables(form.bodyText), [form.bodyText]);
  const headerVariables = useMemo(() => extractVariables(form.headerText), [form.headerText]);
  const allVariables = useMemo(() => {
    const all = [...new Set([...bodyVariables, ...headerVariables])];
    all.sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")));
    return all;
  }, [bodyVariables, headerVariables]);

  // Adjust sample values array when variables change
  useEffect(() => {
    const maxVar = allVariables.length > 0
      ? Math.max(...allVariables.map((v) => parseInt(v.replace(/\D/g, ""))))
      : 0;
    if (form.sampleValues.length < maxVar) {
      setForm((prev) => ({
        ...prev,
        sampleValues: [
          ...prev.sampleValues,
          ...Array(maxVar - prev.sampleValues.length).fill(""),
        ],
      }));
    }
  }, [allVariables]);

  // Reset media when header type changes
  useEffect(() => {
    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [form.headerType]);

  const updateForm = (patch: Partial<BuilderForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMediaError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (form.headerType === "IMAGE") {
      if (!["image/jpeg", "image/png"].includes(file.type)) {
        setMediaError("Only JPG and PNG images are allowed.");
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setMediaError(`Image must be under 5 MB. Selected: ${(file.size / 1048576).toFixed(1)} MB.`);
        return;
      }
    } else if (form.headerType === "VIDEO") {
      if (file.type !== "video/mp4") {
        setMediaError("Only MP4 videos are allowed.");
        return;
      }
      if (file.size > MAX_VIDEO_SIZE) {
        setMediaError(`Video must be under 16 MB. Selected: ${(file.size / 1048576).toFixed(1)} MB.`);
        return;
      }
    } else if (form.headerType === "DOCUMENT") {
      if (file.size > MAX_DOC_SIZE) {
        setMediaError(`Document must be under 100 MB. Selected: ${(file.size / 1048576).toFixed(1)} MB.`);
        return;
      }
    }

    setMediaFile(file);
    if (form.headerType === "IMAGE" || form.headerType === "VIDEO") {
      setMediaPreviewUrl(URL.createObjectURL(file));
    } else {
      setMediaPreviewUrl(null);
    }
  };

  const uploadMedia = async (): Promise<string | null> => {
    if (!mediaFile || !user) return null;
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
    }
  };

  const insertVariable = () => {
    const nextNum = allVariables.length > 0
      ? Math.max(...allVariables.map((v) => parseInt(v.replace(/\D/g, "")))) + 1
      : 1;
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = form.bodyText;
      const newText = text.slice(0, start) + `{{${nextNum}}}` + text.slice(end);
      updateForm({ bodyText: newText });
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + `{{${nextNum}}}`.length;
      }, 0);
    } else {
      updateForm({ bodyText: form.bodyText + `{{${nextNum}}}` });
    }
  };

  const insertFormatting = (wrapper: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = form.bodyText;
    const selected = text.slice(start, end);
    const newText = text.slice(0, start) + wrapper + (selected || "text") + wrapper + text.slice(end);
    updateForm({ bodyText: newText });
    setTimeout(() => {
      textarea.focus();
      if (selected) {
        textarea.selectionStart = start;
        textarea.selectionEnd = end + wrapper.length * 2;
      } else {
        textarea.selectionStart = start + wrapper.length;
        textarea.selectionEnd = start + wrapper.length + 4;
      }
    }, 0);
  };

  const addButton = (type: ButtonType) => {
    const maxButtons = 10;
    if (form.buttons.length >= maxButtons) {
      toast({ variant: "destructive", title: "Limit reached", description: "Maximum 10 buttons allowed." });
      return;
    }
    const qrCount = form.buttons.filter((b) => b.type === "QUICK_REPLY").length;
    const urlCount = form.buttons.filter((b) => b.type === "URL").length;
    const phoneCount = form.buttons.filter((b) => b.type === "PHONE_NUMBER").length;
    const copyCount = form.buttons.filter((b) => b.type === "COPY_CODE").length;

    if (type === "QUICK_REPLY" && qrCount >= 3) {
      toast({ variant: "destructive", title: "Limit", description: "Maximum 3 quick reply buttons." });
      return;
    }
    if (type === "URL" && urlCount >= 2) {
      toast({ variant: "destructive", title: "Limit", description: "Maximum 2 URL buttons." });
      return;
    }
    if (type === "PHONE_NUMBER" && phoneCount >= 1) {
      toast({ variant: "destructive", title: "Limit", description: "Maximum 1 phone button." });
      return;
    }
    if (type === "COPY_CODE" && copyCount >= 1) {
      toast({ variant: "destructive", title: "Limit", description: "Maximum 1 copy code button." });
      return;
    }

    const newBtn: TemplateButton = { type, text: "" };
    if (type === "FLOW") newBtn.flow_action = "navigate";
    updateForm({ buttons: [...form.buttons, newBtn] });
  };

  const updateButton = (index: number, patch: Partial<TemplateButton>) => {
    const updated = [...form.buttons];
    updated[index] = { ...updated[index], ...patch };
    updateForm({ buttons: updated });
  };

  const removeButton = (index: number) => {
    updateForm({ buttons: form.buttons.filter((_, i) => i !== index) });
  };

  const buildComponents = (mediaUrl?: string | null) => {
    const components: any[] = [];

    // Header
    if (form.headerType === "TEXT" && form.headerText.trim()) {
      const headerComp: any = { type: "HEADER", format: "TEXT", text: form.headerText };
      const hVars = extractVariables(form.headerText);
      if (hVars.length > 0) {
        const examples = hVars.map((v) => {
          const idx = parseInt(v.replace(/\D/g, "")) - 1;
          return form.sampleValues[idx] || `sample${idx + 1}`;
        });
        headerComp.example = { header_text: examples };
      }
      components.push(headerComp);
    } else if (form.headerType === "IMAGE" && mediaUrl) {
      components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [mediaUrl] } });
    } else if (form.headerType === "VIDEO" && mediaUrl) {
      components.push({ type: "HEADER", format: "VIDEO", example: { header_handle: [mediaUrl] } });
    } else if (form.headerType === "DOCUMENT" && mediaUrl) {
      components.push({ type: "HEADER", format: "DOCUMENT", example: { header_handle: [mediaUrl] } });
    } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(form.headerType)) {
      components.push({ type: "HEADER", format: form.headerType });
    }

    // Body
    const bodyComp: any = { type: "BODY", text: form.bodyText };
    const bVars = extractVariables(form.bodyText);
    if (bVars.length > 0) {
      const examples = bVars.map((v) => {
        const idx = parseInt(v.replace(/\D/g, "")) - 1;
        return form.sampleValues[idx] || `sample${idx + 1}`;
      });
      bodyComp.example = { body_text: [examples] };
    }
    components.push(bodyComp);

    // Footer
    if (form.footerText.trim()) {
      components.push({ type: "FOOTER", text: form.footerText });
    }

    // Buttons
    if (form.buttons.length > 0) {
      const buttons = form.buttons.map((btn) => {
        const b: any = { type: btn.type, text: btn.text };
        if (btn.type === "URL" && btn.url) {
          b.url = btn.url;
          if (btn.url.includes("{{")) {
            b.example = [btn.url.replace(/\{\{\d+\}\}/g, "https://example.com")];
          }
        }
        if (btn.type === "PHONE_NUMBER" && btn.phone_number) {
          b.phone_number = btn.phone_number;
        }
        if (btn.type === "COPY_CODE") {
          b.example = [btn.text || "COPYCODE"];
        }
        if (btn.type === "FLOW") {
          if (btn.flow_id) b.flow_id = btn.flow_id;
          b.flow_action = btn.flow_action || "navigate";
        }
        return b;
      });
      components.push({ type: "BUTTONS", buttons });
    }

    return components;
  };

  const handleSubmit = async () => {
    if (!user || !currentOrg) return;

    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Validation", description: "Template name is required." });
      return;
    }
    if (!form.bodyText.trim()) {
      toast({ variant: "destructive", title: "Validation", description: "Message body is required." });
      return;
    }
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(form.headerType) && !mediaFile) {
      toast({ variant: "destructive", title: "Validation", description: "Please upload a file for the header." });
      return;
    }
    for (const btn of form.buttons) {
      if (!btn.text.trim()) {
        toast({ variant: "destructive", title: "Validation", description: "All buttons must have label text." });
        return;
      }
      if (btn.type === "URL" && !btn.url?.trim()) {
        toast({ variant: "destructive", title: "Validation", description: "URL buttons require a URL." });
        return;
      }
      if (btn.type === "PHONE_NUMBER" && !btn.phone_number?.trim()) {
        toast({ variant: "destructive", title: "Validation", description: "Phone buttons require a phone number." });
        return;
      }
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
          org_id: currentOrg.id,
          name: form.name,
          category: form.category,
          language: form.language,
          components: buildComponents(mediaUrl),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error + (data.details ? `: ${JSON.stringify(data.details)}` : ""));

      toast({ title: "Template submitted", description: "Sent to WhatsApp for approval." });
      onCreated();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission failed", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const bodyCharCount = form.bodyText.length;
  const footerCharCount = form.footerText.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Create Template</h1>
          <p className="text-sm text-muted-foreground">
            Build your WhatsApp message template with all supported components
          </p>
        </div>
        <Button onClick={handleSubmit} disabled={submitting} className="gap-2 px-6">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit for Approval
        </Button>
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left: Form ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Basic Info */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Template Name *</Label>
                <Input
                  placeholder="order_confirmation"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Lowercase letters, numbers, and underscores only
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category *</Label>
                  <Select value={form.category} onValueChange={(v) => updateForm({ category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Language *</Label>
                  <Select value={form.language} onValueChange={(v) => updateForm({ language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Header */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Header</CardTitle>
              <CardDescription>Optional. Add a text, image, video, or document header.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {HEADER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={form.headerType === opt.value ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => updateForm({ headerType: opt.value, headerText: "" })}
                  >
                    {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
                    {opt.label}
                  </Button>
                ))}
              </div>

              {form.headerType === "TEXT" && (
                <div>
                  <Input
                    placeholder="e.g., Order Update"
                    value={form.headerText}
                    onChange={(e) => updateForm({ headerText: e.target.value })}
                    maxLength={60}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.headerText.length}/60 characters. Use {"{{1}}"} for variables.
                  </p>
                </div>
              )}

              {form.headerType === "IMAGE" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Upload Image
                    </Button>
                    {mediaFile && (
                      <span className="truncate text-xs text-muted-foreground max-w-[200px]">{mediaFile.name}</span>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleMediaSelect} />
                  <p className="text-xs text-muted-foreground">JPG or PNG, max 5 MB</p>
                  {mediaError && <p className="text-xs font-medium text-destructive">{mediaError}</p>}
                </div>
              )}

              {form.headerType === "VIDEO" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Upload Video
                    </Button>
                    {mediaFile && (
                      <span className="truncate text-xs text-muted-foreground max-w-[200px]">{mediaFile.name}</span>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept=".mp4" className="hidden" onChange={handleMediaSelect} />
                  <p className="text-xs text-muted-foreground">MP4 only, max 16 MB</p>
                  {mediaError && <p className="text-xs font-medium text-destructive">{mediaError}</p>}
                </div>
              )}

              {form.headerType === "DOCUMENT" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Upload Document
                    </Button>
                    {mediaFile && (
                      <span className="truncate text-xs text-muted-foreground max-w-[200px]">{mediaFile.name}</span>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" className="hidden" onChange={handleMediaSelect} />
                  <p className="text-xs text-muted-foreground">PDF, DOC, XLS, PPT. Max 100 MB</p>
                  {mediaError && <p className="text-xs font-medium text-destructive">{mediaError}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Body */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Body *</CardTitle>
              <CardDescription>The main message text. Use variables for personalization.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Formatting toolbar */}
              <div className="flex items-center gap-1 rounded-md border p-1 w-fit">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Bold" onClick={() => insertFormatting("*")}>
                  <Bold className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Italic" onClick={() => insertFormatting("_")}>
                  <Italic className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Strikethrough" onClick={() => insertFormatting("~")}>
                  <Strikethrough className="h-3.5 w-3.5" />
                </Button>
                <Separator orientation="vertical" className="h-5 mx-1" />
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={insertVariable}>
                  <Plus className="h-3 w-3" /> Variable
                </Button>
              </div>

              <Textarea
                ref={bodyRef}
                placeholder="Hi {{1}}, your order {{2}} has been confirmed and will be delivered by {{3}}."
                rows={5}
                value={form.bodyText}
                onChange={(e) => updateForm({ bodyText: e.target.value })}
                maxLength={1024}
              />
              <p className={`text-xs ${bodyCharCount > 900 ? "text-amber-600" : "text-muted-foreground"}`}>
                {bodyCharCount}/1024 characters
              </p>
            </CardContent>
          </Card>

          {/* Sample Values */}
          {allVariables.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Sample Values</CardTitle>
                <CardDescription>
                  Provide example values for each variable. Required for WhatsApp approval.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {allVariables.map((v) => {
                    const idx = parseInt(v.replace(/\D/g, "")) - 1;
                    return (
                      <div key={v} className="flex items-center gap-2">
                        <Badge variant="secondary" className="shrink-0 font-mono text-xs">{v}</Badge>
                        <Input
                          placeholder={`e.g., ${idx === 0 ? "John" : idx === 1 ? "ORD-123" : "sample"}`}
                          value={form.sampleValues[idx] || ""}
                          onChange={(e) => {
                            const updated = [...form.sampleValues];
                            updated[idx] = e.target.value;
                            updateForm({ sampleValues: updated });
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Footer</CardTitle>
              <CardDescription>Optional short text below the message body.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="e.g., Reply STOP to opt out"
                value={form.footerText}
                onChange={(e) => updateForm({ footerText: e.target.value })}
                maxLength={60}
              />
              <p className={`mt-1 text-xs ${footerCharCount > 50 ? "text-amber-600" : "text-muted-foreground"}`}>
                {footerCharCount}/60 characters
              </p>
            </CardContent>
          </Card>

          {/* Buttons */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Buttons</CardTitle>
              <CardDescription>
                Add interactive buttons. Max 3 quick replies, 2 URLs, 1 phone, 1 copy code.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing buttons */}
              {form.buttons.map((btn, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {BUTTON_TYPE_OPTIONS.find((o) => o.value === btn.type)?.label || btn.type}
                    </Badge>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeButton(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Button Label *</Label>
                      <Input
                        placeholder={
                          btn.type === "URL" ? "Visit Website" :
                          btn.type === "PHONE_NUMBER" ? "Call Us" :
                          btn.type === "QUICK_REPLY" ? "Yes" :
                          btn.type === "COPY_CODE" ? "Copy Code" :
                          "Start"
                        }
                        value={btn.text}
                        onChange={(e) => updateButton(i, { text: e.target.value })}
                        maxLength={25}
                        className="h-8 text-sm"
                      />
                    </div>

                    {btn.type === "URL" && (
                      <div>
                        <Label className="text-xs">URL *</Label>
                        <Input
                          placeholder="https://example.com/{{1}}"
                          value={btn.url || ""}
                          onChange={(e) => updateButton(i, { url: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                    )}

                    {btn.type === "PHONE_NUMBER" && (
                      <div>
                        <Label className="text-xs">Phone Number *</Label>
                        <Input
                          placeholder="+919876543210"
                          value={btn.phone_number || ""}
                          onChange={(e) => updateButton(i, { phone_number: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                    )}

                    {btn.type === "FLOW" && (
                      <>
                        <div>
                          <Label className="text-xs">Flow ID *</Label>
                          <Input
                            placeholder="flow_id_here"
                            value={btn.flow_id || ""}
                            onChange={(e) => updateButton(i, { flow_id: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Add button dropdown */}
              {form.buttons.length < 10 && (
                <div className="flex flex-wrap gap-2">
                  {BUTTON_TYPE_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => addButton(opt.value)}
                    >
                      <opt.icon className="h-3 w-3" />
                      {opt.label}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom submit */}
          <div className="flex gap-3 pb-8">
            <Button variant="outline" onClick={onBack}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2 flex-1 max-w-xs">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit for Approval
            </Button>
          </div>
        </div>

        {/* ── Right: Preview ── */}
        <div className="hidden lg:block sticky top-6 shrink-0">
          <WhatsAppPreview form={form} mediaPreviewUrl={mediaPreviewUrl} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Templates Page ───

export default function Templates() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();

  const [view, setView] = useState<"list" | "builder">("list");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchTemplates = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
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
      const { data } = await supabase
        .from("templates")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setTemplates((data as unknown as TemplateRow[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentOrg]);

  const handleSync = async () => {
    if (!currentOrg) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-templates", {
        body: { action: "sync", org_id: currentOrg.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Sync complete", description: `Updated ${data.synced} template(s).` });
      fetchTemplates();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Sync failed", description: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!currentOrg) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-templates", {
        body: { action: "delete", org_id: currentOrg.id, template_id: id, template_name: name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Template deleted" });
      fetchTemplates();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    }
  };

  const filtered = templates.filter((t) => {
    if (filterCategory !== "all" && t.category?.toLowerCase() !== filterCategory) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  });

  if (view === "builder") {
    return (
      <DashboardLayout>
        <TemplateBuilder
          onBack={() => setView("list")}
          onCreated={() => {
            setView("list");
            fetchTemplates();
          }}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Templates</h1>
          <p className="text-muted-foreground">Create and manage your WhatsApp message templates</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync Status
          </Button>
          <Button className="gap-2" onClick={() => setView("builder")}>
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value.toLowerCase()}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Template Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array(3).fill(0).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted/20" />
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">
              {templates.length === 0
                ? "No templates yet"
                : "No templates match your filters"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {templates.length === 0 && "Create your first template to get started with WhatsApp messaging."}
            </p>
            {templates.length === 0 && (
              <Button className="mt-4 gap-2" onClick={() => setView("builder")}>
                <Plus className="h-4 w-4" /> Create Template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card key={t.id} className="group relative overflow-hidden transition-all hover:border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Badge variant="outline" className={statusColors[t.status || "pending"]}>
                    {t.status === "approved" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                    {t.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                    {t.status === "rejected" && <XCircle className="mr-1 h-3 w-3" />}
                    {t.status || "pending"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={() => handleDelete(t.id, t.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="mt-2 text-base">{t.name}</CardTitle>
                <CardDescription className="flex gap-2 text-xs">
                  <span className="uppercase">{t.category}</span>
                  <span>-</span>
                  <span className="uppercase">{t.language}</span>
                  {t.exotel_template_id && (
                    <>
                      <span>-</span>
                      <span className="text-muted-foreground">ID: {t.exotel_template_id.slice(0, 8)}...</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                  {t.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
