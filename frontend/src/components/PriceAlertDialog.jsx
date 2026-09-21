import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Trash2, ArrowUp, ArrowDown, CheckCircle2 } from "lucide-react";
import { fmtPrice } from "@/utils/format";
import { toast } from "sonner";

export default function PriceAlertDialog({ quote, onClose, onChanged }) {
  const [alerts, setAlerts] = useState([]);
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState("above");
  const [kind, setKind] = useState("price");
  const [saving, setSaving] = useState(false);
  const open = !!quote;

  useEffect(() => {
    if (!quote) return;
    setTarget("");
    setDirection("above");
    setKind("price");
    api.get("/alerts").then((r) => setAlerts(r.data.alerts)).catch(() => {});
  }, [quote]);

  const mine = alerts.filter((a) => a.symbol === quote?.symbol);

  const save = async (e) => {
    e.preventDefault();
    const t = parseFloat(target);
    if (!t || t <= 0) return toast.error(kind === "pct" ? "Enter a percent, e.g. 5" : "Enter a valid target price");
    setSaving(true);
    try {
      const { data } = await api.post("/alerts", { symbol: quote.symbol, target: t, direction, kind });
      setAlerts(data.alerts);
      setTarget("");
      toast.success(kind === "pct" ? `Alert set: ${quote.symbol} ${direction === "above" ? "up" : "down"} ${t}%+ in a day` : `Alert set: ${quote.symbol} ${direction} $${t.toFixed(2)}`);
      onChanged?.(data.alerts);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to set alert");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      const { data } = await api.delete(`/alerts/${id}`);
      setAlerts(data.alerts);
      onChanged?.(data.alerts);
    } catch {
      toast.error("Failed to remove alert");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="price-alert-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Bell className="w-5 h-5 text-red-600" /> Price alert · {quote?.symbol}
          </DialogTitle>
        </DialogHeader>
        {quote && (
          <>
            <p className="text-sm text-muted-foreground -mt-2">
              Current price <span className="font-num font-semibold text-foreground">${fmtPrice(quote.price)}</span>. We'll email you the moment it crosses your target.
            </p>
            <form onSubmit={save} className="space-y-3">
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {[["price", "Target price"], ["pct", "% move today"]].map(([k, l]) => (
                  <button key={k} type="button" data-testid={`alert-kind-${k}`} onClick={() => { setKind(k); setTarget(""); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>{l}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["above", "below"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    data-testid={`alert-direction-${d}`}
                    onClick={() => setDirection(d)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      direction === d ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    {d === "above" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                    {kind === "pct" ? (d === "above" ? "Jumps more than" : "Drops more than") : d === "above" ? "Rises above" : "Falls below"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  data-testid="alert-target-input"
                  type="number"
                  step={kind === "pct" ? "0.5" : "0.01"}
                  min="0"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={kind === "pct" ? "Percent, e.g. 5" : `Target price e.g. ${fmtPrice(quote.price * (direction === "above" ? 1.05 : 0.95))}`}
                  className="font-num"
                />
                <Button type="submit" disabled={saving} data-testid="alert-save-btn">Set alert</Button>
              </div>
            </form>
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-num">Your alerts for {quote.symbol}</div>
              {mine.length === 0 && <p className="text-sm text-muted-foreground" data-testid="alert-empty">No alerts yet.</p>}
              {mine.map((a) => (
                <div key={a.id} data-testid={`alert-row-${a.id}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {a.triggered_at ? <CheckCircle2 className="w-4 h-4 text-blue-700" /> : a.direction === "above" ? <ArrowUp className="w-4 h-4 text-blue-700" /> : <ArrowDown className="w-4 h-4 text-red-600" />}
                    <span>
                      {a.kind === "pct"
                        ? <>{a.direction === "above" ? "Up" : "Down"} <span className="font-num font-semibold">{a.target}%+</span> in a day</>
                        : <>{a.direction === "above" ? "Above" : "Below"} <span className="font-num font-semibold">${fmtPrice(a.target)}</span></>}
                      {a.triggered_at && <span className="text-xs text-muted-foreground"> · fired at ${fmtPrice(a.triggered_price)}</span>}
                    </span>
                  </div>
                  <button data-testid={`alert-delete-${a.id}`} onClick={() => remove(a.id)} className="text-muted-foreground hover:text-red-600 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
