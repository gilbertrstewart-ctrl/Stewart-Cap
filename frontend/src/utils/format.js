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
export const trendColor = (n) => (Number(n) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400");
export const trendBg = (n) => (Number(n) >= 0 ? "bg-green-600/10" : "bg-red-600/10");
export const trendHex = (n) => (Number(n) >= 0 ? "#16A34A" : "#DC2626");
export const tapeTrendColor = (n) => (Number(n) >= 0 ? "text-green-400" : "text-red-500");
