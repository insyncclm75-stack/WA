import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  Key,
  Lock,
  Unlock,
  RefreshCw,
  Download,
  Trash2,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  FileText,
  Bell,
  ScrollText,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Phone,
  Globe,
  Calendar,
} from "lucide-react";

interface KeyStatus {
  key_active: boolean;
  key_hint: string | null;
  key_created_at: string | null;
  dpdp_enabled: boolean;
  dpo_email: string | null;
  dpo_phone: string | null;
  privacy_policy_url: string | null;
  data_retention_days: number;
  encrypted_contacts: number;
  total_contacts: number;
  active_consents: number;
  pending_requests: number;
  pii_access_count: number;
}

interface DataRequest {
  id: string;
  contact_id: string | null;
  requested_by_phone: string | null;
  request_type: string;
  status: string;
  due_date: string;
  completed_at: string | null;
  admin_notes: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface ConsentRecord {
  id: string;
  contact_id: string | null;
  user_identifier: string;
  consent_version: string;
  purpose: string;
  consented_at: string;
  withdrawn_at: string | null;
}

interface PiiAccessEntry {
  id: string;
  user_id: string | null;
  contact_id: string | null;
  table_name: string;
  column_name: string;
  purpose: string;
  accessed_at: string;
}

interface BreachNotification {
  id: string;
  triggered_by: string;
  title: string;
  description: string;
  impact: string;
  remedial_steps: string;
  dpo_contact: string;
  affected_count: number;
  notified_board: boolean;
  notified_principals: boolean;
  triggered_at: string;
}

async function callDpdpManage(action: string, orgId: string, params: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await supabase.functions.invoke("dpdp-manage", {
    body: { action, org_id: orgId, ...params },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (resp.error) throw resp.error;
  return resp.data;
}

export default function DpdpCompliance() {
  const { currentOrg, orgRole } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = orgRole === "admin";
  const orgId = currentOrg?.id;

  // Key status
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Set key dialog
  const [showSetKey, setShowSetKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [settingKey, setSettingKey] = useState(false);

  // Settings
  const [dpoEmail, setDpoEmail] = useState("");
  const [dpoPhone, setDpoPhone] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [retentionDays, setRetentionDays] = useState(730);
  const [savingSettings, setSavingSettings] = useState(false);

  // Encrypt existing
  const [encrypting, setEncrypting] = useState(false);

  // Data requests
  const [dataRequests, setDataRequests] = useState<DataRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Consent records
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loadingConsents, setLoadingConsents] = useState(false);

  // PII audit
  const [auditLog, setAuditLog] = useState<PiiAccessEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Breach notifications
  const [breaches, setBreaches] = useState<BreachNotification[]>([]);
  const [loadingBreaches, setLoadingBreaches] = useState(false);
  const [showBreachForm, setShowBreachForm] = useState(false);
  const [breachForm, setBreachForm] = useState({ title: "", description: "", impact: "", remedial_steps: "", dpo_contact: "", affected_count: 0 });
  const [submittingBreach, setSubmittingBreach] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await callDpdpManage("check_key_status", orgId);
      setStatus(data);
      setDpoEmail(data.dpo_email || "");
      setDpoPhone(data.dpo_phone || "");
      setPrivacyUrl(data.privacy_policy_url || "");
      setRetentionDays(data.data_retention_days || 730);
    } catch {
      toast({ title: "Error", description: "Failed to fetch DPDP status", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSetKey = async () => {
    if (!orgId || !newKey) return;
    if (newKey.length < 16) {
      toast({ title: "Invalid Key", description: "Encryption key must be at least 16 characters", variant: "destructive" });
      return;
    }
    setSettingKey(true);
    try {
      await callDpdpManage("set_encryption_key", orgId, { encryption_key: newKey });
      toast({ title: "Key Set", description: "Encryption key has been set and DPDP is now enabled" });
      setShowSetKey(false);
      setNewKey("");
      fetchStatus();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to set encryption key", variant: "destructive" });
    } finally {
      setSettingKey(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!orgId) return;
    setSavingSettings(true);
    try {
      await callDpdpManage("update_settings", orgId, {
        dpo_email: dpoEmail,
        dpo_phone: dpoPhone,
        privacy_policy_url: privacyUrl,
        data_retention_days: retentionDays,
      });
      toast({ title: "Saved", description: "DPDP settings updated" });
      fetchStatus();
    } catch {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleEncryptExisting = async () => {
    if (!orgId) return;
    setEncrypting(true);
    try {
      const data = await callDpdpManage("encrypt_existing", orgId);
      toast({ title: "Encryption Complete", description: `Encrypted ${data.encrypted} of ${data.total} contacts` });
      fetchStatus();
    } catch {
      toast({ title: "Error", description: "Failed to encrypt contacts", variant: "destructive" });
    } finally {
      setEncrypting(false);
    }
  };

  const fetchDataRequests = async () => {
    if (!orgId) return;
    setLoadingRequests(true);
    const { data } = await supabase
      .from("data_requests")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    setDataRequests((data as DataRequest[]) || []);
    setLoadingRequests(false);
  };

  const handleProcessErasure = async (requestId: string) => {
    if (!orgId) return;
    try {
      await callDpdpManage("process_erasure", orgId, { request_id: requestId });
      toast({ title: "Erasure Processed", description: "Contact data has been anonymized" });
      fetchDataRequests();
      fetchStatus();
    } catch {
      toast({ title: "Error", description: "Failed to process erasure", variant: "destructive" });
    }
  };

  const fetchConsents = async () => {
    if (!orgId) return;
    setLoadingConsents(true);
    const { data } = await supabase
      .from("consent_records")
      .select("id, contact_id, user_identifier, consent_version, purpose, consented_at, withdrawn_at")
      .eq("org_id", orgId)
      .order("consented_at", { ascending: false })
      .limit(50);
    setConsents((data as ConsentRecord[]) || []);
    setLoadingConsents(false);
  };

  const fetchAuditLog = async () => {
    if (!orgId) return;
    setLoadingAudit(true);
    const { data } = await supabase
      .from("pii_access_log")
      .select("*")
      .eq("org_id", orgId)
      .order("accessed_at", { ascending: false })
      .limit(100);
    setAuditLog((data as PiiAccessEntry[]) || []);
    setLoadingAudit(false);
  };

  const fetchBreaches = async () => {
    if (!orgId) return;
    setLoadingBreaches(true);
    const { data } = await supabase
      .from("breach_notifications")
      .select("*")
      .eq("org_id", orgId)
      .order("triggered_at", { ascending: false })
      .limit(20);
    setBreaches((data as BreachNotification[]) || []);
    setLoadingBreaches(false);
  };

  const handleSubmitBreach = async () => {
    if (!orgId || !user) return;
    setSubmittingBreach(true);
    try {
      await supabase.from("breach_notifications").insert({
        org_id: orgId,
        triggered_by: user.id,
        ...breachForm,
      });
      toast({ title: "Breach Reported", description: "Breach notification logged" });
      setShowBreachForm(false);
      setBreachForm({ title: "", description: "", impact: "", remedial_steps: "", dpo_contact: "", affected_count: 0 });
      fetchBreaches();
    } catch {
      toast({ title: "Error", description: "Failed to log breach", variant: "destructive" });
    } finally {
      setSubmittingBreach(false);
    }
  };

  if (!orgId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Select an organization to manage DPDP compliance.
        </div>
      </DashboardLayout>
    );
  }

  const unencryptedCount = (status?.total_contacts ?? 0) - (status?.encrypted_contacts ?? 0);
  const encryptionPct = status?.total_contacts ? Math.round((status.encrypted_contacts / status.total_contacts) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <Shield className="h-8 w-8 text-primary" />
            DPDP Compliance
          </h1>
          <p className="mt-1 text-muted-foreground">
            Digital Personal Data Protection Act 2023 — encryption, consent, and data subject rights
          </p>
        </div>
        <Badge variant={status?.dpdp_enabled ? "default" : "secondary"} className="text-sm px-3 py-1">
          {status?.dpdp_enabled ? (
            <><ShieldCheck className="mr-1 h-4 w-4" /> DPDP Enabled</>
          ) : (
            <><ShieldAlert className="mr-1 h-4 w-4" /> DPDP Not Enabled</>
          )}
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="encryption" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="encryption"><Key className="mr-1 h-4 w-4" /> Encryption</TabsTrigger>
            <TabsTrigger value="settings"><FileText className="mr-1 h-4 w-4" /> Settings</TabsTrigger>
            <TabsTrigger value="consents" onClick={fetchConsents}><Users className="mr-1 h-4 w-4" /> Consents</TabsTrigger>
            <TabsTrigger value="requests" onClick={fetchDataRequests}><Clock className="mr-1 h-4 w-4" /> Data Requests</TabsTrigger>
            <TabsTrigger value="breaches" onClick={fetchBreaches}><Bell className="mr-1 h-4 w-4" /> Breaches</TabsTrigger>
            <TabsTrigger value="audit" onClick={fetchAuditLog}><ScrollText className="mr-1 h-4 w-4" /> PII Audit</TabsTrigger>
          </TabsList>

          {/* ── ENCRYPTION TAB ── */}
          <TabsContent value="encryption" className="space-y-6">
            {/* Key Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" /> Encryption Key
                </CardTitle>
                <CardDescription>
                  Your organization's AES-256 encryption key protects all PII (names, emails, custom fields) at rest.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {status?.key_active ? (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Lock className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="font-semibold text-green-700">Encryption Key Active</p>
                          <p className="text-sm text-muted-foreground">
                            Key hint: <code className="rounded bg-muted px-1.5 py-0.5">****{status.key_hint}</code>
                            {" "}&middot;{" "}
                            Set on {new Date(status.key_created_at!).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => setShowSetKey(true)}>
                          <RefreshCw className="mr-1 h-4 w-4" /> Rotate Key
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Unlock className="h-8 w-8 text-amber-600" />
                        <div>
                          <p className="font-semibold text-amber-700">No Encryption Key Set</p>
                          <p className="text-sm text-muted-foreground">
                            Set an encryption key to enable PII encryption for all contacts.
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <Button onClick={() => setShowSetKey(true)}>
                          <Key className="mr-1 h-4 w-4" /> Set Encryption Key
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    icon={<Lock className="h-5 w-5 text-green-600" />}
                    label="Encrypted Contacts"
                    value={status?.encrypted_contacts ?? 0}
                    subtitle={`${encryptionPct}% of total`}
                  />
                  <StatCard
                    icon={<Unlock className="h-5 w-5 text-amber-600" />}
                    label="Unencrypted"
                    value={unencryptedCount}
                    subtitle={unencryptedCount > 0 ? "Action needed" : "All clear"}
                  />
                  <StatCard
                    icon={<Users className="h-5 w-5 text-blue-600" />}
                    label="Active Consents"
                    value={status?.active_consents ?? 0}
                  />
                  <StatCard
                    icon={<Eye className="h-5 w-5 text-purple-600" />}
                    label="PII Access Events"
                    value={status?.pii_access_count ?? 0}
                  />
                </div>

                {/* Encrypt existing CTA */}
                {isAdmin && status?.key_active && unencryptedCount > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <div>
                      <p className="font-medium text-blue-700">
                        {unencryptedCount} contact{unencryptedCount !== 1 ? "s" : ""} have unencrypted PII
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Encrypt existing contacts to ensure full compliance. Processes up to 500 per batch.
                      </p>
                    </div>
                    <Button onClick={handleEncryptExisting} disabled={encrypting} variant="outline">
                      {encrypting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Lock className="mr-1 h-4 w-4" />}
                      {encrypting ? "Encrypting..." : "Encrypt Now"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How it works */}
            <Card>
              <CardHeader>
                <CardTitle>How Encryption Works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Key className="h-5 w-5 text-primary" />
                    </div>
                    <h4 className="font-medium">1. Set Your Key</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your org-specific AES-256 key is encrypted with a master passphrase and stored securely.
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Lock className="h-5 w-5 text-primary" />
                    </div>
                    <h4 className="font-medium">2. Auto-Encrypt</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      When DPDP is enabled, all new & updated contacts have name, email, and custom fields encrypted automatically.
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Eye className="h-5 w-5 text-primary" />
                    </div>
                    <h4 className="font-medium">3. Audited Access</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Every PII decryption is logged with user ID, purpose, and timestamp for full audit trail.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── SETTINGS TAB ── */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Data Protection Officer</CardTitle>
                <CardDescription>
                  DPDP Act Section 8(7) requires appointment of a DPO. Configure contact details below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> DPO Email</Label>
                    <Input
                      type="email"
                      placeholder="dpo@yourcompany.com"
                      value={dpoEmail}
                      onChange={(e) => setDpoEmail(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> DPO Phone</Label>
                    <Input
                      type="tel"
                      placeholder="+91 XXXXX XXXXX"
                      value={dpoPhone}
                      onChange={(e) => setDpoPhone(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Privacy Policy URL</Label>
                    <Input
                      type="url"
                      placeholder="https://yourcompany.com/privacy"
                      value={privacyUrl}
                      onChange={(e) => setPrivacyUrl(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Data Retention (days)</Label>
                    <Input
                      type="number"
                      min={30}
                      max={3650}
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Number(e.target.value))}
                      disabled={!isAdmin}
                    />
                    <p className="text-xs text-muted-foreground">
                      Default: 730 days (2 years). DPDP requires data erasure after purpose is served.
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveSettings} disabled={savingSettings}>
                      {savingSettings ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      Save Settings
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CONSENTS TAB ── */}
          <TabsContent value="consents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Consent Records</CardTitle>
                <CardDescription>
                  Track explicit consent from data principals (DPDP Act Section 6).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingConsents ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : consents.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">No consent records yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4">Identifier</th>
                          <th className="pb-2 pr-4">Purpose</th>
                          <th className="pb-2 pr-4">Version</th>
                          <th className="pb-2 pr-4">Consented At</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consents.map((c) => (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-mono text-xs">{c.user_identifier}</td>
                            <td className="py-2 pr-4">{c.purpose}</td>
                            <td className="py-2 pr-4">{c.consent_version}</td>
                            <td className="py-2 pr-4">{new Date(c.consented_at).toLocaleString()}</td>
                            <td className="py-2">
                              {c.withdrawn_at ? (
                                <Badge variant="destructive">Withdrawn</Badge>
                              ) : (
                                <Badge variant="default">Active</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DATA REQUESTS TAB ── */}
          <TabsContent value="requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Data Subject Requests</CardTitle>
                <CardDescription>
                  Manage access, erasure, correction, and nomination requests (90-day SLA per DPDP Act Section 11-13).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRequests ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : dataRequests.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">No data requests yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4">Type</th>
                          <th className="pb-2 pr-4">Status</th>
                          <th className="pb-2 pr-4">Due Date</th>
                          <th className="pb-2 pr-4">Created</th>
                          <th className="pb-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataRequests.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <Badge variant="outline" className="capitalize">{r.request_type}</Badge>
                            </td>
                            <td className="py-2 pr-4">
                              <Badge variant={
                                r.status === "completed" ? "default" :
                                r.status === "pending" ? "secondary" :
                                r.status === "rejected" ? "destructive" : "outline"
                              } className="capitalize">
                                {r.status}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4">
                              <span className={new Date(r.due_date) < new Date() && r.status === "pending" ? "text-destructive font-medium" : ""}>
                                {new Date(r.due_date).toLocaleDateString()}
                              </span>
                            </td>
                            <td className="py-2 pr-4">{new Date(r.created_at).toLocaleString()}</td>
                            <td className="py-2">
                              {isAdmin && r.status === "pending" && r.request_type === "erasure" && (
                                <Button size="sm" variant="destructive" onClick={() => handleProcessErasure(r.id)}>
                                  <Trash2 className="mr-1 h-3 w-3" /> Process
                                </Button>
                              )}
                              {isAdmin && r.status === "pending" && r.request_type === "access" && (
                                <Button size="sm" variant="outline" onClick={async () => {
                                  if (!r.contact_id) return;
                                  try {
                                    const data = await callDpdpManage("export_contact_data", orgId, { contact_id: r.contact_id });
                                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `contact-data-${r.contact_id}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                    toast({ title: "Exported", description: "Contact data downloaded" });
                                    fetchDataRequests();
                                  } catch {
                                    toast({ title: "Error", description: "Export failed", variant: "destructive" });
                                  }
                                }}>
                                  <Download className="mr-1 h-3 w-3" /> Export
                                </Button>
                              )}
                              {r.status === "completed" && (
                                <span className="flex items-center gap-1 text-xs text-green-600">
                                  <CheckCircle2 className="h-3 w-3" /> Done
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── BREACHES TAB ── */}
          <TabsContent value="breaches" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Breach Notifications</CardTitle>
                  <CardDescription>
                    Report data breaches per DPDP Act Section 8(6). Notify the Board within 72 hours.
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Button variant="destructive" size="sm" onClick={() => setShowBreachForm(true)}>
                    <AlertTriangle className="mr-1 h-4 w-4" /> Report Breach
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {loadingBreaches ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : breaches.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
                    <p className="text-muted-foreground">No breach notifications recorded.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {breaches.map((b) => (
                      <div key={b.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold">{b.title}</h4>
                            <p className="mt-1 text-sm text-muted-foreground">{b.description}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{new Date(b.triggered_at).toLocaleString()}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline">Affected: {b.affected_count}</Badge>
                          <Badge variant={b.notified_board ? "default" : "destructive"}>
                            Board: {b.notified_board ? "Notified" : "Pending"}
                          </Badge>
                          <Badge variant={b.notified_principals ? "default" : "destructive"}>
                            Principals: {b.notified_principals ? "Notified" : "Pending"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PII AUDIT TAB ── */}
          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> PII Access Audit Log</CardTitle>
                <CardDescription>
                  Immutable record of every PII decryption event for compliance auditing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAudit ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : auditLog.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">No PII access events recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4">Timestamp</th>
                          <th className="pb-2 pr-4">Table</th>
                          <th className="pb-2 pr-4">Column</th>
                          <th className="pb-2 pr-4">Purpose</th>
                          <th className="pb-2">Contact ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLog.map((a) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 text-xs">{new Date(a.accessed_at).toLocaleString()}</td>
                            <td className="py-2 pr-4 font-mono text-xs">{a.table_name}</td>
                            <td className="py-2 pr-4 font-mono text-xs">{a.column_name}</td>
                            <td className="py-2 pr-4">{a.purpose}</td>
                            <td className="py-2 font-mono text-xs">{a.contact_id?.slice(0, 8)}...</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ── SET/ROTATE KEY DIALOG ── */}
      <Dialog open={showSetKey} onOpenChange={setShowSetKey}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {status?.key_active ? "Rotate Encryption Key" : "Set Encryption Key"}
            </DialogTitle>
            <DialogDescription>
              {status?.key_active
                ? "This will deactivate the current key and set a new one. Existing encrypted data will need to be re-encrypted."
                : "Set an AES-256 encryption key to enable PII encryption for all contacts. This key will be encrypted and stored securely."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="enc-key">Encryption Key</Label>
              <Input
                id="enc-key"
                type="password"
                placeholder="Minimum 16 characters"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Use a strong passphrase. This key encrypts all PII data using AES-256 via pgcrypto.
              </p>
            </div>
            {newKey.length > 0 && newKey.length < 16 && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Key must be at least 16 characters ({16 - newKey.length} more needed)
              </div>
            )}
            {newKey.length >= 16 && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Key length OK ({newKey.length} characters)
              </div>
            )}
            {status?.key_active && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="flex items-center gap-1 text-sm font-medium text-amber-700">
                  <AlertTriangle className="h-4 w-4" /> Warning
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rotating the key will mark the current key as "rotated". You must re-encrypt existing contacts after rotation.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSetKey(false); setNewKey(""); }}>Cancel</Button>
            <Button onClick={handleSetKey} disabled={settingKey || newKey.length < 16}>
              {settingKey ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Key className="mr-1 h-4 w-4" />}
              {settingKey ? "Setting Key..." : status?.key_active ? "Rotate Key" : "Set Key & Enable DPDP"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── BREACH FORM DIALOG ── */}
      <Dialog open={showBreachForm} onOpenChange={setShowBreachForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Report Data Breach
            </DialogTitle>
            <DialogDescription>
              Log a breach notification per DPDP Act Section 8(6). Data Protection Board must be notified within 72 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input placeholder="Brief description of the breach" value={breachForm.title} onChange={(e) => setBreachForm({ ...breachForm, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea placeholder="What happened, when, and how it was discovered" value={breachForm.description} onChange={(e) => setBreachForm({ ...breachForm, description: e.target.value })} rows={3} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Impact</Label>
                <Textarea placeholder="Nature and extent of affected data" value={breachForm.impact} onChange={(e) => setBreachForm({ ...breachForm, impact: e.target.value })} rows={2} />
              </div>
              <div className="space-y-1">
                <Label>Remedial Steps</Label>
                <Textarea placeholder="Actions taken to mitigate" value={breachForm.remedial_steps} onChange={(e) => setBreachForm({ ...breachForm, remedial_steps: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>DPO Contact</Label>
                <Input placeholder="Contact details for DPO" value={breachForm.dpo_contact} onChange={(e) => setBreachForm({ ...breachForm, dpo_contact: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Affected Count</Label>
                <Input type="number" min={0} value={breachForm.affected_count} onChange={(e) => setBreachForm({ ...breachForm, affected_count: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBreachForm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSubmitBreach} disabled={submittingBreach || !breachForm.title || !breachForm.description}>
              {submittingBreach ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-1 h-4 w-4" />}
              {submittingBreach ? "Submitting..." : "Report Breach"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function StatCard({ icon, label, value, subtitle }: { icon: React.ReactNode; label: string; value: number; subtitle?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
