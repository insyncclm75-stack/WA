import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiInsightsProps {
  type: "dashboard" | "campaign" | "inbox";
  context?: Record<string, string>;
  className?: string;
}

// Session cache to avoid re-fetching on every render
const insightCache = new Map<string, { text: string; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function AiInsights({ type, context, className }: AiInsightsProps) {
  const { currentOrg } = useOrg();
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `${type}:${currentOrg?.id}:${context?.campaign_id || ""}`;

  const fetchInsight = async (force = false) => {
    if (!currentOrg) return;

    // Check cache
    if (!force) {
      const cached = insightCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        setInsight(cached.text);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-insights", {
        body: { type, org_id: currentOrg.id, context },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      const text = data?.insight || "No insights available.";
      setInsight(text);
      insightCache.set(cacheKey, { text, ts: Date.now() });
    } catch (err: any) {
      setError("Could not generate insights.");
      console.error("AI Insights error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsight();
  }, [currentOrg?.id, type, context?.campaign_id]);

  return (
    <Card className={cn("border-primary/20 bg-primary/[0.02]", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Insights
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => fetchInsight(true)}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !insight ? (
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : insight ? (
          <div className="prose prose-sm max-w-none text-sm text-foreground/90">
            {insight.split("\n").map((line, i) => {
              if (!line.trim()) return <br key={i} />;
              // Bold markdown-style headers
              if (line.startsWith("**") && line.endsWith("**")) {
                return <p key={i} className="mt-2 font-semibold text-foreground">{line.replace(/\*\*/g, "")}</p>;
              }
              // Bullet points
              if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
                const content = line.trim().replace(/^[-*]\s/, "");
                // Handle inline bold
                const parts = content.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <div key={i} className="ml-3 flex gap-1.5 py-0.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>
                      {parts.map((part, j) =>
                        part.startsWith("**") && part.endsWith("**")
                          ? <strong key={j}>{part.replace(/\*\*/g, "")}</strong>
                          : <span key={j}>{part}</span>
                      )}
                    </span>
                  </div>
                );
              }
              // Numbered items
              if (/^\d+\.\s/.test(line.trim())) {
                const content = line.trim().replace(/^\d+\.\s/, "");
                const parts = content.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <div key={i} className="ml-3 py-0.5">
                    <span>
                      {parts.map((part, j) =>
                        part.startsWith("**") && part.endsWith("**")
                          ? <strong key={j}>{part.replace(/\*\*/g, "")}</strong>
                          : <span key={j}>{part}</span>
                      )}
                    </span>
                  </div>
                );
              }
              // Regular paragraph
              const parts = line.split(/(\*\*[^*]+\*\*)/g);
              return (
                <p key={i} className="py-0.5">
                  {parts.map((part, j) =>
                    part.startsWith("**") && part.endsWith("**")
                      ? <strong key={j}>{part.replace(/\*\*/g, "")}</strong>
                      : <span key={j}>{part}</span>
                  )}
                </p>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Sparkles className="h-5 w-5 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Send your first campaign to unlock insights.</p>
          </div>
        )}
        {loading && insight && (
          <p className="mt-2 text-xs text-muted-foreground">Refreshing...</p>
        )}
      </CardContent>
    </Card>
  );
}
