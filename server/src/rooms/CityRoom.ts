import { Room, Client } from "colyseus";
import {
  CityMap,
  DAY_LENGTH_SEC,
  MoveIntentSchema,
  PLAYER_SPEED,
  TICK_MS,
  Tile,
  appearanceFromSeed,
  decodeAppearance,
  encodeAppearance,
  tileAtWorld,
} from "@mc/shared";
import { CityState, NpcState, PlayerState } from "../schema/State.js";
import { verifyToken } from "../auth.js";
import { pool } from "../db.js";
import { EconomyError, LotStore } from "../lots.js";
import { InteriorStore } from "../interiors.js";
import { GoodsStore } from "../goods.js";
import { MarketStore } from "../market.js";
import { registry } from "../registry.js";
import { NpcSim, Npc } from "../npcs.js";
import { WorkforceStore } from "../workforce.js";
import { CompaniesStore } from "../companies.js";
import { PermitsStore } from "../permits.js";
import { StocksStore } from "../stocks.js";
import { CryptoStore } from "../crypto.js";
import { LogisticsStore } from "../logistics.js";

interface AuthData {
  uid: string;
  eid: number; // entity id — all economy calls use this
  name: string;
  cash: number;
  x: number;
  y: number;
  appearance: string;
  fresh: boolean; // hasn't picked a look yet — the client opens character creation
}

const MOVE_RATE_LIMIT = 30; // intents per second per client

export class CityRoom extends Room<CityState> {
  maxClients = 100;
  private map!: CityMap;
  private lotStore!: LotStore;
  private interiorStore!: InteriorStore;
  private goods!: GoodsStore;
  private market!: MarketStore;
  private uids = new Map<string, string>(); // sessionId -> user id (movement persistence)
  private eids = new Map<string, number>(); // sessionId -> entity id (economy)
  private moveBudget = new Map<string, number>();
  private persistTimer?: NodeJS.Timeout;
  private trafficCounter = 0;

  broadcastAll(type: string, msg: unknown) {
    this.broadcast(type, msg as never);
  }

  sendToEntity(eid: number, type: string, msg: unknown) {
    for (const c of this.clients) {
      if (this.eids.get(c.sessionId) === eid) c.send(type, msg);
    }
  }

  private sessionsOf(eid: number): string[] {
    const out: string[] = [];
    for (const [sid, e] of this.eids.entries()) if (e === eid) out.push(sid);
    return out;
  }

  // apply post-transaction clean balances to any online players
  private applyCash(cash: Map<number, number>) {
    for (const [eid, amount] of cash.entries())
      for (const sid of this.sessionsOf(eid)) {
        const p = this.state.players.get(sid);
        if (p) p.cash = amount;
      }
  }

  private economy(handler: (client: Client, data: any, eid: number) => Promise<void>) {
    return (client: Client, data: unknown) => {
      const eid = this.eids.get(client.sessionId);
      if (eid === undefined) return;
      handler(client, data, eid).catch((err) => {
        if (err instanceof EconomyError) client.send("err", { msg: err.message });
        else {
          console.error(err);
          client.send("err", { msg: "something went wrong" });
        }
      });
    };
  }

  async onAuth(_client: Client, options: { token?: string }): Promise<AuthData> {
    const uid = options?.token ? await verifyToken(options.token) : null;
    if (!uid) throw new Error("unauthorized");
    const res = await pool.query(
      `select p.display_name, p.entity_id, p.x, p.y, p.appearance_seed, p.appearance,
              coalesce(a.balance, 0) as cash
         from players p
         left join accounts a on a.entity_id = p.entity_id and a.currency = 'clean'
        where p.id = $1`,
      [uid]
    );
    if (!res.rowCount || res.rows[0].entity_id === null)
      throw new Error("no player — pick a display name first");
    const r = res.rows[0];
    return {
      uid,
      eid: Number(r.entity_id),
      name: r.display_name,
      cash: Number(r.cash),
      x: r.x,
      y: r.y,
      appearance: r.appearance ?? encodeAppearance(appearanceFromSeed(r.appearance_seed >>> 0)),
      fresh: r.appearance === null,
    };
  }

  private npcSim!: NpcSim;
  private workforce!: WorkforceStore;
  private companies!: CompaniesStore;
  private permits!: PermitsStore;
  private stocks!: StocksStore;
  private crypto!: CryptoStore;
  private logistics!: LogisticsStore;
  private npcView = {
    upsert: (n: Npc) => {
      let st = this.state.npcs.get(String(n.eid));
      if (!st) {
        st = new NpcState();
        st.name = n.name;
        st.appearance = encodeAppearance(appearanceFromSeed(n.appearance));
        this.state.npcs.set(String(n.eid), st);
      }
      st.x = n.x;
      st.y = n.y;
      st.heading = n.heading ?? 999;
      st.status = n.status ?? "";
      st.employer = n.employerEntity === null ? "" : String(n.employerEntity);
    },
    remove: (eid: number) => {
      this.state.npcs.delete(String(eid));
    },
  };

  onCreate(options: {
    map: CityMap;
    lotStore: LotStore;
    interiorStore: InteriorStore;
    goods: GoodsStore;
    market: MarketStore;
    npcSim: NpcSim;
    workforce: WorkforceStore;
    companies: CompaniesStore;
    permits: PermitsStore;
    stocks: StocksStore;
    crypto: CryptoStore;
    logistics: LogisticsStore;
  }) {
    this.map = options.map;
    this.lotStore = options.lotStore;
    this.interiorStore = options.interiorStore;
    this.goods = options.goods;
    this.market = options.market;
    this.npcSim = options.npcSim;
    this.workforce = options.workforce;
    this.companies = options.companies;
    this.permits = options.permits;
    this.stocks = options.stocks;
    this.crypto = options.crypto;
    this.logistics = options.logistics;
    this.setState(new CityState());
    this.npcSim.addView(this.npcView);

    this.onMessage("setAppearance", (client, data: { code?: string }) => {
      const uid = this.uids.get(client.sessionId);
      const p = this.state.players.get(client.sessionId);
      if (!uid || !p) return;
      // re-encode what arrived: anything out of range or malformed lands on a
      // valid look rather than reaching the wire or the database
      const code = encodeAppearance(decodeAppearance(String(data?.code ?? "")));
      p.appearance = code;
      void pool
        .query("update players set appearance = $2 where id = $1", [uid, code])
        .catch((err) => console.error("[room] appearance save", err));
    });
    this.onMessage(
      "placeItem",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const x = Number(data?.x);
        const y = Number(data?.y);
        const rot = Number(data?.rot);
        const item = String(data?.item ?? "");
        const floor = Number(data?.floor ?? 0);
        if (![lotId, x, y, rot, floor].every(Number.isInteger)) throw new EconomyError("bad request");
        const { placed, cash, source } = await this.interiorStore.place(eid, lotId, item, x, y, rot, floor);
        this.applyCash(cash);
        // whoever works here re-reads the floor: a new till or rack changes
        // where they should be standing
        this.npcSim.forgetLotWork(lotId);
        this.broadcast("furn", { lotId, placed });
        if (source === "storage") this.broadcast("lotInvChanged", { lotId });
        else if (source === "pocket") client.send("pocketChanged", {});
      })
    );
    this.onMessage(
      "removeItem",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const furnId = Number(data?.furnId);
        if (!Number.isInteger(lotId) || !Number.isInteger(furnId)) throw new EconomyError("bad request");
        await this.interiorStore.remove(eid, lotId, furnId);
        this.npcSim.forgetLotWork(lotId);
        this.broadcast("furnRemove", { lotId, furnId });
        this.broadcast("lotInvChanged", { lotId });
      })
    );

    this.onMessage(
      "placeOrder",
      this.economy(async (client, data, eid) => {
        const side = data?.side === "sell" ? "sell" : data?.side === "buy" ? "buy" : null;
        const item = String(data?.item ?? "");
        const qty = Number(data?.qty);
        const price = Number(data?.price);
        if (!side || !Number.isInteger(qty) || !Number.isFinite(price))
          throw new EconomyError("bad request");
        const r = await this.market.place(eid, side, item, qty, price);
        this.applyCash(r.cash);
        for (const pu of r.pocketOf)
          for (const sid of this.sessionsOf(pu)) {
            const c = this.clients.find((x) => x.sessionId === sid);
            if (c) c.send("pocketChanged", {});
          }
        for (const n of r.notes) this.sendToEntity(n.eid, "note", { msg: n.msg });
        this.broadcast("mkt", { item });
      })
    );
    this.onMessage(
      "cancelOrder",
      this.economy(async (client, data, eid) => {
        const orderId = Number(data?.orderId);
        if (!Number.isInteger(orderId)) throw new EconomyError("bad request");
        const { pocketChanged } = await this.market.cancel(eid, orderId);
        if (pocketChanged) client.send("pocketChanged", {});
        this.broadcast("mkt", {});
      })
    );
    this.onMessage(
      "transfer",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const qty = Number(data?.qty);
        const item = String(data?.item ?? "");
        const toLot = !!data?.toLot;
        if (!Number.isInteger(lotId) || !Number.isInteger(qty)) throw new EconomyError("bad request");
        const { pocket, lotInv } = await this.goods.transfer(eid, lotId, item, qty, toLot);
        client.send("pocket", pocket);
        client.send("lotInv", { lotId, items: lotInv });
      })
    );
    this.onMessage(
      "tradeCoin",
      this.economy(async (client, data, eid) => {
        const qty = Number(data?.qty);
        const price = Number(data?.price);
        const side = data?.side === "sell" ? "sell" : data?.side === "buy" ? "buy" : null;
        if (!side || !Number.isInteger(qty) || (!data?.market && !Number.isFinite(price))) throw new EconomyError("bad request");
        const r = await this.crypto.trade(
          eid,
          side,
          qty,
          Number.isFinite(price) ? price : 0,
          !!data?.market,
          String(data?.coin ?? "duc")
        );
        this.applyCash(r.cash);
        for (const n of r.notes) this.sendToEntity(n.eid, "note", { msg: n.msg });
        this.broadcast("coin", {});
      })
    );
    this.onMessage(
      "cancelCoinOrder",
      this.economy(async (client, data, eid) => {
        const orderId = Number(data?.orderId);
        if (!Number.isInteger(orderId)) throw new EconomyError("bad request");
        await this.crypto.cancel(eid, orderId);
        this.broadcast("coin", {});
      })
    );
    this.onMessage(
      "sendCoin",
      this.economy(async (client, data, eid) => {
        const to = Number(data?.to);
        const qty = Number(data?.qty);
        if (!Number.isInteger(to) || !Number.isInteger(qty)) throw new EconomyError("bad request");
        const code = String(data?.coin ?? "duc");
        await this.crypto.send(eid, to, qty, code);
        client.send("coin", {});
        this.sendToEntity(to, "note", { msg: `Received ${qty} ${code.toUpperCase()}` });
      })
    );
    this.onMessage(
      "setRackCoin",
      this.economy(async (client, data, eid) => {
        const furnId = Number(data?.furnId);
        if (!Number.isInteger(furnId)) throw new EconomyError("bad request");
        await this.crypto.setRackCoin(eid, furnId, String(data?.coin ?? "duc"));
        client.send("rackChanged", {});
        this.broadcast("coin", {});
      })
    );
    this.onMessage(
      "installComponent",
      this.economy(async (client, data, eid) => {
        const furnId = Number(data?.furnId);
        const item = String(data?.item ?? "");
        if (!Number.isInteger(furnId)) throw new EconomyError("bad request");
        await this.crypto.install(eid, furnId, item);
        client.send("rackChanged", { furnId });
        client.send("pocketChanged", {});
      })
    );
    this.onMessage(
      "removeComponent",
      this.economy(async (client, data, eid) => {
        const furnId = Number(data?.furnId);
        const slot = Number(data?.slot);
        if (!Number.isInteger(furnId) || !Number.isInteger(slot)) throw new EconomyError("bad request");
        await this.crypto.remove(eid, furnId, slot);
        client.send("rackChanged", { furnId });
      })
    );
    this.onMessage(
      "tradeStock",
      this.economy(async (client, data, eid) => {
        const company = Number(data?.company);
        const qty = Number(data?.qty);
        const price = Number(data?.price);
        const side = data?.side === "sell" ? "sell" : data?.side === "buy" ? "buy" : null;
        if (!side || !Number.isInteger(company) || !Number.isInteger(qty) || (!data?.market && !Number.isFinite(price)))
          throw new EconomyError("bad request");
        const r = await this.stocks.trade(eid, company, side, qty, Number.isFinite(price) ? price : 0, !!data?.market);
        this.applyCash(r.cash);
        for (const n of r.notes) this.sendToEntity(n.eid, "note", { msg: n.msg });
        this.broadcast("stk", { company });
      })
    );
    this.onMessage(
      "cancelStockOrder",
      this.economy(async (client, data, eid) => {
        const orderId = Number(data?.orderId);
        if (!Number.isInteger(orderId)) throw new EconomyError("bad request");
        await this.stocks.cancel(eid, orderId);
        this.broadcast("stk", {});
      })
    );
    this.onMessage(
      "ipo",
      this.economy(async (client, data, eid) => {
        const company = Number(data?.company);
        const shares = Number(data?.shares);
        const floatPct = Number(data?.floatPct);
        const price = Number(data?.price);
        if (![company, shares].every(Number.isInteger) || !Number.isFinite(floatPct) || !Number.isFinite(price))
          throw new EconomyError("bad request");
        const r = await this.stocks.ipo(eid, company, shares, floatPct, price);
        client.send("note", { msg: `Listed! ${r.floatShares} shares floated` });
        this.broadcast("stk", { company });
      })
    );
    this.onMessage(
      "setDividend",
      this.economy(async (client, data, eid) => {
        const company = Number(data?.company);
        const ratio = Number(data?.ratio);
        if (!Number.isInteger(company) || !Number.isFinite(ratio)) throw new EconomyError("bad request");
        await this.stocks.setDividend(eid, company, ratio);
        this.broadcast("stk", { company });
      })
    );
    this.onMessage(
      "buildDock",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        await this.logistics.build(eid, lotId, Number(data?.x ?? 0), Number(data?.y ?? 0));
        client.send("dockChanged", { lotId });
      })
    );
    this.onMessage(
      "addDockLine",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const partnerLot = Number(data?.partnerLot);
        const perMin = Number(data?.perMin);
        if (![lotId, partnerLot, perMin].every(Number.isInteger)) throw new EconomyError("bad request");
        await this.logistics.addLine(eid, lotId, String(data?.direction ?? ""), String(data?.item ?? ""), perMin, partnerLot);
        client.send("dockChanged", { lotId });
      })
    );
    this.onMessage(
      "removeDockLine",
      this.economy(async (client, data, eid) => {
        const lineId = Number(data?.lineId);
        if (!Number.isInteger(lineId)) throw new EconomyError("bad request");
        await this.logistics.removeLine(eid, lineId);
        client.send("dockChanged", {});
      })
    );
    this.onMessage(
      "buyPermit",
      this.economy(async (client, data, eid) => {
        const forEntity = Number(data?.entity ?? eid);
        const category = String(data?.category ?? "");
        if (!Number.isInteger(forEntity)) throw new EconomyError("bad request");
        const acting = this.companies.actingSet(eid);
        const r = await this.permits.issue((t) => acting.has(t), forEntity, category);
        this.applyCash(r.cash);
        client.send("permitsChanged", { entity: forEntity, category, fee: r.fee });
      })
    );
    this.onMessage(
      "formCompany",
      this.economy(async (client, data, eid) => {
        const name = String(data?.name ?? "");
        const { companyEid, cash } = await this.companies.form(eid, name);
        this.applyCash(cash);
        client.send("companiesChanged", { companyEid });
      })
    );
    this.onMessage(
      "companyCash",
      this.economy(async (client, data, eid) => {
        const company = Number(data?.company);
        const amount = Number(data?.amount);
        if (!Number.isInteger(company) || !Number.isFinite(amount)) throw new EconomyError("bad request");
        const cash = await this.companies.moveCash(eid, company, amount);
        this.applyCash(cash);
        client.send("companiesChanged", {});
      })
    );
    this.onMessage(
      "companyLot",
      this.economy(async (client, data, eid) => {
        const company = Number(data?.company);
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(company) || !Number.isInteger(lotId)) throw new EconomyError("bad request");
        const lot = await this.companies.transferLot(eid, company, lotId, !!data?.toCompany);
        this.broadcast("lot", lot);
        client.send("companiesChanged", {});
      })
    );
    this.onMessage(
      "bayTransfer",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const qty = Number(data?.qty);
        const item = String(data?.item ?? "");
        if (!Number.isInteger(lotId) || !Number.isInteger(qty)) throw new EconomyError("bad request");
        const r = await this.goods.bayTransfer(eid, lotId, item, qty, !!data?.toStore);
        client.send("pocket", r.pocket);
        client.send("dockChanged", { lotId });
      })
    );
    this.onMessage(
      "storeTransfer",
      this.economy(async (client, data, eid) => {
        const furnId = Number(data?.furnId);
        const qty = Number(data?.qty);
        const item = String(data?.item ?? "");
        if (!Number.isInteger(furnId) || !Number.isInteger(qty)) throw new EconomyError("bad request");
        const r = await this.goods.containerTransfer(eid, furnId, item, qty, !!data?.toStore);
        client.send("pocket", r.pocket);
        client.send("storeInv", { furnId, items: r.items });
        client.send("lotInv", { lotId: r.lotId });
      })
    );
    this.onMessage(
      "demolishArea",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const r = data?.rect ?? {};
        const rect = { x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h) };
        if (!Number.isInteger(lotId) || ![rect.x, rect.y, rect.w, rect.h].every(Number.isInteger))
          throw new EconomyError("bad request");
        if (rect.w < 1 || rect.h < 1) throw new EconomyError("select an area first");
        const { lot, cash, removed } = await this.lotStore.demolishArea(eid, lotId, rect);
        this.applyCash(cash);
        this.npcSim.forgetLotWork(lotId);
        this.broadcast("lot", lot);
        this.broadcast("dockChanged", { lotId });
        client.send("note", { msg: `Cleared ${removed.join(" and ")}` });
      })
    );
    this.onMessage(
      "renameLot",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        const lot = await this.lotStore.rename(eid, lotId, String(data?.name ?? ""));
        this.broadcast("lot", lot);
      })
    );
    this.onMessage(
      "toggleSign",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        this.broadcast("lot", await this.lotStore.setSign(eid, lotId, !!data?.on));
      })
    );
    this.onMessage(
      "hireWorker",
      this.economy(async (client, data, eid) => {
        const wage = Number(data?.wage);
        const slots = Number(data?.slots ?? 1);
        const employer = Number(data?.employer ?? eid);
        const lotId = data?.lotId !== undefined && data?.lotId !== null ? Number(data.lotId) : null;
        const role = data?.role ? String(data.role) : null;
        if (!Number.isFinite(wage) || !Number.isInteger(employer)) throw new EconomyError("bad request");
        await this.workforce.postOffer(eid, employer, wage, slots, lotId, role);
        client.send("workforceChanged", {});
        if (lotId !== null) client.send("jobsChanged", { lotId });
      })
    );
    this.onMessage(
      "cancelOffer",
      this.economy(async (client, data, eid) => {
        const offerId = Number(data?.offerId);
        if (!Number.isInteger(offerId)) throw new EconomyError("bad request");
        await this.workforce.cancelOffer(eid, offerId);
        client.send("workforceChanged", {});
      })
    );
    this.onMessage(
      "assignWorker",
      this.economy(async (client, data, eid) => {
        const npc = Number(data?.npc);
        const role = String(data?.role ?? "");
        const lotId = data?.lotId === null || data?.lotId === undefined ? null : Number(data.lotId);
        if (!Number.isInteger(npc)) throw new EconomyError("bad request");
        await this.workforce.assign(eid, npc, lotId, role);
        client.send("workforceChanged", {});
        if (lotId !== null) client.send("jobsChanged", { lotId });
        client.send("dockChanged", {});
      })
    );
    this.onMessage(
      "unassignWorker",
      this.economy(async (client, data, eid) => {
        const npc = Number(data?.npc);
        if (!Number.isInteger(npc)) throw new EconomyError("bad request");
        await this.workforce.unassign(eid, npc);
        client.send("workforceChanged", {});
      })
    );
    this.onMessage(
      "fireWorker",
      this.economy(async (client, data, eid) => {
        const npc = Number(data?.npc);
        if (!Number.isInteger(npc)) throw new EconomyError("bad request");
        await this.workforce.fire(eid, npc);
        client.send("workforceChanged", {});
      })
    );
    this.onMessage(
      "stockShelf",
      this.economy(async (client, data, eid) => {
        const furnId = Number(data?.furnId);
        const qty = Number(data?.qty);
        if (!Number.isInteger(furnId) || !Number.isInteger(qty)) throw new EconomyError("bad request");
        await this.goods.stockShelf(eid, furnId, qty, !!data?.toShelf);
        const { lotId } = await this.goods.shelfView(furnId);
        this.broadcast("shopChanged", { lotId });
        this.broadcast("lotInvChanged", { lotId });
      })
    );
    this.onMessage(
      "setShelfListing",
      this.economy(async (client, data, eid) => {
        const furnId = Number(data?.furnId);
        if (!Number.isInteger(furnId)) throw new EconomyError("bad request");
        const item = data?.item ? String(data.item) : null;
        const price = data?.price === null || data?.price === undefined ? null : Number(data.price);
        await this.goods.setShelfListing(eid, furnId, item, price);
        const { lotId } = await this.goods.shelfView(furnId);
        this.broadcast("shopChanged", { lotId });
        this.broadcast("lotInvChanged", { lotId });
      })
    );
    this.onMessage(
      "craft",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const count = Number(data?.count);
        const recipe = String(data?.recipe ?? "");
        if (!Number.isInteger(lotId) || !Number.isInteger(count)) throw new EconomyError("bad request");
        const { lotInv } = await this.goods.craft(eid, lotId, recipe, count);
        client.send("lotInv", { lotId, items: lotInv });
        client.send("note", { msg: "Crafting started" });
      })
    );
    this.onMessage(
      "buyLot",
      this.economy(async (_client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        const { lot, cash } = await this.lotStore.buy(eid, lotId);
        this.applyCash(cash);
        this.broadcast("lot", lot);
      })
    );
    this.onMessage(
      "listLot",
      this.economy(async (_client, data, eid) => {
        const lotId = Number(data?.lotId);
        const price = Math.round(Number(data?.price));
        if (!Number.isInteger(lotId) || !Number.isFinite(price)) throw new EconomyError("bad request");
        this.broadcast("lot", await this.lotStore.list(eid, lotId, price));
      })
    );
    this.onMessage(
      "unlistLot",
      this.economy(async (_client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        this.broadcast("lot", await this.lotStore.unlist(eid, lotId));
      })
    );
    this.onMessage(
      "listRent",
      this.economy(async (_client, data, eid) => {
        const lotId = Number(data?.lotId);
        const rent = Math.round(Number(data?.rent));
        if (!Number.isInteger(lotId) || !Number.isFinite(rent)) throw new EconomyError("bad request");
        this.broadcast("lot", await this.lotStore.listRent(eid, lotId, rent));
      })
    );
    this.onMessage(
      "unlistRent",
      this.economy(async (_client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        this.broadcast("lot", await this.lotStore.unlistRent(eid, lotId));
      })
    );
    this.onMessage(
      "rentLot",
      this.economy(async (_client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        const { lot, cash } = await this.lotStore.rentLot(eid, lotId);
        this.applyCash(cash);
        this.broadcast("lot", lot);
      })
    );
    this.onMessage(
      "endTenancy",
      this.economy(async (_client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        this.broadcast("lot", await this.lotStore.endTenancy(eid, lotId));
      })
    );
    this.onMessage(
      "demolish",
      this.economy(async (_client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        const { lot, cash } = await this.lotStore.demolish(eid, lotId);
        this.applyCash(cash);
        this.broadcast("lot", lot);
      })
    );
    this.onMessage(
      "buildTemplate",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const template = String(data?.template ?? "");
        if (!Number.isInteger(lotId) || !template) throw new EconomyError("bad request");
        const { lot, cash } = await this.lotStore.buildTemplate(eid, lotId, template);
        this.applyCash(cash);
        this.broadcast("lot", lot);
      })
    );
    this.onMessage(
      "build",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const floors = Number(data?.floors);
        const raw = Array.isArray(data?.rects) ? data.rects.slice(0, 8) : [];
        const rects = raw.map((r: any) => ({
          x: Number(r?.x), y: Number(r?.y), w: Number(r?.w), h: Number(r?.h),
          ...(r?.f !== undefined ? { f: Number(r.f) } : {}),
        }));
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        const { lot, cash } = await this.lotStore.build(eid, lotId, { rects, floors });
        this.applyCash(cash);
        this.broadcast("lot", lot);
        // materials were consumed from site storage and/or the builder's bag
        this.broadcast("lotInvChanged", { lotId });
        client.send("pocketChanged", {});
      })
    );

    this.onMessage(
      "setupSource",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        const type = String(data?.type ?? "");
        const raw = Array.isArray(data?.rects) ? data.rects.slice(0, 4) : [];
        const rects = raw.map((r: any) => ({
          x: Number(r?.x), y: Number(r?.y), w: Number(r?.w), h: Number(r?.h),
        }));
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        const { lot, cash } = await this.lotStore.setupSource(eid, lotId, type, rects);
        this.applyCash(cash);
        this.broadcast("lot", lot);
        client.send("note", { msg: "Up and running — yields arrive each game day" });
      })
    );
    this.onMessage(
      "collectSource",
      this.economy(async (client, data, eid) => {
        const lotId = Number(data?.lotId);
        if (!Number.isInteger(lotId)) throw new EconomyError("bad request");
        const { pocket, collected, item } = await this.goods.collectSource(eid, lotId);
        client.send("pocket", pocket);
        client.send("note", { msg: `Collected ${collected} ${item.replace(/_/g, " ")}` });
      })
    );
    this.onMessage("move", (client, data) => {
      const budget = this.moveBudget.get(client.sessionId) ?? 0;
      if (budget > MOVE_RATE_LIMIT) return;
      this.moveBudget.set(client.sessionId, budget + 1);

      const parsed = MoveIntentSchema.safeParse(data);
      if (!parsed.success) return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (tileAtWorld(this.map, parsed.data.x, parsed.data.y) === Tile.Water) return;
      p.tx = parsed.data.x;
      p.ty = parsed.data.y;
    });

    registry.add(this);
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
    
    setInterval(() => this.moveBudget.clear(), 1000);
    this.persistTimer = setInterval(() => void this.persistAll(), 30_000);
  }

  onJoin(client: Client, _options?: unknown, auth?: AuthData) {
    if (!auth) throw new Error("unauthorized");
    const p = new PlayerState();
    p.name = auth.name;
    p.x = p.tx = auth.x;
    p.y = p.ty = auth.y;
    p.appearance = auth.appearance;
    p.cash = auth.cash;
    this.state.players.set(client.sessionId, p);
    this.uids.set(client.sessionId, auth.uid);
    this.eids.set(client.sessionId, auth.eid);
    if (auth.fresh) client.send("createCharacter", {});
    console.log(`[room] ${auth.name} joined (${this.clients.length} online)`);
  }

  async onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const uid = this.uids.get(client.sessionId);
    if (p && uid) await this.persistOne(uid, p).catch(console.error);
    this.state.players.delete(client.sessionId);
    this.uids.delete(client.sessionId);
    this.eids.delete(client.sessionId);
    this.moveBudget.delete(client.sessionId);
  }

  onDispose_unused() {
    registry.remove(this);
    if (this.persistTimer) clearInterval(this.persistTimer);
    return this.persistAll();
  }

  private update(dtMs: number) {
    this.state.dayTime = ((Date.now() / 1000) % DAY_LENGTH_SEC) / DAY_LENGTH_SEC;
    if (++this.trafficCounter >= 100) {
      this.trafficCounter = 0;
      this.state.players.forEach((p) => this.lotStore.recordTraffic(p.x, p.y));
    }
    const step = (PLAYER_SPEED * dtMs) / 1000;
    this.state.players.forEach((p) => {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-3) return;
      const s = Math.min(step, dist);
      const nx = p.x + (dx / dist) * s;
      const ny = p.y + (dy / dist) * s;
      if (tileAtWorld(this.map, nx, ny) === Tile.Water) {
        p.tx = p.x;
        p.ty = p.y;
        return;
      }
      p.x = nx;
      p.y = ny;
    });
  }

  private persistOne(uid: string, p: PlayerState) {
    return pool.query("update players set x = $1, y = $2 where id = $3", [p.x, p.y, uid]);
  }

  private async persistAll() {
    for (const [sessionId, p] of this.state.players.entries()) {
      const uid = this.uids.get(sessionId);
      if (uid) await this.persistOne(uid, p).catch(console.error);
    }
  }
}
