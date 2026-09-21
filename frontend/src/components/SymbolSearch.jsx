import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { fmtPrice, fmtPct, trendColor } from "@/utils/format";
import { Badge } from "@/components/ui/badge";

export default function SymbolSearch({ onSelect, selected }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    let active = true;
    api.get("/market/search", { params: { q } }).then((r) => active && setResults(r.data.results)).catch(() => {});
    return () => {
      active = false;
    };
  }, [q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="symbol-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search AAPL, Shopify, TD…"
          className="pl-9"
        />
      </div>
      <div className="max-h-52 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {results.map((s) => (
          <button
            key={s.symbol}
            type="button"
            data-testid={`symbol-option-${s.symbol}`}
            onClick={() => onSelect(s)}
            className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary transition-colors ${
              selected === s.symbol ? "bg-primary/10" : ""
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-num font-semibold text-sm">{s.symbol}</span>
                <Badge variant="secondary" className="text-[9px]">{s.exchange}</Badge>
              </div>
              <div className="text-xs text-muted-foreground truncate">{s.name}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-num text-sm">{fmtPrice(s.price)}</div>
              <div className={`font-num text-xs ${trendColor(s.change_percent)}`}>{fmtPct(s.change_percent)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
