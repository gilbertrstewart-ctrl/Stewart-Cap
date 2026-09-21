import React, { useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SymbolSearch from "@/components/SymbolSearch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AddHoldingDialog({ open, onOpenChange, onAdded }) {
  const [selected, setSelected] = useState(null);
  const [shares, setShares] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setSelected(null);
    setShares("");
    setAvgPrice("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return toast.error("Pick a stock first");
    setLoading(true);
    try {
      const { data } = await api.post("/portfolio", {
        symbol: selected.symbol,
        shares: parseFloat(shares),
        avg_price: parseFloat(avgPrice),
      });
      toast.success(`Added ${selected.symbol}`);
      onAdded(data);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add holding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md" data-testid="add-holding-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Add a holding</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <SymbolSearch onSelect={setSelected} selected={selected?.symbol} />
          {selected && (
            <div className="text-sm rounded-lg bg-primary/10 px-3 py-2 font-num">
              Selected: <span className="font-semibold">{selected.symbol}</span> @ {selected.price}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shares">Shares</Label>
              <Input id="shares" data-testid="holding-shares-input" type="number" step="any" min="0" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avg">Avg cost / share</Label>
              <Input id="avg" data-testid="holding-avgprice-input" type="number" step="any" min="0" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} placeholder="150.00" required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="holding-submit-btn">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Add to portfolio
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
