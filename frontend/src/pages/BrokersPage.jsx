import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ShieldCheck, Building2, Loader2 } from "lucide-react";

export default function BrokersPage() {
  const [brokers, setBrokers] = useState(null);

  useEffect(() => {
    api.get("/brokers").then((r) => setBrokers(r.data.brokers)).catch(() => {});
  }, []);

  return (
    <div data-testid="broker-gateway-section" className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Broker Gateway</h1>
        <p className="text-muted-foreground mt-1">Jump straight to major Canadian & US brokers and banks to place your trades.</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 w-fit">
        <ShieldCheck className="w-4 h-4 text-blue-700" />
        Links open the broker's official site in a new tab. ApexTicker never handles your credentials.
      </div>

      {!brokers ? (
        <div className="h-64 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brokers.map((b) => (
            <a
              key={b.name}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`broker-card-${b.name.replace(/[^a-zA-Z]/g, "")}`}
              className="group rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:bg-secondary transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-lg bg-primary/15 grid place-items-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <h3 className="font-heading font-bold text-lg">{b.name}</h3>
                <Badge variant="secondary" className="text-[9px] font-num">{b.country}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">{b.blurb}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {b.tags.map((t) => (
                  <span key={t} className="text-[10px] font-medium px-2 py-1 rounded-md bg-secondary text-muted-foreground">{t}</span>
                ))}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
