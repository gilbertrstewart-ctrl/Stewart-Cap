import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle, TrendingUp, CheckCircle2, Gauge, Mail } from "lucide-react";
import { fmtPct, trendColor } from "@/utils/format";
import { toast } from "sonner";

export default function AiAnalysisModal({ symbol, onClose }) {
  const { user, openAuth } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!symbol) {
      setData(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    api
      .post("/ai/analyze", { symbol, provider })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.detail || "Analysis failed. Please try again."))
      .finally(() => setLoading(false));
  }, [symbol, provider]);

  const emailMe = async () => {
    if (!user) {
      toast.error("Sign in to email yourself the analysis");
      openAuth("login");
      return;
    }
    setSending(true);
    try {
      const { data: res } = await api.post("/ai/email", { symbol, provider });
      toast.success(`Sent to ${res.to}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const a = data?.analysis;
  const score = a?.sentiment_score ?? 50;

  return (
    <Dialog open={!!symbol} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" data-testid="ai-cause-analysis-card">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 grid place-items-center">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="font-heading text-xl">AI Cause Analysis</DialogTitle>
              {data && (
                <p className="text-sm text-muted-foreground">
                  {data.name} ({data.symbol}) ·{" "}
                  <span className={`font-num ${trendColor(data.change_percent)}`}>{fmtPct(data.change_percent)}</span>
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-secondary p-1" data-testid="ai-engine-toggle">
            {[["anthropic", "Claude"], ["openai", "ChatGPT"]].map(([p, label]) => (
              <button
                key={p}
                data-testid={`engine-${p}`}
                onClick={() => setProvider(p)}
                disabled={loading}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  provider === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" disabled={!data || sending} onClick={emailMe} data-testid="ai-email-btn">
            {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />}
            Email me this
          </Button>
        </div>

        {loading && (
          <div className="h-64 grid place-items-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
            <p className="text-sm text-muted-foreground">{provider === "openai" ? "ChatGPT" : "Claude"} is analyzing the move…</p>
          </div>
        )}

        {error && (
          <div data-testid="ai-error" className="rounded-lg bg-rose-500/10 text-rose-400 px-4 py-3 text-sm">{error}</div>
        )}

        {a && (
          <div className="space-y-5">
            <div className="rounded-xl bg-secondary/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5" /> Market Sentiment
                </span>
                <Badge className="bg-primary/15 text-primary border-0">{a.sentiment_label}</Badge>
              </div>
              <div className="h-2 rounded-full bg-background overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${score}%`,
                    background: score >= 60 ? "#10B981" : score <= 40 ? "#F43F5E" : "#F59E0B",
                  }}
                />
              </div>
              <div className="text-right font-num text-xs text-muted-foreground mt-1">{score}/100</div>
            </div>

            <Section title="Catalyst Summary">
              <p className="text-sm leading-relaxed text-foreground/90">{a.catalyst_summary}</p>
            </Section>

            {a.likely_catalysts?.length > 0 && (
              <Section title="Likely Catalysts" icon={TrendingUp}>
                <div className="space-y-2">
                  {a.likely_catalysts.map((c, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <div className="font-semibold text-sm">{c.title}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">{c.detail}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {a.key_metrics?.length > 0 && (
              <Section title="Key Metrics">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {a.key_metrics.map((m, i) => (
                    <div key={i} className="rounded-lg bg-secondary/50 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                      <div className="font-num text-sm font-semibold mt-0.5">{m.value}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {a.analyst_takeaways?.length > 0 && (
              <Section title="Analyst Takeaways" icon={CheckCircle2}>
                <ul className="space-y-1.5">
                  {a.analyst_takeaways.map((t, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> {t}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {a.risk_flags?.length > 0 && (
              <Section title="Risk Flags" icon={AlertTriangle}>
                <ul className="space-y-1.5">
                  {a.risk_flags.map((t, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> {t}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <p className="text-xs text-muted-foreground border-t border-border pt-3">{a.disclaimer}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <h4 className="font-heading font-semibold text-sm mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        {title}
      </h4>
      {children}
    </div>
  );
}
