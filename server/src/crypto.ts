import { PoolClient } from "pg";
import {
  DAY_LENGTH_SEC,
  COIN_GENESIS_CIRCULATION,
  COIN_MAX_SUPPLY,
  InstalledComponent,
  PROCESSOR_HASH,
  COOLING_CAPACITY,
  RACK_SPECS,
  dailyEmission,
  dailyWear,
  allocateEmission,
  halvingEra,
  nextHalvingSupply,
  rackOutput,
  itemById,
  COINS,
  coinByCode,
  coinEmission,
} from "@mc/shared";
import { pool } from "./db.js";
import { EconomyError } from "./errors.js";
import { credit, debit } from "./accounts.js";
import { placeOrder, cancelOrder, AssetHooks } from "./orderbook.js";
import { LotStore } from "./lots.js";

const WORLD_ID = 1;
const COIN_KEY = "coin";
const COIN_FEE_RATE = 0.004;

// coin-asset hooks: the coin leg moves between coin accounts as 'transfer'
// (the clean cash leg is handled by the shared engine; the account layer
// blocks coin from land/construction/trade/fee — the purchase wall)
const COIN_HOOKS: AssetHooks = {
  async escrowSell(c: PoolClient, eid: number, key: string, qty: number) {
    await debit(c, eid, qty, "transfer", `${key} sale escrow`, key).catch(() => {
      throw new EconomyError("not enough coin");
    });
  },
  async deliver(c: PoolClient, eid: number, key: string, qty: number) {
    await credit(c, eid, qty, "transfer", `${key} purchase`, key);
  },
  async refund(c: PoolClient, eid: number, key: string, qty: number) {
    await credit(c, eid, qty, "transfer", `${key} order refund`, key);
  },
};

// The coin: one native cryptocurrency. Mined via component racks, traded
// against clean cash on the shared order book, transferable wallet-to-wallet.
export class CryptoStore {
  // set after construction: GoodsStore is built from this one
  goods!: import("./goods.js").GoodsStore;

  constructor(private lots: LotStore) {}

  // every coin this holder owns
  async balances(eid: number): Promise<Record<string, number>> {
    const r = await pool.query(
      "select currency, balance from accounts where entity_id = $1 and currency = any($2)",
      [eid, COINS.map((c) => c.code)]
    );
    const out: Record<string, number> = {};
    for (const c of COINS) out[c.code] = 0;
    for (const row of r.rows) out[row.currency] = Number(row.balance);
    return out;
  }

  async balance(eid: number, code = "duc"): Promise<number> {
    const r = await pool.query(
      "select balance from accounts where entity_id = $1 and currency = $2",
      [eid, code]
    );
    return r.rowCount ? Number(r.rows[0].balance) : 0;
  }

  private def(code: string) {
    const d = coinByCode(code);
    if (!d) throw new EconomyError("unknown coin");
    return d;
  }

  private async minedOf(code: string): Promise<number> {
    const r = await pool.query("select mined from coins where code = $1", [code]);
    return r.rowCount ? Number(r.rows[0].mined) : 0;
  }

  // ---- market ----

  async trade(
    eid: number,
    side: "buy" | "sell",
    qty: number,
    price: number,
    market = false,
    code = "duc"
  ) {
    const coin = this.def(code);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) throw new EconomyError("bad quantity");
    if (market) price = side === "buy" ? 1_000_000 : 0.01;
    else {
      price = Math.round(price * 100) / 100;
      if (!(price > 0) || price > 1_000_000) throw new EconomyError("bad price");
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      const r = await placeOrder(client, {
        assetType: "coin",
        assetKey: coin.code,
        label: coin.name,
        eid,
        side,
        qty,
        price,
        feeRate: COIN_FEE_RATE,
        hooks: COIN_HOOKS,
        market,
      });
      await client.query("commit");
      return r;
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async cancel(eid: number, orderId: number) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await cancelOrder(client, eid, orderId, COIN_HOOKS);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  // wallet-to-wallet transfer
  async send(eid: number, toEntity: number, qty: number, code = "duc") {
    if (!Number.isInteger(qty) || qty < 1) throw new EconomyError("bad amount");
    const t = await pool.query("select 1 from entities where id = $1", [toEntity]);
    if (!t.rowCount) throw new EconomyError("no such entity");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await debit(client, eid, qty, "transfer", `${code} to entity ${toEntity}`, code);
      await credit(client, toEntity, qty, "transfer", `${code} from entity ${eid}`, code);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async book(code = "duc") {
    const bids = await pool.query(
      `select price, sum(qty) as qty from orders
        where world_id = $1 and asset_type = 'coin' and item = $2 and side = 'buy'
        group by price order by price desc limit 8`,
      [WORLD_ID, code]
    );
    const asks = await pool.query(
      `select price, sum(qty) as qty from orders
        where world_id = $1 and asset_type = 'coin' and item = $2 and side = 'sell'
        group by price order by price asc limit 8`,
      [WORLD_ID, code]
    );
    const trades = await pool.query(
      `select price, qty, extract(epoch from ts) * 1000 as ts from trades
        where world_id = $1 and asset_type = 'coin' and item = $2 order by ts desc limit 20`,
      [WORLD_ID, code]
    );
    return {
      bids: bids.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty) })),
      asks: asks.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty) })),
      trades: trades.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty), ts: Number(r.ts) })),
    };
  }

  async myOrders(eid: number, code?: string) {
    const r = await pool.query(
      `select id, side, qty, price, item from orders
        where world_id = $1 and owner_entity = $2 and asset_type = 'coin'
          and ($3::text is null or item = $3)
        order by created_at desc`,
      [WORLD_ID, eid, code ?? null]
    );
    return r.rows.map((row) => ({
      id: Number(row.id),
      side: row.side,
      qty: Number(row.qty),
      price: Number(row.price),
      coin: String(row.item),
    }));
  }

  // candles bucketed by minutes (1 = intraday, 10 = one game day per candle)
  async history(bucketMin: number, code = "duc") {
    const r = await pool.query(
      `select floor(extract(epoch from ts) / ($2 * 60)) as bucket,
              (array_agg(price order by ts asc))[1] as o,
              max(price) as h, min(price) as l,
              (array_agg(price order by ts desc))[1] as c,
              sum(qty) as v
         from trades where world_id = $1 and asset_type = 'coin' and item = $3
          and ts > now() - interval '48 hours'
        group by bucket order by bucket asc`,
      [WORLD_ID, bucketMin, code]
    );
    return r.rows.map((row) => ({
      t: Number(row.bucket) * bucketMin * 60_000,
      o: Number(row.o),
      h: Number(row.h),
      l: Number(row.l),
      c: Number(row.c),
      v: Number(row.v),
    }));
  }

  // ---- racks & components ----

  private async rackRow(furnId: number) {
    const r = await pool.query(
      "select id, lot_id, item from furniture where id = $1 and world_id = $2",
      [furnId, WORLD_ID]
    );
    if (!r.rowCount || !RACK_SPECS[r.rows[0].item]) throw new EconomyError("not a mining rack");
    return { lotId: Number(r.rows[0].lot_id), rackItem: r.rows[0].item };
  }

  private slotKind(item: string): "proc" | "psu" | "cool" {
    if (PROCESSOR_HASH[item] !== undefined) return "proc";
    if (item === "psu_unit") return "psu";
    if (COOLING_CAPACITY[item] !== undefined) return "cool";
    throw new EconomyError("that doesn't fit a rack slot");
  }

  // point a rack at a coin: which market its hashpower works for
  async setRackCoin(eid: number, furnId: number, code: string): Promise<void> {
    if (!coinByCode(code)) throw new EconomyError("unknown coin");
    const r = await pool.query("select lot_id, item from furniture where world_id = $1 and id = $2", [
      WORLD_ID,
      furnId,
    ]);
    if (!r.rowCount || !RACK_SPECS[r.rows[0].item]) throw new EconomyError("not a mining rack");
    const lotId = Number(r.rows[0].lot_id);
    if (!this.lots.ownsLot(eid, lotId) && !this.lots.isTenant(eid, lotId))
      throw new EconomyError("not your rack");
    await pool.query("update furniture set coin = $2 where id = $1", [furnId, code]);
  }

  async components(furnId: number) {
    const { rackItem } = await this.rackRow(furnId);
    const r = await pool.query(
      "select slot, item, wear from rack_components where furniture_id = $1 order by slot",
      [furnId]
    );
    const comps: InstalledComponent[] = r.rows.map((row) => ({
      slot: row.slot,
      item: row.item,
      wear: Number(row.wear),
    }));
    const coinRow = await pool.query("select coin from furniture where id = $1", [furnId]);
    return {
      rackItem,
      spec: RACK_SPECS[rackItem],
      components: comps,
      output: rackOutput(RACK_SPECS[rackItem], comps),
      coin: String(coinRow.rows[0]?.coin ?? "duc"),
      coins: COINS.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol })),
    };
  }

  // install from the operator's pocket or the lot storage
  async install(eid: number, furnId: number, item: string): Promise<void> {
    const { lotId, rackItem } = await this.rackRow(furnId);
    if (!this.lots.ownsLot(eid, lotId) && !this.lots.isTenant(eid, lotId))
      throw new EconomyError("not your building");
    const kind = this.slotKind(item);
    const spec = RACK_SPECS[rackItem];
    const capacity = kind === "proc" ? spec.proc : kind === "psu" ? spec.psu : spec.cool;

    const client = await pool.connect();
    try {
      await client.query("begin");
      const cur = await client.query(
        "select slot, item from rack_components where furniture_id = $1",
        [furnId]
      );
      const sameKind = cur.rows.filter((r) => this.slotKind(r.item) === kind).length;
      if (sameKind >= capacity) throw new EconomyError(`all ${kind} slots are full`);
      const used = new Set(cur.rows.map((r) => Number(r.slot)));
      let slot = 0;
      while (used.has(slot)) slot++;
      // take the component from lot storage, else the installer's pocket
      // any rack in the building will do
      const fromLot = await this.goods.takeFromProperty(lotId, item, 1, client);
      if (!fromLot) {
        const fromPocket = await client.query(
          `update inventories set qty = qty - 1
            where world_id = $1 and holder_type = 'entity' and holder_id = $2 and item = $3 and qty >= 1`,
          [WORLD_ID, String(eid), item]
        );
        if (!fromPocket.rowCount)
          throw new EconomyError(`no ${itemById(item)?.label ?? item} in storage or your bag`);
      }
      await client.query(
        "insert into rack_components (furniture_id, slot, item) values ($1,$2,$3)",
        [furnId, slot, item]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  // pull a component back into lot storage (worn ones too — sell or scrap)
  async remove(eid: number, furnId: number, slot: number): Promise<void> {
    const { lotId } = await this.rackRow(furnId);
    if (!this.lots.ownsLot(eid, lotId) && !this.lots.isTenant(eid, lotId))
      throw new EconomyError("not your building");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const del = await client.query(
        "delete from rack_components where furniture_id = $1 and slot = $2 returning item, wear",
        [furnId, slot]
      );
      if (!del.rowCount) throw new EconomyError("empty slot");
      // dead components scrap on removal; live ones go back to storage
      if (Number(del.rows[0].wear) < 1) {
        await client.query(
          `insert into inventories (world_id, holder_type, holder_id, item, qty)
           values ($1,'lot',$2,$3,1)
           on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + 1`,
          [WORLD_ID, String(lotId), del.rows[0].item]
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  // ---- daily mining ----

  // hashpower per operator entity from every rack working a given coin
  async worldHashpower(code = "duc"): Promise<Map<number, number>> {
    const racks = await pool.query(
      `select f.id, f.lot_id, f.item from furniture f
        where f.world_id = $1 and f.item = any($2) and f.coin = $3`,
      [WORLD_ID, Object.keys(RACK_SPECS), code]
    );
    const byEntity = new Map<number, number>();
    for (const r of racks.rows) {
      const op = this.lots.operatorOf(Number(r.lot_id));
      if (op === null) continue;
      const comps = await pool.query(
        "select slot, item, wear from rack_components where furniture_id = $1",
        [r.id]
      );
      const out = rackOutput(
        RACK_SPECS[r.item],
        comps.rows.map((c) => ({ slot: c.slot, item: c.item, wear: Number(c.wear) }))
      );
      if (out.hash > 0) byEntity.set(op, (byEntity.get(op) ?? 0) + out.hash);
    }
    return byEntity;
  }

  // one-time genesis per coin: distribute the pre-mined circulation to the
  // mining companies and citizen savers so each market is liquid from day one
  async seedGenesis(): Promise<void> {
    for (const coin of COINS) {
      if ((await this.minedOf(coin.code)) > 0) continue;
      const cos = await pool.query(
        `select e.id, e.name from entities e
          where e.kind = 'company' and e.name in ('HashWorks Mining', 'Nordvik Mining Systems')`
      );
      const savers = await pool.query(
        "select entity_id from npcs where wealth_tier in ('saver','entrepreneur') order by random() limit 50"
      );
      if (!cos.rowCount || !savers.rowCount) continue;
      const client = await pool.connect();
      try {
        await client.query("begin");
        let total = 0;
        const toCompanies = Math.round(coin.genesis * 0.16);
        for (const c of cos.rows) {
          const amt = c.name === "HashWorks Mining" ? Math.round(toCompanies * 0.75) : Math.round(toCompanies * 0.25);
          await credit(client, Number(c.id), amt, "transfer", `${coin.name} genesis`, coin.code);
          total += amt;
        }
        const per = Math.floor((coin.genesis - total) / savers.rowCount!);
        for (const r of savers.rows) {
          await credit(client, Number(r.entity_id), per, "transfer", `${coin.name} genesis`, coin.code);
          total += per;
        }
        await client.query("update coins set mined = $2 where code = $1", [coin.code, total]);
        await client.query("commit");
        console.log(`[coin] ${coin.name}: ${total} in circulation across ${cos.rowCount! + savers.rowCount!} holders`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    }
  }



  private async minedSoFar(): Promise<number> {
    const r = await pool.query("select mined from coin_network where world_id = $1", [WORLD_ID]);
    return r.rowCount ? Number(r.rows[0].mined) : 0;
  }

  async networkStats(code = "duc") {
    const coin = this.def(code);
    const hash = await this.worldHashpower(code);
    const worldHash = [...hash.values()].reduce((a, b) => a + b, 0);
    const mined = await this.minedOf(code);
    const last = await pool.query(
      `select price from trades where world_id = $1 and asset_type = 'coin' and item = $2
        order by ts desc limit 1`,
      [WORLD_ID, code]
    );
    // the last print from before the current day, so a listing can show a day
    // change the same way a stock does
    const prev = await pool.query(
      `select price from trades
        where world_id = $1 and asset_type = 'coin' and item = $2
          and ts <= now() - make_interval(secs => $3)
        order by ts desc limit 1`,
      [WORLD_ID, code, DAY_LENGTH_SEC]
    );
    return {
      code: coin.code,
      name: coin.name,
      symbol: coin.symbol,
      maxSupply: coin.maxSupply,
      prevClose: prev.rowCount ? Number(prev.rows[0].price) : null,
      mined,
      circulating: mined,
      dailyEmission: coinEmission(coin, mined),
      worldHash,
      miners: hash.size,
      lastPrice: last.rowCount ? Number(last.rows[0].price) : null,
    };
  }

  // every coin's headline numbers, for the market list
  // What a wallet holds, what it cost, and what it has made. Coins arrive two
  // ways — bought on the book, or mined — so the tape gives the cost of what was
  // bought and anything held beyond that is treated as mined at zero cost.
  async portfolio(eid: number) {
    const [balances, stats] = await Promise.all([this.balances(eid), this.allStats()]);
    const trades = await pool.query(
      `select item, qty, price, buyer_entity, seller_entity from trades
        where world_id = $1 and asset_type = 'coin' and (buyer_entity = $2 or seller_entity = $2)
        order by id`,
      [WORLD_ID, eid]
    );

    // walk the tape in order so an average cost survives partial sales
    const book = new Map<string, { qty: number; cost: number; realised: number }>();
    for (const t of trades.rows) {
      const code = String(t.item);
      const b = book.get(code) ?? { qty: 0, cost: 0, realised: 0 };
      const qty = Number(t.qty);
      const price = Number(t.price);
      if (Number(t.buyer_entity) === eid) {
        b.qty += qty;
        b.cost += qty * price;
      } else {
        const avg = b.qty > 0 ? b.cost / b.qty : 0;
        const sold = Math.min(qty, b.qty);
        b.realised += sold * (price - avg);
        b.cost -= sold * avg;
        b.qty -= sold;
      }
      book.set(code, b);
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const rows = stats
      .map((st) => {
        const held = balances[st.code] ?? 0;
        const b = book.get(st.code) ?? { qty: 0, cost: 0, realised: 0 };
        const mined = Math.max(0, held - b.qty);
        const cost = Math.max(0, b.cost);
        const price = st.lastPrice ?? st.prevClose ?? 0;
        const value = held * price;
        return {
          code: st.code,
          name: st.name,
          held,
          mined,
          avgCost: held > 0 ? r2(cost / held) : 0,
          price,
          value: r2(value),
          cost: r2(cost),
          unrealised: r2(value - cost),
          realised: r2(b.realised),
        };
      })
      .filter((r) => r.held > 0 || r.realised !== 0);

    return {
      rows,
      value: r2(rows.reduce((a, r) => a + r.value, 0)),
      cost: r2(rows.reduce((a, r) => a + r.cost, 0)),
      unrealised: r2(rows.reduce((a, r) => a + r.unrealised, 0)),
      realised: r2(rows.reduce((a, r) => a + r.realised, 0)),
    };
  }

  async allStats() {
    return Promise.all(COINS.map((c) => this.networkStats(c.code)));
  }

  // the day's reward (from the supply schedule) split pro-rata by hashpower;
  // whatever is actually credited counts toward the hard cap
  async runDay(): Promise<void> {
    for (const coin of COINS) await this.mineCoin(coin.code);
  }

  // the day's reward for one coin, split pro-rata by the hashpower pointed at
  // it; whatever is actually credited counts toward that coin's hard cap
  private async mineCoin(code: string): Promise<void> {
    const coin = this.def(code);
    const byEntity = await this.worldHashpower(code);
    const worldHash = [...byEntity.values()].reduce((a, b) => a + b, 0);
    if (worldHash <= 0) return;
    const client = await pool.connect();
    try {
      await client.query("begin");
      const minedRow = await client.query("select mined from coins where code = $1 for update", [code]);
      const mined = minedRow.rowCount ? Number(minedRow.rows[0].mined) : 0;
      const pool_ = coinEmission(coin, mined);
      let credited = 0;
      if (pool_ > 0) {
        for (const [eid, share] of allocateEmission([...byEntity.entries()], worldHash, pool_)) {
          await credit(client, eid, share, "transfer", `${coin.name} mining emission`, code);
          credited += share;
        }
        await client.query("update coins set mined = mined + $2 where code = $1", [code, credited]);
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    await this.wearRacks(code);
  }

  // A day's mining wears the processors out. Cooled racks age slowly, ones
  // running hot age fast, and a component that reaches full wear is spent.
  private async wearRacks(code: string): Promise<void> {
    const racks = await pool.query(
      `select f.id, f.item from furniture f
        where f.world_id = $1 and f.item = any($2) and f.coin = $3`,
      [WORLD_ID, Object.keys(RACK_SPECS), code]
    );
    for (const r of racks.rows) {
      const comps = await pool.query(
        "select slot, item, wear from rack_components where furniture_id = $1",
        [r.id]
      );
      const parts = comps.rows.map((c) => ({ slot: c.slot, item: c.item, wear: Number(c.wear) }));
      const out = rackOutput(RACK_SPECS[r.item], parts);
      if (out.hash <= 0) continue;
      // each processor ages by how it ran: idle ones not at all, hot ones fast
      for (const p of out.perProcessor) {
        const add = dailyWear(p.active, p.throttled);
        if (add <= 0) continue;
        await pool.query(
          "update rack_components set wear = least(1, wear + $3) where furniture_id = $1 and slot = $2",
          [r.id, p.slot, add]
        );
      }
    }
  }
}
