import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Target, ThumbsUp, ThumbsDown, Eye } from "lucide-react";
import { fmtPrice, fmtPct } from "@/utils/format";

const KEY_LABEL = { strong_buy: "Strong Buy", buy: "Buy", hold: "Hold", underperform: "Underperform", sell: "Sell", strong_sell: "Strong Sell" };
const KEY_STYLE = {
  strong_buy: "bg-blue-700 text-white", buy: "bg-blue-600 text-white", hold: "bg-slate-500 text-white",
  underperform: "bg-red-500 text-white", sell: "bg-red-600 text-white", strong_sell: "bg-red-700 text-white",
};
export const RATING_STYLE = { Buy: "bg-blue-600 text-white", Hold: "bg-slate-500 text-white", Sell: "bg-red-600 text-white" };
const TREND = [["strongBuy", "Strong buy", "bg-blue-700"], ["buy", "Buy", "bg-blue-500"], ["hold", "Hold", "bg-slate-400"], ["sell", "Sell", "bg-red-400"], ["strongSell", "Strong sell", "bg-red-600"]];

export function ConsensusBadge({ ratingKey, className = "" }) {
  if (!ratingKey) return null;
  return (
    <span data-testid="consensus-badge" className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KEY_STYLE[ratingKey] || "bg-slate-500 text-white"} ${className}`}>
      {KEY_LABEL[ratingKey] || ratingKey}
    </span>
  );
}

export function AnalystConsensus({ symbol }) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    setData(undefined);
    api.get(`/market/consensus/${symbol}`).then((r) => setData(r.data.consensus)).catch(() => setData(null));
  }, [symbol]);

  if (data === undefined) return <div className="h-20 grid place-items-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (!data) return <p className="text-sm text-muted-foreground" data-testid="consensus-empty">No analyst coverage available for {symbol}.</p>;
  const total = Object.values(data.trend).reduce((a, b) => a + b, 0) || 1;
  return (
    <div data-testid="analyst-consensus" className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ConsensusBadge ratingKey={data.rating_key} />
          <span className="text-xs text-muted-foreground font-num">{data.analysts} analysts · score {data.rating_mean?.toFixed(2)}/5</span>
        </div>
        {data.target_mean && (
          <div className="flex items-center gap-1.5 text-sm">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Target</span>
            <span className="font-num font-semibold">${fmtPrice(data.target_mean)}</span>
            <span className={`font-num text-xs ${data.upside_pct >= 0 ? "text-blue-700" : "text-red-600"}`} data-testid="consensus-upside">({fmtPct(data.upside_pct)})</span>
          </div>
        )}
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-secondary">
        {TREND.map(([k, , cls]) => data.trend[k] > 0 && <div key={k} className={cls} style={{ width: `${(data.trend[k] / total) * 100}%` }} title={`${k}: ${data.trend[k]}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground font-num">
        {TREND.map(([k, label, cls]) => (
          <span key={k} className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-sm ${cls}`} /> {label} {data.trend[k]}</span>
        ))}
        {data.target_low && data.target_high && <span className="ml-auto">Range ${fmtPrice(data.target_low)} – ${fmtPrice(data.target_high)}</span>}
      </div>
    </div>
  );
}

export function AiRating({ symbol }) {
  const [provider, setProvider] = useState("openai");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setResult(null); setError(""); }, [symbol]);

  const run = async () => {
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/ai/rating", { symbol, provider });
      setResult(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "AI rating failed");
    } finally { setLoading(false); }
  };

  const r = result?.rating;
  return (
    <div data-testid="ai-rating" className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {[["openai", "ChatGPT"], ["anthropic", "Claude"]].map(([k, l]) => (
            <button key={k} data-testid={`rating-provider-${k}`} onClick={() => setProvider(k)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${provider === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>{l}</button>
          ))}
        </div>
        <Button size="sm" onClick={run} disabled={loading} data-testid="ai-rating-btn" className="bg-red-600 hover:bg-red-700 text-white">
          {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          {result ? "Refresh rating" : "Get AI Buy / Hold / Sell"}
        </Button>
        {loading && <span className="text-xs text-muted-foreground">{provider === "openai" ? "ChatGPT" : "Claude"} is weighing the evidence…</span>}
      </div>
      {error && <div data-testid="ai-rating-error" className="rounded-lg bg-red-600/10 text-red-600 px-3 py-2 text-sm">{error}</div>}
      {r && (
        <div data-testid="ai-rating-result" className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span data-testid="ai-rating-label" className={`rounded-lg px-3 py-1.5 font-heading font-extrabold text-lg ${RATING_STYLE[r.rating] || RATING_STYLE.Hold}`}>{r.rating}</span>
            <div className="text-xs text-muted-foreground font-num">Confidence {r.confidence}/100 · {r.horizon} · {result.provider === "openai" ? "ChatGPT" : "Claude"}</div>
          </div>
          <p className="text-sm leading-relaxed">{r.thesis}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-blue-700 font-semibold flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> Bull case</div>
              {(r.bull_case || []).map((t, i) => <p key={i} className="text-sm text-muted-foreground">• {t}</p>)}
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-red-600 font-semibold flex items-center gap-1"><ThumbsDown className="w-3 h-3" /> Bear case</div>
              {(r.bear_case || []).map((t, i) => <p key={i} className="text-sm text-muted-foreground">• {t}</p>)}
            </div>
          </div>
          {r.what_to_watch?.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1"><Eye className="w-3 h-3" /> What to watch</div>
              {r.what_to_watch.map((t, i) => <p key={i} className="text-sm text-muted-foreground">• {t}</p>)}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{r.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
