import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useModals } from "@/context/ModalContext";
import { Badge } from "@/components/ui/badge";
import { ConsensusBadge } from "@/components/Recommendation";
import { Lightbulb, Plus, Loader2, Check } from "lucide-react";
import { fmtPrice, fmtChange, trendColor } from "@/utils/format";
import { toast } from "sonner";

export default function StockIdeas({ onAdded }) {
  const { openStockDetail } = useModals();
  const [ideas, setIdeas] = useState(null);
  const [added, setAdded] = useState({});

  useEffect(() => {
    api.get("/recommendations").then((r) => setIdeas(r.data.ideas)).catch(() => setIdeas([]));
  }, []);

  const add = async (e, s) => {
    e.stopPropagation();
    try {
      const { data } = await api.post("/watchlist", { symbol: s.symbol });
      setAdded((a) => ({ ...a, [s.symbol]: true }));
      toast.success(`Added ${s.symbol} to watchlist`);
      onAdded?.(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to add");
    }
  };

  if (ideas === null) return <div className="h-20 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!ideas.length) return null;

  return (
    <section data-testid="stock-ideas" className="space-y-3">
      <div>
        <h2 className="font-heading text-lg md:text-xl font-bold flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-red-600" /> Stocks you may like
        </h2>
        <p className="text-sm text-muted-foreground">Ideas based on what you follow and hold, with Wall Street consensus.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ideas.map((s) => (
          <div
            key={s.symbol}
            data-testid={`idea-card-${s.symbol}`}
            onClick={() => openStockDetail(s.symbol)}
            className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-secondary/60 transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold">{s.symbol}</span>
                  <Badge variant="secondary" className="text-[9px] font-num">{s.exchange}</Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-num font-semibold">{fmtPrice(s.price)}</div>
                <div className={`font-num text-xs ${trendColor(s.change_percent)}`}>{fmtChange(s.change, s.change_percent)}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <ConsensusBadge ratingKey={s.consensus?.rating_key} />
                <div className="text-[11px] text-muted-foreground mt-1 truncate">Because you follow {s.because.join(", ")}</div>
              </div>
              <button
                data-testid={`idea-add-${s.symbol}`}
                onClick={(e) => add(e, s)}
                disabled={added[s.symbol]}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors disabled:opacity-60"
              >
                {added[s.symbol] ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {added[s.symbol] ? "Added" : "Watch"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
