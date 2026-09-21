import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { TrendingUp, TrendingDown, Landmark, Fuel, Bitcoin, ArrowLeftRight } from "lucide-react";
import { fmtPct, trendColor, trendBg } from "@/utils/format";

const ICONS = { index: Landmark, commodity: Fuel, crypto: Bitcoin, fx: ArrowLeftRight };

const fmt = (it) => {
  if (it.kind === "fx") return `${it.price.toFixed(4)} US$`;
  if (it.kind === "index") return it.price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `$${it.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function MarketOverview() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let active = true;
    const load = () => api.get("/market/overview").then((r) => active && setItems(r.data.items)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (!items.length) return null;

  return (
    <div data-testid="market-overview" className="border-b border-border bg-card/60">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex gap-2 overflow-x-auto">
        {items.map((it) => {
          const up = it.change_percent >= 0;
          const Icon = ICONS[it.kind] || Landmark;
          return (
            <div
              key={it.symbol}
              data-testid={`overview-${it.symbol}`}
              className={`shrink-0 flex items-center gap-2.5 rounded-lg border border-border px-3 py-1.5 ${trendBg(it.change_percent)}`}
            >
              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-num">{it.name}</div>
                <div className="flex items-center gap-1.5">
                  <span className="font-num text-sm font-semibold">{fmt(it)}</span>
                  <span className={`font-num text-xs inline-flex items-center gap-0.5 ${trendColor(it.change_percent)}`} data-testid={`overview-change-${it.symbol}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {fmtPct(it.change_percent)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
