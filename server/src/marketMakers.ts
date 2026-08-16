import { pool } from "./db.js";
import { registry } from "./registry.js";
import { StocksStore, stockKey } from "./stocks.js";
import { CryptoStore } from "./crypto.js";
import { COINS } from "@mc/shared";

const WORLD_ID = 1;
const COIN_MONETARY_SHARE = 0.25; // share of citizen money the coin float represents

// Continuous NPC market-making: every tick a few citizens quote both sides of
// each market and sometimes cross the spread, so the tape stays alive.
//
// Manipulation resistance comes from the anchor: quotes center on the
// volume-weighted average price of the last game day, not the last print.
// A pump leaves fresh asks below the spike (sellers cash in on the pumper),
// a dump leaves fresh bids above it, and one small painted trade barely
// shifts a volume-weighted anchor. Stale NPC orders expire so old far-away
// prices can't sit as landmines.
export class MarketMakers {
  constructor(
    private stocks: StocksStore,
    private crypto: CryptoStore
  ) {}

  private ticking = false;
  // market mood: a slow random walk that quotes and takers lean on, so runs
  // and pullbacks persist across ticks instead of snapping back every time
  private coinMood = new Map<string, number>();
  // per-company mood, same idea as the coin's
  private stockMood = new Map<number, number>();

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.expireStaleNpcOrders();
      await this.makeStocks();
      for (const c of COINS) await this.makeCoin(c.code);
    } catch (err) {
      console.error("[mm] tick failed", err);
    } finally {
      this.ticking = false;
    }
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
  // its recent earnings. Both come from the real ledger, so business results
  // drive the share price — growth lifts it, losses drag it down.
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
             and l.ts > now() - interval '30 minutes'
             and l.category not in ('transfer','ipo','dividend')
             and l.reason not like 'trade % s:%') as profit30`,
      [companyEid]
    );
    if (!r.rowCount || !(shares > 0)) return null;
    const assets = Number(r.rows[0].cash) + Number(r.rows[0].land);
    // 30 real minutes = 3 game days; value earnings at a ~6x annual multiple
    const annual = (Number(r.rows[0].profit30) / 3) * 365;
    const value = Math.max(assets * 0.4, Math.min(assets * 3, assets + annual * 6));
    return value / shares;
  }

  // What the float is worth if citizens hold ~25% of their money in coin.
  // Grows as wages accumulate, shrinks as mining adds supply.
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
  private async cashSavers(n: number): Promise<number[]> {
    const r = await pool.query(
      `select n.entity_id from npcs n
        join accounts a on a.entity_id = n.entity_id and a.currency = 'clean'
       where n.wealth_tier in ('saver','entrepreneur') and a.balance > 600
       order by random() limit $1`,
      [n]
    );
    return r.rows.map((row) => Number(row.entity_id));
  }

  // NPC-owned stock/coin orders older than a game day get pulled
  private async expireStaleNpcOrders(): Promise<void> {
    const stale = await pool.query(
      `select o.id, o.owner_entity, o.asset_type from orders o
        join entities e on e.id = o.owner_entity
       where o.world_id = $1 and e.kind = 'npc' and o.asset_type in ('stock','coin')
         and o.created_at < now() - interval '10 minutes'
       limit 30`,
      [WORLD_ID]
    );
    for (const row of stale.rows) {
      const eid = Number(row.owner_entity);
      if (row.asset_type === "stock") await this.stocks.cancel(eid, Number(row.id)).catch(() => {});
      else await this.crypto.cancel(eid, Number(row.id)).catch(() => {});
    }
  }

  private async makeStocks(): Promise<void> {
    const list = await this.stocks.list();
    if (!list.length) return;
    // a few random listings per tick keeps every name lively without spam
    const picks = [...list].sort(() => Math.random() - 0.5).slice(0, 3);
    let printed = false;

    for (const s of picks) {
      if (s.halted) continue;
      // anchor follows the last print (lightly damped), so runs compound
      const short = await this.vwap("stock", stockKey(s.company), 5);
      const anchor = s.last !== null && s.last > 0 ? s.last * 0.8 + (short ?? s.last) * 0.2 : short;
      if (anchor === null || !(anchor > 0)) continue;

      // mood: persistent random walk per company — trends form and fade
      let mood = (this.stockMood.get(s.company) ?? 0) * 0.93 + (Math.random() - 0.5) * 0.35;
      // fundamentals: what the business is actually worth per share. Earnings
      // and assets move this, so a company that trades well drifts up and one
      // that bleeds drifts down — the market follows the business.
      const fair = await this.stockFairValue(s.company, s.shares);
      if (fair !== null && fair > 0) {
        const stretch = (anchor - fair) / fair;
        mood -= Math.max(-0.4, Math.min(0.4, stretch * 0.8));
      }
      mood = Math.max(-1, Math.min(1, mood));
      this.stockMood.set(s.company, mood);
      const lean = mood * 0.05;

      // bid side: citizens with cash working just under the anchor, sized
      // to what they can actually afford
      for (const eid of await this.cashSavers(2)) {
        const px = Math.max(0.05, Math.round(anchor * (1 + lean) * (0.975 + Math.random() * 0.025) * 100) / 100);
        const cash = await pool.query(
          "select balance from accounts where entity_id = $1 and currency = 'clean'", [eid]
        );
        const afford = Math.floor((Number(cash.rows[0]?.balance ?? 0) * 0.4) / px);
        const qty = Math.min(afford, 200 + Math.floor(Math.random() * 1800));
        if (qty >= 10) await this.stocks.trade(eid, s.company, "buy", qty, px).catch(() => {});
      }
      // ask side: existing shareholders offering just above it
      const holders = await pool.query(
        `select h.holder_entity, h.shares from share_holdings h
          join entities e on e.id = h.holder_entity
         where h.company_entity = $1 and h.shares > 1000 and e.kind = 'npc'
         order by random() limit 2`,
        [s.company]
      );
      for (const h of holders.rows) {
        const eid = Number(h.holder_entity);
        const px = Math.round(anchor * (1 + lean) * (0.998 + Math.random() * 0.03) * 100) / 100;
        const qty = Math.min(Number(h.shares), 200 + Math.floor(Math.random() * 1800));
        if (qty >= 10) await this.stocks.trade(eid, s.company, "sell", qty, px).catch(() => {});
      }
      // sometimes a citizen just takes the market — that's what prints
      if (Math.random() < 0.6) {
        const side = Math.random() < 0.5 + mood * 0.35 ? "buy" : "sell";
        if (side === "buy") {
          const [eid] = await this.cashSavers(1);
          if (eid) {
            await this.stocks.trade(eid, s.company, "buy", 100 + Math.floor(Math.random() * 500), 0, true).catch(() => {});
            printed = true;
          }
        } else {
          const h = holders.rows[0];
          if (h) {
            await this.stocks
              .trade(Number(h.holder_entity), s.company, "sell", 100 + Math.floor(Math.random() * 500), 0, true)
              .catch(() => {});
            printed = true;
          }
        }
      }
    }
    registry.broadcast("stk", { live: printed });
  }

  private async makeCoin(code: string): Promise<void> {
    // The anchor follows the LAST price (with a little VWAP damping), so a
    // one-sided run compounds into a trend instead of snapping back to an
    // average every tick.
    const lastRow = await pool.query(
      `select price from trades where world_id = $1 and asset_type = 'coin' and item = $2
        order by ts desc limit 1`,
      [WORLD_ID, code]
    );
    const last = lastRow.rowCount ? Number(lastRow.rows[0].price) : null;
    const short = await this.vwap("coin", code, 5);
    // A coin with no tape has no last price. Opening it at an arbitrary figure
    // makes every new coin start at the same place regardless of its supply —
    // so open at what it is actually worth: the money that would chase it,
    // divided by the coins there are.
    const opening = await this.coinFairValue(code);
    const anchor =
      last !== null ? last * 0.8 + (short ?? last) * 0.2 : (short ?? opening ?? 1);

    // mood: a persistent random walk that trends for a while, then fades
    let mood = this.coinMood.get(code) ?? 0;
    mood = Math.max(-1, Math.min(1, mood * 0.94 + (Math.random() - 0.5) * 0.4));
    // Fundamental pull. Citizens collectively want to keep roughly this much
    // of their money in coin; divided by the circulating float that implies a
    // fair value. Price oscillates around it — and the level itself moves as
    // the city gets richer (up) or mining adds supply (down).
    const fair = await this.coinFairValue(code);
    if (fair !== null && fair > 0) {
      const stretch = (anchor - fair) / fair;
      // the further a coin has drifted from what it is worth, the harder the
      // market leans on it — a coin cannot sit at twenty times fair forever
      mood -= Math.max(-0.7, Math.min(0.7, stretch * 0.9));
    }
    this.coinMood.set(code, mood);
    // quotes lean with the mood; a wildly stretched price gets a firmer shove
    const stretchNow = fair !== null && fair > 0 ? Math.abs(anchor / fair - 1) : 0;
    const lean = mood * (stretchNow > 3 ? 0.14 : 0.06);

    // bids from cash-rich citizens
    for (const eid of await this.cashSavers(3)) {
      const px = Math.max(0.05, Math.round(anchor * (1 + lean) * (0.975 + Math.random() * 0.03) * 100) / 100);
      const qty = 3 + Math.floor(Math.random() * 12);
      await this.crypto.trade(eid, "buy", qty, px, false, code).catch(() => {});
    }
    // asks come from sizeable stacks only, and each seller offers a slice —
    // holders aren't vending machines emptying themselves into every bid
    const holders = await pool.query(
      `select a.entity_id, a.balance from accounts a
        join entities e on e.id = a.entity_id
       where a.currency = $1 and a.balance >= 25 and e.kind in ('npc','company')
       order by random() limit 3`,
      [code]
    );
    for (const h of holders.rows) {
      const eid = Number(h.entity_id);
      const px = Math.round(anchor * (1 + lean) * (0.998 + Math.random() * 0.035) * 100) / 100;
      const stack = Math.floor(Number(h.balance));
      const qty = Math.max(1, Math.min(Math.floor(stack * 0.15), 3 + Math.floor(Math.random() * 12)));
      await this.crypto.trade(eid, "sell", qty, px, false, code).catch(() => {});
    }
    // takers keep the tape printing, leaning with the mood — and now and then
    // somebody sizes up and actually moves the price. A taker never eats more
    // than most of what is resting, or the book would be empty for everyone
    // else the moment they looked at it.
    if (Math.random() < 0.75) {
      const buySide = Math.random() < 0.5 + mood * 0.4;
      const whale = Math.random() < 0.12;
      const want = whale ? 40 + Math.floor(Math.random() * 90) : 2 + Math.floor(Math.random() * 8);
      const depth = await pool.query(
        `select coalesce(sum(qty), 0) as q from orders
          where world_id = $1 and asset_type = 'coin' and item = $2 and side = $3`,
        [WORLD_ID, code, buySide ? "sell" : "buy"]
      );
      const resting = Number(depth.rows[0].q);
      const size = Math.max(1, Math.min(want, Math.floor(resting * 0.6)));
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

    // A market with nothing on offer is a market nobody can buy in. If the
    // sell side has been cleared out, put a real offer back on it.
    const asks = await pool.query(
      `select coalesce(sum(qty), 0) as q from orders
        where world_id = $1 and asset_type = 'coin' and item = $2 and side = 'sell'`,
      [WORLD_ID, code]
    );
    if (Number(asks.rows[0].q) < 5) {
      const holder = await pool.query(
        `select a.entity_id from accounts a join entities e on e.id = a.entity_id
          where a.currency = $1 and a.balance >= 40 and e.kind in ('npc','company')
          order by random() limit 1`,
        [code]
      );
      if (holder.rowCount) {
        const px = Math.round(anchor * (1 + lean) * 1.012 * 100) / 100;
        await this.crypto
          .trade(Number(holder.rows[0].entity_id), "sell", 12 + Math.floor(Math.random() * 20), px, false, code)
          .catch(() => {});
      }
    }
  }

}
