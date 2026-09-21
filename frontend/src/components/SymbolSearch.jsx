import React, { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search, Loader2, CornerDownLeft } from "lucide-react";
import { fmtPrice, fmtChange, trendColor } from "@/utils/format";
import { Badge } from "@/components/ui/badge";

export default function SymbolSearch({ onSelect, selected }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get("/market/search", { params: { q } })
        .then((r) => id === reqId.current && setResults(r.data.results))
        .catch(() => id === reqId.current && setResults([]))
        .finally(() => id === reqId.current && setLoading(false));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const pick = async (s) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSelect(s);
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const typed = q.trim().toUpperCase();
    if (!typed) return;
    const exact = results.find((r) => r.symbol === typed || r.symbol.split(".")[0] === typed);
    pick(exact || results[0] || { symbol: typed });
  };

  const typed = q.trim().toUpperCase();

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="symbol-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          placeholder="Type a ticker (AAPL, TD.TO, CNQ) and press Enter"
          className="pl-9 pr-9"
        />
        {(loading || submitting) && (
          <Loader2 data-testid="symbol-search-loading" className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="max-h-60 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {results.map((s) => (
          <button
            key={s.symbol}
            type="button"
            disabled={submitting}
            data-testid={`symbol-option-${s.symbol}`}
            onClick={() => pick(s)}
            className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary transition-colors disabled:opacity-60 ${
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
              <div className={`font-num text-xs ${trendColor(s.change_percent)}`}>{fmtChange(s.change, s.change_percent)}</div>
            </div>
          </button>
        ))}
        {!loading && typed && results.length === 0 && (
          <button
            type="button"
            disabled={submitting}
            data-testid="symbol-add-typed"
            onClick={() => pick({ symbol: typed })}
            className="w-full flex items-center justify-between px-3 py-3 text-left hover:bg-secondary transition-colors"
          >
            <span className="text-sm">
              Add <span className="font-num font-semibold">{typed}</span> anyway
            </span>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" /> Enter
            </span>
          </button>
        )}
        {!loading && !typed && results.length === 0 && (
          <div className="px-3 py-3 text-sm text-muted-foreground">Start typing a US or TSX ticker…</div>
        )}
      </div>
    </div>
  );
}
