import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your API configuration</p>
      </div>

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

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <h4 className="flex items-center gap-2 font-medium text-amber-600">
              <SettingsIcon className="h-4 w-4" /> Secure Storage
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Your Exotel API Key, Token, and WABA ID are stored securely in Supabase Edge Function secrets and are only accessed by backend functions.
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <Button disabled variant="outline">Update Credentials</Button>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
