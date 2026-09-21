import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { fmtPrice, fmtPct, tapeTrendColor } from "@/utils/format";
import { useModals } from "@/context/ModalContext";

export default function TickerTape() {
  const [quotes, setQuotes] = useState([]);
  const { openStockDetail } = useModals();

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get("/market/ticker")
        .then((r) => active && setQuotes(r.data.quotes))
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (!quotes.length) return null;
  const loop = [...quotes, ...quotes];

  return (
    <div
      data-testid="running-stock-ticker-tape"
      className="fixed top-0 left-0 w-full z-50 h-9 bg-black border-b border-white/10 overflow-hidden flex items-center"
    >
      <div className="flex-shrink-0 h-full px-3 flex items-center gap-1.5 bg-red-600 text-white font-heading font-bold text-[11px] uppercase tracking-wider z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-white live-dot" /> Live
      </div>
      <div className="flex whitespace-nowrap animate-marquee">
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
    </div>
  );
}
