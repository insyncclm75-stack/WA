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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Play, Eye, ArrowLeft, ArrowRight, Upload, Download,
  FileText, CheckCircle2, AlertCircle, Loader2, X,
  Image as ImageIcon, Video, Rocket,
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
  media_url?: string | null;
}

interface CsvRow {
  [key: string]: string;
}

// ─── Helpers ───

function extractTemplateVars(text: string): string[] {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches)].sort(
    (a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, ""))
  );
}

function resolveMessage(text: string, mapping: Record<string, string>, row: CsvRow): string {
  let resolved = text;
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

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-info/10 text-info",
  running: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

// ─── Campaign List ───

function CampaignList({
  onNew,
}: {
  onNew: () => void;
}) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    setCampaigns(data ?? []);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

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
      const { data: sendResult } = await supabase.functions.invoke("send-campaign", { body: { campaign_id: id } });
      if (sendResult?.error === "Insufficient balance") {
        toast({
          variant: "destructive",
          title: "Insufficient Balance",
          description: `Required: ₹${sendResult.required}, Current: ₹${sendResult.current_balance}. Please add ₹${sendResult.shortfall} to your wallet.`,
        });
      }
      fetchCampaigns();
    }
  };

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
    </>
  );
}

// ─── Campaign Creator (Multi-Step) ───

function CampaignCreator({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [campaignName, setCampaignName] = useState("");

  // Step 2: CSV upload
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState("");

  // Step 3: Variable mapping
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});

  // Step 4: Media
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);

  // Step 5: Launching
  const [launching, setLaunching] = useState(false);

  // Detect template header type from content
  const templateVars = useMemo(
    () => (selectedTemplate ? extractTemplateVars(selectedTemplate.content || "") : []),
    [selectedTemplate]
  );

  const needsMedia = selectedTemplate?.media_url !== null && selectedTemplate?.media_url !== undefined;

  // Fetch approved templates
  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("templates")
      .select("id, name, content, category, language, status, media_url")
      .eq("org_id", currentOrg.id)
      .eq("status", "approved")
      .then(({ data }) => setTemplates((data as any) || []));
  }, [currentOrg]);

  // Phone column detection
  const phoneColumn = useMemo(() => {
    return csvHeaders.find((h) => {
      const l = h.toLowerCase();
      return l.includes("phone") || l.includes("mobile") || l === "number" || l === "whatsapp";
    }) || csvHeaders[0] || "";
  }, [csvHeaders]);

  // Auto-map variables
  useEffect(() => {
    if (templateVars.length === 0 || csvHeaders.length === 0) return;
    const auto: Record<string, string> = {};
    for (const v of templateVars) {
      const num = v.replace(/\D/g, "");
      // Try to find a matching column by common names
      const nameCol = csvHeaders.find((h) => h.toLowerCase() === "name");
      if (num === "1" && nameCol) {
        auto[num] = nameCol;
      } else {
        // Map to columns in order (skip phone column)
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
      const hasPhone = headers.some((h) => {
        const l = h.toLowerCase();
        return l.includes("phone") || l.includes("mobile") || l === "number" || l === "whatsapp";
      });
      if (!hasPhone) {
        toast({ variant: "destructive", title: "Missing phone column", description: "CSV must have a phone/mobile column." });
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows.filter((r) => r[headers.find((h) => {
        const l = h.toLowerCase();
        return l.includes("phone") || l.includes("mobile") || l === "number" || l === "whatsapp";
      }) || ""]));
    });
  };

  const downloadCsvTemplate = () => {
    if (!selectedTemplate) return;
    const vars = templateVars.map((v) => `variable_${v.replace(/\D/g, "")}`);
    const cols = ["phone_number", "name", ...vars];
    const header = cols.join(",");
    const row1 = ["+919876543210", "John", ...vars.map((_, i) => `sample_value_${i + 1}`)].join(",");
    const row2 = ["+919876543211", "Jane", ...vars.map((_, i) => `sample_value_${i + 1}`)].join(",");
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
    }
  };

  const previewMessage = useMemo(() => {
    if (!selectedTemplate || csvRows.length === 0) return selectedTemplate?.content || "";
    return resolveMessage(selectedTemplate.content || "", variableMapping, csvRows[0]);
  }, [selectedTemplate, variableMapping, csvRows]);

  // Estimated cost
  const estimatedCost = useMemo(() => {
    const rate = selectedTemplate?.category?.toLowerCase() === "utility" ? 0.2
      : selectedTemplate?.category?.toLowerCase() === "authentication" ? 0.2
        : 1.0;
    const gst = rate * 0.18;
    return { perMsg: rate + gst, total: Math.round(csvRows.length * (rate + gst) * 100) / 100, count: csvRows.length };
  }, [csvRows, selectedTemplate]);

  const launch = async () => {
    if (!user || !currentOrg || !selectedTemplate) return;
    setLaunching(true);

    try {
      // 1. Upload media if needed
      let mediaUrl = selectedTemplate.media_url || null;
      if (mediaFile) {
        const ext = mediaFile.name.split(".").pop();
        const path = `${currentOrg.id}/${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("template-media").upload(path, mediaFile);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("template-media").getPublicUrl(path);
        mediaUrl = urlData.publicUrl;
      }

      // 2. Create campaign
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          org_id: currentOrg.id,
          name: campaignName || `${selectedTemplate.name} - ${new Date().toLocaleDateString()}`,
          template_id: selectedTemplate.id,
          template_message: selectedTemplate.content,
          media_url: mediaUrl,
          variable_mapping: variableMapping,
          message_category: (selectedTemplate.category || "marketing").toLowerCase(),
        })
        .select("id")
        .single();
      if (campErr) throw campErr;

      // 3. Create/upsert contacts from CSV and assign to campaign
      const contactInserts = csvRows.map((row) => {
        const phone = row[phoneColumn] || "";
        const nameCol = csvHeaders.find((h) => h.toLowerCase() === "name");
        const emailCol = csvHeaders.find((h) => h.toLowerCase().includes("email"));
        // Build custom_fields from non-standard columns
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

      // Upsert contacts (on phone_number + org_id)
      const { data: contacts, error: contactErr } = await supabase
        .from("contacts")
        .upsert(contactInserts, { onConflict: "phone_number,org_id", ignoreDuplicates: false })
        .select("id, phone_number");

      if (contactErr) throw contactErr;

      // 4. Assign contacts to campaign
      if (contacts && contacts.length > 0) {
        const assignments = contacts.map((c: any) => ({
          campaign_id: campaign.id,
          contact_id: c.id,
          org_id: currentOrg.id,
        }));
        const { error: assignErr } = await supabase.from("campaign_contacts").insert(assignments);
        if (assignErr) throw assignErr;
      }

      // 5. Update status to running and send
      await supabase.from("campaigns").update({ status: "running" }).eq("id", campaign.id);
      const { data: sendResult } = await supabase.functions.invoke("send-campaign", {
        body: { campaign_id: campaign.id },
      });

      if (sendResult?.error === "Insufficient balance") {
        toast({
          variant: "destructive",
          title: "Insufficient Balance",
          description: `Required: ₹${sendResult.required}, Current: ₹${sendResult.current_balance}. Please add ₹${sendResult.shortfall} to your wallet.`,
        });
      } else {
        toast({
          title: "Campaign launched!",
          description: `Sending to ${contacts?.length || 0} contacts.`,
        });
      }

      navigate(`/campaigns/${campaign.id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLaunching(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedTemplate;
      case 2: return csvRows.length > 0;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  const totalSteps = needsMedia ? 5 : 4;
  const getActualStep = (s: number) => {
    if (!needsMedia && s >= 4) return s + 1;
    return s;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Create Campaign</h1>
          <p className="text-sm text-muted-foreground">
            Step {step} of {totalSteps}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-1">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      {/* Step 1: Choose Template */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose Template</CardTitle>
            <CardDescription>Select an approved WhatsApp template for your campaign</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Campaign Name</Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g., March Promo Blast"
              />
            </div>
            <Separator />
            {templates.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No approved templates. Create and submit a template first.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={`rounded-lg border p-4 text-left transition-all ${
                      selectedTemplate?.id === t.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-sm">{t.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {t.category || "marketing"}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                      {t.content}
                    </p>
                    {selectedTemplate?.id === t.id && (
                      <CheckCircle2 className="mt-2 h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Upload List */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Contact List</CardTitle>
            <CardDescription>Upload a CSV file with phone numbers and variables</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload CSV
              </Button>
              <Button variant="ghost" className="gap-2" onClick={downloadCsvTemplate}>
                <Download className="h-4 w-4" /> Download Template CSV
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
            </div>

            {csvFileName && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{csvFileName}</span>
                <Badge variant="outline" className="ml-auto">{csvRows.length} contacts</Badge>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setCsvHeaders([]); setCsvRows([]); setCsvFileName(""); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {csvRows.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  Preview (first 5 rows of {csvRows.length} total)
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvHeaders.map((h) => (
                          <TableHead key={h} className="text-xs">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvRows.slice(0, 5).map((row, i) => (
                        <TableRow key={i}>
                          {csvHeaders.map((h) => (
                            <TableCell key={h} className="text-xs">{row[h] || "—"}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Validation */}
                {csvRows.some((r) => !r[phoneColumn]) && (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Some rows are missing phone numbers and will be skipped.</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Map Variables */}
      {step === 3 && (
        <div className="flex gap-6 items-start">
          <Card className="flex-1">
            <CardHeader>
              <CardTitle>Map Variables</CardTitle>
              <CardDescription>Connect template variables to your CSV columns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {templateVars.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  This template has no variables. Proceed to the next step.
                </p>
              ) : (
                templateVars.map((v) => {
                  const num = v.replace(/\D/g, "");
                  return (
                    <div key={num} className="flex items-center gap-4">
                      <div className="flex h-8 w-16 items-center justify-center rounded bg-primary/10 text-xs font-mono font-medium text-primary">
                        {`{{${num}}}`}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={variableMapping[num] || ""}
                        onValueChange={(val) => setVariableMapping({ ...variableMapping, [num]: val })}
                      >
                        <SelectTrigger className="w-48">
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
                })
              )}
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="w-80 shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Message Preview</CardTitle>
              <CardDescription className="text-xs">Using first row data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-[#e5ddd5] p-3">
                <div className="max-w-full rounded-lg rounded-tl-none bg-white p-2.5 shadow-sm">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-900">
                    {previewMessage || "Message body..."}
                  </p>
                  <p className="mt-1 text-right text-[10px] text-gray-400">
                    {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 4: Attach Media (conditional) */}
      {step === 4 && needsMedia && (
        <Card>
          <CardHeader>
            <CardTitle>Attach Media</CardTitle>
            <CardDescription>Upload the image or video for this campaign</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="gap-2" onClick={() => mediaInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Upload File
            </Button>
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/mp4,.pdf"
              className="hidden"
              onChange={handleMediaUpload}
            />
            {mediaFile && (
              <div className="flex items-center gap-3">
                {mediaPreviewUrl && mediaFile.type.startsWith("image/") && (
                  <img src={mediaPreviewUrl} alt="" className="h-24 w-24 rounded object-cover" />
                )}
                {mediaPreviewUrl && mediaFile.type.startsWith("video/") && (
                  <video src={mediaPreviewUrl} className="h-24 w-24 rounded object-cover" muted />
                )}
                <div>
                  <p className="text-sm font-medium">{mediaFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(mediaFile.size / 1048576).toFixed(1)} MB
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setMediaFile(null); setMediaPreviewUrl(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 5 (or 4 if no media): Review & Launch */}
      {((step === 5) || (step === 4 && !needsMedia)) && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Launch</CardTitle>
            <CardDescription>Confirm your campaign details before sending</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{estimatedCost.count}</p>
                <p className="text-xs text-muted-foreground">Recipients</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">₹{estimatedCost.total}</p>
                <p className="text-xs text-muted-foreground">Estimated Cost</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold capitalize">{selectedTemplate?.category || "marketing"}</p>
                <p className="text-xs text-muted-foreground">Category</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{selectedTemplate?.name}</p>
                <p className="text-xs text-muted-foreground">Template</p>
              </div>
            </div>

            <Separator />

            <div className="flex gap-6 items-start">
              {/* Message preview */}
              <div className="flex-1">
                <p className="mb-2 text-sm font-medium">Message Preview (Row 1)</p>
                <div className="rounded-lg bg-[#e5ddd5] p-3">
                  <div className="max-w-full rounded-lg rounded-tl-none bg-white p-2.5 shadow-sm">
                    {mediaPreviewUrl && (
                      <img src={mediaPreviewUrl} alt="" className="mb-2 w-full rounded object-cover" />
                    )}
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-900">
                      {previewMessage}
                    </p>
                  </div>
                </div>
              </div>

              {/* Variable mapping summary */}
              {Object.keys(variableMapping).length > 0 && (
                <div className="w-60">
                  <p className="mb-2 text-sm font-medium">Variable Mapping</p>
                  <div className="space-y-1">
                    {Object.entries(variableMapping).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{`{{${k}}}`}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex justify-end">
              <Button onClick={launch} disabled={launching} className="gap-2 px-8" size="lg">
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Launch Campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> {step > 1 ? "Back" : "Cancel"}
        </Button>
        {!((step === 5) || (step === 4 && !needsMedia)) && (
          <Button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="gap-2">
            Next <ArrowRight className="h-4 w-4" />
          </Button>
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
