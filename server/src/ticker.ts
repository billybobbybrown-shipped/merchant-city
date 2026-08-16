import { CityMap, DAY_LENGTH_SEC, sourceWorkerRole } from "@mc/shared";
import { pool } from "./db.js";
import { LotStore } from "./lots.js";
import { GoodsStore } from "./goods.js";
import { NpcSim } from "./npcs.js";
import { registry } from "./registry.js";

// One economy day per day/night cycle: rents collect, buildings decay,
// land values follow foot traffic.
export class EconomyTicker {
  private running = false;
  stocks?: { runDay(): Promise<void> }; // wired at boot
  companyOps?: { runDay(): Promise<void>; runSpeculators(): Promise<void>; runCoinSpeculators(): Promise<void> };
  crypto?: { runDay(): Promise<void> };
  stats?: { runDay(): Promise<void> };
  logistics?: { runMinute(): Promise<void> };

  private lotToDistrict = new Map<number, number>();

  constructor(
    private lots: LotStore,
    private goods: GoodsStore,
    private npcs: NpcSim,
    map?: CityMap
  ) {
    if (map) {
      for (const l of map.lots) {
        const cx = l.x + l.w / 2;
        const cy = l.y + l.h / 2;
        for (const d of map.districts) {
          const hit = d.blocks.some((bi) => {
            const b = map.blocks[bi];
            return b && cx >= b.x - 1 && cx <= b.x + b.w + 1 && cy >= b.y - 1 && cy <= b.y + b.h + 1;
          });
          if (hit) {
            this.lotToDistrict.set(l.id, d.id);
            break;
          }
        }
      }
    }
  }

  // districts breathe: foot traffic from real movement, wealth from the
  // average balance of residents
  private async updateDistrictStats() {
    const traffic = new Map<number, number>();
    for (const [lotId, visits] of this.lots.trafficByLot()) {
      const d = this.lotToDistrict.get(lotId);
      if (d) traffic.set(d, (traffic.get(d) ?? 0) + visits);
    }
    const wealthRows = await pool.query(
      `select n.home_lot, avg(a.balance) as w
         from npcs n join accounts a on a.entity_id = n.entity_id and a.currency = 'clean'
        where n.home_lot is not null group by n.home_lot`
    );
    const wealth = new Map<number, { sum: number; k: number }>();
    for (const r of wealthRows.rows) {
      const d = this.lotToDistrict.get(Number(r.home_lot));
      if (!d) continue;
      const cur = wealth.get(d) ?? { sum: 0, k: 0 };
      cur.sum += Number(r.w);
      cur.k++;
      wealth.set(d, cur);
    }
    const districts = new Set([...traffic.keys(), ...wealth.keys()]);
    for (const d of districts) {
      await pool.query(
        `update districts set foot_traffic = $2, wealth = $3 where world_id = 1 and id = $1`,
        [d, traffic.get(d) ?? 0, wealth.get(d) ? wealth.get(d)!.sum / wealth.get(d)!.k : 0]
      );
    }
  }

  start() {
    setInterval(() => void this.runDay(), DAY_LENGTH_SEC * 1000);
    // haulage keeps its own clock: a minute of real time, every minute
    setInterval(() => void this.runHaulage(), 60_000);
    console.log(`[economy] day tick every ${DAY_LENGTH_SEC}s`);
  }

  private haulingNow = false;

  async runHaulage() {
    if (!this.logistics || this.haulingNow) return;
    this.haulingNow = true;
    try {
      await this.logistics.runMinute();
    } catch (err) {
      console.error("[logistics] haulage failed", err);
    } finally {
      this.haulingNow = false;
    }
  }

  async runDay() {
    if (this.running) return;
    this.running = true;
    try {
      await this.npcs.runDay();
      await this.updateDistrictStats();
      const produced = await this.goods.produceDay((lotId, sourceType) =>
        this.npcs.isStaffed(lotId, sourceWorkerRole(sourceType))
      );
      for (const lotId of produced) registry.broadcast("lotInvChanged", { lotId });
      const rents = await this.lots.collectRents();
      const values = await this.lots.recomputeValues();
      await this.goods.resolveCrafts();
      const seen = new Set<number>();
      for (const row of [...rents.changed, ...values]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        registry.broadcast("lot", row);
      }
      for (const n of rents.notes) registry.sendTo(n.eid, "note", { msg: n.msg });
      if (this.crypto) await this.crypto.runDay();
      if (this.companyOps) {
        await this.companyOps.runDay();
        await this.companyOps.runSpeculators();
        await this.companyOps.runCoinSpeculators();
      }
      if (this.stocks) await this.stocks.runDay();
      if (this.stats) await this.stats.runDay();
      console.log(
        `[economy] day: ${produced.length} sites produced, ${rents.notes.length / 2} tenancies, ${values.length} values updated`
      );
    } catch (err) {
      console.error("[economy] day tick failed", err);
    } finally {
      this.running = false;
    }
  }
}
