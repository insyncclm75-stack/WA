import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, ArrowRight, MessageCircle, Users, Rocket } from "lucide-react";

const INDUSTRIES = [
  "E-Commerce",
  "Education",
  "Healthcare",
  "Finance",
  "Real Estate",
  "Travel & Hospitality",
  "Food & Beverage",
  "Retail",
  "Technology",
  "Other",
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function CreateOrg() {
  const { user } = useAuth();
  const { refreshOrgs } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user) {
    navigate("/login");
    return null;
  }

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(slugify(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-org", {
        body: { action: "create", name: name.trim(), slug: slug.trim(), industry: industry || null },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error + (data.details ? `: ${data.details}` : ""));

      await refreshOrgs();
      toast({ title: "Organization created!" });
      navigate("/onboarding");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel: branding ── */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-primary/80 lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
          <div className="flex items-center gap-3 mb-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">In-Sync</span>
          </div>

          <h2 className="text-3xl font-bold leading-tight text-white xl:text-4xl">
            Set up your<br />workspace in seconds.
          </h2>
          <p className="mt-4 max-w-md text-base text-white/70">
            Create your organization to start managing contacts, campaigns, and conversations.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: Building2, text: "Multi-team workspace with role-based access" },
              { icon: Users, text: "Invite your team and collaborate" },
              { icon: Rocket, text: "Launch your first campaign in minutes" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-white/80">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 px-12 pb-8 xl:px-16">
          <div className="grid grid-cols-3 gap-4 rounded-xl bg-white/10 backdrop-blur-sm p-4 mb-4">
            {[
              { value: "98%", label: "Open Rate" },
              { value: "45-60%", label: "Click-through" },
              { value: "10x", label: "vs Email ROI" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-xl font-bold text-white">{value}</p>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/40">Powered by Exotel WhatsApp Business API</p>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-background px-6">
        <div className="w-full max-w-md">
          <Card className="border-border shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
                <Building2 className="h-7 w-7 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl font-bold">Create Your Organization</CardTitle>
              <CardDescription>Set up your workspace to start sending campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name *</Label>
                  <Input
                    id="org-name"
                    placeholder="Acme Corp"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-slug">URL Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">hub/</span>
                    <Input
                      id="org-slug"
                      placeholder="acme-corp"
                      value={slug}
                      onChange={(e) => setSlug(slugify(e.target.value))}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((i) => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? "Creating..." : <>Create & Continue <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
