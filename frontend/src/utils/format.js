export const fmtPrice = (n) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtCurrency = (n) =>
  n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPct = (n) => {
  if (n == null) return "—";
  const v = Number(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
};

export const fmtSigned = (n) => {
  if (n == null) return "—";
  const v = Number(n);
  return `${v >= 0 ? "+" : "-"}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtMarketCap = (b) => {
  if (b == null || b === 0) return "—";
  if (b >= 1000) return `$${(b / 1000).toFixed(2)}T`;
  return `$${b.toFixed(0)}B`;
};

export const fmtVolume = (m) => (m == null ? "—" : `${Number(m).toFixed(1)}M`);

// green when positive, red when negative
export const trendColor = (n) => (Number(n) >= 0 ? "text-emerald-400" : "text-rose-400");
export const trendBg = (n) => (Number(n) >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10");
export const trendHex = (n) => (Number(n) >= 0 ? "#10B981" : "#F43F5E");
