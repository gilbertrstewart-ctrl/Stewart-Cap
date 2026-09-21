import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { fmtPrice, fmtPct, tapeTrendColor } from "@/utils/format";
import { useModals } from "@/context/ModalContext";
import { useAuth } from "@/context/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings2 } from "lucide-react";

const SPEEDS = { slow: 90, normal: 55, fast: 28 };

export default function TickerTape() {
  const [quotes, setQuotes] = useState([]);
  const { openStockDetail } = useModals();
  const { user } = useAuth();
  const [speed, setSpeed] = useState(() => localStorage.getItem("tape_speed") || "normal");
  const [source, setSource] = useState(() => localStorage.getItem("tape_source") || "all");

  useEffect(() => localStorage.setItem("tape_speed", speed), [speed]);
  useEffect(() => localStorage.setItem("tape_source", source), [source]);

  const useWatch = source === "watchlist" && !!user;

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get(useWatch ? "/watchlist" : "/market/ticker")
        .then((r) => active && setQuotes(r.data.quotes))
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [useWatch]);

  const loop = quotes.length ? [...quotes, ...quotes] : [];

  return (
    <div
      data-testid="running-stock-ticker-tape"
      className="fixed top-0 left-0 w-full z-50 h-9 bg-black border-b border-white/10 overflow-hidden flex items-center"
    >
      <div className="flex-shrink-0 h-full px-3 flex items-center gap-1.5 bg-red-600 text-white font-heading font-bold text-[11px] uppercase tracking-wider z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-white live-dot" /> {useWatch ? "Watchlist" : "Live"}
      </div>
      <div className="flex-1 overflow-hidden">
        {loop.length ? (
          <div className="flex whitespace-nowrap animate-marquee" style={{ animationDuration: `${SPEEDS[speed] || 55}s` }}>
            {loop.map((q, i) => (
              <button
                key={`${q.symbol}-${i}`}
                data-testid={i < quotes.length ? `ticker-item-${q.symbol}` : undefined}
                onClick={() => openStockDetail(q.symbol)}
                className="inline-flex items-center gap-2 px-4 text-xs font-num hover:bg-white/5 h-9 transition-colors"
              >
                <span className="text-white font-semibold">{q.symbol}</span>
                <span className="text-white/70">{fmtPrice(q.price)}</span>
                <span className={tapeTrendColor(q.change_percent)}>{fmtPct(q.change_percent)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-4 text-xs text-white/60 font-num" data-testid="ticker-empty">
            {useWatch ? "Your watchlist is empty — add stocks to see them here." : "Loading quotes…"}
          </div>
        )}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button data-testid="ticker-settings-btn" title="Ticker settings" className="shrink-0 h-9 w-9 grid place-items-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <Settings2 className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-3 space-y-3" data-testid="ticker-settings-popover">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-num mb-1.5">Speed</div>
            <div className="grid grid-cols-3 gap-1">
              {Object.keys(SPEEDS).map((s) => (
                <button
                  key={s}
                  data-testid={`ticker-speed-${s}`}
                  onClick={() => setSpeed(s)}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize border transition-colors ${
                    speed === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-num mb-1.5">Stocks shown</div>
            <div className="grid grid-cols-2 gap-1">
              {[["all", "All markets"], ["watchlist", "My watchlist"]].map(([k, label]) => (
                <button
                  key={k}
                  data-testid={`ticker-source-${k}`}
                  onClick={() => setSource(k)}
                  disabled={k === "watchlist" && !user}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium border transition-colors disabled:opacity-50 ${
                    source === k ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {!user && <p className="text-[11px] text-muted-foreground mt-1.5">Sign in to show only your watchlist.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
