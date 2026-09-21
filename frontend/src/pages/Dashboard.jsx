import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useModals } from "@/context/ModalContext";
import AddHoldingDialog from "@/components/AddHoldingDialog";
import PortfolioChart from "@/components/PortfolioChart";
import DividendCard from "@/components/DividendCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, TrendingUp, Wallet, LineChart, Layers, Trash2, Sparkles, ArrowUpRight, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { fmtPct, fmtSigned, fmtPrice, trendColor } from "@/utils/format";
import { toast } from "sonner";

const COLORS = ["#1D4ED8", "#DC2626", "#60A5FA", "#F87171", "#0B2A6F", "#93C5FD", "#991B1B", "#3B82F6"];

export default function Dashboard() {
  const { user, openAuth } = useAuth();
  const { openStockDetail } = useModals();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [currency, setCurrency] = useState(() => localStorage.getItem("portfolio_ccy") || "CAD");
  useEffect(() => localStorage.setItem("portfolio_ccy", currency), [currency]);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.get("/portfolio").then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const remove = async (id, symbol) => {
    try {
      const { data } = await api.delete(`/portfolio/${id}`);
      setData(data);
      toast.success(`Removed ${symbol}`);
    } catch {
      toast.error("Failed to remove");
    }
  };

  if (!user) return <SignedOutHero openAuth={openAuth} />;

  const s = currency === "USD" ? data?.summary_usd : data?.summary_cad || data?.summary;
  const holdings = data?.holdings || [];
  const pie = holdings.map((h) => ({ name: h.symbol, value: currency === "USD" ? h.market_value_usd : h.market_value_cad }));
  const sym = currency === "USD" ? "US$" : "C$";
  const money = (n) => `${sym}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signed = (n) => `${Number(n) >= 0 ? "+" : "-"}${money(Math.abs(n))}`;

  return (
    <div data-testid="portfolio-tracker-section" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Portfolio</h1>
          <p className="text-muted-foreground mt-1">
            Your holdings, live P/L and allocation.
            {data?.fx && <span className="font-num text-xs"> · 1 US$ = C${data.fx.usd_cad}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5" data-testid="currency-toggle">
            {["CAD", "USD"].map((c) => (
              <button key={c} data-testid={`currency-${c}`} onClick={() => setCurrency(c)} className={`px-3 py-1.5 rounded-md text-xs font-num font-semibold transition-colors ${currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>{c}</button>
            ))}
          </div>
          <Button onClick={() => setAddOpen(true)} data-testid="add-holding-btn">
            <Plus className="w-4 h-4 mr-2" /> Add holding
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="h-64 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : holdings.length === 0 ? (
        <EmptyPortfolio onAdd={() => setAddOpen(true)} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard testid="stat-total-value" icon={Wallet} label={`Total Value (${currency})`} value={money(s.total_value)} />
            <StatCard testid="stat-total-gain" icon={TrendingUp} label="Total Gain / Loss"
              value={signed(s.total_gain)} sub={fmtPct(s.total_gain_percent)} tone={s.total_gain} />
            <StatCard testid="stat-day-change" icon={LineChart} label="Day Change"
              value={signed(s.day_change)} sub={fmtPct(s.day_change_percent)} tone={s.day_change} />
            <StatCard testid="stat-invested" icon={Layers} label={`Invested (${currency})`} value={money(s.total_cost)} />
          </div>

          <PortfolioChart refreshKey={holdings.map((h) => h.id).join(",")} currency={currency} />

          <DividendCard refreshKey={holdings.map((h) => h.id).join(",")} currency={currency} />


          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border font-heading font-semibold">Holdings</div>
              <div className="divide-y divide-border">
                {holdings.map((h) => (
                  <div key={h.id} data-testid={`holding-row-${h.symbol}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-secondary/40 transition-colors">
                    <button onClick={() => openStockDetail(h.symbol)} className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold">{h.symbol}</span>
                        <Badge variant="secondary" className="text-[9px]">{h.exchange}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground font-num">
                        {h.shares} sh · avg {fmtPrice(h.avg_price)}
                      </div>
                    </button>
                    <div className="text-right">
                      <div className="font-num font-semibold">{h.currency === "CAD" ? "C$" : "US$"}{fmtPrice(h.market_value)}</div>
                      <div className={`font-num text-xs ${trendColor(h.gain)}`}>
                        {fmtSigned(h.gain)} ({fmtPct(h.gain_percent)})
                      </div>
                      {h.currency !== currency && (
                        <div className="font-num text-[10px] text-muted-foreground" data-testid={`holding-converted-${h.symbol}`}>≈ {money(currency === "USD" ? h.market_value_usd : h.market_value_cad)}</div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-600" data-testid={`remove-holding-${h.symbol}`} onClick={() => remove(h.id, h.symbol)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="font-heading font-semibold mb-2">Allocation</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {pie.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#FFFFFF", border: "1px solid #BFD7F5", color: "#0B1F4D", borderRadius: 8, fontSize: 12 }}
                      formatter={(v, n) => [money(v), n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {pie.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      {p.name}
                    </span>
                    <span className="font-num text-muted-foreground">
                      {((p.value / s.total_value) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <AddHoldingDialog open={addOpen} onOpenChange={setAddOpen} onAdded={setData} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone, testid }) {
  return (
    <div data-testid={testid} className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className={`font-num text-2xl font-bold mt-2 ${tone != null ? trendColor(tone) : ""}`}>{value}</div>
      {sub != null && <div className={`font-num text-sm ${trendColor(tone)}`}>{sub}</div>}
    </div>
  );
}

function EmptyPortfolio({ onAdd }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 grid place-items-center text-center">
      <Layers className="w-10 h-10 text-muted-foreground mb-3" />
      <h3 className="font-heading font-semibold text-lg">No holdings yet</h3>
      <p className="text-muted-foreground text-sm mb-4 max-w-sm">Add your first position to start tracking live gains and allocation.</p>
      <Button onClick={onAdd} data-testid="empty-add-holding-btn"><Plus className="w-4 h-4 mr-2" /> Add holding</Button>
    </div>
  );
}

function SignedOutHero({ openAuth }) {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
        <img src="https://images.unsplash.com/photo-1648275913341-7973ae7bc9b3?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600" alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40" />
        <div className="relative px-6 sm:px-12 py-16 sm:py-24 max-w-2xl">
          <Badge className="bg-primary/15 text-primary border-0 mb-5 font-num">US · TSX · AI-POWERED</Badge>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Track markets.<br />Understand every move.
          </h1>
          <p className="text-muted-foreground text-lg mt-5 max-w-lg">
            A live investment dashboard for US & Canadian stocks — watchlists, 52-week movers, and AI that explains why a stock jumped or dropped 10%+.
          </p>
          <div className="flex gap-3 mt-8">
            <Button size="lg" onClick={() => openAuth("register")} data-testid="hero-get-started-btn">
              Get started free <ArrowUpRight className="w-4 h-4 ml-1.5" />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => openAuth("login")} data-testid="hero-signin-btn">
              Sign in
            </Button>
          </div>
        </div>
      </section>

      <div className="grid sm:grid-cols-3 gap-5">
        {[
          { icon: TrendingUp, title: "52-Week Movers Radar", desc: "Spot stocks at yearly highs, lows and big ±10% swings instantly." },
          { icon: Sparkles, title: "AI Cause Analysis", desc: "Claude explains likely catalysts behind dramatic price moves." },
          { icon: Wallet, title: "Portfolio & Watchlist", desc: "Track live P/L and curate the tickers that matter to you." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-6">
            <div className="w-10 h-10 rounded-lg bg-primary/15 grid place-items-center mb-4">
              <f.icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-heading font-semibold text-lg">{f.title}</h3>
            <p className="text-muted-foreground text-sm mt-1.5">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
