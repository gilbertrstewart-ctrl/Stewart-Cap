import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useModals } from "@/context/ModalContext";
import StockCard from "@/components/StockCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SymbolSearch from "@/components/SymbolSearch";
import { Plus, X, Star, Loader2, Sparkles } from "lucide-react";
import { fmtPrice } from "@/utils/format";
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quotes.map((q) => {
            const pos = ((q.price - q.low_52) / (q.high_52 - q.low_52)) * 100;
            return (
              <StockCard
                key={q.symbol}
                quote={q}
                testid={`watch-card-${q.symbol}`}
                onOpen={() => openStockDetail(q.symbol)}
                right={
                  <button data-testid={`watch-remove-${q.symbol}`} onClick={(e) => remove(q.symbol, e)} className="text-muted-foreground hover:text-rose-400 p-1">
                    <X className="w-4 h-4" />
                  </button>
                }
                footer={
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-[10px] font-num text-muted-foreground">
                      <span>{fmtPrice(q.low_52)}</span>
                      <span className="uppercase tracking-wider">52W range</span>
                      <span>{fmtPrice(q.high_52)}</span>
                    </div>
                    <div className="relative h-1.5 rounded-full bg-secondary">
                      <div className="absolute -top-1 w-3 h-3.5 rounded-full bg-primary" style={{ left: `calc(${Math.min(100, Math.max(0, pos))}% - 6px)` }} />
                    </div>
                    <button
                      data-testid={`watch-analyze-${q.symbol}`}
                      onClick={(e) => { e.stopPropagation(); openAiAnalysis(q.symbol); }}
                      className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 rounded-md py-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> AI analysis
                    </button>
                  </div>
                }
              />
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
