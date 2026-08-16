export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? "http://localhost:2567";
export const WS_URL = SERVER_URL.replace(/^http/, "ws");

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Big figures — market caps, valuations — read as $27.3M, the way a terminal
// shows them. Exact dollars are for prices and balances, not for a number in
// the tens of millions.
export const fmtCap = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${Math.round(n / 1_000)}K`;
  return fmtMoney(n);
};

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
