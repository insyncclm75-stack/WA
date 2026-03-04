import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, MessageCircle, CreditCard, Loader2 } from "lucide-react";

export default function OrgSettings() {
  const { currentOrg, refreshOrgs } = useOrg();
  const { toast } = useToast();

  // Profile
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Credentials
  const [creds, setCreds] = useState({
    exotel_api_key: "",
    exotel_api_token: "",
    exotel_subdomain: "",
    exotel_waba_id: "",
    exotel_account_sid: "",
    exotel_sender_number: "",
  });
  const [credsLoading, setCredsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

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
          setCreds({
            exotel_api_key: c.exotel_api_key ?? "",
            exotel_api_token: c.exotel_api_token ?? "",
            exotel_subdomain: c.exotel_subdomain ?? "",
            exotel_waba_id: c.exotel_waba_id ?? "",
            exotel_account_sid: c.exotel_account_sid ?? "",
            exotel_sender_number: c.exotel_sender_number ?? "",
          });
          setIsConfigured(c.is_configured);
        }
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

  const saveCreds = async () => {
    if (!currentOrg) return;
    setCredsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-org", {
        body: { action: "update_credentials", org_id: currentOrg.id, ...creds },
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
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp Integration (Exotel)</CardTitle>
              <CardDescription>
                {isConfigured
                  ? "Your organization is using custom Exotel credentials."
                  : "Using platform default credentials. Configure your own below."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input value={creds.exotel_api_key} onChange={(e) => setCreds({ ...creds, exotel_api_key: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>API Token</Label>
                  <Input type="password" value={creds.exotel_api_token} onChange={(e) => setCreds({ ...creds, exotel_api_token: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Subdomain</Label>
                  <Input value={creds.exotel_subdomain} onChange={(e) => setCreds({ ...creds, exotel_subdomain: e.target.value })} placeholder="api.exotel.com" />
                </div>
                <div className="space-y-2">
                  <Label>WABA ID</Label>
                  <Input value={creds.exotel_waba_id} onChange={(e) => setCreds({ ...creds, exotel_waba_id: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Account SID</Label>
                  <Input value={creds.exotel_account_sid} onChange={(e) => setCreds({ ...creds, exotel_account_sid: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Sender Number</Label>
                  <Input value={creds.exotel_sender_number} onChange={(e) => setCreds({ ...creds, exotel_sender_number: e.target.value })} placeholder="+91..." />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={saveCreds} disabled={credsLoading}>
                  {credsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Credentials
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
