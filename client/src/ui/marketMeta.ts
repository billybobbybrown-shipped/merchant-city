// Static market metadata: ticker symbols, sector tags and business blurbs
// for the listed names, and network blurbs for the coins. Display-only —
// every number on the terminals still comes from the live books.

export interface StockMeta {
  sym: string;
  sector: string;
  desc: string;
}

const STOCK_META: Record<string, StockMeta> = {
  "Atlas Provisions": {
    sym: "ATLS",
    sector: "Consumer",
    desc: "The city's largest bakery chain. Buys wheat on the exchange, mills flour and bakes bread at its own ovens, and sells it over the counter. A steady staples business run for income.",
  },
  "Consolidated Bakeries": {
    sym: "CBK",
    sector: "Consumer",
    desc: "Atlas's leaner competitor — the same wheat-to-bread chain at mid scale, fighting for the same shoppers with a smaller machine floor and a tighter payroll.",
  },
  "Harbor Retail Group": {
    sym: "HRB",
    sector: "Retail",
    desc: "A large clothing retailer that owns its supply chain: cotton bought wholesale, fabric woven on its own looms, shirts sewn and sold in-store.",
  },
  "Meridian Textiles": {
    sym: "MRD",
    sector: "Retail",
    desc: "Mid-size textile maker running the cotton-to-shirt chain with less overhead than Harbor. What it lacks in scale it keeps in margin.",
  },
  "Vesper Electronics": {
    sym: "VSP",
    sector: "Technology",
    desc: "The deepest production chain in the city: stone and ore smelted to iron, silicon grown, wiring, capacitors and transistors assembled into circuit boards, boards into phones. Everything is reinvested — the classic growth bet.",
  },
  "Crestfield Spirits": {
    sym: "CRS",
    sector: "Vice",
    desc: "A licensed brewery. Wheat in, beer out, liquor permit renewed from company funds. Small, steady and shareholder-friendly.",
  },
  "Bluebird Tobacco Co": {
    sym: "BLU",
    sector: "Vice",
    desc: "Tobacco house — leaf bought at market, cured in its own barns, rolled into cigarettes under a tobacco permit. Pays the fattest dividend on the board, like tobacco names always have.",
  },
  "Ironline Provisions": {
    sym: "IRN",
    sector: "Retail",
    desc: "A no-frills grocer: buys produce wholesale off the exchange and shelves it the same day. No factory, no dividend — just turnover.",
  },
  "Nordvik Mining Systems": {
    sym: "NVK",
    sector: "Industrials",
    desc: "The supply side of the crypto industry. Buys iron and stone, fabricates rig components — processors, power units, cooling — at its electronics benches and sells them on the exchange to every miner in the city.",
  },
  "HashWorks Mining": {
    sym: "HSH",
    sector: "Mining",
    desc: "An industrial crypto miner. Buys Nordvik's components, runs racks around the clock, earns coin emissions by hashpower and sells coin only when it has a reason: bills due, or a price it likes. Pure coin exposure with operating leverage.",
  },
};

export const stockMeta = (name: string): StockMeta =>
  STOCK_META[name] ?? { sym: name.replace(/[^A-Z]/g, "").slice(0, 4) || name.slice(0, 4).toUpperCase(), sector: "Listed", desc: "" };

export const COIN_DESC: Record<string, string> = {
  duc: "The original coin — the scarcest float and the heaviest slice of citizen savings. Slow emissions make it the store-of-value trade.",
  obl: "The middle coin: five times Ducat's float, faster emissions, a lighter savings share. Cheaper per coin, livelier per day.",
  tid: "The spending coin — abundant, cheap and quick. The widest float in the city and the one that changes hands the most.",
};

// tape print coloring: price vs the print before it
export const tapeTone = (px: number, prevPx: number | undefined): string =>
  prevPx === undefined || px === prevPx ? "" : px > prevPx ? "mkt-up" : "mkt-down";
