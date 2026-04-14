import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { Globe, Users, Send, TrendingUp, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    icon: Globe,
    title: "Create Your Org",
    description: "Set up your organization in seconds with our guided onboarding flow.",
  },
  {
    icon: Users,
    title: "Import Contacts",
    description: "Upload your audience via CSV or add contacts manually with smart normalization.",
  },
  {
    icon: Send,
    title: "Launch Campaigns",
    description: "Pick a template, select your audience, and hit send — messages deliver in under a second.",
  },
  {
    icon: TrendingUp,
    title: "Track Results",
    description: "Watch delivery, read, and reply metrics roll in on your real-time dashboard.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

function AnimatedSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Minimal nav ─────────────────────────────────── */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/insync-logo.png" alt="In-Sync" className="h-8 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="text-lg font-bold text-foreground">In-Sync</span>
          </Link>
          <Button asChild>
            <Link to="/login?signup=true">
              Get started free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* ── How It Works ────────────────────────────────── */}
      <section className="relative bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <AnimatedSection className="mx-auto max-w-2xl text-center">
            <motion.div
              variants={fadeUp}
              className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary"
            >
              <Clock className="h-3.5 w-3.5" />
              How It Works
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl"
            >
              Up and running in{" "}
              <span className="text-primary">minutes</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-5 text-lg text-muted-foreground"
            >
              Four simple steps to your first campaign
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="relative mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Connecting line (desktop only) */}
            <div className="pointer-events-none absolute top-14 left-[12%] right-[12%] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent lg:block" />

            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                variants={fadeUp}
                className="relative text-center"
              >
                <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20" />
                  <div className="absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-lg shadow-primary/25">
                    {i + 1}
                  </div>
                  <step.icon className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mx-auto mt-2 max-w-[240px] text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </AnimatedSection>

          {/* ── CTA ─────────────────────────────────────── */}
          <AnimatedSection className="mt-20 text-center">
            <motion.div variants={fadeUp} className="flex flex-col items-center gap-4">
              <p className="text-lg text-muted-foreground">
                Ready to send your first campaign?
              </p>
              <Button size="lg" className="px-10 py-6 text-lg shadow-lg shadow-primary/25" asChild>
                <Link to="/login?signup=true">
                  Start for free — ₹100 credit included <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>
    </div>
  );
}
