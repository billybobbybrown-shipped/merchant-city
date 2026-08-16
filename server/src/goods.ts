import {
  furnitureById,
  slotsUsed,
  itemById,
  POCKET_SLOTS,
  DOCK_CAPACITY,
  sourceByType,
  sourceYield,
  sourceReserve,
  DEPLETING_TYPES,
  fitsPocket,
  stackLimit,
  recipeById,
  permitFor,
  PermitCategory,
} from "@mc/shared";
import { pool } from "./db.js";
import { registry } from "./registry.js";

// pool or an open transaction client — both expose query()
type PoolClientLike = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };
import { EconomyError, LotStore } from "./lots.js";
import { InteriorStore } from "./interiors.js";
import type { PermitsStore } from "./permits.js";

const WORLD_ID = 1;

export type Inv = Record<string, number>;

// Inventories, transfers, workbench crafting and daily source production.
// Postgres is authoritative; qty >= 0 is enforced by the schema.
export class GoodsStore {
  permits?: PermitsStore; // wired at boot

  constructor(
    private lots: LotStore,
    private interiors: InteriorStore
  ) {}

  // permitted goods may only be produced/retailed by a permitted operator
  private async requirePermit(lotId: number, category: PermitCategory): Promise<void> {
    const op = this.lots.operatorOf(lotId);
    if (op === null || !this.permits || !(await this.permits.has(op, category)))
      throw new EconomyError(`needs an active ${category} permit`);
  }

  // ---- containers -------------------------------------------------------
  // Every rack holds its own goods. "lot" is not a place things live; it is
  // shorthand for "this property's containers taken together", which is what a
  // workbench or a shop shelf draws on. A property with no racks at all keeps
  // its pile on the delivery pallets — a field with no barn has nowhere else.

  async stores(lotId: number): Promise<Array<{ id: string; capacity: number }>> {
    if (this.lots.buildingDef(lotId) === null) return [];
    const out: Array<{ id: string; capacity: number }> = [];
    for (const it of await this.interiors.items(lotId)) {
      const def = furnitureById(it.item);
      if (!def?.capacity || def.dock || it.item === "shelf") continue;
      out.push({ id: String(it.id), capacity: def.capacity });
    }
    return out;
  }

  // Where goods go when a property has no racks of its own: its delivery
  // pallets. Failing that — an NPC yard with neither — they stay in the old
  // undivided pile, so nothing already in the world is stranded out of reach.
  private async fallbackStore(lotId: number): Promise<{ holder: "dock" | "lot"; id: string }> {
    const r = await pool.query("select 1 from docks where world_id = $1 and lot_id = $2", [
      WORLD_ID,
      lotId,
    ]);
    return { holder: r.rowCount ? "dock" : "lot", id: String(lotId) };
  }

  private async rawInventory(holderType: string, holderId: string): Promise<Inv> {
    const r = await pool.query(
      "select item, qty from inventories where world_id = $1 and holder_type = $2 and holder_id = $3 and qty > 0",
      [WORLD_ID, holderType, holderId]
    );
    const inv: Inv = {};
    for (const row of r.rows) inv[row.item] = row.qty;
    return inv;
  }

  // everything the property's containers hold, added up
  async propertyInventory(lotId: number): Promise<Inv> {
    const stores = await this.stores(lotId);
    if (!stores.length) {
      const fb = await this.fallbackStore(lotId);
      return this.rawInventory(fb.holder, fb.id);
    }
    const inv: Inv = {};
    for (const st of stores)
      for (const [item, qty] of Object.entries(await this.rawInventory("furn", st.id)))
        inv[item] = (inv[item] ?? 0) + qty;
    return inv;
  }

  // pull an item from the property's containers, spending whichever have it
  async takeFromProperty(
    lotId: number,
    item: string,
    qty: number,
    client?: PoolClientLike
  ): Promise<boolean> {
    const q = client ?? pool;
    const stores = await this.stores(lotId);
    const targets: Array<[string, string]> = stores.length
      ? stores.map((st) => ["furn", st.id] as [string, string])
      : await this.fallbackStore(lotId).then((fb) => [[fb.holder, fb.id] as [string, string]]);
    let left = qty;
    for (const [ht, hid] of targets) {
      if (left <= 0) break;
      const r = await q.query(
        "select qty from inventories where world_id = $1 and holder_type = $2 and holder_id = $3 and item = $4",
        [WORLD_ID, ht, hid, item]
      );
      const have = Number(r.rows[0]?.qty ?? 0);
      const take = Math.min(have, left);
      if (take <= 0) continue;
      await q.query(
        `update inventories set qty = qty - $5
          where world_id = $1 and holder_type = $2 and holder_id = $3 and item = $4`,
        [WORLD_ID, ht, hid, item, take]
      );
      left -= take;
    }
    return left <= 0;
  }

  // put an item into the property's containers, filling whichever have room
  async putIntoProperty(
    lotId: number,
    item: string,
    qty: number,
    client?: PoolClientLike
  ): Promise<number> {
    const q = client ?? pool;
    const stores = await this.stores(lotId);
    const targets: Array<[string, string, number]> = [];
    for (const st of stores) targets.push(["furn", st.id, st.capacity]);
    if (!targets.length) {
      const fb = await this.fallbackStore(lotId);
      targets.push([fb.holder, fb.id, fb.holder === "dock" ? DOCK_CAPACITY : Number.MAX_SAFE_INTEGER]);
    }
    let left = qty;
    for (const [ht, hid, cap] of targets) {
      if (left <= 0) break;
      const r = await q.query(
        "select coalesce(sum(qty), 0) as n from inventories where world_id = $1 and holder_type = $2 and holder_id = $3",
        [WORLD_ID, ht, hid]
      );
      const room = cap - Number(r.rows[0].n);
      const put = Math.min(room, left);
      if (put <= 0) continue;
      await q.query(
        `insert into inventories (world_id, holder_type, holder_id, item, qty)
         values ($1,$2,$3,$4,$5)
         on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $5`,
        [WORLD_ID, ht, hid, item, put]
      );
      left -= put;
    }
    return qty - left;
  }

  async inventory(holderType: "entity" | "lot" | "shelf" | "dock", holderId: string): Promise<Inv> {
    if (holderType === "lot") return this.propertyInventory(Number(holderId));
    const r = await pool.query(
      "select item, qty from inventories where world_id = $1 and holder_type = $2 and holder_id = $3 and qty > 0",
      [WORLD_ID, holderType, holderId]
    );
    const inv: Inv = {};
    for (const row of r.rows) inv[row.item] = row.qty;
    return inv;
  }

  private total(inv: Inv): number {
    return Object.values(inv).reduce((a, b) => a + b, 0);
  }

  // A property holds exactly what its containers hold — nothing more. Storage
  // racks you fit inside a building, and the delivery space itself, which is
  // why a bare field can stockpile a harvest at all.
  async lotCapacity(lotId: number): Promise<number> {
    if (!this.lots.lotDef(lotId)) return 0;
    const stores = await this.stores(lotId);
    if (stores.length) return stores.reduce((a, st) => a + st.capacity, 0);
    // no racks: the delivery pallets are all the storage this property has
    return (await this.fallbackStore(lotId)).holder === "dock" ? DOCK_CAPACITY : 0;
  }

  // everything the property is holding, wherever it sits
  async lotHeld(lotId: number): Promise<number> {
    return this.total(await this.propertyInventory(lotId));
  }

  // one container's own contents — a rack is a place, not a view of a pool
  async containerView(furnId: number): Promise<{ lotId: number; items: Inv; capacity: number }> {
    const r = await pool.query("select lot_id, item from furniture where world_id = $1 and id = $2", [
      WORLD_ID,
      furnId,
    ]);
    if (!r.rowCount) throw new EconomyError("no such container");
    const def = furnitureById(r.rows[0].item);
    if (!def?.capacity) throw new EconomyError("that isn't storage");
    return {
      lotId: Number(r.rows[0].lot_id),
      items: await this.rawInventory("furn", String(furnId)),
      capacity: def.capacity,
    };
  }

  // the delivery pallets are a container too — without this a property with
  // racks but no manager would have goods stranded on its own bay
  async bayTransfer(
    eid: number,
    lotId: number,
    item: string,
    qty: number,
    toStore: boolean
  ): Promise<{ pocket: Inv; bay: Inv }> {
    if (!itemById(item)) throw new EconomyError("unknown item");
    if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) throw new EconomyError("bad quantity");
    this.canUseLot(eid, lotId);
    const me = String(eid);
    const bay = await this.rawInventory("dock", String(lotId));
    if (toStore) {
      if (this.total(bay) + qty > DOCK_CAPACITY)
        throw new EconomyError(`the pallets hold ${DOCK_CAPACITY} units`);
    } else {
      const pocket = await this.inventory("entity", me);
      if (!fitsPocket(pocket, item, qty))
        throw new EconomyError(`no room in your bag (${POCKET_SLOTS} slots, ${stackLimit(item)} per stack)`);
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      const from = toStore ? ["entity", me] : ["dock", String(lotId)];
      const to = toStore ? ["dock", String(lotId)] : ["entity", me];
      const take = await client.query(
        `update inventories set qty = qty - $4
          where world_id = $1 and holder_type = $2 and holder_id = $3 and item = $5 and qty >= $4`,
        [WORLD_ID, from[0], from[1], qty, item]
      );
      if (!take.rowCount) throw new EconomyError("not enough items");
      await client.query(
        `insert into inventories (world_id, holder_type, holder_id, item, qty)
         values ($1,$2,$3,$4,$5)
         on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $5`,
        [WORLD_ID, to[0], to[1], item, qty]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    return { pocket: await this.inventory("entity", me), bay: await this.rawInventory("dock", String(lotId)) };
  }

  // move between your pocket and one specific container
  async containerTransfer(
    eid: number,
    furnId: number,
    item: string,
    qty: number,
    toStore: boolean
  ): Promise<{ pocket: Inv; items: Inv; lotId: number }> {
    if (!itemById(item)) throw new EconomyError("unknown item");
    if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) throw new EconomyError("bad quantity");
    const view = await this.containerView(furnId);
    this.canUseLot(eid, view.lotId);
    const me = String(eid);

    if (toStore) {
      if (this.total(view.items) + qty > view.capacity)
        throw new EconomyError(`this holds ${view.capacity} units`);
    } else {
      const pocket = await this.inventory("entity", me);
      if (!fitsPocket(pocket, item, qty))
        throw new EconomyError(`no room in your bag (${POCKET_SLOTS} slots, ${stackLimit(item)} per stack)`);
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const from = toStore
        ? { t: "entity", id: me }
        : { t: "furn", id: String(furnId) };
      const to = toStore ? { t: "furn", id: String(furnId) } : { t: "entity", id: me };
      const take = await client.query(
        `update inventories set qty = qty - $4
          where world_id = $1 and holder_type = $2 and holder_id = $3 and item = $5 and qty >= $4`,
        [WORLD_ID, from.t, from.id, qty, item]
      );
      if (!take.rowCount) throw new EconomyError("not enough items");
      await client.query(
        `insert into inventories (world_id, holder_type, holder_id, item, qty)
         values ($1,$2,$3,$4,$5)
         on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $5`,
        [WORLD_ID, to.t, to.id, item, qty]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    return {
      pocket: await this.inventory("entity", me),
      items: await this.rawInventory("furn", String(furnId)),
      lotId: view.lotId,
    };
  }

  private canUseLot(eid: number, lotId: number): void {
    const st = this.lots.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.lots.ownsLot(eid, lotId) && !this.lots.isTenant(eid, lotId))
      throw new EconomyError("not your lot");
  }

  // move items between the player's pocket and a lot's storage
  async transfer(
    eid: number,
    lotId: number,
    item: string,
    qty: number,
    toLot: boolean
  ): Promise<{ pocket: Inv; lotInv: Inv }> {
    if (!itemById(item)) throw new EconomyError("unknown item");
    if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) throw new EconomyError("bad quantity");
    this.canUseLot(eid, lotId);
    await this.resolveCrafts(lotId);

    const me = String(eid);

    // capacity checks
    if (toLot) {
      const cap = await this.lotCapacity(lotId);
      const lotInv = await this.inventory("lot", String(lotId));
      if (this.total(lotInv) + qty > cap) throw new EconomyError("no room in this property's storage");
    } else {
      const pocket = await this.inventory("entity", me);
      if (!fitsPocket(pocket, item, qty))
        throw new EconomyError(`no room in your bag (${POCKET_SLOTS} slots, ${stackLimit(item)} per stack)`);
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      if (toLot) {
        const take = await client.query(
          `update inventories set qty = qty - $4
            where world_id = $1 and holder_type = 'entity' and holder_id = $2 and item = $3 and qty >= $4`,
          [WORLD_ID, me, item, qty]
        );
        if (!take.rowCount) throw new EconomyError("not enough items");
        const put = await this.putIntoProperty(lotId, item, qty, client);
        if (put < qty) throw new EconomyError("no room in this property's storage");
      } else {
        if (!(await this.takeFromProperty(lotId, item, qty, client)))
          throw new EconomyError("not enough items");
        await client.query(
          `insert into inventories (world_id, holder_type, holder_id, item, qty)
           values ($1,'entity',$2,$3,$4)
           on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $4`,
          [WORLD_ID, me, item, qty]
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    return {
      pocket: await this.inventory("entity", me),
      lotInv: await this.inventory("lot", String(lotId)),
    };
  }

  // start a workbench craft: inputs leave the lot storage now, outputs arrive
  // when the labor time elapses
  async craft(
    eid: number,
    lotId: number,
    recipeId: string,
    count: number
  ): Promise<{ doneAt: number; lotInv: Inv }> {
    const recipe = recipeById(recipeId);
    if (!recipe) throw new EconomyError("unknown recipe");
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new EconomyError("bad count");
    this.canUseLot(eid, lotId);
    if (recipe.permit) await this.requirePermit(lotId, recipe.permit);
    const furn = await this.interiors.items(lotId);
    if (!furn.some((f) => f.item === recipe.station))
      throw new EconomyError(
        `needs a ${furnitureById(recipe.station)?.label ?? recipe.station} in this building`
      );
    await this.resolveCrafts(lotId);

    const doneAt = Date.now() + recipe.minutes * count * 60_000;
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const [item, need] of Object.entries(recipe.inputs)) {
        if (!(await this.takeFromProperty(lotId, item, need * count, client)))
          throw new EconomyError(`needs ${need * count} ${itemById(item)?.label ?? item}`);
      }
      await client.query(
        `insert into crafts (world_id, lot_id, owner_id, recipe, count, done_at)
         values ($1, $2, (select id from players where entity_id = $3), $4, $5, to_timestamp($6 / 1000.0))`,
        [WORLD_ID, lotId, eid, recipeId, count, doneAt]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    return { doneAt, lotInv: await this.inventory("lot", String(lotId)) };
  }

  async pendingCrafts(lotId: number): Promise<Array<{ recipe: string; count: number; doneAt: number }>> {
    const r = await pool.query(
      `select recipe, count, extract(epoch from done_at) * 1000 as done_ms
         from crafts where world_id = $1 and lot_id = $2 order by done_at`,
      [WORLD_ID, lotId]
    );
    return r.rows.map((row) => ({ recipe: row.recipe, count: row.count, doneAt: Number(row.done_ms) }));
  }

  // production sites pile up their yield once per game day, pausing at the
  // stock cap (3 days' worth) until the owner collects
  async produceDay(staffed?: (lotId: number, sourceType: string) => boolean): Promise<number[]> {
    const rows = await pool.query(
      `select id, source_type, source_area, source_extracted from lots
        where world_id = $1 and source_type is not null and source_done_at <= now()`,
      [WORLD_ID]
    );
    const changed: number[] = [];
    for (const r of rows.rows) {
      const def = sourceByType(r.source_type);
      if (!def) continue;
      const area = Number(r.source_area ?? 0);
      // a hired worker on site doubles the daily yield
      const worked = staffed?.(Number(r.id), r.source_type) ?? false;
      // nowhere to put it, nothing gets picked — build storage or ship it out
      const room = (await this.lotCapacity(Number(r.id))) - (await this.lotHeld(Number(r.id)));
      let add = Math.min(sourceYield(def, area) * (worked ? 2 : 1), Math.max(0, room));
      // a quarry or a mine works a deposit: dig it out and the ground gives out
      if (DEPLETING_TYPES.includes(r.source_type)) {
        const left = sourceReserve(def, area) - Number(r.source_extracted ?? 0);
        add = Math.min(add, Math.max(0, left));
        if (add > 0) {
          await pool.query(
            "update lots set source_extracted = source_extracted + $3 where world_id = $1 and id = $2",
            [WORLD_ID, r.id, add]
          );
          const st = this.lots.noteExtraction(Number(r.id), add);
          if (st) registry.broadcast("lot", st);
        }
      }
      if (add <= 0) continue;
      if ((await this.putIntoProperty(Number(r.id), def.item, add)) <= 0) continue;
      changed.push(Number(r.id));
    }
    return changed;
  }

  // scoop everything the site has piled up into the owner's bag (as much as fits)
  async collectSource(eid: number, lotId: number): Promise<{ pocket: Inv; collected: number; item: string }> {
    const st = this.lots.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.lots.ownsLot(eid, lotId)) throw new EconomyError("not your lot");
    if (!st.source) throw new EconomyError("nothing producing here");
    const def = sourceByType(st.source.type);
    if (!def) throw new EconomyError("nothing producing here");
    const inv = await this.inventory("lot", String(lotId));
    const stock = inv[def.item] ?? 0;
    if (stock <= 0) throw new EconomyError("nothing to collect yet");
    const pocket = await this.inventory("entity", String(eid));
    const lim = stackLimit(def.item);
    const cur = pocket[def.item] ?? 0;
    const freeInStack = cur % lim === 0 ? 0 : lim - (cur % lim);
    const freeSlots = POCKET_SLOTS - slotsUsed(pocket);
    const maxFit = freeInStack + Math.max(0, freeSlots) * lim;
    const take = Math.min(stock, maxFit);
    if (take <= 0) throw new EconomyError("your bag is full");

    const client = await pool.connect();
    try {
      await client.query("begin");
      if (!(await this.takeFromProperty(lotId, def.item, take, client)))
        throw new EconomyError("nothing to collect yet");
      await client.query(
        `insert into inventories (world_id, holder_type, holder_id, item, qty)
         values ($1,'entity',$2,$3,$4)
         on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $4`,
        [WORLD_ID, String(eid), def.item, take]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    return { pocket: await this.inventory("entity", String(eid)), collected: take, item: def.item };
  }

  // ---------------- retail shelves ----------------
  // A shelf is a unit of retail: it lists one item at one price and holds its
  // own stock. Nothing about it is shared with the building's racks — a stocker
  // is what carries goods from one to the other.

  private shelfUnitCapacity(): number {
    return furnitureById("shelf")?.capacity ?? 40;
  }

  private async shelfLot(furnId: number): Promise<number> {
    const r = await pool.query(
      "select lot_id, item from furniture where world_id = $1 and id = $2",
      [WORLD_ID, furnId]
    );
    if (!r.rowCount || r.rows[0].item !== "shelf") throw new EconomyError("not a shop shelf");
    return Number(r.rows[0].lot_id);
  }

  async shelfView(furnId: number): Promise<{
    lotId: number;
    item: string | null;
    price: number | null;
    qty: number;
    capacity: number;
  }> {
    const lotId = await this.shelfLot(furnId);
    const r = await pool.query(
      "select item, price from shelf_listings where world_id = $1 and furn_id = $2",
      [WORLD_ID, furnId]
    );
    const item = r.rowCount ? String(r.rows[0].item) : null;
    const inv = await this.rawInventory("shelf", String(furnId));
    return {
      lotId,
      item,
      price: r.rowCount ? Number(r.rows[0].price) : null,
      qty: item ? inv[item] ?? 0 : this.total(inv),
      capacity: this.shelfUnitCapacity(),
    };
  }

  // choose what this shelf sells, and for how much. Clearing the listing sends
  // whatever is on it back into the building's storage.
  async setShelfListing(
    eid: number,
    furnId: number,
    item: string | null,
    price: number | null
  ): Promise<void> {
    const lotId = await this.shelfLot(furnId);
    this.canUseLot(eid, lotId);
    if (item === null) {
      const inv = await this.rawInventory("shelf", String(furnId));
      for (const [id, qty] of Object.entries(inv)) {
        if (qty <= 0) continue;
        await pool.query(
          "update inventories set qty = 0 where world_id = $1 and holder_type = 'shelf' and holder_id = $2 and item = $3",
          [WORLD_ID, String(furnId), id]
        );
        await this.putIntoProperty(lotId, id, qty);
      }
      await pool.query("delete from shelf_listings where world_id = $1 and furn_id = $2", [
        WORLD_ID,
        furnId,
      ]);
      return;
    }
    if (!itemById(item)) throw new EconomyError("unknown item");
    const cat = permitFor(item);
    if (cat) await this.requirePermit(lotId, cat);
    const p = Math.round(Number(price) * 100) / 100;
    if (!(p > 0) || p > 1_000_000) throw new EconomyError("bad price");

    // switching what a shelf sells clears the old stock back into storage
    const cur = await this.rawInventory("shelf", String(furnId));
    for (const [id, qty] of Object.entries(cur)) {
      if (id === item || qty <= 0) continue;
      await pool.query(
        "update inventories set qty = 0 where world_id = $1 and holder_type = 'shelf' and holder_id = $2 and item = $3",
        [WORLD_ID, String(furnId), id]
      );
      await this.putIntoProperty(lotId, id, qty);
    }
    await pool.query(
      `insert into shelf_listings (world_id, furn_id, lot_id, item, price) values ($1,$2,$3,$4,$5)
       on conflict (world_id, furn_id) do update set item = $4, price = $5, lot_id = $3`,
      [WORLD_ID, furnId, lotId, item, p]
    );
  }

  // Stock a shelf out of your own bag, or take stock off it. Goods only come
  // off the building's racks by way of a stocker — that is the whole job.
  async stockShelf(eid: number, furnId: number, qty: number, toShelf: boolean): Promise<void> {
    if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) throw new EconomyError("bad quantity");
    const view = await this.shelfView(furnId);
    this.canUseLot(eid, view.lotId);
    if (!view.item) throw new EconomyError("choose what this shelf sells first");
    const item = view.item;
    const me = String(eid);

    if (toShelf) {
      if (view.qty + qty > view.capacity)
        throw new EconomyError(`a shelf holds ${view.capacity} units`);
    } else {
      const pocket = await this.inventory("entity", me);
      if (!fitsPocket(pocket, item, qty))
        throw new EconomyError(`no room in your bag (${POCKET_SLOTS} slots, ${stackLimit(item)} per stack)`);
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const from = toShelf ? ["entity", me] : ["shelf", String(furnId)];
      const to = toShelf ? ["shelf", String(furnId)] : ["entity", me];
      const take = await client.query(
        `update inventories set qty = qty - $4
          where world_id = $1 and holder_type = $2 and holder_id = $3 and item = $5 and qty >= $4`,
        [WORLD_ID, from[0], from[1], qty, item]
      );
      if (!take.rowCount)
        throw new EconomyError(toShelf ? "you don't have that many" : "not that much on the shelf");
      await client.query(
        `insert into inventories (world_id, holder_type, holder_id, item, qty)
         values ($1,$2,$3,$4,$5)
         on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $5`,
        [WORLD_ID, to[0], to[1], item, qty]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  // every shelf in a shop, for the shop panel and the 3D fittings
  async shelvesOf(lotId: number): Promise<
    Array<{ furnId: number; item: string | null; price: number | null; qty: number; capacity: number }>
  > {
    const items = (await this.interiors.items(lotId)).filter((i) => i.item === "shelf");
    const out = [];
    for (const it of items) {
      const v = await this.shelfView(it.id);
      out.push({ furnId: it.id, item: v.item, price: v.price, qty: v.qty, capacity: v.capacity });
    }
    return out;
  }

  // An NPC shopkeeper doesn't fuss over which shelf: it uses the one already
  // selling its product, or the first empty one, then keeps it stocked.
  async autoRetail(
    eid: number,
    lotId: number,
    item: string,
    price: number,
    qty: number
  ): Promise<void> {
    const shelves = await this.shelvesOf(lotId);
    if (!shelves.length) return;
    // Restock what is already listed. An empty shelf is only claimed in a shop
    // where nothing is listed at all — otherwise an owner who deliberately
    // leaves a shelf free would find the shopkeeper had taken it over.
    const listed = shelves.find((sh) => sh.item === item);
    const target = listed ?? (shelves.every((sh) => sh.item === null) ? shelves[0] : undefined);
    if (!target) return;
    await this.setShelfListing(eid, target.furnId, item, price);
    // the shop's own staff carry it out of the racks — the same trip a
    // stocker makes, not a reach into the owner's pockets
    const room = target.capacity - (target.item === item ? target.qty : 0);
    const take = Math.min(qty, room);
    if (take > 0 && (await this.takeFromProperty(lotId, item, take)))
      await pool.query(
        `insert into inventories (world_id, holder_type, holder_id, item, qty)
         values ($1,'shelf',$2,$3,$4)
         on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $4`,
        [WORLD_ID, String(target.furnId), item, take]
      );
  }

  async shelfCapacity(lotId: number): Promise<number> {
    const items = await this.interiors.items(lotId);
    return items.filter((i) => i.item === "shelf").length * this.shelfUnitCapacity();
  }

  // finished crafts deposit their outputs (storage overflow is discarded-safe:
  // outputs always land; capacity only gates deliberate deposits)
  async resolveCrafts(lotId?: number): Promise<void> {
    const r = await pool.query(
      `delete from crafts where world_id = $1 and done_at <= now() ${lotId ? "and lot_id = $2" : ""} returning lot_id, recipe, count`,
      lotId ? [WORLD_ID, lotId] : [WORLD_ID]
    );
    for (const row of r.rows) {
      const recipe = recipeById(row.recipe);
      if (!recipe) continue;
      // finished goods go into whichever rack in the building has room
      await this.putIntoProperty(Number(row.lot_id), recipe.out, recipe.outQty * row.count);
    }
  }

}
