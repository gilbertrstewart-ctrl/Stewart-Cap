import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Loader2 } from "lucide-react";
import { fmtPct, trendColor, trendHex } from "@/utils/format";

const money = (n, c) => `${c === "USD" ? "US$" : "C$"}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RANGES = ["1W", "1M", "3M", "1Y"];

export default function PortfolioChart({ refreshKey, currency = "CAD" }) {
  const [range, setRange] = useState("1M");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/portfolio/history", { params: { range, currency } }).then((r) => setData(r.data)).catch(() => setData({ points: [] })).finally(() => setLoading(false));
  }, [range, refreshKey, currency]);

  const pts = data?.points || [];
  const first = pts[0]?.value, last = pts[pts.length - 1]?.value;
  const change = first && last ? last - first : 0;
  const changePct = first ? (change / first) * 100 : 0;

  return (
    <div data-testid="portfolio-chart" className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-heading font-semibold">Portfolio value <span className="text-xs font-num text-muted-foreground">({currency})</span></div>
          {pts.length > 1 && (
            <div className={`font-num text-sm ${trendColor(change)}`} data-testid="portfolio-chart-change">
              {change >= 0 ? "+" : "-"}{money(Math.abs(change), currency)} ({fmtPct(changePct)}) over {range}
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r} data-testid={`portfolio-range-${r}`} onClick={() => setRange(r)} className={`px-3 py-1 rounded-md text-xs font-num font-semibold transition-colors ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>{r}</button>
          ))}
        </div>
      </div>
      <div className="h-64 sm:h-72 p-2">
        {loading && !pts.length ? (
          <div className="h-full grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : pts.length < 2 ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">Not enough history yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pts} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trendHex(change)} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={trendHex(change)} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis domain={["auto", "auto"]} hide />
              {data?.invested && <ReferenceLine y={data.invested} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "Invested", position: "insideTopLeft", fontSize: 10, fill: "#64748b" }} />}
              <Tooltip
                contentStyle={{ background: "#FFFFFF", border: "1px solid #BFD7F5", color: "#0B1F4D", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l) => l}
                formatter={(v) => [money(v, currency), "Value"]}
              />
              <Area type="monotone" dataKey="value" stroke={trendHex(change)} strokeWidth={2} fill="url(#pv)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
