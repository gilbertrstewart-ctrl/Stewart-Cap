import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useModals } from "@/context/ModalContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SymbolSearch from "@/components/SymbolSearch";
import PriceAlertDialog from "@/components/PriceAlertDialog";
import DigestCard from "@/components/DigestCard";
import { Plus, X, Star, Loader2, Sparkles, Bell, BellRing, ArrowUpDown } from "lucide-react";
import { fmtPrice, fmtPct, trendColor } from "@/utils/format";
import { toast } from "sonner";

const SORTS = {
  change_desc: { label: "% change · top gainers", fn: (a, b) => b.change_percent - a.change_percent },
  change_asc: { label: "% change · top losers", fn: (a, b) => a.change_percent - b.change_percent },
  near_high: { label: "Closest to 52W high", fn: (a, b) => (a.pct_from_high ?? 999) - (b.pct_from_high ?? 999) },
  name_asc: { label: "Name A → Z", fn: (a, b) => a.name.localeCompare(b.name) },
  symbol_asc: { label: "Symbol A → Z", fn: (a, b) => a.symbol.localeCompare(b.symbol) },
  added: { label: "Order added", fn: null },
};

export default function WatchlistPage() {
  const { user, openAuth } = useAuth();
  const { openStockDetail, openAiAnalysis } = useModals();
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [alertQuote, setAlertQuote] = useState(null);
  const [sort, setSort] = useState(() => localStorage.getItem("watch_sort") || "added");

  useEffect(() => localStorage.setItem("watch_sort", sort), [sort]);

  const load = () => {
    setLoading(true);
    api.get("/watchlist").then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
    api.get("/alerts").then((r) => setAlerts(r.data.alerts)).catch(() => {});
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const add = async (s) => {
    try {
      const { data } = await api.post("/watchlist", { symbol: s.symbol });
      setData(data);
      toast.success(`Added ${s.symbol}`);
      setAddOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to add");
    }
  };

  const remove = async (symbol, e) => {
    e.stopPropagation();
    try {
      const { data } = await api.delete(`/watchlist/${symbol}`);
      setData(data);
    } catch {
      toast.error("Failed to remove");
    }
  };

  const quotes = useMemo(() => {
    const list = [...(data?.quotes || [])];
    const fn = SORTS[sort]?.fn;
    return fn ? list.sort(fn) : list;
  }, [data, sort]);

  const activeAlerts = useMemo(() => {
    const m = {};
    alerts.forEach((a) => { if (!a.triggered_at) m[a.symbol] = (m[a.symbol] || 0) + 1; });
    return m;
  }, [alerts]);

  if (!user)
    return (
      <SignInPrompt
        openAuth={openAuth}
        icon={Star}
        title="Your watchlist lives here"
        desc="Sign in to save and track your favourite US & TSX tickers."
      />
    );

  return (
    <div data-testid="stock-watchlist-section" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Watchlist</h1>
          <p className="text-muted-foreground mt-1">Live quotes for the stocks you follow.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[210px]" data-testid="watchlist-sort-select">
              <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([k, v]) => (
                <SelectItem key={k} value={k} data-testid={`watchlist-sort-${k}`}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setAddOpen(true)} data-testid="add-watchlist-btn">
            <Plus className="w-4 h-4 mr-2" /> Add stock
          </Button>
        </div>
      </div>

      <DigestCard />

      {loading && !data ? (
        <div className="h-64 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : quotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 grid place-items-center text-center">
          <Star className="w-10 h-10 text-muted-foreground mb-3" />
          <h3 className="font-heading font-semibold text-lg">Watchlist is empty</h3>
          <p className="text-muted-foreground text-sm mb-4">Add stocks to keep an eye on their price and 52-week range.</p>
          <Button onClick={() => setAddOpen(true)} data-testid="empty-add-watchlist-btn"><Plus className="w-4 h-4 mr-2" /> Add stock</Button>
        </div>
      ) : (
        <div data-testid="watchlist-list" className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {quotes.map((q) => {
            const pos = ((q.price - q.low_52) / (q.high_52 - q.low_52)) * 100;
            const nAlerts = activeAlerts[q.symbol] || 0;
            return (
              <div
                key={q.symbol}
                data-testid={`watch-row-${q.symbol}`}
                onClick={() => openStockDetail(q.symbol)}
                className="group cursor-pointer flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-secondary transition-colors"
              >
                <div className="w-32 sm:w-44 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold">{q.symbol}</span>
                    <Badge variant="secondary" className="text-[9px] font-num">{q.exchange}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{q.name}</div>
                </div>

                <div className="hidden md:block flex-1 min-w-0">
                  <div className="flex justify-between text-[10px] font-num text-muted-foreground mb-1">
                    <span>{fmtPrice(q.low_52)}</span>
                    <span className="uppercase tracking-wider">52W range</span>
                    <span>{fmtPrice(q.high_52)}</span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-secondary">
                    <div className="absolute -top-1 w-3 h-3.5 rounded-full bg-primary" style={{ left: `calc(${Math.min(100, Math.max(0, pos))}% - 6px)` }} />
                  </div>
                </div>

                {q.near_high && (
                  <span data-testid={`watch-nearhigh-${q.symbol}`} className="hidden lg:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-blue-600/15 text-blue-700 shrink-0">
                    <Bell className="w-3 h-3" /> {q.at_high ? "At 52W high" : `${q.pct_from_high}% from high`}
                  </span>
                )}

                <div className="w-24 sm:w-28 text-right shrink-0">
                  <div className="font-num text-lg font-bold">{fmtPrice(q.price)}</div>
                  <div className={`font-num text-xs ${trendColor(q.change_percent)}`}>{fmtPct(q.change_percent)}</div>
                </div>

                <button
                  data-testid={`watch-alert-${q.symbol}`}
                  onClick={(e) => { e.stopPropagation(); setAlertQuote(q); }}
                  title="Price alert"
                  className={`shrink-0 relative flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 transition-colors ${
                    nAlerts ? "text-red-600 hover:bg-red-600/10" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {nAlerts ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  {nAlerts > 0 && (
                    <span data-testid={`watch-alert-count-${q.symbol}`} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-num grid place-items-center">
                      {nAlerts}
                    </span>
                  )}
                </button>

                <button
                  data-testid={`watch-analyze-${q.symbol}`}
                  onClick={(e) => { e.stopPropagation(); openAiAnalysis(q.symbol); }}
                  title="AI cause analysis"
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-red-600 hover:bg-red-600/10 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <Sparkles className="w-4 h-4" /> <span className="hidden sm:inline">AI</span>
                </button>

                <button data-testid={`watch-remove-${q.symbol}`} onClick={(e) => remove(q.symbol, e)} className="shrink-0 text-muted-foreground hover:text-red-600 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md" data-testid="add-watchlist-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Add to watchlist</DialogTitle>
          </DialogHeader>
          <SymbolSearch onSelect={add} />
        </DialogContent>
      </Dialog>

      <PriceAlertDialog quote={alertQuote} onClose={() => setAlertQuote(null)} onChanged={setAlerts} />
    </div>
  );
}

export function SignInPrompt({ openAuth, icon: Icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-border bg-card py-20 grid place-items-center text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-primary/15 grid place-items-center mb-4">
        <Icon className="w-7 h-7 text-primary" />
      </div>
      <h2 className="font-heading text-2xl font-bold">{title}</h2>
      <p className="text-muted-foreground mt-2 max-w-sm">{desc}</p>
      <div className="flex gap-3 mt-6">
        <Button onClick={() => openAuth("register")} data-testid="prompt-register-btn">Get started</Button>
        <Button variant="secondary" onClick={() => openAuth("login")} data-testid="prompt-signin-btn">Sign in</Button>
      </div>
    </div>
  );
}
