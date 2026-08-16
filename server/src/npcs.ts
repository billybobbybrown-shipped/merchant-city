import {
  BASE_PRICE,
  buildingForLot,
  CityMap,
  findPath,
  LotDef,
  npcName,
  planLiquidation,
  retailPrice,
  scoreOffer,
  wageAcceptable,
  TILE_WORLD_SIZE as TS,
} from "@mc/shared";
import { pool } from "./db.js";
import {
  furnitureById,
  fixtureWorld,
  siteCellWorld,
  standingSpot,
  interiorSpec,
  interiorRoute,
  cellInside,
  worldToCell,
  cellsOf,
  DOCK_SIZE,
  type PlacedItem,
} from "@mc/shared";
import { LotStore } from "./lots.js";
import { CITY_ENTITY, transfer } from "./accounts.js";
import { EconomyError } from "./errors.js";
import { registry } from "./registry.js";
import { WorkforceStore, JobRole } from "./workforce.js";

const WORLD_ID = 1;
const NPC_SPEED = 3.4; // world units/sec — slower than players
// needs drain continuously so shopping spreads across the day:
// food empties in ~1.5 game days, goods in ~4.5
const FOOD_DECAY_PER_SEC = 0.65 / 600;
const GOODS_DECAY_PER_SEC = 0.22 / 600;
const DECIDE_EVERY_MS = 6000; // how often an idle NPC considers going somewhere

// what needs accept
const FOOD_ITEMS = ["bread", "corn", "carrots"];
const GOODS_ITEMS = ["shirt", "phone"];
const VICE_ITEMS = ["beer", "cigarettes", "whiskey", "cigars"];

interface Offer {
  lotId: number;
  furnId: number; // the shelf it comes off
  item: string;
  price: number;
  qty: number;
  x: number; // world coords of the shop
  y: number;
  appeal: number;
  ownerEid: number;
}

// how much a worker carries in their arms per trip
const CARRY = 8;
// how long they linger at a spot before moving on
const WORK_PAUSE_MS = 2200;

export interface Npc {
  eid: number;
  name: string;
  appearance: number;
  homeLot: number | null;
  bizLot: number | null;
  bizStage: string | null;
  x: number;
  y: number;
  food: number;
  goods: number;
  vice: number;
  tier: string;
  employerEntity: number | null;
  employerLot: number | null;
  jobRole: string | null;
  wage: number;
  // runtime
  path: Array<{ x: number; y: number }>;
  nextDecideAt: number;
  moving: boolean;
  lastSx: number;
  lastSy: number;
  errand: {
    lotId: number;
    furnId: number;
    item: string;
    price: number;
    ownerEid: number;
    need: "food" | "goods" | "vice";
  } | null;
  busy: boolean;
  // work: a loop of spots the job takes them to, and what they're carrying
  work: Array<{ x: number; y: number; act: string; nx?: number; ny?: number }>;
  workStep: number;
  workAt: { x: number; y: number } | null;
  workPath: Array<{ x: number; y: number }>;
  carrying: { item: string; qty: number } | null;
  workPause: number;
}

// listener interface the room implements so positions reach clients
export interface NpcView {
  upsert(n: Npc): void;
  remove(eid: number): void;
}

// Server-side NPC population + simulation. Decisions are batched; movement
// integrates every tick. Money (rent, wages) moves through accounts like
// everyone else's.
export class NpcSim {
  readonly npcs = new Map<number, Npc>();
  private views = new Set<NpcView>();
  private residential: LotDef[] = [];
  private wanderTargets: Array<{ x: number; y: number }> = [];

  workforce: WorkforceStore | null = null; // attached after construction
  goods: import("./goods.js").GoodsStore | null = null;
  market: import("./market.js").MarketStore | null = null;
  interiors: import("./interiors.js").InteriorStore | null = null;
  private staffing = new Map<number, Map<JobRole, number>>();

  isStaffed(lotId: number, role: JobRole): boolean {
    return (this.staffing.get(lotId)?.get(role) ?? 0) > 0;
  }

  constructor(
    private map: CityMap,
    private lots: LotStore
  ) {
    for (const l of map.lots) {
      const b = buildingForLot(map.seed, l);
      if (b && (b.kind === "house" || b.kind === "apartment")) this.residential.push(l);
    }
    // public wander spots: sidewalk tiles sampled across the map
    for (let i = 0; i < 400; i++) {
      const x = Math.floor((i * 7919) % map.width);
      const y = Math.floor((i * 104729) % map.height);
      if (map.tiles[y * map.width + x] === 2) this.wanderTargets.push({ x, y });
    }
  }

  private offers = new Map<string, Offer[]>(); // item -> offers

  // rebuild the retail offer index from shelf stock + prices (called every ~30s)
  async refreshOffers() {
    if (this.workforce) this.staffing = await this.workforce.staffing();
    // one row per stocked shelf — each shelf sells its own listing
    const rows = await pool.query(
      `select l.furn_id, l.lot_id, l.item, l.price, i.qty
         from shelf_listings l
         join inventories i on i.world_id = l.world_id and i.holder_type = 'shelf'
                           and i.holder_id = l.furn_id::text and i.item = l.item
        where l.world_id = $1 and i.qty > 0`,
      [WORLD_ID]
    );
    // appeal per lot from placed furniture
    const furn = await pool.query(
      "select lot_id, item from furniture where world_id = $1",
      [WORLD_ID]
    );
    const appeal = new Map<number, number>();
    for (const f of furn.rows) {
      const def = furnitureById(f.item);
      if (def?.appeal) appeal.set(f.lot_id, (appeal.get(f.lot_id) ?? 0) + def.appeal);
    }
    const next = new Map<string, Offer[]>();
    for (const r of rows.rows) {
      const lotId = Number(r.lot_id);
      const lot = this.lots.lotDef(lotId);
      const st = this.lots.get(lotId);
      if (!lot || !st) continue;
      const ownerEid = st.ownerType === "city" ? CITY_ENTITY : Number(st.ownerId);
      // no cashier on shift = register closed: the shop can't sell
      const staffed = (this.staffing.get(lotId)?.get("cashier") ?? 0) > 0;
      if (!staffed) continue;
      const offer: Offer = {
        lotId,
        furnId: Number(r.furn_id),
        item: r.item,
        price: Number(r.price),
        qty: Number(r.qty),
        x: (lot.x + lot.w / 2) * TS,
        y: (lot.y + lot.h / 2) * TS,
        appeal: appeal.get(lotId) ?? 0,
        ownerEid,
      };
      if (!next.has(r.item)) next.set(r.item, []);
      next.get(r.item)!.push(offer);
    }
    this.offers = next;
  }

  // stockers refill priced shelf items from building storage



  addView(v: NpcView) {
    this.views.add(v);
    for (const n of this.npcs.values()) v.upsert(n);
  }

  removeView(v: NpcView) {
    this.views.delete(v);
  }

  private publish(n: Npc, force = false) {
    if (!force && Math.hypot(n.x - n.lastSx, n.y - n.lastSy) < 0.6) return;
    n.lastSx = n.x;
    n.lastSy = n.y;
    for (const v of this.views) v.upsert(n);
  }

  // residential capacity: houses hold 2, apartments hold 3 per floor
  private homeCapacity(l: LotDef): number {
    const b = buildingForLot(this.map.seed, l);
    if (!b) return 0;
    return b.kind === "house" ? 2 : b.floors * 3;
  }

  async ensurePopulation(target: number) {
    const existing = await pool.query(
      `select n.entity_id, n.home_lot, n.x, n.y, n.food, n.goods, n.vice, n.wealth_tier, n.appearance,
              n.employer_entity, n.employer_lot, n.job_role, n.wage, n.biz_lot, n.biz_stage, e.name
         from npcs n join entities e on e.id = n.entity_id where n.world_id = $1`,
      [WORLD_ID]
    );
    for (const r of existing.rows) {
      this.npcs.set(Number(r.entity_id), {
        eid: Number(r.entity_id),
        name: r.name,
        appearance: r.appearance >>> 0,
        homeLot: r.home_lot,
        bizLot: r.biz_lot,
        bizStage: r.biz_stage,
        x: r.x,
        y: r.y,
        food: Number(r.food),
        goods: Number(r.goods),
        vice: Number(r.vice),
        tier: r.wealth_tier,
        employerEntity: r.employer_entity !== null ? Number(r.employer_entity) : null,
        employerLot: r.employer_lot,
        jobRole: r.job_role,
        wage: Number(r.wage ?? 0),
        path: [],
        nextDecideAt: Date.now() + Math.random() * DECIDE_EVERY_MS,
        moving: false,
        lastSx: r.x,
        lastSy: r.y,
        errand: null,
        busy: false,
        work: [],
        workStep: 0,
        workAt: null,
        workPath: [],
        carrying: null,
        workPause: 0,
      });
    }
    const missing = target - this.npcs.size;
    if (missing <= 0) {
      console.log(`[npc] ${this.npcs.size} citizens loaded`);
      return;
    }

    // occupancy per home so we respect capacity
    const occupancy = new Map<number, number>();
    for (const n of this.npcs.values())
      if (n.homeLot !== null) occupancy.set(n.homeLot, (occupancy.get(n.homeLot) ?? 0) + 1);

    const client = await pool.connect();
    try {
      for (let i = 0; i < missing; i++) {
        const seed = (Date.now() & 0xffffff) * 1000 + i;
        const name = npcName(seed);
        const appearance = (Math.imul(seed, 2654435761) >>> 0) & 0x7fffffff;
        const vice = Math.random() < 0.85 ? 0 : Math.round((0.2 + Math.random() * 0.8) * 100) / 100;
        const tier =
          Math.random() < 0.08 ? "entrepreneur" : Math.random() < 0.3 ? "saver" : "worker";
        const home = this.residential.find((l) => (occupancy.get(l.id) ?? 0) < this.homeCapacity(l));
        if (home) occupancy.set(home.id, (occupancy.get(home.id) ?? 0) + 1);
        const hx = home ? (home.x + home.w / 2) * TS : (this.map.width / 2) * TS;
        const hy = home ? (home.y + home.h / 2) * TS : (this.map.height / 2) * TS;
        const cash = 300 + Math.floor(Math.random() * 1500);

        await client.query("begin");
        const ent = await client.query(
          "insert into entities (kind, name) values ('npc', $1) returning id",
          [name]
        );
        const eid = Number(ent.rows[0].id);
        await client.query(
          "insert into accounts (entity_id, currency, balance) values ($1, 'clean', $2)",
          [eid, cash]
        );
        await client.query(
          `insert into npcs (entity_id, world_id, home_lot, x, y, vice, wealth_tier, appearance)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [eid, WORLD_ID, home?.id ?? null, hx, hy, vice, tier, appearance]
        );
        await client.query("commit");

        this.npcs.set(eid, {
          eid,
          name,
          appearance,
          homeLot: home?.id ?? null,
          bizLot: null,
          bizStage: null,
          x: hx,
          y: hy,
          food: 1,
          goods: 1,
          vice,
          tier,
          employerEntity: null,
          employerLot: null,
          jobRole: null,
          wage: 0,
          path: [],
          nextDecideAt: Date.now() + Math.random() * DECIDE_EVERY_MS,
          moving: false,
          lastSx: hx,
          lastSy: hy,
          errand: null,
          busy: false,
          work: [],
          workStep: 0,
          workAt: null,
          workPath: [],
          carrying: null,
          workPause: 0,
        });
      }
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    console.log(`[npc] spawned ${missing} citizens (${this.npcs.size} total)`);
  }

  // ---- working ----------------------------------------------------------
  // A worker walks the spots their job takes them to: the till, the racks, the
  // shelves, the field. Indoors there is nothing to path around, so they walk
  // straight there rather than through the city grid.

  private async workLoop(n: Npc): Promise<void> {
    n.work = [];
    n.workStep = 0;
    await this.buildWorkLoop(n);
    // Two people sent to the same spot stand inside each other and read as one
    // person, so give each their own patch of it. At a fixture the spread runs
    // along its face, never into it.
    // A cell is one unit across, so the spread has to stay well inside it —
    // any further and a worker ends up in the next cell, or in a wall.
    const off = ((n.eid % 3) - 1) * 0.26;
    for (const spot of n.work) {
      if (spot.nx !== undefined && spot.ny !== undefined) {
        spot.x += -spot.ny * off;
        spot.y += spot.nx * off;
      } else {
        const a = (n.eid % 8) * (Math.PI / 4);
        spot.x += Math.cos(a) * 0.45;
        spot.y += Math.sin(a) * 0.45;
      }
    }
  }

  private async buildWorkLoop(n: Npc): Promise<void> {
    const role = n.jobRole;
    if (!role) return;

    if (role === "hauler") {
      // drive the routes themselves: each shipment is a trip between two bays
      const spots: typeof n.work = [];
      const seen = new Set<number>();
      const routes = await pool.query(
        `select dl.lot_id, dl.partner_lot from dock_lines dl
           join lots l on l.id = dl.lot_id
          where dl.world_id = $1 and l.owner_entity_id = $2 limit 6`,
        [WORLD_ID, n.employerEntity]
      );
      for (const row of routes.rows)
        for (const id of [Number(row.lot_id), Number(row.partner_lot)]) {
          if (seen.has(id)) continue;
          seen.add(id);
          const p = await this.bayWorldPos(id);
          if (p) spots.push({ ...p, act: "haul" });
        }
      if (spots.length < 2)
        for (const b of await this.employerBays(n.employerEntity))
          if (!spots.some((sp) => Math.hypot(sp.x - b.x, sp.y - b.y) < 1))
            spots.push({ ...b, act: "haul" });
      if (spots.length) n.work = spots;
      return;
    }

    const lotId = n.employerLot;
    if (lotId === null) return;
    const lot = this.lots.lotDef(lotId);
    if (!lot) return;
    const st = this.lots.get(lotId);
    const bdef = this.lots.buildingDef(lotId);

    const spec = bdef ? interiorSpec(lot, bdef, 0) : null;
    this.claims.delete(n.eid);
    const mine: string[] = [];
    const taken = this.claimed(lotId, n.eid);
    // cells a solid fixture already fills: standing there means standing inside
    // the shelf, so they are never a place to work from
    const solid = new Set<string>();
    const isTaken = (cx: number, cy: number) =>
      taken.has(`${lotId}:${cx},${cy}`) || solid.has(`${cx},${cy}`);
    const claim = (cx: number, cy: number) => {
      mine.push(`${lotId}:${cx},${cy}`);
      this.claims.set(n.eid, mine);
    };
    // stand at a fixture, beside it rather than in it
    const beside = (
      f: { item: string; x: number; y: number; rot: number },
      act: string,
      prefer: "front" | "back" = "front"
    ) => {
      if (!bdef || !spec) return null;
      const def = furnitureById(f.item);
      const fw = f.rot % 2 === 0 ? def?.w ?? 1 : def?.h ?? 1;
      const fh = f.rot % 2 === 0 ? def?.h ?? 1 : def?.w ?? 1;
      const c = standingSpot(spec, f.x, f.y, fw, fh, prefer, isTaken);
      claim(c.x, c.y);
      const w = fixtureWorld(lot, bdef, c.x, c.y);
      // which way is "away from the fixture" in world terms — used to stand
      // clear of it rather than half inside it
      const mid = fixtureWorld(lot, bdef, f.x + (fw - 1) / 2, f.y + (fh - 1) / 2);
      const dx = w.x - mid.x;
      const dy = w.z - mid.z;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      return { x: w.x, y: w.z, act, nx, ny };
    };
    const fixtures = bdef && this.interiors ? await this.interiors.items(lotId) : [];
    const ground = fixtures.filter((f) => (f.floor ?? 0) === 0);
    this.workFixtures.set(lotId, ground);
    for (const f of ground) {
      if (furnitureById(f.item)?.walkable) continue;
      for (const [cx, cy] of cellsOf(f)) solid.add(`${cx},${cy}`);
    }
    const firstOf = (pred: (item: string) => boolean) =>
      fixtures.find((f) => (f.floor ?? 0) === 0 && pred(f.item));

    const centre = {
      x: (lot.x + lot.w / 2) * TS,
      y: (lot.y + lot.h / 2) * TS,
      act: "idle",
    };

    if (role === "cashier") {
      // Behind the register, not merely behind the counter. The register sits
      // on the counter's +x quarter, so which end that is depends on how the
      // counter was turned.
      const till = firstOf((i) => i === "counter");
      if (till && spec && bdef) {
        const def = furnitureById(till.item);
        const fw = till.rot % 2 === 0 ? def?.w ?? 1 : def?.h ?? 1;
        const fh = till.rot % 2 === 0 ? def?.h ?? 1 : def?.w ?? 1;
        const dir = [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ][till.rot % 4];
        // the footprint cell furthest along the register's side
        const reg = {
          x: till.x + (dir[0] > 0 ? fw - 1 : 0),
          y: till.y + (dir[1] > 0 ? fh - 1 : 0),
        };
        // The till is a post, not a preference: the cashier takes the spot
        // behind the register and anyone else standing there moves along.
        const c = standingSpot(spec, reg.x, reg.y, 1, 1, "back", (cx, cy) =>
          solid.has(`${cx},${cy}`)
        );
        this.evictFrom(lotId, c.x, c.y, n.eid);
        claim(c.x, c.y);
        const w = fixtureWorld(lot, bdef, c.x, c.y);
        const mid = fixtureWorld(lot, bdef, reg.x, reg.y);
        const len = Math.hypot(w.x - mid.x, w.z - mid.z) || 1;
        n.work = [
          {
            x: w.x,
            y: w.z,
            act: "till",
            nx: (w.x - mid.x) / len,
            ny: (w.z - mid.z) / len,
          },
        ];
        return;
      }
      const fallback = firstOf((i) => i === "shelf");
      n.work = [(fallback && beside(fallback, "till", "back")) ?? centre];
      return;
    }
    if (role === "stocker") {
      const rack = firstOf((i) => i.startsWith("rack_"));
      const shelf = firstOf((i) => i === "shelf");
      const a = rack ? beside(rack, "pickup") : null;
      const b = shelf ? beside(shelf, "restock") : null;
      n.work = [a, b].filter(Boolean) as typeof n.work;
      if (!n.work.length) n.work = [centre];
      return;
    }
    if (role === "crafter") {
      const machine = firstOf((i) => !!furnitureById(i)?.machine);
      n.work = [(machine && beside(machine, "craft")) ?? centre];
      return;
    }
    if (role === "manager") {
      const bay = firstOf((i) => !!furnitureById(i)?.dock);
      const rack = firstOf((i) => i.startsWith("rack_"));
      const spots = [
        bay ? beside(bay, "bay") : null,
        rack ? beside(rack, "rack") : null,
      ].filter(Boolean) as typeof n.work;
      n.work = spots.length ? spots : [centre];
      return;
    }
    if (role === "farmer" || role === "miner") {
      // work the drawn cells, then carry the day's pick to the loading bay
      const shape = st?.source?.shape ?? [];
      const spots: typeof n.work = [];
      for (const r of shape.slice(0, 3)) {
        const w = siteCellWorld(lot, r.x + r.w / 2, r.y + r.h / 2);
        spots.push({ x: w.x, y: w.z, act: "harvest" });
      }
      const bay = await this.bayWorldPos(lotId);
      if (bay) spots.push({ ...bay, act: "deliver" });
      n.work = spots.length ? spots : [centre];
      return;
    }
    n.work = [centre];
  }

  // move to the next spot in the loop, building the loop the first time
  private stepWork(n: Npc): boolean {
    if (Date.now() < n.workPause) return true; // pausing at a spot, still "at work"
    if (!n.work.length) {
      void this.workLoop(n).then(() => {
        if (n.work.length) {
          n.workStep = 0;
          n.workAt = { x: n.work[0].x, y: n.work[0].y };
        }
      });
      return true;
    }
    n.workStep = (n.workStep + 1) % n.work.length;
    const spot = n.work[n.workStep];
    n.workPath = this.indoorRouteTo(n, spot);
    n.workAt = n.workPath.shift() ?? { x: spot.x, y: spot.y };
    return true;
  }

  // Inside a building the straight line would cut through the fittings, so
  // walk the floor plan around them. Outdoors there is nothing to dodge.
  private indoorRouteTo(n: Npc, spot: { x: number; y: number }): Array<{ x: number; y: number }> {
    const lotId = n.employerLot;
    if (lotId === null || !this.interiors) return [];
    const lot = this.lots.lotDef(lotId);
    const bdef = this.lots.buildingDef(lotId);
    if (!lot || !bdef) return [];
    const spec = interiorSpec(lot, bdef, 0);
    const from = worldToCell(lot, bdef, n.x, n.y);
    const to = worldToCell(lot, bdef, spot.x, spot.y);
    if (!cellInside(spec, from.x, from.y) || !cellInside(spec, to.x, to.y)) return [];
    const blocked = new Set<number>();
    for (const it of this.workFixtures.get(lotId) ?? [])
      for (const [cx, cy] of cellsOf(it)) blocked.add(cy * spec.w + cx);
    return interiorRoute(spec, blocked, from, to)
      .map((c) => {
        const w = fixtureWorld(lot, bdef, c.x, c.y);
        return { x: w.x, y: w.z };
      })
      .concat([{ x: spot.x, y: spot.y }]);
  }

  // fixtures per lot, refreshed when a worker's loop is built
  private workFixtures = new Map<number, PlacedItem[]>();
  // which cells workers have claimed, so no two stand in the same one
  private claims = new Map<number, string[]>();

  private claimed(lotId: number, exceptEid: number): Set<string> {
    const out = new Set<string>();
    for (const [eid, keys] of this.claims)
      if (eid !== exceptEid) for (const k of keys) if (k.startsWith(`${lotId}:`)) out.add(k);
    return out;
  }

  // turf someone out of a cell another worker has a stronger claim to
  private evictFrom(lotId: number, cx: number, cy: number, exceptEid: number): void {
    const key = `${lotId}:${cx},${cy}`;
    for (const [eid, keys] of this.claims) {
      if (eid === exceptEid || !keys.includes(key)) continue;
      this.claims.delete(eid);
      const other = this.npcs.get(eid);
      if (other) {
        other.work = [];
        other.workAt = null;
        other.workPath = [];
      }
    }
  }

  // everyone working this property re-reads the floor when it changes
  forgetLotWork(lotId: number): void {
    for (const n of this.npcs.values())
      if (n.employerLot === lotId) {
        n.work = [];
        n.workAt = null;
        n.workPath = [];
        this.claims.delete(n.eid);
      }
    this.workFixtures.delete(lotId);
  }

  // clear a worker's loop when their job changes
  forgetWork(eid: number): void {
    const n = this.npcs.get(eid);
    if (!n) return;
    n.work = [];
    n.workAt = null;
    n.carrying = null;
  }

  // the loading bay of a property, in world coordinates
  private async bayWorldPos(lotId: number): Promise<{ x: number; y: number } | null> {
    const r = await pool.query(
      "select cell_x, cell_y, indoor from docks where world_id = $1 and lot_id = $2",
      [WORLD_ID, lotId]
    );
    if (!r.rowCount) return null;
    const lot = this.lots.lotDef(lotId);
    if (!lot) return null;
    const cx = Number(r.rows[0].cell_x ?? 0);
    const cy = Number(r.rows[0].cell_y ?? 0);
    if (r.rows[0].indoor) {
      const bdef = this.lots.buildingDef(lotId);
      if (!bdef) return null;
      const w = fixtureWorld(lot, bdef, cx, cy);
      return { x: w.x, y: w.z };
    }
    const w = siteCellWorld(lot, cx + DOCK_SIZE / 2, cy + DOCK_SIZE / 2);
    return { x: w.x, y: w.z };
  }

  private async employerBays(employer: number | null): Promise<Array<{ x: number; y: number }>> {
    if (employer === null) return [];
    const r = await pool.query(
      `select d.lot_id from docks d join lots l on l.id = d.lot_id
        where d.world_id = $1 and l.owner_entity_id = $2 limit 4`,
      [WORLD_ID, employer]
    );
    const out: Array<{ x: number; y: number }> = [];
    for (const row of r.rows) {
      const p = await this.bayWorldPos(Number(row.lot_id));
      if (p) out.push(p);
    }
    return out;
  }

  // arriving somewhere is what makes the work happen
  private async onWorkArrival(n: Npc, act: string): Promise<void> {
    if (!this.goods || n.employerLot === null) return;
    const lotId = n.employerLot;
    if (act === "pickup") {
      // fill your arms from the racks with whatever the shelves are short of
      const listings = await pool.query(
        "select furn_id, item from shelf_listings where world_id = $1 and lot_id = $2",
        [WORLD_ID, lotId]
      );
      const store = await this.goods.inventory("lot", String(lotId));
      for (const row of listings.rows) {
        const view = await this.goods.shelfView(Number(row.furn_id)).catch(() => null);
        if (!view?.item) continue;
        const need = Math.min(CARRY, view.capacity - view.qty, store[view.item] ?? 0);
        if (need <= 0) continue;
        if (await this.goods.takeFromProperty(lotId, view.item, need)) {
          n.carrying = { item: view.item, qty: need };
          return;
        }
      }
      return;
    }
    if (act === "restock" && n.carrying) {
      const listings = await pool.query(
        "select furn_id from shelf_listings where world_id = $1 and lot_id = $2 and item = $3",
        [WORLD_ID, lotId, n.carrying.item]
      );
      const furnId = listings.rows[0] ? Number(listings.rows[0].furn_id) : null;
      if (furnId !== null) {
        await pool.query(
          `insert into inventories (world_id, holder_type, holder_id, item, qty)
           values ($1,'shelf',$2,$3,$4)
           on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $4`,
          [WORLD_ID, String(furnId), n.carrying.item, n.carrying.qty]
        );
        registry.broadcast("shopChanged", { lotId });
      } else {
        await this.goods.putIntoProperty(lotId, n.carrying.item, n.carrying.qty);
      }
      n.carrying = null;
    }
  }

  // send an NPC toward a world position via A*
  sendTo(n: Npc, wx: number, wy: number): boolean {
    const path = findPath(
      this.map,
      Math.floor(n.x / TS),
      Math.floor(n.y / TS),
      Math.floor(wx / TS),
      Math.floor(wy / TS)
    );
    if (!path) return false;
    n.path = path;
    n.moving = path.length > 0;
    return true;
  }

  // called every server tick
  tick(dtSec: number) {
    const now = Date.now();
    for (const n of this.npcs.values()) {
      n.food = Math.max(0, n.food - FOOD_DECAY_PER_SEC * dtSec);
      n.goods = Math.max(0, n.goods - GOODS_DECAY_PER_SEC * dtSec);
      if (n.moving && n.path.length) {
        const wp = n.path[0];
        const tx = (wp.x + 0.5) * TS;
        const ty = (wp.y + 0.5) * TS;
        const dx = tx - n.x;
        const dy = ty - n.y;
        const dist = Math.hypot(dx, dy);
        const step = NPC_SPEED * dtSec;
        if (dist <= step) {
          n.x = tx;
          n.y = ty;
          n.path.shift();
          if (!n.path.length) {
            n.moving = false;
            this.publish(n, true);
            if (n.errand) void this.completeErrand(n);
          }
        } else {
          n.x += (dx / dist) * step;
          n.y += (dy / dist) * step;
        }
        this.lots.recordTraffic(n.x, n.y);
        this.publish(n);
      } else if (n.workAt) {
        // walking a work spot: indoors there is nothing to path around
        const dx = n.workAt.x - n.x;
        const dy = n.workAt.y - n.y;
        const dist = Math.hypot(dx, dy);
        const step = NPC_SPEED * dtSec;
        if (dist <= step) {
          n.x = n.workAt.x;
          n.y = n.workAt.y;
          const next = n.workPath.shift();
          if (next) {
            n.workAt = next;
          } else {
            n.workAt = null;
            n.workPause = now + WORK_PAUSE_MS;
            const spot = n.work[n.workStep];
            if (spot) void this.onWorkArrival(n, spot.act);
          }
          this.publish(n, true);
        } else {
          n.x += (dx / dist) * step;
          n.y += (dy / dist) * step;
          this.publish(n);
        }
      } else if (now >= n.nextDecideAt) {
        n.nextDecideAt = now + DECIDE_EVERY_MS * (0.5 + Math.random());
        this.decide(n);
      }
    }
  }

  // idle decision: hungry citizens shop, others stroll or head home
  private decide(n: Npc) {
    // Hired workers are on the clock. Citizens live their own lives — shopping,
    // strolling, going home — but a worker exists to do the job, so nothing
    // pulls them off it.
    if (n.jobRole && (n.employerLot !== null || n.jobRole === "hauler")) {
      this.stepWork(n);
      return;
    }
    if (n.food < 0.55 && this.startShopping(n, "food")) return;
    if (n.goods < 0.5 && this.startShopping(n, "goods")) return;
    // discretionary vice runs — trait-driven, only when permitted shops exist
    if (n.vice > 0 && Math.random() < n.vice * 0.3 && this.startShopping(n, "vice")) return;
    const roll = Math.random();
    if (roll < 0.45 && this.wanderTargets.length) {
      const t = this.wanderTargets[Math.floor(Math.random() * this.wanderTargets.length)];
      this.sendTo(n, (t.x + 0.5) * TS, (t.y + 0.5) * TS);
    } else if (roll < 0.65 && n.homeLot !== null) {
      const home = this.lots.lotDef(n.homeLot);
      if (home) this.sendTo(n, (home.x + home.w / 2) * TS, (home.y + home.h / 2) * TS);
    }
    // else: keep loitering
  }

  // pick the best shop for a need: cheap vs the reference price, close, inviting
  private startShopping(n: Npc, need: "food" | "goods" | "vice"): boolean {
    const wants = need === "food" ? FOOD_ITEMS : need === "vice" ? VICE_ITEMS : GOODS_ITEMS;
    let best: Offer | null = null;
    let bestScore = -Infinity;
    for (const item of wants) {
      for (const o of this.offers.get(item) ?? []) {
        if (o.qty <= 0) continue;
        const dist = Math.hypot(o.x - n.x, o.y - n.y);
        const score = scoreOffer({ item, price: o.price, appeal: o.appeal, dist }) + Math.random() * 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
    }
    if (!best) return false;
    if (!this.sendTo(n, best.x, best.y)) return false;
    n.errand = {
      lotId: best.lotId,
      furnId: best.furnId,
      item: best.item,
      price: best.price,
      ownerEid: best.ownerEid,
      need,
    };
    return true;
  }

  // at the shop: pay the owner, take the item off the shelf, refill the need
  private async completeErrand(n: Npc) {
    const e = n.errand;
    if (!e || n.busy) return;
    n.busy = true;
    n.errand = null;
    const client = await pool.connect();
    try {
      await client.query("begin");
      const take = await client.query(
        `update inventories set qty = qty - 1
          where world_id = $1 and holder_type = 'shelf' and holder_id = $2 and item = $3 and qty >= 1`,
        [WORLD_ID, String(e.furnId), e.item]
      );
      if (!take.rowCount) throw new EconomyError("shelf empty");
      await transfer(client, n.eid, e.ownerEid, e.price, "retail_sale", `${e.item} @ lot ${e.lotId}`);
      await client.query("commit");
      if (e.need === "food") n.food = Math.min(1, n.food + 0.6);
      else if (e.need === "goods") n.goods = Math.min(1, n.goods + 0.6);
      // vice purchases are pure discretionary spend — no need refilled
      const cached = this.offers.get(e.item);
      if (cached) {
        const o = cached.find((x) => x.lotId === e.lotId);
        if (o) o.qty -= 1;
      }
    } catch (err) {
      await client.query("rollback");
      if (!(err instanceof EconomyError)) console.error("[npc] purchase failed", err);
    } finally {
      client.release();
      n.busy = false;
    }
  }

  // unemployed citizens look for work: best wage minus commute, above their
  // reservation wage
  async runJobHunt() {
    if (!this.workforce) return;
    const open = await this.workforce.openOffers();
    if (!open.length) return;
    const taken = new Map<number, number>(); // offer -> hires this round
    for (const n of this.npcs.values()) {
      if (n.employerEntity !== null || n.tier === "entrepreneur") continue;
      let best: (typeof open)[number] | null = null;
      let bestScore = -Infinity;
      for (const o of open) {
        if (o.slots - (taken.get(o.id) ?? 0) <= 0) continue;
        // preset offers factor in the commute; generic ones are wage-only
        let score = o.wage;
        if (o.assignLot !== null) {
          const lot = this.lots.lotDef(o.assignLot);
          if (lot)
            score -= Math.hypot((lot.x + lot.w / 2) * TS - n.x, (lot.y + lot.h / 2) * TS - n.y) / 30;
        }
        if (wageAcceptable(n.tier, o.wage) && score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
      if (!best) continue;
      taken.set(best.id, (taken.get(best.id) ?? 0) + 1);
      n.employerEntity = best.employer;
      n.employerLot = best.assignLot;
      n.jobRole = best.assignRole;
      n.wage = best.wage;
      await pool.query(
        "update npcs set employer_entity = $2, employer_lot = $3, job_role = $4, wage = $5 where entity_id = $1",
        [n.eid, best.employer, best.assignLot, best.assignRole, best.wage]
      );
      await this.workforce.consumeOffer(best.id);
      const { registry: reg } = await import("./registry.js");
      reg.sendTo(best.employer, "note", {
        msg: `${n.name} accepted your offer — $${best.wage}/day${
          best.assignRole ? ` as ${best.assignRole}` : " (assign them a job)"
        }`,
      });
      reg.sendTo(best.employer, "workforceChanged", {});
    }
  }

  // workforce store pushes assignment/firing changes into the running sim
  applyEmployment(
    npcEid: number,
    emp: { employer: number | null; lotId: number | null; role: string | null; wage: number }
  ): void {
    const n = this.npcs.get(npcEid);
    if (!n) return;
    n.employerEntity = emp.employer;
    n.employerLot = emp.lotId;
    n.jobRole = emp.role;
    n.wage = emp.wage;
    // a new job means a new round to walk
    n.work = [];
    n.workAt = null;
    n.workStep = 0;
    n.workPause = 0;
  }

  // crafters keep machines running toward whatever the shop has priced
  private async runCrafters() {
    if (!this.goods) return;
    const prices = await pool.query(
      "select distinct lot_id, item from shelf_listings where world_id = $1",
      [WORLD_ID]
    );
    for (const r of prices.rows) {
      const lotId = Number(r.lot_id);
      if (!this.isStaffed(lotId, "crafter")) continue;
      const st = this.lots.get(lotId);
      if (!st) continue;
      const ownerEid = st.ownerType === "city" ? CITY_ENTITY : Number(st.ownerId);
      try {
        await this.goods.craft(ownerEid, lotId, r.item, 3);
      } catch {
        /* missing machine or inputs — crafter idles */
      }
    }
  }

  private async balanceOf(eid: number): Promise<number> {
    const r = await pool.query(
      "select balance from accounts where entity_id = $1 and currency = 'clean'",
      [eid]
    );
    return r.rowCount ? Number(r.rows[0].balance) : 0;
  }

  // entrepreneurs build real businesses: buy a shop lot, place a shelf, hire
  // a cashier, buy stock on the exchange, price it — and liquidate when broke
  private async runEntrepreneurs() {
    if (!this.goods || !this.market || !this.interiors || !this.workforce) return;
    for (const n of this.npcs.values()) {
      if (n.tier !== "entrepreneur" || n.bizStage === "failed") continue;
      try {
        const balance = await this.balanceOf(n.eid);

        // --- bankruptcy: liquidate everything onto the market ---
        if (n.bizLot !== null && balance < 150) {
          const lotId = n.bizLot;
          await this.workforce.fireAllOf(n.eid).catch(() => {});
          const pocket = await this.goods.inventory("entity", String(n.eid));
          for (const o of planLiquidation(pocket)) {
            await this.market.place(n.eid, "sell", o.item, o.qty, o.price).catch(() => {});
          }
          const lotDef = this.lots.lotDef(lotId);
          if (lotDef) {
            await this.lots
              .list(n.eid, lotId, Math.max(100, Math.round(lotDef.value * 0.9)))
              .catch(() => {});
          }
          n.bizLot = null;
          n.bizStage = "failed";
          n.tier = "worker";
          await pool.query(
            "update npcs set biz_lot = null, biz_stage = 'failed', wealth_tier = 'worker' where entity_id = $1",
            [n.eid]
          );
          console.log(`[npc] ${n.name} went bankrupt — business liquidated`);
          continue;
        }

        // --- founding: buy a commercial lot when flush ---
        if (n.bizLot === null) {
          if (balance < 2500) continue;
          let picked: number | null = null;
          for (const st of this.lots.all()) {
            if (st.ownerType !== "city" || !st.forSale) continue;
            if (st.price > balance * 0.55 || st.price < 200) continue;
            const b = this.lots.buildingDef(st.id);
            if (!b || b.kind === "house" || b.kind === "apartment") continue;
            picked = st.id;
            break;
          }
          if (picked === null) continue;
          const { lot } = await this.lots.buy(n.eid, picked);
          n.bizLot = picked;
          n.bizStage = "setup";
          await pool.query(
            "update npcs set biz_lot = $2, biz_stage = 'setup' where entity_id = $1",
            [n.eid, picked]
          );
          const { registry } = await import("./registry.js");
          registry.broadcast("lot", lot);
          console.log(`[npc] ${n.name} bought lot ${picked} to open a shop`);
          continue;
        }

        // --- operations: shelf, cashier, stock, price ---
        const lotId = n.bizLot;
        const furn = await this.interiors.items(lotId);
        if (!furn.some((f) => f.item === "shelf")) {
          placed: for (let y = 1; y < 7; y++)
            for (let x = 1; x < 7; x++) {
              try {
                await this.interiors.place(n.eid, lotId, "shelf", x, y, 0);
                break placed;
              } catch {
                /* try next cell */
              }
            }
        }
        await this.workforce.ensureStaffed(n.eid, lotId, "cashier", 52).catch(() => {});

        // keep bread stocked: exchange buys, haul to the shop, price it
        const shelf = await this.goods.inventory("shelf", String(lotId));
        const store = await this.goods.inventory("lot", String(lotId));
        const pocket = await this.goods.inventory("entity", String(n.eid));
        const onHand = (shelf.bread ?? 0) + (store.bread ?? 0);
        if ((pocket.bread ?? 0) > 0) {
          await this.goods.transfer(n.eid, lotId, "bread", pocket.bread!, true).catch(() => {});
        }
        if (onHand < 8 && balance > 200) {
          const limit = Math.round(BASE_PRICE.bread * 1.3 * 100) / 100;
          await this.market.place(n.eid, "buy", "bread", 10, limit).catch(() => {});
        }
        const inStore = (await this.goods.inventory("lot", String(lotId))).bread ?? 0;
        await this.goods
          .autoRetail(n.eid, lotId, "bread", retailPrice(BASE_PRICE.bread * 1.3), Math.min(inStore, 10))
          .catch(() => {});
        if (n.bizStage !== "open") {
          n.bizStage = "open";
          await pool.query("update npcs set biz_stage = 'open' where entity_id = $1", [n.eid]);
        }
      } catch (err) {
        if (!(err instanceof EconomyError)) console.error("[npc] entrepreneur", n.name, err);
      }
    }
  }

  // savers who've built cash move somewhere nicer — richer rent for owners
  private async runHousingUpgrades() {
    let moves = 0;
    const occupancy = new Map<number, number>();
    for (const x of this.npcs.values())
      if (x.homeLot !== null) occupancy.set(x.homeLot, (occupancy.get(x.homeLot) ?? 0) + 1);
    for (const n of this.npcs.values()) {
      if (moves >= 5) break;
      if (n.tier === "worker" || n.homeLot === null) continue;
      const balance = await this.balanceOf(n.eid);
      if (balance < 4000) continue;
      const cur = this.lots.lotDef(n.homeLot);
      if (!cur) continue;
      const better = this.residential.find(
        (l) => l.value > cur.value * 1.4 && (occupancy.get(l.id) ?? 0) < this.homeCapacity(l)
      );
      if (!better) continue;
      occupancy.set(better.id, (occupancy.get(better.id) ?? 0) + 1);
      occupancy.set(n.homeLot, (occupancy.get(n.homeLot) ?? 1) - 1);
      n.homeLot = better.id;
      await pool.query("update npcs set home_lot = $2 where entity_id = $1", [n.eid, better.id]);
      moves++;
    }
  }

  // per game day: wages (real job or city floor), rent, needs, fallback vendor
  async runDay(): Promise<void> {
    await this.runJobHunt();
    await this.runCrafters();
    await this.runEntrepreneurs();
    await this.runHousingUpgrades();
    for (const n of this.npcs.values()) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        let paid = false;
        if (n.employerEntity !== null && n.wage > 0) {
          // real job: employer pays, or the NPC quits over missed wages
          try {
            await transfer(
              client, n.employerEntity, n.eid, n.wage, "wage",
              `wage ${n.jobRole ?? "worker"}${n.employerLot !== null ? ` lot ${n.employerLot}` : ""}`
            );
            paid = true;
          } catch (err) {
            if (!(err instanceof EconomyError)) throw err;
            // employer broke — quit, and tell them why
            const formerEmployer = n.employerEntity;
            const wage = n.wage;
            n.employerEntity = null;
            n.employerLot = null;
            n.jobRole = null;
            n.wage = 0;
            await client.query(
              "update npcs set employer_entity = null, employer_lot = null, job_role = null, wage = 0 where entity_id = $1",
              [n.eid]
            );
            const { registry: reg } = await import("./registry.js");
            reg.sendTo(formerEmployer, "note", {
              msg: `${n.name} quit — you couldn't cover $${wage} in wages`,
            });
            reg.sendTo(formerEmployer, "workforceChanged", {});
          }
        }
        if (paid) {
          await client.query("commit");
          await client.query("begin");
        }
        // city job floor for the unemployed — the money faucet retail recycles
        if (!paid) await transfer(client, CITY_ENTITY, n.eid, 40, "wage", `city wage ${n.name}`).catch(
          async () => {
            // treasury can run dry early on; mint the floor wage as a credit
            await client.query(
              `update accounts set balance = balance + 40 where entity_id = $1 and currency = 'clean'`,
              [n.eid]
            );
            await client.query(
              `insert into ledger (amount, reason, category, currency, to_account)
               values (40, $1, 'wage', 'clean', (select id from accounts where entity_id = $2 and currency = 'clean'))`,
              [`city wage ${n.name}`, n.eid]
            );
          }
        );
        // rent to the real owner of the home lot
        if (n.homeLot !== null) {
          const st = this.lots.get(n.homeLot);
          const lot = this.lots.lotDef(n.homeLot);
          if (st && lot) {
            const ownerEid = st.ownerType === "city" ? CITY_ENTITY : Number(st.ownerId);
            const rent = Math.max(4, Math.round(lot.value * 0.003));
            try {
              await transfer(client, n.eid, ownerEid, rent, "rent", `npc rent lot ${n.homeLot}`);
            } catch (err) {
              if (!(err instanceof EconomyError)) throw err; // broke NPCs just skip rent
            }
          }
        }
        // desperate and nothing on any shelf: the city vendor sells at a
        // premium — sink pressure that player shops undercut
        if (n.food < 0.15) {
          try {
            await transfer(client, n.eid, CITY_ENTITY, 9, "retail_sale", `city vendor food ${n.name}`);
            n.food = Math.min(1, n.food + 0.6);
          } catch (err) {
            if (!(err instanceof EconomyError)) throw err; // broke: stays hungry until wages land
          }
        }
        if (n.goods < 0.1) {
          try {
            await transfer(client, n.eid, CITY_ENTITY, 16, "retail_sale", `city vendor goods ${n.name}`);
            n.goods = Math.min(1, n.goods + 0.6);
          } catch (err) {
            if (!(err instanceof EconomyError)) throw err;
          }
        }
        // persist position + needs
        await client.query(
          "update npcs set x = $2, y = $3, food = $4, goods = $5 where entity_id = $1",
          [n.eid, n.x, n.y, n.food, n.goods]
        );
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        console.error("[npc] day tick failed for", n.eid, err);
      } finally {
        client.release();
      }
    }
    console.log(`[npc] day settled for ${this.npcs.size} citizens`);
  }
}
