import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useModals } from "@/context/ModalContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SymbolSearch from "@/components/SymbolSearch";
import { Plus, X, Star, Loader2, Sparkles, Bell } from "lucide-react";
import { fmtPrice, fmtPct, trendColor } from "@/utils/format";
import { toast } from "sonner";

export default function WatchlistPage() {
  const { user, openAuth } = useAuth();
  const { openStockDetail, openAiAnalysis } = useModals();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/watchlist").then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
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
    } catch {
      toast.error("Failed to add");
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

  if (!user)
    return (
      <SignInPrompt
        openAuth={openAuth}
        icon={Star}
        title="Your watchlist lives here"
        desc="Sign in to save and track your favourite US & TSX tickers."
      />
    );

  const quotes = data?.quotes || [];

  return (
    <div data-testid="stock-watchlist-section" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Watchlist</h1>
          <p className="text-muted-foreground mt-1">Live quotes for the stocks you follow.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} data-testid="add-watchlist-btn">
          <Plus className="w-4 h-4 mr-2" /> Add stock
        </Button>
      </div>

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
            return (
              <div
                key={q.symbol}
                data-testid={`watch-row-${q.symbol}`}
                onClick={() => openStockDetail(q.symbol)}
                className="group cursor-pointer flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-[#1C2234] transition-colors"
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
                  <span data-testid={`watch-nearhigh-${q.symbol}`} className="hidden lg:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 shrink-0">
                    <Bell className="w-3 h-3" /> {q.at_high ? "At 52W high" : `${q.pct_from_high}% from high`}
                  </span>
                )}

                <div className="w-24 sm:w-28 text-right shrink-0">
                  <div className="font-num text-lg font-bold">{fmtPrice(q.price)}</div>
                  <div className={`font-num text-xs ${trendColor(q.change_percent)}`}>{fmtPct(q.change_percent)}</div>
                </div>

                <button
                  data-testid={`watch-analyze-${q.symbol}`}
                  onClick={(e) => { e.stopPropagation(); openAiAnalysis(q.symbol); }}
                  title="AI cause analysis"
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <Sparkles className="w-4 h-4" /> <span className="hidden sm:inline">AI</span>
                </button>

                <button data-testid={`watch-remove-${q.symbol}`} onClick={(e) => remove(q.symbol, e)} className="shrink-0 text-muted-foreground hover:text-rose-400 p-1">
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
