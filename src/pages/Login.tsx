import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import {
  MessageCircle,
  ArrowLeft,
  Sparkles,
  Shield,
  IndianRupee,
  CheckCheck,
  Check,
  Bot,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ── Animated phone mockup ────────────────────────────── */

const mockMessages = [
  { dir: "out", text: "Hi Priya! 🎉 Your order #4521 has been shipped. Track here: trk.in/4521", time: "10:30 AM", status: "read" },
  { dir: "in", text: "Great, thanks! When will it arrive?", time: "10:32 AM" },
  { dir: "out", text: "Expected delivery is tomorrow by 6 PM. I'll send you a live tracking link once it's out for delivery!", time: "10:32 AM", status: "delivered", isAi: true },
  { dir: "in", text: "Perfect, thank you! 😊", time: "10:33 AM" },
];

function PhoneMockup() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers = mockMessages.map((_, i) =>
      setTimeout(() => setVisible(i + 1), 1200 + i * 1400)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateY: -8 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="relative mx-auto w-[280px]"
      style={{ perspective: 1000 }}
    >
      {/* Phone frame */}
      <div className="rounded-[2.5rem] border-[3px] border-white/20 bg-black/40 p-2 shadow-2xl backdrop-blur-sm">
        <div className="overflow-hidden rounded-[2rem] bg-[#e5ddd5]">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-primary px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">P</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-white">Priya Patel</p>
                <p className="text-[8px] text-white/60">online</p>
              </div>
            </div>
          </div>

          {/* Chat area */}
          <div className="space-y-1.5 p-3" style={{ minHeight: 300 }}>
            {mockMessages.slice(0, visible).map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25 }}
                className={`flex ${msg.dir === "out" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-2.5 py-1.5 shadow-sm ${
                    msg.dir === "out"
                      ? "rounded-tr-none bg-[#dcf8c6]"
                      : "rounded-tl-none bg-white"
                  }`}
                >
                  {msg.isAi && (
                    <div className="mb-0.5 flex items-center gap-0.5 text-[7px] font-semibold text-primary">
                      <Bot className="h-2 w-2" /> AI Auto-Reply
                    </div>
                  )}
                  <p className="text-[10px] leading-relaxed text-gray-900">{msg.text}</p>
                  <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[8px] text-gray-500">
                    {msg.time}
                    {msg.dir === "out" && msg.status === "read" && <CheckCheck className="h-2.5 w-2.5 text-blue-500" />}
                    {msg.dir === "out" && msg.status === "delivered" && <CheckCheck className="h-2.5 w-2.5" />}
                    {msg.dir === "out" && !msg.status && <Check className="h-2.5 w-2.5" />}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 border-t border-gray-200 bg-[#f0f0f0] px-3 py-2">
            <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[9px] text-gray-400">
              Type a message
            </div>
          </div>
        </div>
      </div>

      {/* Glow effect behind phone */}
      <div className="absolute -inset-10 -z-10 rounded-full bg-white/5 blur-3xl" />
    </motion.div>
  );
}

/* ── Floating particles ───────────────────────────────── */

function FloatingParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white/10"
          style={{
            width: 6 + i * 10,
            height: 6 + i * 10,
            left: `${10 + i * 18}%`,
            top: `${15 + (i % 3) * 28}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 4 + i * 0.8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.6,
          }}
        />
      ))}
    </div>
  );
}

/* ── Main component ───────────────────────────────────── */

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(searchParams.get("signup") === "true");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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
      try {
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: { type: "register", email, password },
        });
        if (error || data?.error) {
          const msg = data?.error || (typeof data === "string" ? data : null) || error?.message || "Something went wrong. Please try again.";
          toast({ variant: "destructive", title: "Sign up failed", description: msg });
        } else {
          toast({ title: "Check your email", description: "We've sent you a confirmation link." });
        }
      } catch (err: any) {
        toast({ variant: "destructive", title: "Sign up failed", description: err.message || "Something went wrong. Please try again." });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ variant: "destructive", title: "Login failed", description: error.message });
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel ── */}
      <div className="relative hidden w-1/2 overflow-hidden lg:flex lg:flex-col lg:justify-between">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1a12] via-[#0d2818] to-[#0a1e14]" />

        {/* Layered color washes */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[150px]" />
          <div className="absolute -bottom-40 -right-20 h-[450px] w-[450px] rounded-full bg-emerald-500/20 blur-[130px]" />
          <div className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-teal-400/10 blur-[100px]" />
          <div className="absolute bottom-1/4 left-1/4 h-56 w-56 rounded-full bg-emerald-300/8 blur-[90px]" />
        </div>

        {/* Fine grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Diagonal lines texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,0.1) 35px, rgba(255,255,255,0.1) 36px)",
          }}
        />

        {/* Noise grain overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: "128px 128px",
          }}
        />

        {/* Radial spotlight */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />

        <FloatingParticles />

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-between px-10 py-10 xl:px-14">
          {/* Top: Logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shadow-lg backdrop-blur-sm">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">In-Sync</span>
          </motion.div>

          {/* Center: Phone mockup + text */}
          <div className="flex flex-col items-center">
            <PhoneMockup />

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="mt-10 text-center"
            >
              <h2 className="text-2xl font-bold leading-tight text-white xl:text-3xl">
                Conversations that convert.
                <br />
                <span className="text-white/70">Powered by AI.</span>
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/50">
                Launch campaigns, let AI handle replies, and track every message — all self-serve, with transparent billing.
              </p>
            </motion.div>

            {/* Feature pills */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="mt-6 flex flex-wrap items-center justify-center gap-2"
            >
              {[
                { icon: Sparkles, text: "AI Auto-Replies" },
                { icon: Shield, text: "Enterprise Security" },
                { icon: IndianRupee, text: "Pay Per Message" },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm"
                >
                  <Icon className="h-3 w-3" />
                  {text}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Bottom: Stats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.5 }}
          >
            <div className="grid grid-cols-3 gap-4 rounded-2xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm">
              {[
                { value: "98%", label: "Open Rate" },
                { value: "45-60%", label: "Click-through" },
                { value: "10x", label: "vs Email ROI" },
              ].map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="text-xl font-bold text-white">{value}</p>
                  <p className="text-[9px] font-medium uppercase tracking-widest text-white/40">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="relative flex flex-1 flex-col items-center justify-center bg-background px-6">
        {/* Subtle gradient for depth */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 right-0 h-[400px] w-[400px] rounded-full bg-primary/[0.03] blur-[100px]" />
        </div>

        <div className="relative w-full max-w-md">
          {/* Back link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link to="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to home
              </Link>
            </Button>
          </motion.div>

          {/* Form card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-xl shadow-black/5">
              {/* Header */}
              <div className="mb-6 text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.3, type: "spring" }}
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25"
                >
                  <MessageCircle className="h-7 w-7 text-primary-foreground" />
                </motion.div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {isForgotPassword
                    ? "Reset password"
                    : isSignUp
                    ? "Create your account"
                    : "Welcome back"}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {isForgotPassword
                    ? "Enter your email and we'll send you a reset link"
                    : isSignUp
                    ? "Sign up to start managing your WhatsApp campaigns"
                    : "Sign in to your campaign dashboard"}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                {!isForgotPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}
                <Button
                  type="submit"
                  className="h-11 w-full text-sm font-semibold shadow-lg shadow-primary/25"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Please wait...
                    </>
                  ) : isForgotPassword ? (
                    "Send Reset Link"
                  ) : isSignUp ? (
                    "Create Account"
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              {/* Forgot password */}
              {!isForgotPassword && !isSignUp && (
                <p className="mt-3 text-center">
                  <button
                    onClick={() => setIsForgotPassword(true)}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </p>
              )}

              {/* Toggle sign in / sign up */}
              <p className="mt-5 text-center text-sm text-muted-foreground">
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

              {/* Free balance callout for sign up */}
              {isSignUp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-center"
                >
                  <p className="text-xs font-medium text-primary">
                    Start with a free Rs 100 balance — no credit card needed
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Mobile-only branding (when left panel hidden) */}
          <div className="mt-8 text-center lg:hidden">
            <div className="mx-auto mb-2 flex items-center justify-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">In-Sync</span>
            </div>
            <p className="text-xs text-muted-foreground">
              AI-powered WhatsApp campaign platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
