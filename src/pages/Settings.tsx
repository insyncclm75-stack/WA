import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Settings as SettingsIcon, MessageSquare, Trash2, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const statusColors: Record<string, string> = {
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Tables<"templates">[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    category: "MARKETING",
    language: "en",
  });

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast({ variant: "destructive", title: "Error fetching templates", description: error.message });
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreateTemplate = async () => {
    if (!user) return;
    if (!formData.name || !formData.content) {
      toast({ variant: "destructive", title: "Validation Error", description: "Name and content are required." });
      return;
    }

    const { error } = await supabase.from("templates").insert({
      user_id: user.id,
      name: formData.name,
      content: formData.content,
      category: formData.category,
      language: formData.language,
      status: "approved", // Auto-approving for this demo, in real life you'd sync with Exotel
    });

    if (error) {
      toast({ variant: "destructive", title: "Error creating template", description: error.message });
    } else {
      toast({ title: "Template created", description: "Your template has been added successfully." });
      setIsDialogOpen(false);
      setFormData({ name: "", content: "", category: "MARKETING", language: "en" });
      fetchTemplates();
    }
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Error deleting template", description: error.message });
    } else {
      toast({ title: "Template deleted" });
      fetchTemplates();
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings & Templates</h1>
        <p className="mt-1 text-muted-foreground">Manage your WhatsApp message templates and API configuration</p>
      </div>

      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> API Config
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">WhatsApp Templates</h2>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> New Template
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add New Template</DialogTitle>
                  <DialogDescription>
                    Templates must match your approved WhatsApp templates in Exotel.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Template Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., summer_promotion_01"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="category">Category</Label>
                      <Select 
                        value={formData.category} 
                        onValueChange={(v) => setFormData({ ...formData, category: v })}
                      >
                        <SelectTrigger id="category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MARKETING">Marketing</SelectItem>
                          <SelectItem value="UTILITY">Utility</SelectItem>
                          <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="language">Language</Label>
                      <Select 
                        value={formData.language} 
                        onValueChange={(v) => setFormData({ ...formData, language: v })}
                      >
                        <SelectTrigger id="language">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English (en)</SelectItem>
                          <SelectItem value="hi">Hindi (hi)</SelectItem>
                          <SelectItem value="es">Spanish (es)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="content">Template Content</Label>
                    <Textarea
                      id="content"
                      placeholder="Hello {{1}}, your order {{2}} has been shipped!"
                      rows={5}
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    />
                    <p className="text-[0.8rem] text-muted-foreground">
                      Use placeholders like {"{{1}}"}, {"{{2}}"} to match WhatsApp template variables.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateTemplate}>Save Template</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <Card key={i} className="animate-pulse border-border bg-card/50">
                  <CardHeader className="h-24 bg-muted/20" />
                  <CardContent className="h-20" />
                </Card>
              ))
            ) : templates.length === 0 ? (
              <Card className="col-span-full border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No templates added yet.</p>
                </CardContent>
              </Card>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className="group relative overflow-hidden border-border transition-all hover:border-primary/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <Badge variant="outline" className={statusColors[template.status || "pending"]}>
                        {template.status === "approved" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {template.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                        {template.status === "rejected" && <XCircle className="mr-1 h-3 w-3" />}
                        {template.status}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={() => deleteTemplate(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardTitle className="mt-2 text-base font-bold">{template.name}</CardTitle>
                    <CardDescription className="flex gap-2">
                      <span className="text-xs uppercase">{template.category}</span>
                      <span className="text-xs uppercase">• {template.language}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                      {template.content}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="config">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>API Configuration</CardTitle>
              <CardDescription>
                These settings are used to connect to your Exotel WhatsApp Business account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Exotel Subdomain</Label>
                  <Input disabled value="api.exotel.com" className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">Managed in environment secrets.</p>
                </div>
                <div className="space-y-2">
                  <Label>Sender Number (WhatsApp)</Label>
                  <Input disabled value="+91 XXXXX XXXXX" className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">Your verified WhatsApp Business number.</p>
                </div>
              </div>
              
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-4">
                <h4 className="flex items-center gap-2 font-medium text-warning">
                  <SettingsIcon className="h-4 w-4" /> Secure Storage
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your Exotel API Key and Token are stored securely in Lovable Cloud secrets and are only accessed by background functions.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button disabled variant="outline">Update Credentials</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
