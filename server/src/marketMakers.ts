import { BASE_PRICE, furnitureById } from "@mc/shared";
import { pool } from "./db.js";
import { registry } from "./registry.js";
import { StocksStore, stockKey } from "./stocks.js";
import { CryptoStore } from "./crypto.js";
import { COINS } from "@mc/shared";
import { CITY_ENTITY } from "./accounts.js";

const WORLD_ID = 1;
const COIN_MONETARY_SHARE = 0.25; // share of citizen money the coin float represents

// ---------------------------------------------------------------------------
// The market, reworked around one idea: every asset has a continuous MARK — a
// live price that breathes every tick whether or not anyone trades. Everything
// hangs off it:
//
//   · the mark evolves by mean-reversion toward fair value, a persistent mood
//     (so trends form and fade), noise, and pressure from PLAYER order flow —
//     buying pushes it up, selling pushes it down, with real weight
//   · a tight LADDER of resting orders is maintained around the mark (three
//     levels a side), so the spread is always narrow, a market order always
//     fills near the price on screen, and size walks the book for honest
//     slippage
//   · every mark is recorded, so candles exist at every timeframe with real
//     open/high/low/close through quiet periods — charts move like markets
//
// Quotes and takers are real citizens settling through the real order book, so
// every fill still moves actual money and actual holdings.
// ---------------------------------------------------------------------------

const TICK_NOISE = 0.006; // per-tick random component (~0.6%)
const MOOD_STEP = 0.35; // how fast mood wanders
const MOOD_DECAY = 0.94; // how fast trends fade
const REVERT = 0.012; // pull toward fair value per unit of stretch
const FLOW_PUSH = 0.05; // mark impact per (player net flow / resting depth)
const LADDER = [0.004, 0.01, 0.018]; // half-spread of each quote level
// The city treasury runs a dealer desk: a standing institutional bid under
// every market (recycling fees back into citizen pockets when they sell), and
// offers from whatever inventory those purchases accumulate. This is where
// DEPTH comes from — citizens add colour, the desk absorbs size.
const DESK_RESERVE = 60_000; // treasury never bids below this cushion
const DESK_TICK_BUDGET = 0.04; // share of free treasury committed per tick per asset
const QUOTE_TTL_MIN = 2; // maker quotes are refreshed, not left to rot

interface MarkState {
  mark: number;
  mood: number;
}

export class MarketMakers {
  constructor(
    private stocks: StocksStore,
    private crypto: CryptoStore
  ) {}

  private ticking = false;
  private state = new Map<string, MarkState>(); // "stock:s:12" / "coin:duc"

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.expireStaleNpcOrders();
      await this.makeStocks();
      for (const c of COINS) await this.makeCoin(c.code);
      await this.pruneMarks();
    } catch (err) {
      console.error("[mm] tick failed", err);
    } finally {
      this.ticking = false;
    }
  }

  // a maker keeps ONE working quote per asset and side — the previous one is
  // pulled (escrow refunded) before the new one goes on, so no entity ever
  // hits its order cap and no stale price lingers as the best quote
  private async requote(
    kind: "stock" | "coin",
    eid: number,
    item: string,
    side: "buy" | "sell"
  ): Promise<void> {
    const old = await pool.query(
      `select id from orders where world_id = $1 and owner_entity = $2 and asset_type = $3
         and item = $4 and side = $5`,
      [WORLD_ID, eid, kind, item, side]
    );
    for (const row of old.rows) {
      if (kind === "stock") await this.stocks.cancel(eid, Number(row.id)).catch(() => {});
      else await this.crypto.cancel(eid, Number(row.id)).catch(() => {});
    }
  }

  // ---- shared machinery ---------------------------------------------------

  private async recordMark(assetType: string, item: string, price: number): Promise<void> {
    await pool.query(
      "insert into price_marks (world_id, asset_type, item, price) values ($1,$2,$3,$4)",
      [WORLD_ID, assetType, item, price]
    );
  }

  private pruneCounter = 0;
  private async pruneMarks(): Promise<void> {
    if (++this.pruneCounter % 60 !== 0) return; // every ~10 minutes
    await pool.query("delete from price_marks where ts < now() - interval '7 days'");
  }

  // net player taker flow since the last tick, as a fraction of resting depth:
  // players trading with size are supposed to MOVE markets
  private async playerFlow(assetType: string, item: string, sinceSec: number): Promise<number> {
    const r = await pool.query(
      `select
         coalesce(sum(case when eb.kind = 'player' then t.qty else 0 end), 0) as bought,
         coalesce(sum(case when es.kind = 'player' then t.qty else 0 end), 0) as sold
       from trades t
       left join entities eb on eb.id = t.buyer_entity
       left join entities es on es.id = t.seller_entity
       where t.world_id = $1 and t.asset_type = $2 and t.item = $3
         and t.ts > now() - make_interval(secs => $4)`,
      [WORLD_ID, assetType, item, sinceSec]
    );
    const net = Number(r.rows[0].bought) - Number(r.rows[0].sold);
    if (net === 0) return 0;
    const depth = await pool.query(
      `select coalesce(sum(qty), 1) as q from orders
        where world_id = $1 and asset_type = $2 and item = $3`,
      [WORLD_ID, assetType, item]
    );
    return net / Math.max(1, Number(depth.rows[0].q));
  }

  // one step of the mark's life: trend + noise + gravity + player pressure
  private evolveMark(key: string, prev: number | null, fair: number | null, flow: number): number {
    const st = this.state.get(key) ?? { mark: prev ?? fair ?? 1, mood: 0 };
    if (prev !== null && !this.state.has(key)) st.mark = prev;
    let mood = st.mood * MOOD_DECAY + (Math.random() - 0.5) * MOOD_STEP;
    let revert = 0;
    if (fair !== null && fair > 0) {
      const stretch = (st.mark - fair) / fair;
      // gravity grows with the stretch: drift is cheap, absurdity is not
      revert = -Math.max(-0.05, Math.min(0.05, stretch * REVERT * (1 + Math.abs(stretch))));
      mood -= Math.max(-0.3, Math.min(0.3, stretch * 0.1));
    }
    mood = Math.max(-1, Math.min(1, mood));
    const drift = mood * 0.0035 + (Math.random() - 0.5) * TICK_NOISE + revert + Math.max(-0.04, Math.min(0.04, flow * FLOW_PUSH));
    st.mark = Math.max(0.01, st.mark * (1 + drift));
    st.mood = mood;
    this.state.set(key, st);
    return st.mark;
  }

  // volume-weighted average over the recent window; robust to paint prints
  private async vwap(assetType: string, key: string, minutes: number): Promise<number | null> {
    const r = await pool.query(
      `select sum(price * qty) / nullif(sum(qty), 0) as v from trades
        where world_id = $1 and asset_type = $2 and item = $3
          and ts > now() - make_interval(mins => $4)`,
      [WORLD_ID, assetType, key, minutes]
    );
    return r.rows[0]?.v !== null && r.rows[0]?.v !== undefined ? Number(r.rows[0].v) : null;
  }

  // What a share is actually worth: the company's assets plus a multiple on
  // its recent OPERATING earnings. Capital spending is an asset swap, not a
  // loss — counting a machine-buying spree as negative earnings, annualized
  // off a 30-minute window, cratered fair value to its floor and marched
  // half the board into the circuit breaker. Operating categories only, a
  // 3-hour window (18 game days) so one bad hour can't move the needle far,
  // and clamps that keep valuation tethered to the balance sheet.
  private async stockFairValue(companyEid: number, shares: number): Promise<number | null> {
    const r = await pool.query(
      `select
         (select coalesce(balance, 0) from accounts where entity_id = $1 and currency = 'clean') as cash,
         (select coalesce(sum(value), 0) from lots where owner_entity_id = $1) as land,
         (select coalesce(sum(case when a_to.entity_id = $1 then l.amount else 0 end), 0)
               - coalesce(sum(case when a_from.entity_id = $1 then l.amount else 0 end), 0)
            from ledger l
            left join accounts a_to on a_to.id = l.to_account
            left join accounts a_from on a_from.id = l.from_account
           where (a_to.entity_id = $1 or a_from.entity_id = $1)
             and l.ts > now() - interval '180 minutes'
             and l.category not in ('transfer','ipo','dividend','land','construction','furniture','demolition','production_setup')
             and l.reason not like 'trade % s:%') as profit`,
      [companyEid]
    );
    if (!r.rowCount || !(shares > 0)) return null;
    // plant and stock are assets too: a company that turns cash into ovens
    // and wheat hasn't lost a cent, and its valuation shouldn't say it has
    const furn = await pool.query(
      `select f.item, count(*) as n from furniture f
         join lots l on l.id = f.lot_id where l.owner_entity_id = $1 group by 1`,
      [companyEid]
    );
    const plant = furn.rows.reduce(
      (a: number, row: { item: string; n: string }) => a + (furnitureById(row.item)?.cost ?? 0) * Number(row.n),
      0
    );
    const inv = await pool.query(
      `select i.item, sum(i.qty) as q from inventories i
        where (i.holder_type = 'entity' and i.holder_id = $1)
           or (i.holder_type in ('lot','dock') and i.holder_id in
                 (select id::text from lots where owner_entity_id = $2))
        group by 1`,
      [String(companyEid), companyEid]
    );
    const stockpile = inv.rows.reduce(
      (a: number, row: { item: string; q: string }) => a + (BASE_PRICE[row.item] ?? 0) * Number(row.q),
      0
    );
    const assets =
      Number(r.rows[0].cash) + Number(r.rows[0].land) + plant * 0.7 + stockpile;
    // 180 real minutes = 18 game days; value earnings at a ~6x annual multiple
    const annual = (Number(r.rows[0].profit) / 18) * 365;
    const value = Math.max(assets * 0.6, Math.min(assets * 2.5, assets + annual * 6));
    return value / shares;
  }

  // What the float is worth if citizens hold ~25% of their money in coin.
  private async coinFairValue(code = "duc"): Promise<number | null> {
    const r = await pool.query(
      `select (select coalesce(sum(a.balance), 0) from accounts a
                 join npcs n on n.entity_id = a.entity_id where a.currency = 'clean') as cash,
              (select coalesce(sum(balance), 0) from accounts where currency = $1) as supply`,
      [code]
    );
    const cash = Number(r.rows[0].cash);
    const supply = Number(r.rows[0].supply);
    if (!(supply > 0)) return null;
    return (cash * COIN_MONETARY_SHARE) / supply;
  }

  // citizens with spare cash (bid side)
  private async cashSavers(n: number, minCash = 600): Promise<number[]> {
    const r = await pool.query(
      `select n.entity_id from npcs n
        join accounts a on a.entity_id = n.entity_id and a.currency = 'clean'
       where n.wealth_tier in ('saver','entrepreneur') and a.balance > $2
       order by random() limit $1`,
      [n, minCash]
    );
    return r.rows.map((row) => Number(row.entity_id));
  }

  // maker quotes are working orders, not history — clear ALL the stale ones
  // every tick; a capped sweep fell behind the quoting rate and the backlog
  // starved half the book through the per-entity order limit
  private async expireStaleNpcOrders(): Promise<void> {
    const stale = await pool.query(
      `select o.id, o.owner_entity, o.asset_type from orders o
        join entities e on e.id = o.owner_entity
       where o.world_id = $1 and e.kind in ('npc','company','city') and o.asset_type in ('stock','coin')
         and o.created_at < now() - make_interval(mins => $2)
       limit 500`,
      [WORLD_ID, QUOTE_TTL_MIN]
    );
    for (const row of stale.rows) {
      const eid = Number(row.owner_entity);
      if (row.asset_type === "stock") await this.stocks.cancel(eid, Number(row.id)).catch(() => {});
      else await this.crypto.cancel(eid, Number(row.id)).catch(() => {});
    }
  }

  // ---- stocks -------------------------------------------------------------

  private async makeStocks(): Promise<void> {
    const list = await this.stocks.list();
    if (!list.length) return;
    let printed = false;

    for (const s of list) {
      if (s.halted) continue;
      const key = stockKey(s.company);
      const prev =
        this.state.get(`stock:${key}`)?.mark ??
        (s.last !== null && s.last > 0 ? s.last : (await this.vwap("stock", key, 30)) ?? null);
      const fair = await this.stockFairValue(s.company, s.shares);
      const flow = await this.playerFlow("stock", key, 15);
      const mark = this.evolveMark(`stock:${key}`, prev, fair, flow);
      if (!(mark > 0)) continue;
      await this.recordMark("stock", key, mark);

      // the ladder: bids below the mark from cash-rich citizens, asks above it
      // from real shareholders — three levels a side, tight to wide
      const px = (mult: number) => Math.max(0.05, Math.round(mark * mult * 100) / 100);
      const bidders = await this.cashSavers(5);
      for (let i = 0; i < bidders.length; i++) {
        const cash = await pool.query(
          "select balance from accounts where entity_id = $1 and currency = 'clean'",
          [bidders[i]]
        );
        const p = px(1 - LADDER[i % LADDER.length]);
        const afford = Math.floor((Number(cash.rows[0]?.balance ?? 0) * 0.6) / p);
        const qty = Math.min(afford, 250 + Math.floor(Math.random() * 1200));
        if (qty >= 10) {
          await this.requote("stock", bidders[i], key, "buy");
          await this.stocks.trade(bidders[i], s.company, "buy", qty, p).catch(() => {});
        }
      }
      // the desk's standing bid — real size, priced just under the mark
      const treasury = await pool.query(
        "select balance from accounts where entity_id = $1 and currency = 'clean'", [CITY_ENTITY]
      );
      const free = Number(treasury.rows[0]?.balance ?? 0) - DESK_RESERVE;
      if (free > 0) {
        const p = px(0.992);
        const qty = Math.floor((free * DESK_TICK_BUDGET) / p);
        if (qty >= 50) {
          await this.requote("stock", CITY_ENTITY, key, "buy");
          await this.stocks.trade(CITY_ENTITY, s.company, "buy", qty, p).catch(() => {});
        }
      }
      // and the desk's OFFER: what it bought, it sells back a little above the
      // mark — the ask side of the market is never left to starve
      const deskShares = await pool.query(
        "select shares from share_holdings where company_entity = $1 and holder_entity = $2",
        [s.company, CITY_ENTITY]
      );
      const held = Number(deskShares.rows[0]?.shares ?? 0);
      if (held >= 50) {
        await this.requote("stock", CITY_ENTITY, key, "sell");
        const qty = Math.max(50, Math.floor(held * 0.25));
        await this.stocks.trade(CITY_ENTITY, s.company, "sell", qty, px(1.006)).catch(() => {});
      }
      // holders offer real size — their stacks run to hundreds of thousands
      const holders = await pool.query(
        `select h.holder_entity, h.shares from share_holdings h
          join entities e on e.id = h.holder_entity
         where h.company_entity = $1 and h.shares > 500 and e.kind in ('npc', 'city')
         order by random() limit $2`,
        [s.company, LADDER.length + 1]
      );
      for (let i = 0; i < holders.rows.length; i++) {
        const h = holders.rows[i] as { holder_entity: string; shares: string };
        const lvl = LADDER[Math.min(i, LADDER.length - 1)];
        const qty = Math.min(Math.floor(Number(h.shares) * 0.05), 1500 + Math.floor(Math.random() * 4500));
        if (qty >= 10) {
          await this.requote("stock", Number(h.holder_entity), key, "sell");
          await this.stocks.trade(Number(h.holder_entity), s.company, "sell", qty, px(1 + lvl)).catch(() => {});
        }
      }

      // a taker or two keeps the tape printing near the mark
      if (Math.random() < 0.55) {
        const mood = this.state.get(`stock:${key}`)?.mood ?? 0;
        const buySide = Math.random() < 0.5 + mood * 0.3;
        if (buySide) {
          const [eid] = await this.cashSavers(1);
          if (eid) {
            await this.stocks.trade(eid, s.company, "buy", 50 + Math.floor(Math.random() * 400), 0, true).catch(() => {});
            printed = true;
          }
        } else if (holders.rows[0]) {
          await this.stocks
            .trade(Number(holders.rows[0].holder_entity), s.company, "sell", 50 + Math.floor(Math.random() * 400), 0, true)
            .catch(() => {});
          printed = true;
        }
      }
    }
    registry.broadcast("stk", { live: printed });
  }

  // ---- coins --------------------------------------------------------------

  private async makeCoin(code: string): Promise<void> {
    const lastRow = await pool.query(
      `select price from trades where world_id = $1 and asset_type = 'coin' and item = $2
        order by ts desc limit 1`,
      [WORLD_ID, code]
    );
    const prev =
      this.state.get(`coin:${code}`)?.mark ??
      (lastRow.rowCount ? Number(lastRow.rows[0].price) : ((await this.coinFairValue(code)) ?? 1));
    const fair = await this.coinFairValue(code);
    const flow = await this.playerFlow("coin", code, 15);
    const mark = this.evolveMark(`coin:${code}`, prev, fair, flow);
    await this.recordMark("coin", code, mark);

    const px = (mult: number) => Math.max(0.01, Math.round(mark * mult * 100) / 100);

    // ladder bids from citizens, then the desk's standing bid with real size
    const bidders = await this.cashSavers(5, 300);
    for (let i = 0; i < bidders.length; i++) {
      const qty = 8 + Math.floor(Math.random() * 30);
      await this.requote("coin", bidders[i], code, "buy");
      await this.crypto.trade(bidders[i], "buy", qty, px(1 - LADDER[i % LADDER.length]), false, code).catch(() => {});
    }
    const treasury = await pool.query(
      "select balance from accounts where entity_id = $1 and currency = 'clean'", [CITY_ENTITY]
    );
    const free = Number(treasury.rows[0]?.balance ?? 0) - DESK_RESERVE;
    if (free > 0) {
      const p = px(0.992);
      const qty = Math.floor((free * DESK_TICK_BUDGET) / p);
      if (qty >= 20) {
        await this.requote("coin", CITY_ENTITY, code, "buy");
        await this.crypto.trade(CITY_ENTITY, "buy", qty, p, false, code).catch(() => {});
      }
    }
    // the desk's coin inventory works the ask side
    const deskCoin = await pool.query(
      "select balance from accounts where entity_id = $1 and currency = $2", [CITY_ENTITY, code]
    );
    const deskStack = Math.floor(Number(deskCoin.rows[0]?.balance ?? 0));
    if (deskStack >= 20) {
      await this.requote("coin", CITY_ENTITY, code, "sell");
      await this.crypto.trade(CITY_ENTITY, "sell", Math.floor(deskStack * 0.3), px(1.006), false, code).catch(() => {});
    }
    // asks from real stacks — including whatever the desk has accumulated
    const holders = await pool.query(
      `select a.entity_id, a.balance from accounts a
        join entities e on e.id = a.entity_id
       where a.currency = $1 and a.balance >= 20 and e.kind in ('npc','company','city')
       order by random() limit $2`,
      [code, LADDER.length + 1]
    );
    for (let i = 0; i < holders.rows.length; i++) {
      const h = holders.rows[i] as { entity_id: string; balance: string };
      const lvl = LADDER[Math.min(i, LADDER.length - 1)];
      const stack = Math.floor(Number(h.balance));
      const qty = Math.max(1, Math.min(Math.floor(stack * 0.35), 15 + Math.floor(Math.random() * 60)));
      await this.requote("coin", Number(h.entity_id), code, "sell");
      await this.crypto.trade(Number(h.entity_id), "sell", qty, px(1 + lvl), false, code).catch(() => {});
    }

    // takers print the tape; whales occasionally move it for real
    if (Math.random() < 0.7) {
      const mood = this.state.get(`coin:${code}`)?.mood ?? 0;
      const buySide = Math.random() < 0.5 + mood * 0.35;
      const whale = Math.random() < 0.1;
      const want = whale ? 30 + Math.floor(Math.random() * 80) : 2 + Math.floor(Math.random() * 8);
      const depth = await pool.query(
        `select coalesce(sum(qty), 0) as q from orders
          where world_id = $1 and asset_type = 'coin' and item = $2 and side = $3`,
        [WORLD_ID, code, buySide ? "sell" : "buy"]
      );
      const resting = Number(depth.rows[0].q);
      const size = Math.max(1, Math.min(want, Math.floor(resting * 0.5)));
      if (resting > 1) {
        if (buySide) {
          const [eid] = await this.cashSavers(1);
          if (eid) await this.crypto.trade(eid, "buy", size, 0, true, code).catch(() => {});
        } else {
          const seller = await pool.query(
            `select a.entity_id from accounts a join entities e on e.id = a.entity_id
              where a.currency = $2 and a.balance >= $1 and e.kind in ('npc','company')
              order by random() limit 1`,
            [size, code]
          );
          if (seller.rowCount)
            await this.crypto.trade(Number(seller.rows[0].entity_id), "sell", size, 0, true, code).catch(() => {});
        }
      }
    }
  }
}
