import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  Users,
  Megaphone,
  BarChart3,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle,
} from "lucide-react";

const features = [
  {
    icon: Megaphone,
    title: "Campaign Builder",
    description:
      "Create targeted WhatsApp campaigns with personalized templates, media attachments, and scheduled delivery.",
  },
  {
    icon: Users,
    title: "Contact Management",
    description:
      "Import contacts via CSV, organize with tags, and build segmented audiences for precision messaging.",
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    description:
      "Track delivery, read receipts, and failures with live dashboards and exportable reports.",
  },
  {
    icon: Zap,
    title: "Instant Delivery",
    description:
      "Powered by Exotel's WhatsApp Business API for reliable, high-throughput message delivery.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description:
      "Role-based access, encrypted credentials, and row-level data isolation keep your data safe.",
  },
  {
    icon: MessageCircle,
    title: "Communications Hub",
    description:
      "Monitor every message in real-time with status tracking from sent to delivered to read.",
  },
];

const stats = [
  { value: "99.5%", label: "Delivery Rate" },
  { value: "10K+", label: "Messages / min" },
  { value: "< 1s", label: "Avg. Latency" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <MessageCircle className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              WhatsApp Hub
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link to="/login?signup=true">
                Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Gradient orb */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Powered by Exotel WhatsApp Business API
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Launch WhatsApp Campaigns{" "}
              <span className="text-primary">That Convert</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Upload your contacts, craft personalized messages, and reach
              thousands instantly — all from one powerful admin dashboard.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="text-base px-8" asChild>
                <Link to="/login?signup=true">
                  Start Sending <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-base px-8" asChild>
                <a href="#features">See Features</a>
              </Button>
            </div>
          </div>

          {/* Stats ribbon */}
          <div className="mx-auto mt-16 grid max-w-lg grid-cols-3 gap-6 sm:mt-20">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-bold text-primary sm:text-4xl">
                  {s.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Everything you need to run campaigns
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A complete toolkit for WhatsApp marketing — from contact import to
              delivery analytics.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent">
                  <f.icon className="h-5 w-5 text-accent-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center sm:px-16">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(142_70%_55%/0.3),transparent_60%)]" />
            <h2 className="relative text-3xl font-bold text-primary-foreground sm:text-4xl">
              Ready to reach your audience?
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-primary-foreground/80">
              Sign up in seconds, upload your contacts, and launch your first
              WhatsApp campaign today.
            </p>
            <div className="relative mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                variant="secondary"
                className="text-base px-8"
                asChild
              >
                <Link to="/login?signup=true">
                  Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-primary-foreground/70">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" /> No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" /> Admin-only access
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" /> Enterprise-grade security
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageCircle className="h-4 w-4 text-primary" />
              WhatsApp Hub
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} WhatsApp Hub. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
