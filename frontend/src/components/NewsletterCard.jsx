import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

export default function NewsletterCard() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [sending, setSending] = useState(false);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (user) api.get("/newsletter/preview").then((r) => setInfo(r.data)).catch(() => {});
  }, [user]);

  if (!user || !info) return null;

  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/newsletter/send");
      toast.success(isAdmin ? `Newsletter sent to ${data.sent} subscriber${data.sent === 1 ? "" : "s"}` : "Newsletter sent to your inbox");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send newsletter");
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="newsletter-card" className="rounded-xl border border-border bg-card px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-red-600/10 grid place-items-center shrink-0"><Mail className="w-5 h-5 text-red-600" /></div>
      <div className="flex-1 min-w-0">
        <div className="font-heading font-semibold">Weekly newsletter</div>
        <p className="text-sm text-muted-foreground">
          Every Friday 8:00 AM ET, digest subscribers get the week's new articles.
          <span className="font-num"> · {info.articles.length} new this week{isAdmin ? ` · ${info.subscribers} subscriber${info.subscribers === 1 ? "" : "s"}` : ""}</span>
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={send} disabled={sending || !info.articles.length} data-testid="newsletter-send-btn">
        {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} {isAdmin ? "Send to subscribers now" : "Email me this week's"}
      </Button>
    </div>
  );
}
