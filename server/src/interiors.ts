import { furnitureById, PlacedItem, validatePlacement } from "@mc/shared";
import { pool } from "./db.js";
import { EconomyError, LotStore } from "./lots.js";
import { CITY_ENTITY, transfer } from "./accounts.js";

const WORLD_ID = 1;

// Authoritative furniture placement. Layout rules live in @mc/shared so the
// client preview and this validation can never disagree.
export class InteriorStore {
  private cache = new Map<number, PlacedItem[]>();

  // set after construction: GoodsStore is built from this one
  goods!: import("./goods.js").GoodsStore;
  // set after construction: fixtures are bought on the open market
  market?: { buyNow(eid: number, item: string, qty: number): Promise<{ avgPrice: number | null; cash: Map<number, number> }> };

  constructor(private lots: LotStore) {}

  async items(lotId: number): Promise<PlacedItem[]> {
    const hit = this.cache.get(lotId);
    if (hit) return hit;
    const r = await pool.query(
      "select id, item, x, y, rot, floor from furniture where world_id = $1 and lot_id = $2 order by id",
      [WORLD_ID, lotId]
    );
    const items: PlacedItem[] = r.rows.map((row) => ({
      id: Number(row.id),
      item: row.item,
      x: row.x,
      y: row.y,
      rot: row.rot,
      floor: Number(row.floor ?? 0),
    }));
    this.cache.set(lotId, items);
    return items;
  }

  private ensureEditable(eid: number, lotId: number) {
    const st = this.lots.get(lotId);
    const lot = this.lots.lotDef(lotId);
    if (!st || !lot) throw new EconomyError("no such lot");
    if (!this.lots.ownsLot(eid, lotId) && !this.lots.isTenant(eid, lotId))
      throw new EconomyError("you don't own or rent this building");
    if (st.building) {
      if (Date.now() < st.building.doneAt) throw new EconomyError("still under construction");
    } else if (this.lots.isVacant(lotId)) {
      // no player-built and no pre-existing city building either
      throw new EconomyError("nothing built here");
    }
    return lot;
  }

  async place(
    eid: number,
    lotId: number,
    item: string,
    x: number,
    y: number,
    rot: number,
    floor = 0
  ): Promise<{ placed: PlacedItem; cash: Map<number, number>; source: "storage" | "pocket" | "cash"; paid: number | null }> {
    const lot = this.ensureEditable(eid, lotId);
    const def = furnitureById(item);
    if (!def) throw new EconomyError("unknown item");
    const building = this.lots.buildingDef(lotId);
    if (!building) throw new EconomyError("nothing built here");
    const existing = await this.items(lotId);
    // a loading bay is where goods cross the property line, so it belongs on
    // the ground where a hauler can reach it
    if (item === "delivery_space" && floor !== 0)
      throw new EconomyError("a delivery space has to be on the ground floor");
    const reason = validatePlacement(lot, building, existing, { item, x, y, rot, floor });
    if (reason) throw new EconomyError(reason);

    // A fixture is a real item. It comes out of the building's storage or your
    // own bag; failing that it is bought on the market, where the money goes to
    // a seller who is then one item lighter. Only when nobody is selling at all
    // does the city supply one at its list price, so a thin market slows you
    // down rather than stopping you.
    const cash = new Map<number, number>();
    let source: "storage" | "pocket" | "cash" = "storage";
    let bought: { avgPrice: number | null } | null = null;
    let fromCity = false;
    const inStore = (await this.goods.inventory("lot", String(lotId)))[item] ?? 0;
    if (inStore < 1) {
      const pocket = await this.goods.inventory("entity", String(eid));
      if ((pocket[item] ?? 0) < 1) {
        source = "cash";
        try {
          if (!this.market) throw new EconomyError("no market");
          const r = await this.market.buyNow(eid, item, 1);
          for (const [k, v] of r.cash) cash.set(k, v);
          bought = { avgPrice: r.avgPrice };
        } catch {
          fromCity = true;
        }
      } else source = "pocket";
    }

    const client = await pool.connect();
    let placed: PlacedItem;
    try {
      await client.query("begin");
      if (fromCity) {
        // no seller anywhere: the city supplies one at list price
        const bal = await transfer(
          client,
          eid,
          CITY_ENTITY,
          def.cost,
          "furniture",
          `city-supplied ${item} on lot ${lotId}`
        );
        cash.set(eid, bal.from);
        bought = { avgPrice: def.cost };
      } else if (source === "storage") {
        if (!(await this.goods.takeFromProperty(lotId, item, 1, client)))
          throw new EconomyError("that fixture is no longer in storage");
      } else {
        const fromPocket = await client.query(
          `update inventories set qty = qty - 1
            where world_id = $1 and holder_type = 'entity' and holder_id = $2 and item = $3 and qty >= 1`,
          [WORLD_ID, String(eid), item]
        );
        if (!fromPocket.rowCount) throw new EconomyError("you don't have one to place");
      }
      const ins = await client.query(
        "insert into furniture (world_id, lot_id, item, x, y, rot, floor) values ($1,$2,$3,$4,$5,$6,$7) returning id",
        [WORLD_ID, lotId, item, x, y, rot, floor]
      );
      placed = { id: Number(ins.rows[0].id), item, x, y, rot, floor };
      // a delivery space fitting IS the plot's loading bay
      if (item === "delivery_space")
        await client.query(
          `insert into docks (lot_id, world_id, cell_x, cell_y, indoor) values ($1,$2,$3,$4,true)
           on conflict (lot_id) do nothing`,
          [lotId, WORLD_ID, x, y]
        );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    const list = this.cache.get(lotId);
    if (list) list.push(placed);
    return { placed, cash, source, paid: bought?.avgPrice ?? null };
  }

  async remove(eid: number, lotId: number, furnId: number): Promise<{ item: string }> {
    this.ensureEditable(eid, lotId);
    const items = await this.items(lotId);
    const target = items.find((i) => i.id === furnId);
    if (!target) throw new EconomyError("no such item");

    const client = await pool.connect();
    try {
      await client.query("begin");
      const del = await client.query(
        "delete from furniture where id = $1 and world_id = $2 and lot_id = $3",
        [furnId, WORLD_ID, lotId]
      );
      if (!del.rowCount) throw new EconomyError("item already gone");
      // pulling out the last delivery fitting closes the plot's indoor bay
      if (target.item === "delivery_space") {
        const others = await client.query(
          "select 1 from furniture where world_id = $1 and lot_id = $2 and item = 'delivery_space' limit 1",
          [WORLD_ID, lotId]
        );
        if (!others.rowCount)
          await client.query("delete from docks where lot_id = $1 and indoor = true", [lotId]);
      }
      // the fixture goes back into the property's storage as the item it is
      await this.goods.putIntoProperty(lotId, target.item, 1, client);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    this.cache.set(lotId, items.filter((i) => i.id !== furnId));
    return { item: target.item };
  }
}
