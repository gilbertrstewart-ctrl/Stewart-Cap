import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useModals } from "@/context/ModalContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, TrendingUp, TrendingDown, Bell, Newspaper, ExternalLink } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { fmtPrice, fmtPct, fmtMarketCap, fmtVolume, trendColor, trendHex } from "@/utils/format";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y"];

const timeAgo = (unix) => {
  if (!unix) return "";
  const s = Math.floor(Date.now() / 1000 - unix);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function StockDetailModal({ symbol, onClose }) {
  const { openAiAnalysis } = useModals();
  const [quote, setQuote] = useState(null);
  const [range, setRange] = useState("1M");
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [news, setNews] = useState([]);

  useEffect(() => {
    if (!symbol) return;
    setQuote(null);
    let active = true;
    const load = () => api.get(`/market/quote/${symbol}`).then((r) => active && setQuote(r.data)).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    api
      .get(`/market/history/${symbol}`, { params: { range } })
      .then((r) => setPoints(r.data.points))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol, range]);

  useEffect(() => {
    if (!symbol) {
      setNews([]);
      return;
    }
    api.get(`/market/news/${symbol}`).then((r) => setNews(r.data.news)).catch(() => setNews([]));
  }, [symbol]);

  const up = quote ? quote.change_percent >= 0 : true;
  const rangePos = quote ? ((quote.price - quote.low_52) / (quote.high_52 - quote.low_52)) * 100 : 0;

  return (
    <Dialog open={!!symbol} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="stock-detail-modal">
        {!quote ? (
          <div className="h-72 grid place-items-center">
            <DialogTitle className="sr-only">Stock details</DialogTitle>
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle className="font-heading text-2xl flex items-center gap-2">
                    {quote.symbol}
                    <Badge variant="secondary" className="font-num text-[10px]">{quote.exchange}</Badge>
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">{quote.name} · {quote.sector}</p>
                </div>
                <div className="text-right">
                  <div className="font-num text-3xl font-bold">{fmtPrice(quote.price)}</div>
                  <div className={`font-num text-sm flex items-center gap-1 justify-end ${trendColor(quote.change_percent)}`}>
                    {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {fmtPrice(quote.change)} ({fmtPct(quote.change_percent)})
                  </div>
                  <div className="text-[10px] font-num text-muted-foreground mt-1">
                    {quote.source === "live" ? "● Live" : "Simulated"}
                    {quote.as_of ? ` · ${new Date(quote.as_of).toLocaleString()}` : ""}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex gap-1 mt-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  data-testid={`range-${r}`}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-md text-xs font-num font-semibold transition-colors ${
                    range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="h-72 sm:h-80 -mx-2">
              {loading ? (
                <div className="h-full grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={trendHex(quote.change_percent)} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={trendHex(quote.change_percent)} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={["dataMin", "dataMax"]} hide />
                    <Tooltip
                      contentStyle={{ background: "#FFFFFF", border: "1px solid #BFD7F5", color: "#0B1F4D", borderRadius: 8, fontSize: 12 }}
                      labelFormatter={() => ""}
                      formatter={(v) => [`$${fmtPrice(v)}`, "Price"]}
                    />
                    <Area type="monotone" dataKey="price" stroke={trendHex(quote.change_percent)} strokeWidth={2} fill="url(#g)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 52 week range */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-num text-muted-foreground">
                <span>52W Low {fmtPrice(quote.low_52)}</span>
                <span>52W High {fmtPrice(quote.high_52)}</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-secondary">
                <div className="absolute -top-1 w-3 h-3.5 rounded-full bg-primary shadow" style={{ left: `calc(${Math.min(100, Math.max(0, rangePos))}% - 6px)` }} />
              </div>
            </div>

            {quote.near_high && (
              <div data-testid="detail-nearhigh-alert" className="flex items-center gap-2 rounded-lg bg-blue-600/10 text-blue-700 px-3 py-2 text-sm">
                <Bell className="w-4 h-4" />
                {quote.at_high ? "Trading at its 52-week high" : `Only ${quote.pct_from_high}% below its 52-week high`}
              </div>
            )}
            {quote.near_low && (
              <div data-testid="detail-nearlow-alert" className="flex items-center gap-2 rounded-lg bg-red-600/10 text-red-600 px-3 py-2 text-sm">
                <Bell className="w-4 h-4" />
                {`Only ${quote.pct_from_low}% above its 52-week low`}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              {[
                ["P/E", quote.pe || "—"],
                ["Market Cap", fmtMarketCap(quote.market_cap)],
                ["Volume", fmtVolume(quote.volume)],
                ["Div Yield", quote.dividend_yield ? `${quote.dividend_yield}%` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-secondary/50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className="font-num font-semibold text-sm mt-0.5">{v}</div>
                </div>
              ))}
            </div>

            {news.length > 0 && (
              <div data-testid="stock-news" className="mt-1">
                <h4 className="font-heading font-semibold text-sm mb-2 flex items-center gap-1.5">
                  <Newspaper className="w-4 h-4 text-muted-foreground" /> Latest News
                </h4>
                <div className="space-y-2">
                  {news.map((n, i) => (
                    <a
                      key={i}
                      href={n.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`news-item-${i}`}
                      className="group flex items-start gap-2 rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-secondary/40 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug group-hover:text-primary">{n.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 font-num">
                          {n.publisher}{n.published ? ` · ${timeAgo(n.published)}` : ""}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white"
              data-testid="detail-analyze-btn"
              onClick={() => {
                onClose();
                openAiAnalysis(quote.symbol);
              }}
            >
              <Sparkles className="w-4 h-4 mr-2" /> AI Cause Analysis
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
