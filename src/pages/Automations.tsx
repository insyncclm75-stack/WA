import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Upload,
  GitBranch,
  Clock,
  Send,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Users,
  CheckCircle,
  XCircle,
  Loader2,
  Zap,
} from "lucide-react";

interface Template {
  id: string;
  name: string;
  content: string;
  category: string;
  status: string;
}

interface AutomationStep {
  id?: string;
  step_order: number;
  step_type: "send_template" | "wait" | "condition";
  template_id?: string;
  template_name?: string;
  wait_hours?: number;
  rules?: { status: string; goto_step: number }[];
}

interface Automation {
  id: string;
  org_id: string;
  name: string;
  daily_limit: number;
  status: string;
  total_contacts: number;
  processed_contacts: number;
  created_at: string;
}

export default function Automations() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreator, setShowCreator] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<AutomationStep[]>([]);
  const [expandedStats, setExpandedStats] = useState<Record<string, number>>({});

  // Creator state
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState("10");
  const [steps, setSteps] = useState<AutomationStep[]>([
    { step_order: 1, step_type: "send_template" },
  ]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvContacts, setCsvContacts] = useState<{ phone_number: string; name?: string }[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchAutomations = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("automations")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    setAutomations((data as any) ?? []);
    setLoading(false);
  }, [currentOrg]);

  const fetchTemplates = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("templates")
      .select("*")
      .eq("status", "approved")
      .order("name");
    setTemplates((data as any) ?? []);
  }, [currentOrg]);

  useEffect(() => {
    fetchAutomations();
    fetchTemplates();
  }, [fetchAutomations, fetchTemplates]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    // Fetch steps and stats
    const [{ data: stepsData }, { data: statsData }] = await Promise.all([
      supabase
        .from("automation_steps")
        .select("*")
        .eq("automation_id", id)
        .order("step_order"),
      supabase
        .from("automation_contacts")
        .select("status")
        .eq("automation_id", id),
    ]);
    setExpandedSteps((stepsData as any) ?? []);
    const counts: Record<string, number> = {};
    (statsData ?? []).forEach((c: any) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    setExpandedStats(counts);
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        toast({ variant: "destructive", title: "Invalid CSV", description: "Need header + at least 1 row" });
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const phoneIdx = headers.findIndex((h) =>
        ["phone", "phone_number", "mobile", "number", "whatsapp"].includes(h)
      );
      const nameIdx = headers.findIndex((h) => ["name", "contact_name", "customer"].includes(h));

      if (phoneIdx === -1) {
        toast({ variant: "destructive", title: "No phone column", description: "CSV must have a phone/phone_number/mobile column" });
        return;
      }

      const contacts: { phone_number: string; name?: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        const phone = cols[phoneIdx]?.replace(/[^0-9+]/g, "");
        if (phone && phone.length >= 10) {
          contacts.push({
            phone_number: phone,
            ...(nameIdx >= 0 ? { name: cols[nameIdx] } : {}),
          });
        }
      }
      setCsvContacts(contacts);
      toast({ title: `${contacts.length} contacts parsed` });
    };
    reader.readAsText(file);
  };

  const addStep = (type: AutomationStep["step_type"]) => {
    setSteps((prev) => [
      ...prev,
      {
        step_order: prev.length + 1,
        step_type: type,
        ...(type === "wait" ? { wait_hours: 24 } : {}),
        ...(type === "condition"
          ? {
              rules: [
                { status: "read", goto_step: prev.length + 2 },
                { status: "no_response", goto_step: 0 },
              ],
            }
          : {}),
      },
    ]);
  };

  const updateStep = (index: number, updates: Partial<AutomationStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  const removeStep = (index: number) => {
    setSteps((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
  };

  const updateRule = (
    stepIndex: number,
    ruleIndex: number,
    updates: Partial<{ status: string; goto_step: number }>
  ) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const newRules = [...(s.rules || [])];
        newRules[ruleIndex] = { ...newRules[ruleIndex], ...updates };
        return { ...s, rules: newRules };
      })
    );
  };

  const addRule = (stepIndex: number) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        return {
          ...s,
          rules: [...(s.rules || []), { status: "delivered", goto_step: 0 }],
        };
      })
    );
  };

  const removeRule = (stepIndex: number, ruleIndex: number) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        return { ...s, rules: (s.rules || []).filter((_, ri) => ri !== ruleIndex) };
      })
    );
  };

  const createAutomation = async () => {
    if (!currentOrg || !user || !name.trim() || csvContacts.length === 0) {
      toast({ variant: "destructive", title: "Missing info", description: "Name, contacts, and at least one step are required" });
      return;
    }

    // Validate steps
    for (const step of steps) {
      if (step.step_type === "send_template" && !step.template_id) {
        toast({ variant: "destructive", title: "Incomplete step", description: `Step ${step.step_order}: select a template` });
        return;
      }
    }

    setCreating(true);
    try {
      // 1. Create automation
      const { data: automation, error: autoErr } = await supabase
        .from("automations")
        .insert({
          org_id: currentOrg.id,
          name: name.trim(),
          daily_limit: parseInt(dailyLimit) || 10,
          total_contacts: csvContacts.length,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (autoErr) throw autoErr;

      // 2. Insert steps
      const stepsToInsert = steps.map((s) => ({
        automation_id: automation.id,
        step_order: s.step_order,
        step_type: s.step_type,
        template_id: s.template_id || null,
        template_name: s.template_name || null,
        wait_hours: s.wait_hours || null,
        rules: s.rules || null,
      }));

      const { error: stepsErr } = await supabase
        .from("automation_steps")
        .insert(stepsToInsert);

      if (stepsErr) throw stepsErr;

      // 3. Upsert contacts and create automation_contacts
      for (const c of csvContacts) {
        // Upsert contact
        const { data: contact } = await supabase
          .from("contacts")
          .upsert(
            {
              phone_number: c.phone_number,
              name: c.name || null,
              org_id: currentOrg.id,
              source: "automation_csv",
            },
            { onConflict: "phone_number,org_id" }
          )
          .select("id")
          .single();

        if (contact) {
          await supabase.from("automation_contacts").insert({
            automation_id: automation.id,
            contact_id: contact.id,
          });
        }
      }

      toast({ title: "Automation created", description: `${csvContacts.length} contacts added` });
      setShowCreator(false);
      resetCreator();
      fetchAutomations();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setCreating(false);
    }
  };

  const resetCreator = () => {
    setName("");
    setDailyLimit("10");
    setSteps([{ step_order: 1, step_type: "send_template" }]);
    setCsvFile(null);
    setCsvContacts([]);
  };

  const toggleStatus = async (automation: Automation) => {
    const newStatus = automation.status === "active" ? "paused" : "active";
    await supabase
      .from("automations")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", automation.id);
    fetchAutomations();
    toast({ title: `Automation ${newStatus}` });
  };

  const deleteAutomation = async (id: string) => {
    await supabase.from("automations").delete().eq("id", id);
    setExpandedId(null);
    fetchAutomations();
    toast({ title: "Automation deleted" });
  };

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };

  const stepIcon = (type: string) => {
    if (type === "send_template") return <Send className="h-4 w-4" />;
    if (type === "wait") return <Clock className="h-4 w-4" />;
    return <GitBranch className="h-4 w-4" />;
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Automations</h1>
          <p className="text-muted-foreground">Drip campaigns with daily limits and response-based branching</p>
        </div>
        <Dialog open={showCreator} onOpenChange={(v) => { setShowCreator(v); if (!v) resetCreator(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Automation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Automation</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-2">
              {/* Name & Daily Limit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Automation Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Welcome Drip"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Daily Send Limit</Label>
                  <Input
                    type="number"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    min={1}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* CSV Upload */}
              <div>
                <Label>Upload Contact List (CSV)</Label>
                <div className="mt-1 flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-2 text-sm hover:bg-accent">
                    <Upload className="h-4 w-4" />
                    {csvFile ? csvFile.name : "Choose CSV"}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setCsvFile(f);
                          parseCSV(f);
                        }
                      }}
                    />
                  </label>
                  {csvContacts.length > 0 && (
                    <Badge variant="secondary">
                      <Users className="mr-1 h-3 w-3" />
                      {csvContacts.length} contacts
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  CSV needs a phone/phone_number/mobile column. Optional: name column.
                </p>
              </div>

              {/* Steps Builder */}
              <div>
                <Label>Automation Steps</Label>
                <div className="mt-2 space-y-3">
                  {steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {step.step_order}
                        </span>
                        {stepIcon(step.step_type)}
                        <span className="text-sm font-medium capitalize">
                          {step.step_type.replace("_", " ")}
                        </span>
                        <div className="flex-1" />
                        {steps.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeStep(idx)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>

                      {step.step_type === "send_template" && (
                        <div className="mt-2">
                          <Select
                            value={step.template_id || ""}
                            onValueChange={(v) => {
                              const t = templates.find((t) => t.id === v);
                              updateStep(idx, {
                                template_id: v,
                                template_name: t?.name,
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select template" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {step.step_type === "wait" && (
                        <div className="mt-2 flex items-center gap-2">
                          <Label className="text-xs">Wait</Label>
                          <Input
                            type="number"
                            value={step.wait_hours ?? 24}
                            onChange={(e) =>
                              updateStep(idx, {
                                wait_hours: parseInt(e.target.value) || 1,
                              })
                            }
                            className="h-8 w-20 text-sm"
                            min={1}
                          />
                          <span className="text-xs text-muted-foreground">hours</span>
                        </div>
                      )}

                      {step.step_type === "condition" && (
                        <div className="mt-2 space-y-2">
                          {(step.rules || []).map((rule, ri) => (
                            <div key={ri} className="flex items-center gap-2 text-sm">
                              <span className="text-xs text-muted-foreground">If</span>
                              <Select
                                value={rule.status}
                                onValueChange={(v) =>
                                  updateRule(idx, ri, { status: v })
                                }
                              >
                                <SelectTrigger className="h-7 w-32 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="read">Read</SelectItem>
                                  <SelectItem value="delivered">Delivered</SelectItem>
                                  <SelectItem value="replied">Replied</SelectItem>
                                  <SelectItem value="failed">Failed</SelectItem>
                                  <SelectItem value="no_response">No Response</SelectItem>
                                </SelectContent>
                              </Select>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">go to step</span>
                              <Input
                                type="number"
                                value={rule.goto_step}
                                onChange={(e) =>
                                  updateRule(idx, ri, {
                                    goto_step: parseInt(e.target.value) || 0,
                                  })
                                }
                                className="h-7 w-16 text-xs"
                                min={0}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => removeRule(idx, ri)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => addRule(idx)}
                          >
                            <Plus className="mr-1 h-3 w-3" /> Add Rule
                          </Button>
                          <p className="text-[11px] text-muted-foreground">
                            Step 0 = stop automation for this contact
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Step Buttons */}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addStep("send_template")}
                  >
                    <Send className="mr-1 h-3 w-3" /> Send Template
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addStep("wait")}
                  >
                    <Clock className="mr-1 h-3 w-3" /> Wait
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addStep("condition")}
                  >
                    <GitBranch className="mr-1 h-3 w-3" /> Condition
                  </Button>
                </div>
              </div>

              {/* Create Button */}
              <Button
                className="w-full"
                onClick={createAutomation}
                disabled={creating || !name.trim() || csvContacts.length === 0}
              >
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Create Automation ({csvContacts.length} contacts)
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Automations List */}
      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : automations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Zap className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">No automations yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <div
                className="flex cursor-pointer items-center gap-4 px-5 py-4"
                onClick={() => toggleExpand(a.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{a.name}</h3>
                    <Badge className={cn("text-xs", statusColor[a.status])}>
                      {a.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.processed_contacts}/{a.total_contacts} contacts processed
                    {" "}&middot;{" "}
                    {a.daily_limit}/day limit
                    {" "}&middot;{" "}
                    Created {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {(a.status === "draft" || a.status === "paused") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStatus(a);
                      }}
                    >
                      <Play className="mr-1 h-3 w-3" /> Start
                    </Button>
                  )}
                  {a.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStatus(a);
                      }}
                    >
                      <Pause className="mr-1 h-3 w-3" /> Pause
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAutomation(a.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  {expandedId === a.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === a.id && (
                <div className="border-t border-border bg-muted/20 px-5 py-4">
                  {/* Contact Status Breakdown */}
                  <div className="mb-4 grid grid-cols-5 gap-3">
                    {[
                      { label: "Pending", key: "pending", icon: Clock, color: "text-muted-foreground" },
                      { label: "In Progress", key: "in_progress", icon: Loader2, color: "text-blue-500" },
                      { label: "Waiting", key: "waiting", icon: Clock, color: "text-yellow-500" },
                      { label: "Completed", key: "completed", icon: CheckCircle, color: "text-green-500" },
                      { label: "Failed", key: "failed", icon: XCircle, color: "text-destructive" },
                    ].map(({ label, key, icon: Icon, color }) => (
                      <div
                        key={key}
                        className="rounded-lg border border-border bg-background p-3 text-center"
                      >
                        <Icon className={cn("mx-auto h-4 w-4", color)} />
                        <p className="mt-1 text-lg font-bold">{expandedStats[key] || 0}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Steps Flow */}
                  <h4 className="mb-2 text-sm font-semibold">Steps</h4>
                  <div className="space-y-2">
                    {expandedSteps.map((step, idx) => (
                      <div key={step.id || idx} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {step.step_order}
                          </span>
                          {idx < expandedSteps.length - 1 && (
                            <div className="my-1 h-6 w-px bg-border" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                          {stepIcon(step.step_type)}
                          {step.step_type === "send_template" && (
                            <span>Send: <strong>{step.template_name || "Template"}</strong></span>
                          )}
                          {step.step_type === "wait" && (
                            <span>Wait <strong>{step.wait_hours}h</strong></span>
                          )}
                          {step.step_type === "condition" && (
                            <div>
                              <span className="font-medium">Branch:</span>
                              {((step.rules as any[]) || []).map((r, ri) => (
                                <span key={ri} className="ml-2 text-xs text-muted-foreground">
                                  {r.status} → step {r.goto_step || "stop"}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>
                        {a.total_contacts > 0
                          ? Math.round((a.processed_contacts / a.total_contacts) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${a.total_contacts > 0 ? (a.processed_contacts / a.total_contacts) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
