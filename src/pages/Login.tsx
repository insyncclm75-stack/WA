import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, ArrowLeft, Zap, Shield, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(searchParams.get("signup") === "true");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect once auth is resolved
  useEffect(() => {
    if (!authLoading && user) navigate("/dashboard", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    setIsSignUp(searchParams.get("signup") === "true");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isForgotPassword) {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { type: "reset_password", email },
      });
      if (error || data?.error) {
        toast({ variant: "destructive", title: "Error", description: data?.error || error?.message });
      } else {
        toast({ title: "Check your email", description: "If an account exists, we've sent a password reset link." });
      }
    } else if (isSignUp) {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { type: "register", email, password },
      });
      if (error || data?.error) {
        toast({ variant: "destructive", title: "Sign up failed", description: data?.error || error?.message });
      } else {
        toast({ title: "Check your email", description: "We've sent you a confirmation link." });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ variant: "destructive", title: "Login failed", description: error.message });
      }
      // Navigation handled by useEffect above once auth state resolves
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel: branding ── */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-primary/80 lg:flex lg:flex-col lg:justify-between">
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Gradient orbs */}
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
          <div className="flex items-center gap-3 mb-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">In-Sync</span>
          </div>

          <h2 className="text-3xl font-bold leading-tight text-white xl:text-4xl">
            Reach your customers<br />where they already are.
          </h2>
          <p className="mt-4 max-w-md text-base text-white/70">
            Launch WhatsApp campaigns, automate drip sequences, and manage conversations — all from one dashboard.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: Zap, text: "Send 10,000+ messages per minute" },
              { icon: Shield, text: "Official WhatsApp Business API" },
              { icon: BarChart3, text: "Real-time delivery analytics" },
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

        {/* WhatsApp marketing stats */}
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
          <div className="mb-6">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link to="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to home
              </Link>
            </Button>
          </div>

          <Card className="border-border shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
                <MessageCircle className="h-7 w-7 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl font-bold">
                {isForgotPassword ? "Reset password" : isSignUp ? "Create your account" : "Welcome back"}
              </CardTitle>
              <CardDescription>
                {isForgotPassword
                  ? "Enter your email and we'll send you a reset link"
                  : isSignUp
                  ? "Sign up to start managing your WhatsApp campaigns"
                  : "Sign in to your campaign dashboard"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {!isForgotPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading
                    ? "Please wait..."
                    : isForgotPassword
                    ? "Send Reset Link"
                    : isSignUp
                    ? "Create Account"
                    : "Sign In"}
                </Button>
              </form>
              {!isForgotPassword && !isSignUp && (
                <p className="mt-3 text-center">
                  <button
                    onClick={() => setIsForgotPassword(true)}
                    className="text-sm text-muted-foreground hover:text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </p>
              )}
              <p className="mt-4 text-center text-sm text-muted-foreground">
                {isForgotPassword ? (
                  <button
                    onClick={() => setIsForgotPassword(false)}
                    className="font-medium text-primary hover:underline"
                  >
                    Back to sign in
                  </button>
                ) : (
                  <>
                    {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                    <button
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="font-medium text-primary hover:underline"
                    >
                      {isSignUp ? "Sign in" : "Sign up"}
                    </button>
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
