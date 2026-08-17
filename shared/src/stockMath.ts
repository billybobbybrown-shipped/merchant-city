// Pure stock-market rules: IPO gating, valuation bounds, dividends, control,
// circuit breakers. The server enforces these; tests cover them directly.

export const IPO_MIN_AGE_DAYS = 7; // real days since company registration
export const IPO_MIN_REVENUE_7D = 50_000;
export const IPO_MIN_BUILDINGS = 2;
export const IPO_MIN_EMPLOYEES = 5;
export const IPO_AUDIT_FEE = 2_500;
export const IPO_FLOAT_MIN = 0.25;
export const IPO_FLOAT_MAX = 0.75;
export const STOCK_FEE_RATE = 0.005;
export const CIRCUIT_BAND = 0.3; // ±30% of prev close per day

export interface IpoStats {
  ageDays: number;
  revenue7d: number;
  profit7d: number;
  buildings: number;
  employees: number;
}

export function ipoEligible(s: IpoStats): string | null {
  if (s.ageDays < IPO_MIN_AGE_DAYS) return `company must be ${IPO_MIN_AGE_DAYS}+ days old`;
  if (s.revenue7d < IPO_MIN_REVENUE_7D) return `needs $${IPO_MIN_REVENUE_7D.toLocaleString()} trailing 7-day revenue`;
  if (s.profit7d <= 0) return "must be profitable over the trailing 7 days";
  if (s.buildings < IPO_MIN_BUILDINGS && s.employees < IPO_MIN_EMPLOYEES)
    return `needs ${IPO_MIN_BUILDINGS}+ buildings or ${IPO_MIN_EMPLOYEES}+ employees`;
  return null;
}

// IPO price must sit inside a valuation band from real tracked earnings:
// annualized 7-day profit x 8..30 P/E, spread over shares outstanding.
export function ipoPriceBand(profit7d: number, sharesOutstanding: number): { min: number; max: number } {
  const annual = (profit7d / 7) * 365;
  const lo = (annual * 8) / sharesOutstanding;
  const hi = (annual * 30) / sharesOutstanding;
  return { min: Math.max(0.01, Math.round(lo * 100) / 100), max: Math.max(0.02, Math.round(hi * 100) / 100) };
}

export function floatValid(pct: number): boolean {
  return pct >= IPO_FLOAT_MIN && pct <= IPO_FLOAT_MAX;
}

// Dividends are a DECLARED policy sized like the real thing: the ratio is a
// TARGET ANNUAL YIELD on the share price (income names run 1-7%; growth names
// pay nothing), paid in weekly installments — 52 periods to a game year. Like
// a real board the rate moves gradually, at most ±25% per period, and the
// payout pool never exceeds 5% of cash on hand per period, so a dividend can
// run for years off retained earnings but can't bleed a company dry. Per-share
// rate keeps 6 decimals — flooring sub-penny rates at 4 shaved a low-yield
// name visibly under its target — and each holder's total rounds to cents.
export const DIVIDEND_PERIOD_DAYS = 7;
export const DIVIDEND_PERIODS_PER_YEAR = 52;
export function declaredDps(
  yieldAnnual: number,
  price: number,
  prevDps: number,
  cash: number,
  sharesOutstanding: number
): number {
  if (sharesOutstanding <= 0 || yieldAnnual <= 0 || price <= 0) return 0;
  const target = (price * yieldAnnual) / DIVIDEND_PERIODS_PER_YEAR;
  let dps =
    prevDps > 0 ? Math.min(Math.max(target, prevDps * 0.75), prevDps * 1.25) : target;
  const pool = Math.min(dps * sharesOutstanding, Math.max(0, cash) * 0.05);
  dps = pool / sharesOutstanding;
  return Math.round(dps * 1_000_000) / 1_000_000;
}

// >50% of shares outstanding controls a listed company (hostile takeovers
// included); null when nobody holds a majority
export function majorityHolder(holdings: Array<{ holder: number; shares: number }>, sharesOutstanding: number): number | null {
  for (const h of holdings) if (h.shares * 2 > sharesOutstanding) return h.holder;
  return null;
}

// allowed order-price band for the day; unset prev close = free float (IPO day)
export function circuitBand(prevClose: number | null): { min: number; max: number } | null {
  if (prevClose === null || !(prevClose > 0)) return null;
  return {
    min: Math.round(prevClose * (1 - CIRCUIT_BAND) * 100) / 100,
    max: Math.round(prevClose * (1 + CIRCUIT_BAND) * 100) / 100,
  };
}
