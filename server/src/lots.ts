import {
  itemById,
  sourceByType,
  sourceReserve,
  sourceSetupCost,
  DEPLETING_TYPES,
  planArea,
  shapesOverlap,
  buildCost,
  BuildingDef,
  buildingForLot,
  CityMap,
  CustomPlan,
  LotDef,
  LotState,
  TILE_WORLD_SIZE,
  validatePlan,
} from "@mc/shared";
import { pool } from "./db.js";

const depletes = (t: string) => DEPLETING_TYPES.includes(t);
import { EconomyError } from "./errors.js";
import { CITY_ENTITY, credit, debit, transfer } from "./accounts.js";

const WORLD_ID = 1;

export { EconomyError };

// Authoritative lot/market state. Postgres is the source of truth; this class
// keeps an in-memory mirror for fast reads and returns updated wire rows for
// broadcasting. All ownership is by ENTITY id (players, city — later npcs,
// companies, families); all money moves through accounts.ts inside single
// transactions.
export class LotStore {
  private lots = new Map<number, LotDef>();
  private state = new Map<number, LotState>();
  private names = new Map<number, string>(); // entity id -> display name
  private tileIndex = new Map<number, number>(); // tileY*W+tileX -> lot id
  private traffic = new Map<number, number>(); // lot id -> visits this game day
  private missed = new Map<number, number>(); // lot id -> missed rent payments

  get mapSeed(): number {
    return this.map.seed;
  }

  constructor(private map: CityMap) {
    for (const l of map.lots) {
      this.lots.set(l.id, l);
      for (let y = l.y; y < l.y + l.h; y++)
        for (let x = l.x; x < l.x + l.w; x++) this.tileIndex.set(y * map.width + x, l.id);
    }
  }

  // foot traffic sampling: players standing on/near a lot raise its value
  recordTraffic(wx: number, wy: number) {
    const x = Math.floor(wx / TILE_WORLD_SIZE);
    const y = Math.floor(wy / TILE_WORLD_SIZE);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const id = this.tileIndex.get((y + dy) * this.map.width + (x + dx));
        if (id) this.traffic.set(id, (this.traffic.get(id) ?? 0) + 1);
      }
  }

  async load() {
    const rows = await pool.query(
      `select l.id, l.name, l.sign, l.for_sale, l.price, l.value, l.for_rent, l.rent,
              l.owner_entity_id, l.tenant_entity_id,
              l.missed_payments, l.cleared, l.source_type, l.source_area, l.source_shape, l.source_extracted,
              extract(epoch from l.source_done_at) * 1000 as source_ms,
              oe.kind as owner_kind, oe.name as owner_name, te.name as tenant_name,
              b.template, b.kind, b.floors, b.seed, b.name as bname, b.shape,
              extract(epoch from b.done_at) * 1000 as done_ms
         from lots l
         left join entities oe on oe.id = l.owner_entity_id
         left join entities te on te.id = l.tenant_entity_id
         left join buildings b on b.world_id = l.world_id and b.lot_id = l.id
        where l.world_id = $1`,
      [WORLD_ID]
    );
    for (const r of rows.rows) {
      const ownerEid = Number(r.owner_entity_id ?? CITY_ENTITY);
      const isCity = (r.owner_kind ?? "city") === "city";
      if (r.owner_name) this.names.set(ownerEid, r.owner_name);
      if (r.tenant_name) this.names.set(Number(r.tenant_entity_id), r.tenant_name);
      if (r.missed_payments) this.missed.set(r.id, r.missed_payments);
      this.state.set(r.id, {
        id: r.id,
        name: r.name ?? null,
        sign: r.sign ?? true,
        ownerType: isCity ? "city" : "player",
        ownerId: isCity ? null : String(ownerEid),
        ownerName: isCity ? null : (r.owner_name ?? null),
        // city lots are always for sale at assessed value
        forSale: isCity ? true : r.for_sale,
        price: isCity ? Number(r.value) : Number(r.price ?? 0),
        forRent: r.for_rent,
        rent: Number(r.rent ?? 0),
        tenantId: r.tenant_entity_id !== null ? String(r.tenant_entity_id) : null,
        tenantName: r.tenant_name ?? null,
        cleared: r.cleared,
        source: r.source_type
          ? {
              type: r.source_type,
              doneAt: Number(r.source_ms),
              area: Number(r.source_area ?? 0),
              extracted: Number(r.source_extracted ?? 0),
              reserve: depletes(r.source_type)
                ? sourceReserve(sourceByType(r.source_type)!, Number(r.source_area ?? 0))
                : 0,
              shape: r.source_shape ?? undefined,
            }
          : null,
        building: r.template
          ? {
              template: r.template,
              kind: r.kind,
              floors: r.floors,
              seed: r.seed,
              name: r.bname,
              doneAt: Number(r.done_ms),
              // legacy shapes predate per-section floors
              shape: r.shape
                ? (r.shape as any[]).map((sr) => ({ ...sr, f: sr.f ?? r.floors }))
                : undefined,
            }
          : null,
      });
    }
    console.log(`[lots] loaded market state for ${this.state.size} lots`);
  }

  all(): LotState[] {
    return [...this.state.values()];
  }

  get(lotId: number): LotState | undefined {
    return this.state.get(lotId);
  }

  lotDef(lotId: number): LotDef | undefined {
    return this.lots.get(lotId);
  }

  // entities eid may act as — self only until CompaniesStore injects control
  private controlResolver: (eid: number) => Set<number> = (eid) => new Set([eid]);

  setControlResolver(fn: (eid: number) => Set<number>): void {
    this.controlResolver = fn;
  }

  ownsLot(eid: number, lotId: number): boolean {
    const st = this.state.get(lotId);
    if (!st || st.ownerType === "city") return false;
    return this.controlResolver(eid).has(Number(st.ownerId));
  }

  // the pit gets deeper as the deposit comes out: keep the live state in step
  // with the ground so the site visibly ages without waiting for a reload
  noteExtraction(lotId: number, amount: number): LotState | null {
    const st = this.state.get(lotId);
    if (!st?.source || amount <= 0) return null;
    st.source.extracted += amount;
    return st;
  }

  // in-memory owner swap after a DB-side ownership transfer (company moves)
  async reassignOwner(lotId: number, toEid: number): Promise<LotState> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    st.ownerType = "player";
    st.ownerId = String(toEid);
    st.ownerName = await this.entityName(toEid);
    st.forSale = false;
    st.price = 0;
    return st;
  }

  isTenant(eid: number, lotId: number): boolean {
    const st = this.state.get(lotId);
    return !!st && st.tenantId === String(eid);
  }

  // the entity operating a lot's business: tenant, else owner
  operatorOf(lotId: number): number | null {
    const st = this.state.get(lotId);
    if (!st) return null;
    if (st.tenantId) return Number(st.tenantId);
    return st.ownerType === "city" ? null : Number(st.ownerId);
  }

  // the effective building on a lot: player-built (DB) wins, else derived
  buildingDef(lotId: number): BuildingDef | null {
    const lot = this.lots.get(lotId);
    const st = this.state.get(lotId);
    if (!lot || !st) return null;
    if (st.building)
      return {
        kind: st.building.kind,
        floors: st.building.floors,
        style: st.building.seed % 4,
        seed: st.building.seed,
        name: st.building.name,
        shape: st.building.shape,
      };
    if (st.cleared) return null; // pre-existing building was demolished
    return buildingForLot(this.map.seed, lot);
  }

  // vacant = no procedural city building and no player-built one
  isVacant(lotId: number): boolean {
    const lot = this.lots.get(lotId);
    const st = this.state.get(lotId);
    if (!lot || !st) return false;
    return !st.building && (st.cleared || buildingForLot(this.map.seed, lot) === null);
  }

  private async entityName(eid: number): Promise<string> {
    const hit = this.names.get(eid);
    if (hit) return hit;
    const r = await pool.query("select name from entities where id = $1", [eid]);
    const name = r.rows[0]?.name ?? "?";
    this.names.set(eid, name);
    return name;
  }

  // Returns the updated lot row + new clean balances for any entities involved.
  async buy(buyerEid: number, lotId: number): Promise<{ lot: LotState; cash: Map<number, number> }> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!st.forSale) throw new EconomyError("lot is not for sale");
    if (st.ownerId === String(buyerEid)) throw new EconomyError("you already own this lot");
    const price = st.price;
    const sellerEid = st.ownerType === "city" ? CITY_ENTITY : Number(st.ownerId);

    const client = await pool.connect();
    const cash = new Map<number, number>();
    try {
      await client.query("begin");
      const bal = await transfer(client, buyerEid, sellerEid, price, "land", `buy lot ${lotId}`);
      cash.set(buyerEid, bal.from);
      cash.set(sellerEid, bal.to);
      const upd = await client.query(
        `update lots set owner_entity_id = $1, owner_type = 'player', for_sale = false, price = null,
                for_rent = false
          where world_id = $2 and id = $3
            and (owner_entity_id = $4 or owner_entity_id is null)`,
        [buyerEid, WORLD_ID, lotId, sellerEid]
      );
      if (!upd.rowCount) throw new EconomyError("lot state changed, try again");
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    st.ownerType = "player";
    st.ownerId = String(buyerEid);
    st.ownerName = await this.entityName(buyerEid);
    st.forSale = false;
    st.price = 0;
    st.forRent = false;
    return { lot: st, cash };
  }

  // An owner names their own property. Clearing the name sends it back to
  // being known by its lot number.
  async rename(eid: number, lotId: number, name: string): Promise<LotState> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 30);
    if (clean && clean.length < 2) throw new EconomyError("name must be at least 2 characters");
    await pool.query("update lots set name = $1 where world_id = $2 and id = $3", [
      clean || null,
      WORLD_ID,
      lotId,
    ]);
    st.name = clean || null;
    return st;
  }

  async setSign(eid: number, lotId: number, on: boolean): Promise<LotState> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    await pool.query("update lots set sign = $1 where world_id = $2 and id = $3", [on, WORLD_ID, lotId]);
    st.sign = on;
    return st;
  }

  async list(eid: number, lotId: number, price: number): Promise<LotState> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    if (!(price > 0) || price > 100_000_000) throw new EconomyError("bad price");
    const upd = await pool.query(
      "update lots set for_sale = true, price = $1 where world_id = $2 and id = $3 and owner_entity_id = $4",
      [price, WORLD_ID, lotId, eid]
    );
    if (!upd.rowCount) throw new EconomyError("lot state changed");
    st.forSale = true;
    st.price = price;
    return st;
  }

  async unlist(eid: number, lotId: number): Promise<LotState> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    await pool.query(
      "update lots set for_sale = false, price = null where world_id = $1 and id = $2 and owner_entity_id = $3",
      [WORLD_ID, lotId, eid]
    );
    st.forSale = false;
    st.price = 0;
    return st;
  }

  async build(
    eid: number,
    lotId: number,
    plan: CustomPlan
  ): Promise<{ lot: LotState; cash: Map<number, number> }> {
    const st = this.state.get(lotId);
    const lot = this.lots.get(lotId);
    if (!st || !lot) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    // extending an existing player-built structure: new sections join the
    // current shape; materials are charged for the addition only
    const extending = !!st.building;
    let combined = plan.rects;
    if (extending) {
      const b = st.building!;
      if (Date.now() < b.doneAt) throw new EconomyError("still under construction");
      if (b.template !== "custom" || !b.shape?.length)
        throw new EconomyError("only your own custom buildings can be extended");
      if (st.tenantId) throw new EconomyError("can't renovate with a tenant inside");
      combined = [...b.shape, ...plan.rects];
    } else if (!st.source && !this.isVacant(lotId)) {
      throw new EconomyError("lot is not vacant");
    }
    // buildings and fields share the lot, never the same ground
    if (st.source?.shape?.length && shapesOverlap(plan.rects, st.source.shape))
      throw new EconomyError("overlaps your field — draw beside it");
    if (!plan.rects.length) throw new EconomyError("draw at least one section");
    const invalid = validatePlan(lot, { rects: combined, floors: plan.floors });
    if (invalid) throw new EconomyError(invalid);

    // added sections priced on their own, each at its own floor count
    const cost = buildCost({ rects: plan.rects, floors: plan.floors });
    const floors = combined.reduce((m, r) => Math.max(m, r.f ?? plan.floors), 1);
    const ownerName = await this.entityName(eid);
    const bname = extending ? st.building!.name : `${ownerName} Building`;
    const seed = extending
      ? st.building!.seed
      : (Math.imul(lotId, 2654435761) ^ Date.now()) & 0x7fffffff; // fits pg integer
    const doneAt = Date.now() + cost.minutes * 60_000;

    const client = await pool.connect();
    const cash = new Map<number, number>();
    try {
      await client.query("begin");
      // materials come out of the builder's bag
      for (const [item, need] of Object.entries(cost.materials)) {
        if (!need) continue;
        const take = await client.query(
          `update inventories set qty = qty - $4
            where world_id = $1 and holder_type = 'entity' and holder_id = $2 and item = $3 and qty >= $4`,
          [WORLD_ID, String(eid), item, need]
        );
        if (!take.rowCount) {
          const have = await client.query(
            `select qty from inventories where world_id = $1 and holder_type = 'entity' and holder_id = $2 and item = $3`,
            [WORLD_ID, String(eid), item]
          );
          throw new EconomyError(
            `needs ${need - Number(have.rows[0]?.qty ?? 0)} more ${itemById(item)?.label ?? item} in your bag`
          );
        }
      }
      if (extending)
        await client.query(
          `update buildings set shape = $3, done_at = to_timestamp($4 / 1000.0)
            where world_id = $1 and lot_id = $2`,
          [WORLD_ID, lotId, JSON.stringify(combined), doneAt]
        );
      else
        await client.query(
          `insert into buildings (world_id, lot_id, owner_id, template, kind, floors, seed, name, done_at, shape)
           values ($1, $2, (select id from players where entity_id = $3), 'custom', 'custom', $4, $5, $6, to_timestamp($7 / 1000.0), $8)`,
          [WORLD_ID, lotId, eid, floors, seed, bname, doneAt, JSON.stringify(plan.rects)]
        );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      if ((err as any)?.code === "23505") throw new EconomyError("already built here");
      throw err;
    } finally {
      client.release();
    }

    st.building = {
      template: "custom",
      kind: "custom",
      floors,
      seed,
      name: bname,
      doneAt,
      shape: combined,
    };
    return { lot: st, cash };
  }

  // ---------------- tenancy ----------------

  async listRent(eid: number, lotId: number, rent: number): Promise<LotState> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    if (!this.buildingDef(lotId)) throw new EconomyError("nothing built here to rent out");
    if (st.building && Date.now() < st.building.doneAt)
      throw new EconomyError("still under construction");
    if (st.tenantId) throw new EconomyError("already has a tenant");
    if (!(rent > 0) || rent > 1_000_000) throw new EconomyError("bad rent");
    await pool.query(
      "update lots set for_rent = true, rent = $1 where world_id = $2 and id = $3 and owner_entity_id = $4",
      [rent, WORLD_ID, lotId, eid]
    );
    st.forRent = true;
    st.rent = rent;
    return st;
  }

  async unlistRent(eid: number, lotId: number): Promise<LotState> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    await pool.query(
      "update lots set for_rent = false where world_id = $1 and id = $2 and owner_entity_id = $3",
      [WORLD_ID, lotId, eid]
    );
    st.forRent = false;
    return st;
  }

  // first day's rent is paid up front
  async rentLot(eid: number, lotId: number): Promise<{ lot: LotState; cash: Map<number, number> }> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!st.forRent || st.tenantId) throw new EconomyError("not available to rent");
    if (st.ownerId === String(eid)) throw new EconomyError("you own this lot");
    const ownerEid = Number(st.ownerId);
    const rent = st.rent;

    const client = await pool.connect();
    const cash = new Map<number, number>();
    try {
      await client.query("begin");
      const bal = await transfer(client, eid, ownerEid, rent, "rent", `rent lot ${lotId}`);
      cash.set(eid, bal.from);
      cash.set(ownerEid, bal.to);
      const upd = await client.query(
        `update lots set tenant_entity_id = $1, tenant_id = null, for_rent = false, missed_payments = 0
          where world_id = $2 and id = $3 and for_rent = true and tenant_entity_id is null`,
        [eid, WORLD_ID, lotId]
      );
      if (!upd.rowCount) throw new EconomyError("lot state changed, try again");
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    st.tenantId = String(eid);
    st.tenantName = await this.entityName(eid);
    st.forRent = false;
    this.missed.delete(lotId);
    return { lot: st, cash };
  }

  async endTenancy(eid: number, lotId: number): Promise<LotState> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    const isOwner = this.ownsLot(eid, lotId);
    if (!isOwner && st.tenantId !== String(eid)) throw new EconomyError("not your tenancy");
    if (!st.tenantId) throw new EconomyError("no tenant");
    await pool.query(
      "update lots set tenant_entity_id = null, tenant_id = null, missed_payments = 0 where world_id = $1 and id = $2",
      [WORLD_ID, lotId]
    );
    st.tenantId = null;
    st.tenantName = null;
    this.missed.delete(lotId);
    return st;
  }

  // ---------------- resource production sites ----------------

  async setupSource(
    eid: number,
    lotId: number,
    type: string,
    rects: import("@mc/shared").PlanRect[]
  ): Promise<{ lot: LotState; cash: Map<number, number> }> {
    const def = sourceByType(type);
    if (!def) throw new EconomyError("unknown production type");
    const st = this.state.get(lotId);
    const lot = this.lots.get(lotId);
    if (!st || !lot) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    if (st.building && (st.building.template !== "custom" || !st.building.shape?.length))
      throw new EconomyError("demolish the existing building first");
    const expanding = !!st.source;
    let combined = rects;
    if (expanding) {
      if (st.source!.type !== type)
        throw new EconomyError("this lot already produces something else — tear it down first");
      combined = [...(st.source!.shape ?? []), ...rects];
    } else if (!st.building && !this.isVacant(lotId)) {
      throw new EconomyError("lot is not clear");
    }
    // fields and buildings share the lot, never the same ground
    if (st.building?.shape?.length && shapesOverlap(rects, st.building.shape))
      throw new EconomyError("overlaps the building — draw beside it");
    if (!rects.length) throw new EconomyError("draw at least one section");
    const invalid = validatePlan(lot, { rects: combined, floors: 1 }, 1);
    if (invalid) throw new EconomyError(invalid);
    const area = planArea({ rects: combined, floors: 1 });
    // pay only for newly covered cells (overlaps with the old field are free)
    const addedArea = expanding ? area - st.source!.area : area;
    if (addedArea <= 0) throw new EconomyError("the new sections add no new ground");
    const setupCost = sourceSetupCost(def, addedArea);

    const doneAt = Date.now(); // production sites place instantly
    const client = await pool.connect();
    const cash = new Map<number, number>();
    try {
      await client.query("begin");
      const bal = await transfer(
        client, eid, CITY_ENTITY, setupCost, "production_setup", `set up ${def.label} on lot ${lotId}`
      );
      cash.set(eid, bal.from);
      await client.query(
        `update lots set source_type = $3, source_done_at = to_timestamp($4 / 1000.0),
                source_area = $5, source_shape = $6 where world_id = $1 and id = $2`,
        [WORLD_ID, lotId, type, doneAt, area, JSON.stringify(combined)]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    st.source = {
      type,
      doneAt,
      area,
      extracted: st.source?.extracted ?? 0,
      reserve: depletes(type) ? sourceReserve(sourceByType(type)!, area) : 0,
      shape: combined,
    };
    return { lot: st, cash };
  }

  // ---------------- demolish & maintain ----------------

  // Clear whatever is inside a selected area of a plot — one cell or the whole
  // thing. Workings and building sections that the selection touches come out;
  // a delivery pad inside it goes too. What is left standing stays.
  async demolishArea(
    eid: number,
    lotId: number,
    rect: { x: number; y: number; w: number; h: number }
  ): Promise<{ lot: LotState; cash: Map<number, number>; removed: string[] }> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    if (st.tenantId) throw new EconomyError("evict or wait out the tenant first");
    const hits = (r: { x: number; y: number; w: number; h: number }) =>
      rect.x < r.x + r.w && r.x < rect.x + rect.w && rect.y < r.y + r.h && r.y < rect.y + rect.h;

    const removed: string[] = [];
    const cash = new Map<number, number>();
    const client = await pool.connect();
    try {
      await client.query("begin");

      const bay = await client.query(
        "select cell_x, cell_y from docks where world_id = $1 and lot_id = $2",
        [WORLD_ID, lotId]
      );
      if (bay.rowCount) {
        const b = { x: Number(bay.rows[0].cell_x ?? 0), y: Number(bay.rows[0].cell_y ?? 0), w: 1, h: 1 };
        if (hits(b)) {
          await client.query("delete from docks where world_id = $1 and lot_id = $2", [WORLD_ID, lotId]);
          await client.query(
            "delete from dock_lines where world_id = $1 and (lot_id = $2 or partner_lot = $2)",
            [WORLD_ID, lotId]
          );
          // the bay's goods go home with the demolisher — see interiors.remove
          await client.query(
            `insert into inventories (world_id, holder_type, holder_id, item, qty)
             select world_id, 'entity', $2, item, qty from inventories
              where world_id = $1 and holder_type = 'dock' and holder_id = $3
             on conflict (world_id, holder_type, holder_id, item)
               do update set qty = inventories.qty + excluded.qty`,
            [WORLD_ID, String(eid), String(lotId)]
          );
          await client.query(
            "delete from inventories where world_id = $1 and holder_type = 'dock' and holder_id = $2",
            [WORLD_ID, String(lotId)]
          );
          removed.push("delivery space");
        }
      }

      let structural = false;
      if (st.source?.shape?.length) {
        const keep = st.source.shape.filter((r) => !hits(r));
        if (keep.length !== st.source.shape.length) {
          structural = true;
          if (!keep.length) {
            await client.query(
              `update lots set source_type = null, source_done_at = null, source_area = null,
                      source_shape = null, source_extracted = 0 where world_id = $1 and id = $2`,
              [WORLD_ID, lotId]
            );
            st.source = null;
            removed.push("the workings");
          } else {
            const area = keep.reduce((a, r) => a + r.w * r.h, 0);
            await client.query(
              "update lots set source_shape = $3, source_area = $4 where world_id = $1 and id = $2",
              [WORLD_ID, lotId, JSON.stringify(keep), area]
            );
            st.source = { ...st.source, shape: keep, area };
            removed.push("part of the workings");
          }
        }
      }

      if (st.building) {
        const shape = st.building.shape ?? [];
        const keep = shape.filter((r) => !hits(r));
        const touched = !shape.length || keep.length !== shape.length;
        if (touched) {
          structural = true;
          if (!keep.length) {
            await client.query("delete from furniture where world_id = $1 and lot_id = $2", [WORLD_ID, lotId]);
            await client.query("delete from buildings where world_id = $1 and lot_id = $2", [WORLD_ID, lotId]);
            await client.query("update lots set cleared = true where world_id = $1 and id = $2", [WORLD_ID, lotId]);
            st.building = null;
            st.cleared = true;
            removed.push("the building");
          } else {
            await client.query("update buildings set shape = $3 where world_id = $1 and lot_id = $2", [
              WORLD_ID,
              lotId,
              JSON.stringify(keep),
            ]);
            st.building = { ...st.building, shape: keep };
            removed.push("part of the building");
          }
        }
      } else if (this.buildingDef(lotId) !== null && !st.cleared) {
        // a pre-existing city building comes down whole
        structural = true;
        await client.query("update lots set cleared = true where world_id = $1 and id = $2", [WORLD_ID, lotId]);
        st.cleared = true;
        removed.push("the old building");
      }

      if (!removed.length) throw new EconomyError("nothing there to remove");
      if (structural) {
        const bal = await transfer(client, eid, CITY_ENTITY, 250, "demolition", `demolition on lot ${lotId}`);
        cash.set(eid, bal.from);
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    return { lot: st, cash, removed };
  }

  async demolish(eid: number, lotId: number): Promise<{ lot: LotState; cash: Map<number, number> }> {
    const st = this.state.get(lotId);
    if (!st) throw new EconomyError("no such lot");
    if (!this.ownsLot(eid, lotId)) throw new EconomyError("you don't own this lot");
    if (st.tenantId) throw new EconomyError("evict or wait out the tenant first");
    if (!this.buildingDef(lotId) && !st.source) throw new EconomyError("nothing to demolish");
    const FEE = 250;

    const client = await pool.connect();
    const cash = new Map<number, number>();
    try {
      await client.query("begin");
      const bal = await transfer(client, eid, CITY_ENTITY, FEE, "demolition", `demolish lot ${lotId}`);
      cash.set(eid, bal.from);
      await client.query("delete from furniture where world_id = $1 and lot_id = $2", [WORLD_ID, lotId]);
      if (st.source) {
        await client.query(
          `update lots set source_type = null, source_done_at = null,
                  source_area = null, source_shape = null where world_id = $1 and id = $2`,
          [WORLD_ID, lotId]
        );
        // clear any uncollected yields
        await client.query(
          "delete from inventories where world_id = $1 and holder_type = 'lot' and holder_id = $2",
          [WORLD_ID, String(lotId)]
        );
      } else if (st.building) {
        await client.query("delete from buildings where world_id = $1 and lot_id = $2", [WORLD_ID, lotId]);
      } else {
        await client.query("update lots set cleared = true where world_id = $1 and id = $2", [WORLD_ID, lotId]);
      }
      await client.query("update lots set for_rent = false where world_id = $1 and id = $2", [WORLD_ID, lotId]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    if (st.source) st.source = null;
    else if (st.building) st.building = null;
    else st.cleared = true;
    st.forRent = false;
    return { lot: st, cash };
  }

  // ---------------- game-day economy tick ----------------

  async collectRents(): Promise<{ notes: Array<{ eid: number; msg: string }>; changed: LotState[] }> {
    const notes: Array<{ eid: number; msg: string }> = [];
    const changed: LotState[] = [];
    for (const st of this.state.values()) {
      if (!st.tenantId || !st.ownerId) continue;
      const tenant = Number(st.tenantId);
      const owner = Number(st.ownerId);
      const rent = st.rent;
      const client = await pool.connect();
      try {
        await client.query("begin");
        let paid = true;
        try {
          await transfer(client, tenant, owner, rent, "rent", `daily rent lot ${st.id}`);
        } catch (err) {
          if (err instanceof EconomyError) paid = false;
          else throw err;
        }
        if (paid) {
          await client.query(
            "update lots set missed_payments = 0 where world_id = $1 and id = $2",
            [WORLD_ID, st.id]
          );
          await client.query("commit");
          this.missed.delete(st.id);
          notes.push({ eid: tenant, msg: `Rent paid: -$${rent} (lot ${st.id})` });
          notes.push({ eid: owner, msg: `Rent received: +$${rent} (lot ${st.id})` });
        } else {
          await client.query("rollback");
          await client.query("begin");
          const miss = (this.missed.get(st.id) ?? 0) + 1;
          if (miss >= 2) {
            await client.query(
              "update lots set tenant_entity_id = null, tenant_id = null, missed_payments = 0 where world_id = $1 and id = $2",
              [WORLD_ID, st.id]
            );
            await client.query("commit");
            this.missed.delete(st.id);
            notes.push({ eid: tenant, msg: `Evicted from lot ${st.id} (unpaid rent)` });
            notes.push({ eid: owner, msg: `Tenant evicted from lot ${st.id} (unpaid rent)` });
            st.tenantId = null;
            st.tenantName = null;
            changed.push(st);
          } else {
            await client.query(
              "update lots set missed_payments = $3 where world_id = $1 and id = $2",
              [WORLD_ID, st.id, miss]
            );
            await client.query("commit");
            this.missed.set(st.id, miss);
            notes.push({ eid: tenant, msg: `Missed rent on lot ${st.id} (${miss}/2 — eviction next)` });
            notes.push({ eid: owner, msg: `Tenant missed rent on lot ${st.id} (${miss}/2)` });
          }
        }
      } catch (err) {
        await client.query("rollback");
        console.error(err);
      } finally {
        client.release();
      }
    }
    return { notes, changed };
  }

  trafficByLot(): Map<number, number> {
    return new Map(this.traffic);
  }

  // land value = generated base × foot-traffic boost, recomputed per game day
  async recomputeValues(): Promise<LotState[]> {
    const changed: LotState[] = [];
    for (const [id, visits] of this.traffic.entries()) {
      const lot = this.lots.get(id);
      const st = this.state.get(id);
      if (!lot || !st) continue;
      const boost = 1 + Math.min(0.5, 0.08 * Math.log2(1 + visits));
      const newVal = Math.round(lot.value * boost);
      const current = st.ownerType === "city" ? st.price : null;
      if (current !== null && newVal !== current) {
        await pool.query("update lots set value = $1 where world_id = $2 and id = $3", [
          newVal, WORLD_ID, id,
        ]);
        st.price = newVal;
        changed.push(st);
      }
    }
    this.traffic.clear();
    return changed;
  }
}
