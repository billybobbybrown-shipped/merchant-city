// Pure economic-statistics math. Every dashboard number is computed from
// recorded data (trades, ledger, inventories) — these helpers are the math,
// the server's stats service is the plumbing.

export interface TradeRow {
  price: number;
  qty: number;
}

export function vwap(trades: TradeRow[]): number | null {
  let notional = 0;
  let vol = 0;
  for (const t of trades) {
    notional += t.price * t.qty;
    vol += t.qty;
  }
  return vol > 0 ? Math.round((notional / vol) * 100) / 100 : null;
}

export function realizedRange(trades: TradeRow[]): { high: number; low: number } | null {
  if (!trades.length) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const t of trades) {
    if (t.price > high) high = t.price;
    if (t.price < low) low = t.price;
  }
  return { high, low };
}

// CPI: a fixed consumer basket priced from actual retail transactions,
// indexed to 100 at reference prices. Items with no trades fall back to the
// reference price (no data ≠ deflation).
export function cpi(
  basket: Record<string, number>, // item -> weight
  observed: Record<string, number>, // item -> avg transacted price this period
  reference: Record<string, number> // item -> base-period price
): number {
  let num = 0;
  let den = 0;
  for (const [item, weight] of Object.entries(basket)) {
    const base = reference[item];
    if (!base) continue;
    num += weight * (observed[item] ?? base);
    den += weight * base;
  }
  return den > 0 ? Math.round((num / den) * 1000) / 10 : 100;
}

// cap-weighted index: sum of market caps over a fixed divisor so the series
// is comparable across days; divisor is set once at inception (index = 100)
export function capWeightedIndex(
  members: Array<{ last: number | null; shares: number }>,
  divisor: number
): number | null {
  let cap = 0;
  let priced = 0;
  for (const m of members) {
    if (m.last === null) continue;
    cap += m.last * m.shares;
    priced++;
  }
  if (!priced || divisor <= 0) return null;
  return Math.round((cap / divisor) * 100) / 100;
}

export function indexDivisor(members: Array<{ last: number | null; shares: number }>, baseValue = 100): number {
  let cap = 0;
  for (const m of members) if (m.last !== null) cap += m.last * m.shares;
  return cap > 0 ? cap / baseValue : 1;
}

// GDP for a period from categorized ledger rows: final goods & services only
// — retail sales, rents, wages, construction/production spend. Transfers,
// asset trades, fees and the criminal categories are NOT production.
const GDP_CATEGORIES = new Set(["retail_sale", "rent", "wage", "construction", "production_setup"]);

export function gdpFromLedger(rows: Array<{ category: string; amount: number; currency?: string }>): {
  total: number;
  bySector: Record<string, number>;
} {
  const bySector: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    if (r.currency && r.currency !== "clean") continue; // the shadow economy stays off the books
    if (!GDP_CATEGORIES.has(r.category)) continue;
    bySector[r.category] = (bySector[r.category] ?? 0) + r.amount;
    total += r.amount;
  }
  return { total: Math.round(total * 100) / 100, bySector };
}

// the standard consumer basket
export const CPI_BASKET: Record<string, number> = { bread: 4, shirt: 2, beer: 2, phone: 1 };
