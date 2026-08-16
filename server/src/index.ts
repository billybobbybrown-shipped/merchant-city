import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  LoginSchema,
  RegisterSchema,
  SetNameSchema,
  SERVER_PORT,
  STARTING_CASH,
  PERMIT_CATEGORIES,
  PermitCategory,
} from "@mc/shared";
import { migrate, pool, sqlProfiling, sqlStats } from "./db.js";
import { hashPassword, issueToken, verifyPassword, verifyToken } from "./auth.js";
import { entityForUser } from "./accounts.js";
import { findSpawn, loadOrCreateWorld } from "./world.js";
import { CityRoom } from "./rooms/CityRoom.js";
import { LotStore } from "./lots.js";
import { InteriorStore } from "./interiors.js";
import { EconomyTicker } from "./ticker.js";
import { NpcSim } from "./npcs.js";
import { WorkforceStore } from "./workforce.js";
import { CompaniesStore } from "./companies.js";
import { PermitsStore } from "./permits.js";
import { StocksStore } from "./stocks.js";
import { CompanyOps } from "./companyOps.js";
import { CryptoStore } from "./crypto.js";
import { StatsService } from "./stats.js";
import { LogisticsStore } from "./logistics.js";
import { MarketMakers } from "./marketMakers.js";
import { GoodsStore } from "./goods.js";
import { MarketStore } from "./market.js";

const PORT = Number(process.env.PORT ?? SERVER_PORT);

async function bearerUid(req: express.Request): Promise<string | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return verifyToken(h.slice(7));
}

async function main() {
  await migrate();
  const world = await loadOrCreateWorld();
  const spawn = findSpawn(world.map);
  const lotStore = new LotStore(world.map);
  await lotStore.load();
  const interiorStore = new InteriorStore(lotStore);
  const goods = new GoodsStore(lotStore, interiorStore);
  interiorStore.goods = goods;
  const market = new MarketStore();
  interiorStore.market = market;
  const workforce = new WorkforceStore(lotStore);
  const companies = new CompaniesStore(lotStore);
  await companies.load();
  lotStore.setControlResolver((eid) => companies.actingSet(eid));
  workforce.acting = (eid) => companies.actingSet(eid);
  const logistics = new LogisticsStore(lotStore, goods);
  logistics.acting = (eid) => companies.actingSet(eid);
  logistics.workforce = workforce;
  logistics.companies = companies;
  const permits = new PermitsStore();
  goods.permits = permits;
  market.permits = permits;
  const stocks = new StocksStore(companies);
  const crypto = new CryptoStore(lotStore);
  crypto.goods = goods;
  const companyOps = new CompanyOps(lotStore, goods, interiorStore, workforce, market, permits, companies, stocks);
  companyOps.crypto = crypto;
  const stats = new StatsService(lotStore, stocks, crypto);
  companyOps.stats = stats;
  const marketMakers = new MarketMakers(stocks, crypto);
  setInterval(() => void marketMakers.tick(), 25_000);
  const npcSim = new NpcSim(world.map, lotStore);
  npcSim.workforce = workforce;
  npcSim.goods = goods;
  npcSim.market = market;
  npcSim.interiors = interiorStore;
  workforce.sync = npcSim;
  await npcSim.ensurePopulation(Number(process.env.NPC_COUNT ?? 250));
  await npcSim.refreshOffers();
  setInterval(() => void npcSim.refreshOffers(), 30_000);
  let lastNpcTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    npcSim.tick(Math.min(0.3, (now - lastNpcTick) / 1000));
    lastNpcTick = now;
  }, 100);
  await companyOps.seed();
  await crypto.seedGenesis();
  const ticker = new EconomyTicker(lotStore, goods, npcSim, world.map);
  ticker.stocks = stocks;
  ticker.companyOps = companyOps;
  ticker.crypto = crypto;
  ticker.stats = stats;
  ticker.logistics = logistics;
  ticker.start();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/map", (_req, res) => {
    res.type("application/json").send(world.wireJson);
  });
  app.get("/lots", (_req, res) => res.json(lotStore.all()));
  if (process.env.NODE_ENV !== "production")
    app.post("/dev/tick", async (_req, res) => {
      await ticker.runDay();
      res.json({ ok: true });
    });
    // what the database was asked to do since the last reset — only populated
    // when the server runs with MC_PROFILE_SQL=1
    app.get("/dev/sql", (req, res) => {
      const rows = [...sqlStats.entries()]
        .map(([q, s]) => ({ q, n: s.n, ms: Math.round(s.ms), avg: +(s.ms / s.n).toFixed(2) }))
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 40);
      if (req.query.reset) sqlStats.clear();
      res.json({ profiling: sqlProfiling, rows });
    });
  app.get("/districts", async (_req, res) => {
    const r = await pool.query(
      `select d.id, d.name, e.name as control
         from districts d
         left join entities e on e.id = d.controlling_family_id
        where d.world_id = 1 order by d.id`
    );
    res.json(r.rows.map((row) => ({ id: row.id, name: row.name, control: row.control ?? null })));
  });
  app.get("/market", async (_req, res) => res.json(await market.summary()));
  app.get("/market/orders", async (req, res) => {
    const uid = await bearerUid(req);
    const eid = uid ? await entityForUser(uid) : null;
    if (!eid) return res.status(401).json({ error: "unauthorized" });
    res.json(await market.myOrders(eid));
  });
  app.get("/market/history/:item", async (req, res) => {
    const bucket = req.query.res === "1m" ? 1 : 10;
    res.json(await market.history(String(req.params.item), bucket));
  });
  app.get("/market/:item", async (req, res) => res.json(await market.book(String(req.params.item))));
  app.get("/inventory", async (req, res) => {
    const uid = await bearerUid(req);
    const eid = uid ? await entityForUser(uid) : null;
    if (!eid) return res.status(401).json({ error: "unauthorized" });
    res.json(await goods.inventory("entity", String(eid)));
  });
  app.get("/jobs/:lotId", async (req, res) => {
    const lotId = Number(req.params.lotId);
    if (!Number.isInteger(lotId)) return res.status(400).json({ error: "bad lot" });
    res.json(await workforce.forLot(lotId));
  });
  app.get("/shelf/:furnId", async (req, res) => {
    const furnId = Number(req.params.furnId);
    if (!Number.isInteger(furnId)) return res.status(400).json({ error: "bad shelf" });
    try {
      res.json(await goods.shelfView(furnId));
    } catch {
      res.status(404).json({ error: "not a shelf" });
    }
  });
  app.get("/shop/:lotId", async (req, res) => {
    const lotId = Number(req.params.lotId);
    if (!Number.isInteger(lotId)) return res.status(400).json({ error: "bad lot" });
    res.json({
      shelves: await goods.shelvesOf(lotId),
      capacity: await goods.shelfCapacity(lotId),
    });
  });
  app.get("/lotinv/:lotId", async (req, res) => {
    const lotId = Number(req.params.lotId);
    if (!Number.isInteger(lotId)) return res.status(400).json({ error: "bad lot" });
    await goods.resolveCrafts(lotId);
    res.json({
      items: await goods.inventory("lot", String(lotId)),
      capacity: await goods.lotCapacity(lotId),
      // includes anything staged on the delivery pallets, which shares the
      // property's storage
      held: await goods.lotHeld(lotId),
      crafts: await goods.pendingCrafts(lotId),
    });
  });
  app.get("/interior/:lotId", async (req, res) => {
    const lotId = Number(req.params.lotId);
    if (!Number.isInteger(lotId)) return res.status(400).json({ error: "bad lot" });
    res.json(await interiorStore.items(lotId));
  });
  app.get("/workforce/:eid", async (req, res) => {
    const eid = Number(req.params.eid);
    if (!Number.isInteger(eid)) return res.status(400).json({ error: "bad entity" });
    res.json(await workforce.manageable(eid));
  });
  app.get("/companies/of/:eid", async (req, res) => {
    const eid = Number(req.params.eid);
    if (!Number.isInteger(eid)) return res.status(400).json({ error: "bad entity" });
    res.json(await companies.mine(eid));
  });
  app.get("/company/:eid/financials", async (req, res) => {
    const eid = Number(req.params.eid);
    if (!Number.isInteger(eid)) return res.status(400).json({ error: "bad entity" });
    res.json(await companies.financials(eid));
  });
  app.get("/econ/macro", async (req, res) => res.json(await stats.macro(Number(req.query.days ?? 30))));
  app.get("/econ/indices", async (req, res) => res.json(await stats.indices(Number(req.query.days ?? 30))));
  app.get("/econ/commodities", async (_req, res) => res.json(await stats.commodities()));
  app.get("/econ/asset/:type/:asset", async (req, res) =>
    res.json(await stats.assetHistory(String(req.params.type), String(req.params.asset), Number(req.query.days ?? 60))));
  app.get("/coins", async (_req, res) => res.json(await crypto.allStats()));
  app.get("/coin", async (req, res) => {
    const code = String(req.query.c ?? "duc");
    res.json({ ...(await crypto.book(code)), stats: await crypto.networkStats(code) });
  });
  app.get("/coin/portfolio/:eid", async (req, res) => {
    const eid = Number(req.params.eid);
    if (!Number.isInteger(eid)) return res.status(400).json({ error: "bad entity" });
    res.json(await crypto.portfolio(eid));
  });
  app.get("/coin/balance/:eid", async (req, res) => {
    const eid = Number(req.params.eid);
    if (!Number.isInteger(eid)) return res.status(400).json({ error: "bad entity" });
    const code = String(req.query.c ?? "duc");
    const hash = await crypto.worldHashpower(code);
    const worldHash = [...hash.values()].reduce((a, b) => a + b, 0);
    const mine = hash.get(eid) ?? 0;
    res.json({
      balance: await crypto.balance(eid, code),
      balances: await crypto.balances(eid),
      orders: await crypto.myOrders(eid),
      myHash: mine,
      hashShare: worldHash > 0 ? mine / worldHash : 0,
    });
  });
  app.get("/store/:furnId", async (req, res) => {
    const furnId = Number(req.params.furnId);
    if (!Number.isInteger(furnId)) return res.status(400).json({ error: "bad container" });
    try {
      res.json(await goods.containerView(furnId));
    } catch {
      res.status(404).json({ error: "not storage" });
    }
  });
  app.get("/rack/:furnId", async (req, res) => {
    const furnId = Number(req.params.furnId);
    if (!Number.isInteger(furnId)) return res.status(400).json({ error: "bad rack" });
    try {
      res.json(await crypto.components(furnId));
    } catch {
      res.status(404).json({ error: "not a rack" });
    }
  });
  app.get("/stocks", async (_req, res) => res.json(await stocks.list()));
  app.get("/stocks/:company", async (req, res) => {
    const company = Number(req.params.company);
    if (!Number.isInteger(company)) return res.status(400).json({ error: "bad company" });
    res.json(await stocks.detail(company));
  });
  app.get("/stocks/:company/history", async (req, res) => {
    const company = Number(req.params.company);
    if (!Number.isInteger(company)) return res.status(400).json({ error: "bad company" });
    res.json(await stocks.history(company, req.query.res === "1m" ? 1 : 10));
  });
  app.get("/coin/history", async (req, res) =>
    res.json(await crypto.history(req.query.res === "1m" ? 1 : 10, String(req.query.c ?? "duc"))));
  app.get("/holdings/:eid", async (req, res) => {
    const eid = Number(req.params.eid);
    if (!Number.isInteger(eid)) return res.status(400).json({ error: "bad entity" });
    res.json({
      holdings: await stocks.holdingsOf(eid),
      orders: await stocks.myStockOrders(eid),
      portfolio: await stocks.portfolio(eid),
    });
  });
  app.get("/docks", async (_req, res) => res.json(await logistics.all()));
  app.get("/dock/:lotId", async (req, res) => {
    const lotId = Number(req.params.lotId);
    if (!Number.isInteger(lotId)) return res.status(400).json({ error: "bad lot" });
    res.json(await logistics.view(lotId));
  });
  app.get("/permits", async (_req, res) => res.json(await permits.registry()));
  app.get("/permits/of/:eid", async (req, res) => {
    const eid = Number(req.params.eid);
    if (!Number.isInteger(eid)) return res.status(400).json({ error: "bad entity" });
    res.json(await permits.of(eid));
  });
  app.get("/permits/fee/:eid/:category", async (req, res) => {
    const eid = Number(req.params.eid);
    const category = String(req.params.category);
    if (!Number.isInteger(eid) || !PERMIT_CATEGORIES.includes(category as PermitCategory))
      return res.status(400).json({ error: "bad request" });
    res.json({ fee: await permits.feeFor(eid, category as PermitCategory) });
  });

  app.post("/auth/register", async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid email or password (min 8 chars)" });
    const { email, password } = parsed.data;
    try {
      const r = await pool.query(
        "insert into users (email, pass_hash) values ($1, $2) returning id",
        [email.toLowerCase(), hashPassword(password)]
      );
      res.json({ token: issueToken(r.rows[0].id) });
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "email already registered" });
      throw err;
    }
  });

  app.post("/auth/login", async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid credentials" });
    const r = await pool.query("select id, pass_hash from users where email = $1", [
      parsed.data.email.toLowerCase(),
    ]);
    if (!r.rowCount || !r.rows[0].pass_hash || !verifyPassword(parsed.data.password, r.rows[0].pass_hash))
      return res.status(401).json({ error: "invalid credentials" });
    res.json({ token: issueToken(r.rows[0].id) });
  });

  app.get("/auth/me", async (req, res) => {
    const uid = await bearerUid(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const r = await pool.query(
      `select u.email, p.display_name, p.entity_id, p.appearance_seed,
              coalesce(a.balance, 0) as cash
         from users u
         left join players p on p.id = u.id
         left join accounts a on a.entity_id = p.entity_id and a.currency = 'clean'
        where u.id = $1`,
      [uid]
    );
    if (!r.rowCount) return res.status(401).json({ error: "unauthorized" });
    const row = r.rows[0];
    res.json({
      userId: uid,
      entityId: row.entity_id !== null ? Number(row.entity_id) : null,
      email: row.email,
      player: row.display_name
        ? { name: row.display_name, cash: Number(row.cash), appearance: row.appearance_seed }
        : null,
    });
  });

  app.post("/auth/name", async (req, res) => {
    const uid = await bearerUid(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const parsed = SetNameSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "3-16 chars, letters/numbers/underscore" });
    const client = await pool.connect();
    try {
      await client.query("begin");
      const ent = await client.query(
        "insert into entities (kind, name) values ('player', $1) returning id",
        [parsed.data.name]
      );
      const eid = Number(ent.rows[0].id);
      await client.query(
        `insert into players (id, display_name, cash, x, y, appearance_seed, entity_id)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [uid, parsed.data.name, STARTING_CASH, spawn.x, spawn.y, randomInt(0, 2 ** 31), eid]
      );
      await client.query(
        "insert into accounts (entity_id, currency, balance) values ($1, 'clean', $2)",
        [eid, STARTING_CASH]
      );
      await client.query("commit");
      res.json({ ok: true });
    } catch (err: any) {
      await client.query("rollback");
      if (err?.code === "23505") {
        const mine = await pool.query("select 1 from players where id = $1", [uid]);
        return res
          .status(409)
          .json({ error: mine.rowCount ? "you already have a character" : "name taken" });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  const httpServer = createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });
  gameServer.define("city", CityRoom, { map: world.map, lotStore, interiorStore, goods, market, npcSim, workforce, companies, permits, stocks, crypto, logistics });

  httpServer.listen(PORT, () => console.log(`[server] merchant-city on :${PORT}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
