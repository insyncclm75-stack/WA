import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Building2, MessageCircle, CreditCard, Loader2, Bot, Facebook, Check, Phone } from "lucide-react";
import { motion } from "framer-motion";

export default function OrgSettings() {
  const { currentOrg, refreshOrgs } = useOrg();
  const { toast } = useToast();

  // Profile
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Credentials (only WABA ID and sender number are user-visible)
  const [wabaId, setWabaId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [credsLoading, setCredsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isvConnecting, setIsvConnecting] = useState(false);
  const [isvConnected, setIsvConnected] = useState(false);

  // AI Config
  const [aiConfig, setAiConfig] = useState({
    system_prompt: "You are a helpful customer support agent. Be concise and friendly.",
    knowledge_base: "",
    enabled: true,
  });
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    setName(currentOrg.name);
    setWebsite(currentOrg.website ?? "");
    setIndustry(currentOrg.industry ?? "");

    // Fetch credentials
    supabase.functions
      .invoke("manage-org", { body: { action: "get_credentials", org_id: currentOrg.id } })
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.credentials) {
          const c = data.credentials;
          setWabaId(c.exotel_waba_id ?? "");
          setSenderNumber(c.exotel_sender_number ?? "");
          setPhoneNumbers(c.phone_numbers ?? []);
          setIsConfigured(c.is_configured);
        }
      });

    // Fetch AI config
    supabase
      .from("ai_config")
      .select("system_prompt, knowledge_base, enabled")
      .eq("org_id", currentOrg.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setAiConfig({
          system_prompt: data.system_prompt ?? "",
          knowledge_base: data.knowledge_base ?? "",
          enabled: data.enabled ?? true,
        });
      });

    return () => { cancelled = true; };
  }, [currentOrg]);

  const saveProfile = async () => {
    if (!currentOrg) return;
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-org", {
        body: { action: "update", org_id: currentOrg.id, name, website, industry },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refreshOrgs();
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setProfileLoading(false);
  };

  const saveAiConfig = async () => {
    if (!currentOrg) return;
    setAiLoading(true);
    try {
      const { error } = await supabase
        .from("ai_config")
        .upsert({
          org_id: currentOrg.id,
          system_prompt: aiConfig.system_prompt,
          knowledge_base: aiConfig.knowledge_base,
          enabled: aiConfig.enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id" });
      if (error) throw error;
      toast({ title: "AI configuration saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setAiLoading(false);
  };

  const saveCreds = async () => {
    if (!currentOrg) return;
    setCredsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-org", {
        body: {
          action: "update_credentials",
          org_id: currentOrg.id,
          exotel_waba_id: wabaId,
          exotel_sender_number: senderNumber,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setIsConfigured(data.is_configured);
      toast({ title: "Credentials updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setCredsLoading(false);
  };

  const handleFacebookConnect = async () => {
    if (!currentOrg) return;
    setIsvConnecting(true);
    setIsvConnected(false);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-onboarding", {
        body: { action: "generate_link", org_id: currentOrg.id },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ variant: "destructive", title: "Error", description: data.error });
        setIsvConnecting(false);
        return;
      }

      const onboardingUrl =
        data?.data?.response?.whatsapp?.isv?.data?.onboarding_url ||
        data?.data?.onboarding_url ||
        data?.data?.url;

      if (onboardingUrl) {
        const popup = window.open(onboardingUrl, "whatsapp_onboarding", "width=800,height=700,scrollbars=yes");

        const pollTimer = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(pollTimer);
            await supabase.functions.invoke("whatsapp-onboarding", {
              body: { action: "save_facebook", org_id: currentOrg.id },
            });
            setIsvConnected(true);
            setIsvConnecting(false);
            toast({ title: "WhatsApp number added", description: "Your number(s) will be activated shortly." });

            // Re-fetch credentials
            const { data: refreshed } = await supabase.functions.invoke("manage-org", {
              body: { action: "get_credentials", org_id: currentOrg.id },
            });
            if (refreshed?.credentials) {
              setWabaId(refreshed.credentials.exotel_waba_id ?? "");
              setSenderNumber(refreshed.credentials.exotel_sender_number ?? "");
              setPhoneNumbers(refreshed.credentials.phone_numbers ?? []);
              setIsConfigured(refreshed.credentials.is_configured);
            }

            // Update profile pictures in background
            supabase.functions.invoke("whatsapp-onboarding", {
              body: { action: "update_profile_pictures", org_id: currentOrg.id },
            }).catch(() => {});
          }
        }, 1000);
      } else {
        toast({ variant: "destructive", title: "Error", description: "Could not generate onboarding link. Please try again." });
        setIsvConnecting(false);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
      setIsvConnecting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Organization Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your organization profile and integrations</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> WhatsApp Integration
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Bot className="h-4 w-4" /> AI Auto-Reply
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Organization Profile</CardTitle>
              <CardDescription>Update your organization's public information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={saveProfile} disabled={profileLoading}>
                  {profileLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp Integration</CardTitle>
                <CardDescription>
                  {isConfigured
                    ? "Your organization's WhatsApp Business is configured."
                    : "Using platform default configuration. Update WABA ID and sender number below."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>WABA ID</Label>
                    <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WhatsApp Business Account ID" />
                  </div>
                  <div className="space-y-2">
                    <Label>Display Number</Label>
                    <Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="+91..." />
                  </div>
                </div>

                {phoneNumbers.length > 0 && (
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Registered Numbers</p>
                    <div className="space-y-1.5">
                      {phoneNumbers.map((num, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Phone className="h-3.5 w-3.5 text-green-500" />
                          <span className="font-mono">{num}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button onClick={saveCreds} disabled={credsLoading}>
                    {credsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add WhatsApp Number</CardTitle>
                <CardDescription>
                  Connect your Meta Business account to add or manage WhatsApp numbers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!isvConnected ? (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-4">
                      <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400">How it works</h4>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <li>1. A new window will open for Meta Business signup</li>
                        <li>2. Log in with your Facebook account</li>
                        <li>3. Select or create a WhatsApp Business Account</li>
                        <li>4. Grant access to connect it with In-Sync</li>
                      </ul>
                    </div>

                    <Button
                      onClick={handleFacebookConnect}
                      disabled={isvConnecting}
                      className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      size="lg"
                    >
                      {isvConnecting ? (
                        <><Loader2 className="h-5 w-5 animate-spin" /> Opening registration...</>
                      ) : (
                        <><Facebook className="h-5 w-5" /> Connect with Facebook</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10"
                    >
                      <Check className="h-8 w-8 text-green-500" />
                    </motion.div>
                    <h4 className="font-semibold text-green-700 dark:text-green-400">Number Added Successfully</h4>
                    <p className="text-sm text-muted-foreground text-center">
                      Your WhatsApp number(s) will be activated shortly after verification.
                    </p>
                    <Button variant="outline" onClick={() => setIsvConnected(false)} className="mt-2 gap-2">
                      <Facebook className="h-4 w-4" /> Add Another Number
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>AI Auto-Reply</CardTitle>
              <CardDescription>
                Configure AI-powered automatic responses to incoming WhatsApp messages.
                Replies within the 24-hour window are free.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Enable AI Auto-Reply</p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, AI will automatically respond to incoming messages
                  </p>
                </div>
                <Switch
                  checked={aiConfig.enabled}
                  onCheckedChange={(v) => setAiConfig({ ...aiConfig, enabled: v })}
                />
              </div>

              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea
                  value={aiConfig.system_prompt}
                  onChange={(e) => setAiConfig({ ...aiConfig, system_prompt: e.target.value })}
                  placeholder="You are a helpful customer support agent for [Your Business]..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Tell the AI who it is, how to behave, and what tone to use
                </p>
              </div>

              <div className="space-y-2">
                <Label>Knowledge Base</Label>
                <Textarea
                  value={aiConfig.knowledge_base}
                  onChange={(e) => setAiConfig({ ...aiConfig, knowledge_base: e.target.value })}
                  placeholder="Paste your FAQs, product details, pricing, policies, business hours, etc..."
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  The AI will use this information to answer customer questions accurately
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveAiConfig} disabled={aiLoading}>
                  {aiLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save AI Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
              <CardDescription>Manage your subscription and payment methods</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="py-8 text-center text-muted-foreground">
                Billing features coming soon.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
