import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Mail, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export default function DigestCard() {
  const [settings, setSettings] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/digest/settings").then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  const toggle = async (enabled) => {
    try {
      const { data } = await api.put("/digest/settings", { enabled });
      setSettings(data);
      toast.success(enabled ? "Daily digest on — arrives weekdays at 8:00 AM ET" : "Daily digest off");
    } catch {
      toast.error("Could not update digest setting");
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      await api.post("/digest/send");
      toast.success("Digest sent — check your inbox");
      setSettings((s) => ({ ...s, last_sent: new Date().toISOString() }));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not send digest");
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="digest-card" className="rounded-xl border border-border bg-card px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
        <Mail className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-heading font-semibold">Morning digest email</div>
        <p className="text-sm text-muted-foreground">
          Weekdays at 8:00 AM ET: your watchlist movers, near-52W-high alerts and market-wide dramatic moves.
          {settings?.last_sent && <span className="font-num"> · Last sent {new Date(settings.last_sent).toLocaleString()}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Switch
          data-testid="digest-toggle"
          checked={!!settings?.enabled}
          onCheckedChange={toggle}
          disabled={!settings}
        />
        <Button variant="secondary" size="sm" onClick={sendNow} disabled={sending} data-testid="digest-send-now-btn">
          {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Send now
        </Button>
      </div>
    </div>
  );
}
