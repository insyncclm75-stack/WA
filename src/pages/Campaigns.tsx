import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Play, Eye, ArrowLeft, ArrowRight, Upload, Download,
  FileText, AlertCircle, Loader2, X, Rocket, CheckCircle2, Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── Types ───

interface Template {
  id: string;
  name: string;
  content: string;
  category: string | null;
  language: string | null;
  status: string | null;
}

interface CsvRow {
  [key: string]: string;
}

interface CsvError {
  row: number;
  reason: string;
}

// ─── Helpers ───

const UPLOAD_BATCH = 5000;
const UPSERT_BATCH = 500;

function stripContentMarkers(content: string): string {
  return content.replace(/^\[(Image|Video|Document) Header\]\n?/, "").trim();
}

function extractTemplateVars(text: string): string[] {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches)].sort(
    (a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, ""))
  );
}

function resolveMessage(text: string, mapping: Record<string, string>, row: CsvRow): string {
  let resolved = stripContentMarkers(text);
  for (const [varNum, col] of Object.entries(mapping)) {
    resolved = resolved.replaceAll(`{{${varNum}}}`, row[col] || `{{${varNum}}}`);
  }
  return resolved;
}

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] || "";
    });
    return row;
  });
  return { headers, rows };
}

function isPhoneColumn(h: string): boolean {
  const l = h.toLowerCase();
  return l.includes("phone") || l.includes("mobile") || l === "number" || l === "whatsapp";
}

function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  return /^\+?\d{10,15}$/.test(cleaned);
}

/** Normalize phone to include country code (default 91 for India). */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, "");
  // 10-digit Indian number → prepend 91
  if (/^\d{10}$/.test(cleaned)) cleaned = "91" + cleaned;
  return cleaned;
}

type MediaType = "image" | "video" | "document" | null;

function detectMediaType(content: string): MediaType {
  if (content.startsWith("[Image Header]")) return "image";
  if (content.startsWith("[Video Header]")) return "video";
  if (content.startsWith("[Document Header]")) return "document";
  return null;
}

const mediaAcceptMap: Record<string, string> = {
  image: "image/jpeg,image/png",
  video: "video/mp4",
  document: "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-info/10 text-info",
  running: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

// ─── Campaign Metrics ───

interface CampaignMetrics {
  audience: number;
  sent: number;
  delivered: number;
  read: number;
  responded: number;
  failed: number;
}

// ─── Campaign List ───

function CampaignList({ onNew }: { onNew: () => void }) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, CampaignMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const fetchCampaigns = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    // Fetch campaigns, contacts counts, and message stats in parallel
    const [campRes, contactsRes, msgsRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("campaign_contacts")
        .select("campaign_id")
        .eq("org_id", currentOrg.id),
      supabase
        .from("messages")
        .select("campaign_id, status, direction")
        .eq("org_id", currentOrg.id),
    ]);

    const campData = campRes.data ?? [];
    setCampaigns(campData);

    // Build metrics map
    const metricsMap: Record<string, CampaignMetrics> = {};
    for (const c of campData) {
      metricsMap[c.id] = { audience: 0, sent: 0, delivered: 0, read: 0, responded: 0, failed: 0 };
    }

    // Count audience per campaign
    for (const cc of contactsRes.data ?? []) {
      if (metricsMap[cc.campaign_id]) {
        metricsMap[cc.campaign_id].audience++;
      }
    }

    // Count message statuses per campaign
    for (const m of msgsRes.data ?? []) {
      const met = m.campaign_id ? metricsMap[m.campaign_id] : null;
      if (!met) continue;
      if ((m as any).direction === "inbound") {
        met.responded++;
        continue;
      }
      switch (m.status) {
        case "sent":
          met.sent++;
          break;
        case "delivered":
          met.sent++;
          met.delivered++;
          break;
        case "read":
          met.sent++;
          met.delivered++;
          met.read++;
          break;
        case "failed":
          met.failed++;
          break;
        // pending: not counted in sent/delivered/read
      }
    }

    setMetrics(metricsMap);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const launchCampaign = async (id: string) => {
    if (launchingId) return;
    setLaunchingId(id);

    try {
      const { count } = await supabase
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id);

      if (!count || count === 0) {
        toast({ variant: "destructive", title: "No contacts", description: "Assign contacts to this campaign first." });
        return;
      }

      const { data: camp } = await supabase.from("campaigns").select("status").eq("id", id).single();
      const fromStatus = camp?.status === "scheduled" ? "scheduled" : "draft";

      const { data: transitioned } = await supabase.rpc("transition_campaign_status", {
        _campaign_id: id,
        _from_status: fromStatus,
        _to_status: "running",
      });

      if (!transitioned) {
        toast({ variant: "destructive", title: "Already launched", description: "This campaign is no longer launchable." });
        fetchCampaigns();
        return;
      }

      toast({ title: "Campaign launched!" });
      const { data: sendResult, error: invokeErr } = await supabase.functions.invoke("send-campaign", { body: { campaign_id: id } });
      if (invokeErr) {
        toast({ variant: "destructive", title: "Error", description: invokeErr.message || "Failed to start send" });
      } else if (sendResult?.error === "Insufficient balance") {
        toast({
          variant: "destructive",
          title: "Insufficient Balance",
          description: `Required: ₹${sendResult.required}, Current: ₹${sendResult.current_balance}. Please add ₹${sendResult.shortfall} to your wallet.`,
        });
      }
      fetchCampaigns();
    } finally {
      setLaunchingId(null);
    }
  };

  // Apply filters
  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterCategory !== "all" && (c.message_category || "marketing") !== filterCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = c.name?.toLowerCase().includes(q);
        const descMatch = c.description?.toLowerCase().includes(q);
        if (!nameMatch && !descMatch) return false;
      }
      return true;
    });
  }, [campaigns, filterStatus, filterCategory, searchQuery]);

  const pctOf = (num: number, total: number) => total > 0 ? `${Math.round((num / total) * 100)}%` : "—";

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Campaigns</h1>
          <p className="text-muted-foreground">Create and manage WhatsApp campaigns</p>
        </div>
        <Button className="gap-2" onClick={onNew}>
          <Plus className="h-4 w-4" /> New Campaign
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-56 pl-8 text-sm"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-36 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="utility">Utility</SelectItem>
            <SelectItem value="authentication">Authentication</SelectItem>
          </SelectContent>
        </Select>
        {(searchQuery || filterStatus !== "all" || filterCategory !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => { setSearchQuery(""); setFilterStatus("all"); setFilterCategory("all"); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No campaigns yet. Create your first one!</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No campaigns match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Audience</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Opened</TableHead>
                <TableHead className="text-right">Responded</TableHead>
                <TableHead className="text-right">Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const m = metrics[c.id] || { audience: 0, sent: 0, delivered: 0, read: 0, responded: 0, failed: 0 };
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <TableCell>
                      <div className="min-w-[160px]">
                        <p className="font-medium text-foreground">{c.name}</p>
                        {c.template_message && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {stripContentMarkers(c.template_message)}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColor[c.status] || ""}>
                        {c.status === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize text-muted-foreground">{c.message_category || "marketing"}</span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {m.audience.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>
                        <span className="font-medium">{m.sent.toLocaleString()}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{pctOf(m.sent, m.audience)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>
                        <span className="font-medium">{m.delivered.toLocaleString()}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{pctOf(m.delivered, m.sent)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>
                        <span className="font-medium">{m.read.toLocaleString()}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{pctOf(m.read, m.delivered)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>
                        <span className="font-medium">{m.responded.toLocaleString()}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{pctOf(m.responded, m.audience)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-sm text-muted-foreground">
                      {c.scheduled_at
                        ? new Date(c.scheduled_at).toLocaleDateString()
                        : new Date(c.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/campaigns/${c.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary"
                            onClick={() => launchCampaign(c.id)}
                            disabled={launchingId === c.id}
                          >
                            {launchingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

// ─── Campaign Creator (Single Page) ───

function CampaignCreator({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [campaignName, setCampaignName] = useState("");

  // CSV
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvErrors, setCsvErrors] = useState<CsvError[]>([]);

  // Variable mapping
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});

  // Media
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  // Launching + progress
  const [launching, setLaunching] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  // Derived
  const templateVars = useMemo(
    () => (selectedTemplate ? extractTemplateVars(selectedTemplate.content || "") : []),
    [selectedTemplate]
  );

  const mediaType = useMemo(
    () => (selectedTemplate ? detectMediaType(selectedTemplate.content || "") : null),
    [selectedTemplate]
  );
  const needsMedia = mediaType !== null;

  const displayContent = useMemo(
    () => (selectedTemplate ? stripContentMarkers(selectedTemplate.content || "") : ""),
    [selectedTemplate]
  );

  // Fetch approved templates
  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("templates")
      .select("id, name, content, category, language, status")
      .eq("org_id", currentOrg.id)
      .eq("status", "approved")
      .then(({ data }) => setTemplates((data as any) || []));
  }, [currentOrg]);

  // Phone column detection
  const phoneColumn = useMemo(() => {
    return csvHeaders.find((h) => isPhoneColumn(h)) || csvHeaders[0] || "";
  }, [csvHeaders]);

  // Auto-map variables
  useEffect(() => {
    if (templateVars.length === 0 || csvHeaders.length === 0) return;
    const auto: Record<string, string> = {};
    for (const v of templateVars) {
      const num = v.replace(/\D/g, "");
      const nameCol = csvHeaders.find((h) => h.toLowerCase() === "name");
      if (num === "1" && nameCol) {
        auto[num] = nameCol;
      } else {
        const nonPhoneCols = csvHeaders.filter((h) => h !== phoneColumn);
        const idx = parseInt(num) - 1;
        if (idx < nonPhoneCols.length) {
          auto[num] = nonPhoneCols[idx];
        }
      }
    }
    setVariableMapping(auto);
  }, [templateVars, csvHeaders, phoneColumn]);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    file.text().then((text) => {
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) {
        toast({ variant: "destructive", title: "Invalid CSV", description: "No columns found." });
        return;
      }
      const phoneCol = headers.find((h) => isPhoneColumn(h));
      if (!phoneCol) {
        toast({ variant: "destructive", title: "Missing phone column", description: "CSV must have a phone/mobile column." });
        return;
      }

      // Validate rows
      const errors: CsvError[] = [];
      const validRows: CsvRow[] = [];
      const seenPhones = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rawPhone = row[phoneCol] || "";
        const rowNum = i + 2; // +2 for header row + 0-index

        if (!rawPhone) {
          errors.push({ row: rowNum, reason: "Missing phone number" });
          continue;
        }

        if (!isValidPhone(rawPhone)) {
          errors.push({ row: rowNum, reason: `Invalid phone: ${rawPhone}` });
          continue;
        }

        const normalized = normalizePhone(rawPhone);
        if (seenPhones.has(normalized)) {
          errors.push({ row: rowNum, reason: `Duplicate: ${rawPhone}` });
          continue;
        }

        seenPhones.add(normalized);
        // Store normalized phone (with country code) back into the row
        row[phoneCol] = normalized;
        validRows.push(row);
      }

      setCsvErrors(errors);
      setCsvHeaders(headers);
      setCsvRows(validRows);
    });
  };

  const clearCsv = () => {
    setCsvHeaders([]);
    setCsvRows([]);
    setCsvFileName("");
    setCsvErrors([]);
  };

  const downloadCsvTemplate = () => {
    const vars = selectedTemplate
      ? templateVars.map((v) => `variable_${v.replace(/\D/g, "")}`)
      : [];
    const cols = ["phone_number", "name", "email", ...vars];
    const header = cols.join(",");
    const row1 = ["+919876543210", "John", "john@example.com", ...vars.map((_, i) => `sample_value_${i + 1}`)].join(",");
    const row2 = ["+919876543211", "Jane", "jane@example.com", ...vars.map((_, i) => `sample_value_${i + 1}`)].join(",");
    const csv = [header, row1, row2].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setMediaPreviewUrl(URL.createObjectURL(file));
    } else {
      setMediaPreviewUrl(null);
    }
  };

  const previewMessage = useMemo(() => {
    if (!selectedTemplate) return "";
    if (csvRows.length === 0) return displayContent;
    return resolveMessage(selectedTemplate.content || "", variableMapping, csvRows[0]);
  }, [selectedTemplate, displayContent, variableMapping, csvRows]);

  // Estimated cost
  const estimatedCost = useMemo(() => {
    const rate = selectedTemplate?.category?.toLowerCase() === "utility" ? 0.2
      : selectedTemplate?.category?.toLowerCase() === "authentication" ? 0.2
        : 1.0;
    const gst = rate * 0.18;
    return { perMsg: rate + gst, total: Math.round(csvRows.length * (rate + gst) * 100) / 100, count: csvRows.length };
  }, [csvRows, selectedTemplate]);

  const canLaunch = !!selectedTemplate && csvRows.length > 0 && (!needsMedia || !!mediaFile);

  const launch = async () => {
    if (!user || !currentOrg || !selectedTemplate) return;
    setLaunching(true);
    setUploadProgress({ done: 0, total: csvRows.length, failed: 0 });

    try {
      // 1. Upload media if needed
      let mediaUrl: string | null = null;
      if (mediaFile) {
        const ext = mediaFile.name.split(".").pop();
        const path = `${currentOrg.id}/${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("template-media").upload(path, mediaFile);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("template-media").getPublicUrl(path);
        mediaUrl = urlData.publicUrl;
      }

      // 2. Create campaign — store stripped content for display, raw stays in templates.content
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          org_id: currentOrg.id,
          name: campaignName || `${selectedTemplate.name} - ${new Date().toLocaleDateString()}`,
          template_id: selectedTemplate.id,
          template_message: stripContentMarkers(selectedTemplate.content),
          media_url: mediaUrl,
          variable_mapping: variableMapping,
          message_category: (selectedTemplate.category || "marketing").toLowerCase(),
        })
        .select("id")
        .single();
      if (campErr) throw campErr;

      // 3. Prepare contact inserts
      const nameCol = csvHeaders.find((h) => h.toLowerCase() === "name");
      const emailCol = csvHeaders.find((h) => h.toLowerCase().includes("email"));
      const contactInserts = csvRows.map((row) => {
        const phone = row[phoneColumn] || "";
        const customFields: Record<string, string> = {};
        for (const h of csvHeaders) {
          if (h === phoneColumn || h === nameCol || h === emailCol) continue;
          if (row[h]) customFields[h] = row[h];
        }
        return {
          user_id: user.id,
          org_id: currentOrg.id,
          phone_number: phone,
          name: nameCol ? row[nameCol] || null : null,
          email: emailCol ? row[emailCol] || null : null,
          source: "campaign_csv",
          custom_fields: customFields,
        };
      }).filter((c) => c.phone_number);

      // 4. Process in chunks of UPLOAD_BATCH (5000), each chunk sub-batched by UPSERT_BATCH (500)
      // On batch failure, retry record-by-record to isolate bad rows and continue
      let totalUploaded = 0;
      let totalFailed = 0;
      let totalAssigned = 0;

      for (let chunkStart = 0; chunkStart < contactInserts.length; chunkStart += UPLOAD_BATCH) {
        const chunk = contactInserts.slice(chunkStart, chunkStart + UPLOAD_BATCH);
        const chunkContacts: { id: string; phone_number: string }[] = [];

        for (let i = 0; i < chunk.length; i += UPSERT_BATCH) {
          const batch = chunk.slice(i, i + UPSERT_BATCH);
          const { data, error } = await supabase
            .from("contacts")
            .upsert(batch, { onConflict: "phone_number,org_id", ignoreDuplicates: false })
            .select("id, phone_number");

          if (error) {
            // Batch failed — retry each record individually to isolate bad rows
            for (const record of batch) {
              const { data: single, error: singleErr } = await supabase
                .from("contacts")
                .upsert(record, { onConflict: "phone_number,org_id", ignoreDuplicates: false })
                .select("id, phone_number")
                .single();
              if (singleErr) {
                totalFailed++;
              } else if (single) {
                chunkContacts.push(single);
              }
            }
          } else {
            chunkContacts.push(...(data ?? []));
          }

          totalUploaded += batch.length;
          setUploadProgress({ done: totalUploaded, total: contactInserts.length, failed: totalFailed });
        }

        // Assign this chunk's contacts to campaign
        if (chunkContacts.length > 0) {
          const assignments = chunkContacts.map((c) => ({
            campaign_id: campaign.id,
            contact_id: c.id,
            org_id: currentOrg.id,
          }));
          for (let i = 0; i < assignments.length; i += UPSERT_BATCH) {
            const batch = assignments.slice(i, i + UPSERT_BATCH);
            const { error: assignErr } = await supabase.from("campaign_contacts").insert(batch);
            if (assignErr) {
              // Same fallback — retry individually
              for (const row of batch) {
                const { error: sErr } = await supabase.from("campaign_contacts").insert(row);
                if (sErr) totalFailed++;
                else totalAssigned++;
              }
            } else {
              totalAssigned += batch.length;
            }
          }
        }
      }

      if (totalAssigned === 0) {
        throw new Error("No contacts could be uploaded. Check your CSV data.");
      }

      // 5. Schedule or launch immediately
      if (scheduleMode && scheduledAt) {
        // Schedule for later
        await supabase
          .from("campaigns")
          .update({ status: "scheduled", scheduled_at: new Date(scheduledAt).toISOString() })
          .eq("id", campaign.id);

        const failNote = totalFailed > 0 ? ` (${totalFailed} records failed to upload)` : "";
        toast({
          title: "Campaign scheduled!",
          description: `Will send to ${totalAssigned.toLocaleString()} contacts at ${new Date(scheduledAt).toLocaleString()}.${failNote}`,
        });
      } else {
        // Launch immediately
        await supabase.rpc("transition_campaign_status", {
          _campaign_id: campaign.id,
          _from_status: "draft",
          _to_status: "running",
        });
        const { data: sendResult, error: invokeErr } = await supabase.functions.invoke("send-campaign", {
          body: { campaign_id: campaign.id },
        });

        if (invokeErr) {
          throw new Error(invokeErr.message || "Failed to start campaign send");
        }

        if (sendResult?.error === "Insufficient balance") {
          toast({
            variant: "destructive",
            title: "Insufficient Balance",
            description: `Required: ₹${sendResult.required}, Current: ₹${sendResult.current_balance}. Please add ₹${sendResult.shortfall} to your wallet.`,
          });
        } else {
          const failNote = totalFailed > 0 ? ` (${totalFailed} records failed to upload)` : "";
          toast({
            title: "Campaign launched!",
            description: `Sending to ${totalAssigned.toLocaleString()} contacts.${failNote}`,
          });
        }
      }

      navigate(`/campaigns/${campaign.id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLaunching(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Create Campaign</h1>
      </div>

      <div className="flex gap-6 items-start">
        {/* ─── Left: Form ─── */}
        <div className="flex-1 space-y-6">
          {/* Section 1: Template & Name */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Template & Name</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Campaign Name</Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., March Promo Blast"
                />
              </div>
              <div>
                <Label>Template</Label>
                {templates.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    No approved templates. Create and submit a template first.
                  </p>
                ) : (
                  <Select
                    value={selectedTemplate?.id || ""}
                    onValueChange={(val) => {
                      const t = templates.find((t) => t.id === val);
                      setSelectedTemplate(t || null);
                      setMediaFile(null);
                      setMediaPreviewUrl(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} — {t.category || "marketing"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {selectedTemplate && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  {mediaType && (
                    <Badge variant="outline" className="mb-2 text-[10px] capitalize">{mediaType} header</Badge>
                  )}
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{displayContent}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Upload Contacts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact List</CardTitle>
              <CardDescription className="text-xs">Upload a CSV file with your contacts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Format guide + download template */}
              {!csvFileName && (
                <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 p-4 space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">CSV Format</p>
                    <p className="text-xs text-muted-foreground">
                      Your file must include a <span className="font-mono font-medium text-foreground">phone_number</span> or <span className="font-mono font-medium text-foreground">mobile</span> column. Optional columns: <span className="font-mono text-foreground">name</span>, <span className="font-mono text-foreground">email</span>, and any custom fields for template variables.
                    </p>
                  </div>
                  <div className="overflow-hidden rounded border bg-background">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">phone_number</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">name</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">email</th>
                          {templateVars.length > 0 && templateVars.map((v) => (
                            <th key={v} className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                              variable_{v.replace(/\D/g, "")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b">
                          <td className="px-3 py-1.5">+919876543210</td>
                          <td className="px-3 py-1.5">John</td>
                          <td className="px-3 py-1.5">john@example.com</td>
                          {templateVars.length > 0 && templateVars.map((v, i) => (
                            <td key={v} className="px-3 py-1.5">value_{i + 1}</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5">+919876543211</td>
                          <td className="px-3 py-1.5">Jane</td>
                          <td className="px-3 py-1.5">jane@example.com</td>
                          {templateVars.length > 0 && templateVars.map((v, i) => (
                            <td key={v} className="px-3 py-1.5">value_{i + 1}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="default" size="sm" className="gap-2" onClick={downloadCsvTemplate}>
                      <Download className="h-3.5 w-3.5" /> Download Template
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Upload CSV
                    </Button>
                  </div>
                </div>
              )}

              {/* Upload button when CSV already loaded (for replacing) */}
              {csvFileName && (
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> Replace CSV
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2" onClick={downloadCsvTemplate}>
                    <Download className="h-3.5 w-3.5" /> Download Template
                  </Button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />

              {csvFileName && (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{csvFileName}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      {csvRows.length.toLocaleString()} valid
                    </Badge>
                    {csvErrors.length > 0 && (
                      <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                        <AlertCircle className="h-3 w-3" />
                        {csvErrors.length.toLocaleString()} skipped
                      </Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearCsv}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {csvErrors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View {csvErrors.length} skipped row{csvErrors.length > 1 ? "s" : ""}
                  </summary>
                  <div className="mt-1 max-h-32 overflow-y-auto rounded border p-2 space-y-0.5">
                    {csvErrors.slice(0, 50).map((e, i) => (
                      <p key={i} className="text-muted-foreground">
                        Row {e.row}: {e.reason}
                      </p>
                    ))}
                    {csvErrors.length > 50 && (
                      <p className="text-muted-foreground">...and {csvErrors.length - 50} more</p>
                    )}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Variable Mapping (conditional) */}
          {templateVars.length > 0 && csvRows.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Map Variables</CardTitle>
                <CardDescription className="text-xs">Connect template variables to CSV columns</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {templateVars.map((v) => {
                  const num = v.replace(/\D/g, "");
                  return (
                    <div key={num} className="flex items-center gap-3">
                      <div className="flex h-7 w-14 items-center justify-center rounded bg-primary/10 text-xs font-mono font-medium text-primary">
                        {`{{${num}}}`}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <Select
                        value={variableMapping[num] || ""}
                        onValueChange={(val) => setVariableMapping({ ...variableMapping, [num]: val })}
                      >
                        <SelectTrigger className="w-44 h-8 text-sm">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {csvHeaders.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Section 4: Attach Media (conditional) */}
          {needsMedia && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Attach {mediaType === "image" ? "Image" : mediaType === "video" ? "Video" : "Document"}
                </CardTitle>
                <CardDescription className="text-xs">
                  Required by this template's {mediaType} header
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => mediaInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> Upload
                </Button>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept={mediaType ? mediaAcceptMap[mediaType] : ""}
                  className="hidden"
                  onChange={handleMediaUpload}
                />
                {mediaFile && (
                  <div className="flex items-center gap-3">
                    {mediaPreviewUrl && mediaFile.type.startsWith("image/") && (
                      <img src={mediaPreviewUrl} alt="" className="h-16 w-16 rounded object-cover" />
                    )}
                    {mediaPreviewUrl && mediaFile.type.startsWith("video/") && (
                      <video src={mediaPreviewUrl} className="h-16 w-16 rounded object-cover" muted />
                    )}
                    <div>
                      <p className="text-sm font-medium">{mediaFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(mediaFile.size / 1048576).toFixed(1)} MB</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setMediaFile(null); setMediaPreviewUrl(null); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Launch Bar */}
          {selectedTemplate && csvRows.length > 0 && (
            <Card>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">Recipients:</span>{" "}
                      <span className="font-semibold">{estimatedCost.count.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Est. Cost:</span>{" "}
                      <span className="font-semibold">₹{estimatedCost.total}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Category:</span>{" "}
                      <span className="font-semibold capitalize">{selectedTemplate.category || "marketing"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scheduleMode}
                        onChange={(e) => setScheduleMode(e.target.checked)}
                        className="rounded"
                      />
                      Schedule
                    </label>
                    {scheduleMode && (
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                      />
                    )}
                    <Button
                      onClick={launch}
                      disabled={!canLaunch || launching || (scheduleMode && !scheduledAt)}
                      className="gap-2 px-6"
                    >
                      {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                      {launching ? "Uploading..." : scheduleMode ? "Schedule Campaign" : "Launch Campaign"}
                    </Button>
                  </div>
                </div>
                {uploadProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Uploading contacts...</span>
                      <span>
                        {uploadProgress.done.toLocaleString()} / {uploadProgress.total.toLocaleString()}
                        {uploadProgress.failed > 0 && (
                          <span className="text-destructive ml-2">({uploadProgress.failed} failed)</span>
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ─── Right: Message Preview ─── */}
        {selectedTemplate && (
          <Card className="w-80 shrink-0 sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Message Preview</CardTitle>
              {csvRows.length > 0 && (
                <CardDescription className="text-xs">Using first row data</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-[#e5ddd5] p-3">
                <div className="max-w-full rounded-lg rounded-tl-none bg-white p-2.5 shadow-sm">
                  {mediaPreviewUrl && (
                    <img src={mediaPreviewUrl} alt="" className="mb-2 w-full rounded object-cover" />
                  )}
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-900">
                    {previewMessage || "Select a template to preview"}
                  </p>
                  <p className="mt-1 text-right text-[10px] text-gray-400">
                    {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              {/* Variable mapping summary */}
              {Object.keys(variableMapping).length > 0 && csvRows.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Variable Mapping</p>
                  {Object.entries(variableMapping).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{`{{${k}}}`}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function Campaigns() {
  const [creating, setCreating] = useState(false);

  return (
    <DashboardLayout>
      {creating ? (
        <CampaignCreator onBack={() => setCreating(false)} />
      ) : (
        <CampaignList onNew={() => setCreating(true)} />
      )}
    </DashboardLayout>
  );
}
