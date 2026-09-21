import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useModals } from "@/context/ModalContext";
import StockCard from "@/components/StockCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Flame, Sparkles, Loader2, TrendingUp, TrendingDown, Bell } from "lucide-react";
import { fmtPct } from "@/utils/format";

export default function MoversPage() {
  const { openStockDetail, openAiAnalysis } = useModals();
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => api.get("/market/movers").then((r) => setData(r.data)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div data-testid="market-movers-section" className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Market Movers Radar</h1>
        <p className="text-muted-foreground mt-1">52-week highs & lows and dramatic ±10% moves across US & TSX.</p>
      </div>

      {!data ? (
        <div className="h-64 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue="big" className="w-full">
          <TabsList data-testid="movers-tabs" className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="big" data-testid="tab-big-movers">
              <Flame className="w-4 h-4 mr-1.5" /> Big Movers
              <Badge variant="secondary" className="ml-2 text-[10px]">{data.big_movers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="high" data-testid="tab-52w-high">
              <ArrowUp className="w-4 h-4 mr-1.5" /> Near 52W High
              <Badge variant="secondary" className="ml-2 text-[10px]">{data.near_high.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="low" data-testid="tab-52w-low">
              <ArrowDown className="w-4 h-4 mr-1.5" /> Near 52W Low
              <Badge variant="secondary" className="ml-2 text-[10px]">{data.near_low.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="big" className="mt-5">
            <p className="text-sm text-muted-foreground mb-4">Stocks that moved more than 10% today — tap <span className="text-amber-400">AI analysis</span> to understand the cause.</p>
            {data.big_movers.length === 0 && (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                No stocks are up or down more than 10% right now. This list fills up when the market gets volatile.
              </div>
            )}
            <Grid>
              {data.big_movers.map((q) => (
                <StockCard
                  key={q.symbol}
                  quote={q}
                  testid={`big-mover-${q.symbol}`}
                  onOpen={() => openStockDetail(q.symbol)}
                  right={
                    <Badge className={`border-0 ${q.direction === "up" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                      {q.direction === "up" ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                      {q.direction === "up" ? "Surging" : "Plunging"}
                    </Badge>
                  }
                  footer={
                    <button
                      data-testid={`analyze-${q.symbol}`}
                      onClick={(e) => { e.stopPropagation(); openAiAnalysis(q.symbol); }}
                      className="w-full mt-3 flex items-center justify-center gap-1.5 text-sm font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg py-2 transition-colors"
                    >
                      <Sparkles className="w-4 h-4" /> AI Cause Analysis
                    </button>
                  }
                />
              ))}
            </Grid>
          </TabsContent>

          <TabsContent value="high" className="mt-5">
            <p className="text-sm text-muted-foreground mb-4">Alert: stocks trading within 10% of their 52-week high — potential breakouts to watch.</p>
            <Grid>
              {data.near_high.map((q) => (
                <StockCard key={q.symbol} quote={q} testid={`high-mover-${q.symbol}`} onOpen={() => openStockDetail(q.symbol)}
                  right={
                    <Badge className={`border-0 ${q.at_high ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-500/10 text-emerald-400"}`}>
                      <Bell className="w-3 h-3 mr-1" /> {q.at_high ? "At high" : `${q.pct_from_high}%`}
                    </Badge>
                  }
                  footer={<Footer label="Below 52W high" value={`${q.pct_from_high}%`} />} />
              ))}
            </Grid>
          </TabsContent>

          <TabsContent value="low" className="mt-5">
            <p className="text-sm text-muted-foreground mb-4">Stocks trading within 10% of their 52-week low.</p>
            <Grid>
              {data.near_low.map((q) => (
                <StockCard key={q.symbol} quote={q} testid={`low-mover-${q.symbol}`} onOpen={() => openStockDetail(q.symbol)}
                  right={<Badge className="border-0 bg-rose-500/10 text-rose-400"><ArrowDown className="w-3 h-3 mr-1" /> {q.pct_from_low}%</Badge>}
                  footer={<Footer label="Above 52W low" value={`${q.pct_from_low}%`} />} />
              ))}
            </Grid>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

const Grid = ({ children }) => <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{children}</div>;

const Footer = ({ label, value }) => (
  <div className="mt-3 flex items-center justify-between text-xs font-num text-muted-foreground border-t border-border pt-2.5">
    <span className="uppercase tracking-wider">{label}</span>
    <span className="text-foreground">{value}</span>
  </div>
);
