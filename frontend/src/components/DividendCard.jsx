import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Coins, Loader2, CalendarDays } from "lucide-react";
import { fmtPrice } from "@/utils/format";

const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const money = (n, cur) => `${cur === "CAD" ? "C$" : "US$"}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DividendCard({ refreshKey, currency = "CAD" }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get("/portfolio/dividends").then((r) => setData(r.data)).catch(() => setData({ holdings: [] }));
  }, [refreshKey]);

  const payers = (data?.holdings || []).filter((h) => h.pays);
  const upcoming = payers.filter((h) => h.upcoming);
  const total = currency === "CAD" ? data?.total_annual_cad : data?.total_annual_usd;

  return (
    <div data-testid="dividend-card" className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="font-heading font-semibold flex items-center gap-2"><Coins className="w-4 h-4 text-green-600" /> Dividends</div>
        {data && payers.length > 0 && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-num">Projected yearly income</div>
            <div className="font-num font-bold text-green-600" data-testid="dividend-total">{money(total, currency)} <span className="text-xs text-muted-foreground font-normal">· {money(total / 12, currency)}/mo</span></div>
          </div>
        )}
      </div>
      {!data ? (
        <div className="h-24 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : payers.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground" data-testid="dividend-empty">None of your holdings currently pay a dividend.</p>
      ) : (
        <div className="divide-y divide-border">
          {upcoming.length > 0 && (
            <div className="px-5 py-2 bg-green-600/5 text-[11px] uppercase tracking-wider text-green-700 font-num flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Upcoming payouts</div>
          )}
          {payers.map((h) => (
            <div key={h.symbol} data-testid={`dividend-row-${h.symbol}`} className="px-5 py-3 flex items-center gap-3">
              <div className="w-28 shrink-0">
                <div className="flex items-center gap-1.5"><span className="font-heading font-bold text-sm">{h.symbol}</span>{h.upcoming && <Badge className="border-0 bg-green-600/15 text-green-700 text-[9px]">Upcoming</Badge>}</div>
                <div className="text-[11px] text-muted-foreground font-num">{h.shares} sh · {h.dividend_yield}% yield</div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2 text-xs font-num">
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ex-div</div><div>{fmtDate(h.ex_date)}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pay date</div><div>{fmtDate(h.pay_date)}</div></div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-num font-semibold text-sm">{money(h.annual_income, h.currency)}<span className="text-[10px] text-muted-foreground">/yr</span></div>
                <div className="text-[11px] text-muted-foreground font-num">{fmtPrice(h.dividend_rate)} {h.currency}/sh</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
