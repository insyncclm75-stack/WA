import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Key,
  Webhook,
  Copy,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Clock,
  Code,
  ExternalLink,
} from "lucide-react";

interface OutboundWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  created_at: string;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface WebhookDelivery {
  id: string;
  event: string;
  response_status: number | null;
  success: boolean;
  delivered_at: string;
}

const ALL_EVENTS = [
  "message.inbound",
  "message.outbound",
  "message.status",
  "contact.created",
  "conversation.created",
];

export default function Developers() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  // Webhooks state
  const [webhooks, setWebhooks] = useState<OutboundWebhook[]>([]);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["message.inbound"]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["read", "write"]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("outbound_webhooks")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    setWebhooks((data as any) ?? []);
  }, [currentOrg]);

  const fetchApiKeys = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("api_keys")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });
    setApiKeys((data as any) ?? []);
  }, [currentOrg]);

  useEffect(() => {
    fetchWebhooks();
    fetchApiKeys();
  }, [fetchWebhooks, fetchApiKeys]);

  const fetchDeliveries = async (webhookId: string) => {
    setSelectedWebhookId(webhookId);
    const { data } = await supabase
      .from("webhook_deliveries")
      .select("id, event, response_status, success, delivered_at")
      .eq("webhook_id", webhookId)
      .order("delivered_at", { ascending: false })
      .limit(20);
    setDeliveries((data as any) ?? []);
  };

  const createWebhook = async () => {
    if (!currentOrg || !webhookName || !webhookUrl) return;
    const { error } = await supabase.from("outbound_webhooks").insert({
      org_id: currentOrg.id,
      name: webhookName,
      url: webhookUrl,
      secret: webhookSecret || null,
      events: webhookEvents,
    });
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      return;
    }
    toast({ title: "Webhook created" });
    setShowWebhookForm(false);
    setWebhookName("");
    setWebhookUrl("");
    setWebhookSecret("");
    setWebhookEvents(["message.inbound"]);
    fetchWebhooks();
  };

  const deleteWebhook = async (id: string) => {
    await supabase.from("outbound_webhooks").delete().eq("id", id);
    fetchWebhooks();
    toast({ title: "Webhook deleted" });
  };

  const toggleWebhookEvent = (event: string) => {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const createApiKey = async () => {
    if (!currentOrg || !user || !keyName) return;

    // Generate a random API key
    const rawKey = `insync_${crypto.randomUUID().replace(/-/g, "")}`;
    const keyPrefix = rawKey.substring(0, 14);

    // Hash it
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
    const keyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error } = await supabase.from("api_keys").insert({
      org_id: currentOrg.id,
      name: keyName,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: keyScopes,
      created_by: user.id,
    });

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      return;
    }

    setGeneratedKey(rawKey);
    setShowKeyForm(false);
    setKeyName("");
    fetchApiKeys();
    toast({ title: "API key created" });
  };

  const deleteApiKey = async (id: string) => {
    await supabase.from("api_keys").delete().eq("id", id);
    fetchApiKeys();
    toast({ title: "API key deleted" });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiBaseUrl = `${supabaseUrl}/functions/v1/api-gateway`;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Developers</h1>
        <p className="text-muted-foreground">Webhooks, API keys, and integration settings</p>
      </div>

      <Tabs defaultValue="webhooks">
        <TabsList>
          <TabsTrigger value="webhooks">
            <Webhook className="mr-1.5 h-4 w-4" /> Webhooks
          </TabsTrigger>
          <TabsTrigger value="api">
            <Key className="mr-1.5 h-4 w-4" /> API Keys
          </TabsTrigger>
          <TabsTrigger value="docs">
            <Code className="mr-1.5 h-4 w-4" /> API Docs
          </TabsTrigger>
        </TabsList>

        {/* ── Webhooks Tab ── */}
        <TabsContent value="webhooks" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Get notified via HTTP when events occur in your account.
            </p>
            <Dialog open={showWebhookForm} onOpenChange={setShowWebhookForm}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-3 w-3" /> Add Webhook
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Webhook</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} placeholder="e.g., CRM Sync" className="mt-1" />
                  </div>
                  <div>
                    <Label>URL</Label>
                    <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-app.com/webhook" className="mt-1" />
                  </div>
                  <div>
                    <Label>Signing Secret (optional)</Label>
                    <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="hmac-secret" className="mt-1" />
                    <p className="mt-1 text-[11px] text-muted-foreground">If set, payloads will be signed with HMAC-SHA256</p>
                  </div>
                  <div>
                    <Label>Events</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ALL_EVENTS.map((evt) => (
                        <button
                          key={evt}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            webhookEvents.includes(evt)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary"
                          )}
                          onClick={() => toggleWebhookEvent(evt)}
                        >
                          {evt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button className="w-full" onClick={createWebhook} disabled={!webhookName || !webhookUrl}>
                    Create Webhook
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {webhooks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No webhooks configured yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <Card key={wh.id}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <Webhook className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{wh.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {wh.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{wh.url}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {wh.events.map((e) => (
                          <Badge key={e} variant="outline" className="text-[10px]">
                            {e}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => fetchDeliveries(wh.id)}>
                      <Clock className="mr-1 h-3 w-3" /> Logs
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteWebhook(wh.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Delivery Logs */}
          {selectedWebhookId && deliveries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent Deliveries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {deliveries.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 rounded border border-border p-2 text-xs">
                      {d.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">{d.event}</span>
                      <Badge variant={d.success ? "secondary" : "destructive"} className="text-[10px]">
                        {d.response_status || "Error"}
                      </Badge>
                      <span className="flex-1" />
                      <span className="text-muted-foreground">
                        {new Date(d.delivered_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── API Keys Tab ── */}
        <TabsContent value="api" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Create API keys to access the REST API from external systems.
            </p>
            <Dialog open={showKeyForm} onOpenChange={setShowKeyForm}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-3 w-3" /> Create API Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New API Key</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="e.g., Shopify Integration" className="mt-1" />
                  </div>
                  <div>
                    <Label>Scopes</Label>
                    <div className="mt-2 flex gap-3">
                      {["read", "write"].map((scope) => (
                        <button
                          key={scope}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            keyScopes.includes(scope)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary"
                          )}
                          onClick={() =>
                            setKeyScopes((prev) =>
                              prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
                            )
                          }
                        >
                          {scope}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button className="w-full" onClick={createApiKey} disabled={!keyName}>
                    Generate Key
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Show newly generated key */}
          {generatedKey && (
            <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
              <CardContent className="py-4">
                <p className="mb-2 text-sm font-semibold text-green-700 dark:text-green-400">
                  API Key Generated — copy it now, it won't be shown again!
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-background p-2 text-xs">
                    {showKey ? generatedKey : "•".repeat(40)}
                  </code>
                  <Button size="icon" variant="ghost" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => copyToClipboard(generatedKey)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {apiKeys.length === 0 && !generatedKey ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No API keys created yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <Card key={key.id}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <Key className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{key.name}</span>
                        <code className="text-xs text-muted-foreground">{key.key_prefix}...</code>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Scopes: {key.scopes.join(", ")}</span>
                        {key.last_used_at && (
                          <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => deleteApiKey(key.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── API Docs Tab ── */}
        <TabsContent value="docs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Code className="h-5 w-5" /> REST API Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm text-muted-foreground">
                  Base URL: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{apiBaseUrl}</code>
                  <Button size="icon" variant="ghost" className="ml-1 h-5 w-5" onClick={() => copyToClipboard(apiBaseUrl)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Include your API key in the <code className="rounded bg-muted px-1.5 py-0.5 text-xs">x-api-key</code> header.
                </p>
              </div>

              {[
                {
                  method: "GET",
                  path: "/contacts",
                  desc: "List contacts (paginated with ?limit=&offset=)",
                },
                {
                  method: "POST",
                  path: "/contacts",
                  desc: "Create or update a contact (upsert by phone_number)",
                  body: '{"phone_number": "919876543210", "name": "John", "tags": ["vip"]}',
                },
                {
                  method: "GET",
                  path: "/conversations",
                  desc: "List conversations (?status=open)",
                },
                {
                  method: "GET",
                  path: "/messages",
                  desc: "List messages (?contact_id=...&conversation_id=...)",
                },
                {
                  method: "POST",
                  path: "/messages/send",
                  desc: "Send a message in a conversation",
                  body: '{"conversation_id": "...", "content": "Hello!"}',
                },
                {
                  method: "GET",
                  path: "/templates",
                  desc: "List all templates",
                },
              ].map((endpoint) => (
                <div key={endpoint.path + endpoint.method} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={endpoint.method === "GET" ? "secondary" : "default"}
                      className="text-[10px]"
                    >
                      {endpoint.method}
                    </Badge>
                    <code className="text-sm font-medium">{endpoint.path}</code>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{endpoint.desc}</p>
                  {endpoint.body && (
                    <pre className="mt-2 rounded bg-muted p-2 text-[11px]">{endpoint.body}</pre>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
