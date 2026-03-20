import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Facebook, ExternalLink, Loader2, Check, Phone } from "lucide-react";
import { motion } from "framer-motion";

export default function Settings() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();

  const [wabaId, setWabaId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [isvConnecting, setIsvConnecting] = useState(false);
  const [isvConnected, setIsvConnected] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;

    supabase.functions
      .invoke("manage-org", { body: { action: "get_credentials", org_id: currentOrg.id } })
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.credentials) {
          const c = data.credentials;
          setWabaId(c.exotel_waba_id ?? "");
          setSenderNumber(c.exotel_sender_number ?? "");
          setPhoneNumbers(c.phone_numbers ?? []);
        }
      });

    return () => { cancelled = true; };
  }, [currentOrg]);

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

            // Re-fetch credentials to update displayed info
            const { data: refreshed } = await supabase.functions.invoke("manage-org", {
              body: { action: "get_credentials", org_id: currentOrg.id },
            });
            if (refreshed?.credentials) {
              setWabaId(refreshed.credentials.exotel_waba_id ?? "");
              setSenderNumber(refreshed.credentials.exotel_sender_number ?? "");
              setPhoneNumbers(refreshed.credentials.phone_numbers ?? []);
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your WhatsApp configuration</p>
      </div>

      <div className="space-y-6">
        {/* Current Configuration */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>WhatsApp Configuration</CardTitle>
            <CardDescription>
              Your current WhatsApp Business setup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">WABA ID</p>
                <p className="mt-1 text-sm font-mono">{wabaId || "Not configured"}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Display Number</p>
                <p className="mt-1 text-sm font-mono">{senderNumber || "Not configured"}</p>
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
          </CardContent>
        </Card>

        {/* Add Number via Facebook */}
        <Card className="border-border">
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
    </DashboardLayout>
  );
}
