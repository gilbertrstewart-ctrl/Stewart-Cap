import React from "react";
import { Badge } from "@/components/ui/badge";
import { fmtPrice, fmtPct, trendColor, trendBg } from "@/utils/format";

export default function StockCard({ quote, onOpen, right, footer, testid }) {
  return (
    <div
      data-testid={testid}
      onClick={onOpen}
      className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-secondary transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-base">{quote.symbol}</span>
            <Badge variant="secondary" className="text-[9px] font-num">{quote.exchange}</Badge>
          </div>
          <div className="text-xs text-muted-foreground truncate max-w-[170px] mt-0.5">{quote.name}</div>
        </div>
        {right}
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div className="font-num text-xl font-bold tracking-tight">{fmtPrice(quote.price)}</div>
        <div className={`font-num text-sm font-semibold px-2 py-0.5 rounded-md ${trendColor(quote.change_percent)} ${trendBg(quote.change_percent)}`}>
          {fmtPct(quote.change_percent)}
        </div>
      </div>
      {footer}
    </div>
  );
}
