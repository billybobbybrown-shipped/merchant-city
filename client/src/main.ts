import { buildingForLot, LotState, lotName } from "@mc/shared";
import { fetchMap, getToken } from "./net/api.js";
import { SERVER_URL } from "./config.js";
import { joinCity } from "./net/room.js";
import { runAuthFlow } from "./ui/auth.js";
import { HUD } from "./ui/hud.js";
import { watchSelects } from "./ui/dropdown.js";
import { Engine } from "./render/engine.js";
import { buildCity, derivedBuildings, restyleDerived } from "./game/city.js";
import * as THREE from "three";
import { PlayerRenderer } from "./game/players.js";
import { CharacterPanel } from "./ui/characterPanel.js";
import { Controls } from "./game/input.js";
import { Lots } from "./game/lots.js";
import { Constructions } from "./game/constructions.js";
import { InteriorMode } from "./game/interior.js";
import { BuildMode } from "./game/buildMode.js";
import { DistrictOverlay } from "./game/districts.js";
import { DistrictLegend } from "./ui/districtLegend.js";
import { LotPanel, toast } from "./ui/lotPanel.js";
import { CraftPanel, StoragePanel } from "./ui/goodsPanels.js";
import { ShopPanel } from "./ui/shopPanel.js";
import { CompanyPanel } from "./ui/companyPanel.js";
import { WorkersPanel } from "./ui/workersPanel.js";
import { StocksPanel } from "./ui/stocksPanel.js";
import { CryptoPanel } from "./ui/cryptoPanel.js";
import { RackPanel } from "./ui/rackPanel.js";
import { DockPanel } from "./ui/dockPanel.js";
import { EconomyPanel } from "./ui/economyPanel.js";
import { ExchangePanel } from "./ui/exchange.js";
import { PocketPanel } from "./ui/inventory.js";

function loadingOverlay(ui: HTMLElement, text: string): () => void {
  const el = document.createElement("div");
  el.className = "loading";
  el.innerHTML = `<div class="wordmark">MERCHANT CITY</div><div class="bar"></div><div class="hint-text">${text}</div>`;
  ui.appendChild(el);
  return () => el.remove();
}

async function boot() {
  const app = document.getElementById("app")!;
  const ui = document.getElementById("ui")!;

  watchSelects(ui); // every <select> becomes a styled dropdown, automatically
  const session = await runAuthFlow(ui);
  const done = loadingOverlay(ui, "Building the city…");

  const map = await fetchMap();
  const engine = new Engine(app);
  engine.scene.add(buildCity(map));
  const districtOverlay = new DistrictOverlay(map);
  engine.scene.add(districtOverlay.group);

  const players = new PlayerRenderer();
  engine.scene.add(players.group);
  const npcs = new PlayerRenderer(false);
  engine.scene.add(npcs.group);

  const hud = new HUD(ui, session.player!.name);
  hud.setCash(session.player!.cash);
  const districtLegend = new DistrictLegend(ui, districtOverlay.entries, (cx, cz) => {
    engine.target.set(cx, 0, cz);
    engine.targetDist = Math.max(engine.targetDist, 60);
  });
  hud.onDistricts(() => {
    const on = districtOverlay.toggle();
    if (on) void districtLegend.show();
    else districtLegend.hide();
    return on;
  });

  const room = await joinCity(getToken()!);
  const state = room.state as any;

  // ---- land market -------------------------------------------------------
  const selfId = String(session.entityId ?? ""); // entity id — ownership comparisons use this
  // self + companies I control (>50%); lot ownership checks use this set
  const actingIds = new Set([selfId]);
  const refreshCompanies = async () => {
    const rows = await fetch(`${SERVER_URL}/companies/of/${selfId}`)
      .then((r) => r.json())
      .catch(() => []);
    actingIds.clear();
    actingIds.add(selfId);
    for (const c of rows) if (c.share > 0.5) actingIds.add(String(c.entityId));
  };
  await refreshCompanies();
  const lots = new Lots(map, selfId);
  await lots.fetch();
  engine.scene.add(lots.group);
  const constructions = new Constructions(lots);
  engine.scene.add(constructions.group);
  constructions.sync();

  // what a property is called in a list: the owner's name for it, always with
  // the lot number attached so two similarly named properties stay distinct
  const lotLabel = (id: number, st: LotState) => lotName(id, st.name);

  const myCash = () => {
    const p = state.players.get(room.sessionId);
    return p ? p.cash : 0;
  };
  const isVacant = (lotId: number) => {
    const lot = lots.defs.get(lotId);
    const st = lots.state.get(lotId);
    if (!lot || !st) return false;
    return !st.building && (st.cleared || buildingForLot(map.seed, lot) === null);
  };
  // effective building on a lot: player-built wins, else the derived city one
  const buildingDefFor = (lotId: number) => {
    const lot = lots.defs.get(lotId);
    const st = lots.state.get(lotId);
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
    if (st.cleared) return null;
    return buildingForLot(map.seed, lot);
  };
  // demolished pre-existing buildings disappear from the static city
  // what each pre-existing building was last rendered with, so a lot broadcast
  // only rebuilds one when its sign actually changed
  const signedAs = new Map<number, string>();
  const applyCleared = (st: LotState) => {
    // a pre-existing building is only rebuilt once its sign differs from the
    // one the city was generated with — untouched lots are left alone
    const want = `${st.name ?? ""}|${st.sign}`;
    const plain = want === "|true";
    if (!st.building && signedAs.get(st.id) !== want && !(plain && !signedAs.has(st.id))) {
      restyleDerived(st.id, st.name, st.sign);
    }
    if (!st.building) signedAs.set(st.id, want);
    // A pre-existing building only stands while the plot is untouched: once
    // something is built or dug there it is long gone, whether or not the plot
    // was formally cleared first.
    const m = derivedBuildings.get(st.id);
    if (m) m.visible = !st.cleared && !st.source && !st.building;
  };
  lots.state.forEach(applyCleared);
  const goodsActions = {
    // a rack takes and gives on its own account; without one the whole
    // building's storage is the target (workbench and shop panels)
    transfer: (lotId: number, item: string, qty: number, toLot: boolean) =>
      storagePanel.furnId !== null && storagePanel.lotId === lotId
        ? room.send("storeTransfer", { furnId: storagePanel.furnId, item, qty, toStore: toLot })
        : room.send("transfer", { lotId, item, qty, toLot }),
    craft: (lotId: number, recipe: string, count: number) =>
      room.send("craft", { lotId, recipe, count }),
  };
  const exchange = new ExchangePanel(
    ui,
    {
      place: (side, item, qty, price) => room.send("placeOrder", { side, item, qty, price }),
      cancel: (orderId) => room.send("cancelOrder", { orderId }),
    },
    getToken()!
  );
  const storagePanel = new StoragePanel(ui, goodsActions);
  const craftPanel = new CraftPanel(ui, goodsActions);
  const rackPanel = new RackPanel(
    ui,
    {
      install: (furnId, item) => room.send("installComponent", { furnId, item }),
      remove: (furnId, slot) => room.send("removeComponent", { furnId, slot }),
      setCoin: (furnId, coin) => room.send("setRackCoin", { furnId, coin }),
    },
    async (lotId) => {
      const [lotInv, mine] = await Promise.all([
        fetch(`${SERVER_URL}/lotinv/${lotId}`).then((r) => r.json()),
        fetch(`${SERVER_URL}/inventory`, { headers: { authorization: `Bearer ${getToken()}` } }).then((r) => r.json()),
      ]);
      const out: Record<string, number> = { ...(lotInv.items ?? {}) };
      for (const [k, v] of Object.entries(mine as Record<string, number>)) out[k] = (out[k] ?? 0) + v;
      return out;
    }
  );
  const dockPanel = new DockPanel(
    ui,
    {
      addLine: (lotId, direction, item, perMin, partnerLot) =>
        room.send("addDockLine", { lotId, direction, item, perMin, partnerLot }),
      removeLine: (lineId) => room.send("removeDockLine", { lineId }),
      bayTransfer: (lotId, item, qty, toStore) =>
        room.send("bayTransfer", { lotId, item, qty, toStore }),
      pocket: () => pocket,
    },
    () =>
      [...lots.state.entries()]
        .filter(([, st]) => st.ownerType === "player" && (actingIds.has(st.ownerId ?? "") || (!!st.tenantId && actingIds.has(st.tenantId))))
        .map(([id, st]) => ({
          id,
          name: lotLabel(id, st),
        }))
  );
  const refreshDocks = async () => {
    const list = await fetch(`${SERVER_URL}/docks`).then((r) => r.json()).catch(() => []);
    constructions.setDocks(list);
  };
  void refreshDocks();
  room.onMessage("dockChanged", () => {
    void dockPanel.refresh();
    void refreshDocks();
    void interior.refreshDock();
  });
  const shopPanel = new ShopPanel(ui, {
    stock: (furnId, qty, toShelf) => room.send("stockShelf", { furnId, qty, toShelf }),
    setListing: (furnId, item, price) => room.send("setShelfListing", { furnId, item, price }),
    pocket: () => pocket,
  });
  const refreshFixtures = async (lotId: number) => {
    if (storagePanel.lotId !== lotId && craftPanel.lotId !== lotId) return;
    const data = await fetch(`${SERVER_URL}/lotinv/${lotId}`).then((r) => r.json());
    // a rack shows its own contents; a workbench draws on the whole building
    if (storagePanel.lotId === lotId) {
      if (storagePanel.furnId === null) storagePanel.render(data, pocket);
      else {
        const one = await fetch(`${SERVER_URL}/store/${storagePanel.furnId}`).then((r) => r.json());
        storagePanel.render({ items: one.items, capacity: one.capacity, crafts: [] }, pocket);
      }
    }
    if (craftPanel.lotId === lotId) craftPanel.render(data);
  };
  const interior = new InteriorMode(
    engine,
    ui,
    {
      place: (lotId, item, x, y, rot, floor) => room.send("placeItem", { lotId, item, x, y, rot, floor }),
      remove: (lotId, furnId) => room.send("removeItem", { lotId, furnId }),
      openStorage: (lotId, label, furnId) => {
        craftPanel.close();
        shopPanel.close();
        storagePanel.open(lotId, label, furnId);
        void refreshFixtures(lotId);
      },
      openCraft: (lotId, station) => {
        storagePanel.close();
        shopPanel.close();
        craftPanel.open(lotId, station);
        void refreshFixtures(lotId);
      },
      walk: (x, z) => room.send("move", { x, y: z }),
      elevate: (y) => players.elevate(room.sessionId, y),
      openDock: (lotId) => {
        storagePanel.close();
        craftPanel.close();
        shopPanel.close();
        dockPanel.open(lotId);
      },
      openRack: (lotId, furnId) => {
        storagePanel.close();
        craftPanel.close();
        shopPanel.close();
        const st = lots.state.get(lotId);
        const manage =
          (st?.ownerType === "player" && actingIds.has(st.ownerId ?? "")) ||
          (!!st?.tenantId && actingIds.has(st.tenantId));
        rackPanel.open(lotId, furnId, manage);
      },
      openShop: (lotId, furnId) => {
        storagePanel.close();
        craftPanel.close();
        rackPanel.close();
        const st = lots.state.get(lotId);
        const mine =
          (st?.ownerType === "player" && actingIds.has(st.ownerId ?? "")) ||
          (!!st?.tenantId && actingIds.has(st.tenantId));
        shopPanel.open(lotId, mine, furnId);
      },
      closeFixtures: () => {
        storagePanel.close();
        craftPanel.close();
        shopPanel.close();
        rackPanel.close();
        dockPanel.close();
      },
      stock: async (lotId) => {
        // what the player can furnish with: building storage + their pocket
        const [lotInv, mine] = await Promise.all([
          fetch(`${SERVER_URL}/lotinv/${lotId}`).then((r) => r.json()),
          fetch(`${SERVER_URL}/inventory`, {
            headers: { authorization: `Bearer ${getToken()}` },
          }).then((r) => r.json()),
        ]);
        const out: Record<string, number> = { ...(lotInv.items ?? {}) };
        for (const [k, v] of Object.entries(mine as Record<string, number>))
          out[k] = (out[k] ?? 0) + v;
        return out;
      },
    },
    myCash,
    (lotId) => constructions.objectFor(lotId) ?? derivedBuildings.get(lotId) ?? null
  );
  const characterPanel = new CharacterPanel(ui, {
    save: (code) => room.send("setAppearance", { code }),
  });
  hud.onName(() =>
    characterPanel.isOpen
      ? characterPanel.close()
      : characterPanel.open(state.players.get(room.sessionId)?.appearance ?? "")
  );
  const pocketPanel = new PocketPanel(ui);
  const authHeaders = { authorization: `Bearer ${getToken()}` };
  let pocket: Record<string, number> = await fetch(`${SERVER_URL}/inventory`, { headers: authHeaders }).then((r) => r.json()).catch(() => ({}));
  pocketPanel.update(pocket);

  const buildMode = new BuildMode(
    engine,
    ui,
    {
      build: (lotId, rects, floors) => room.send("build", { lotId, rects, floors }),
      setupSource: (lotId, type, rects) => room.send("setupSource", { lotId, type, rects }),
      buildDock: (lotId, x, y) => room.send("buildDock", { lotId, x, y }),
      demolishArea: (lotId, rect) => room.send("demolishArea", { lotId, rect }),
    },
    myCash
  );
  const lotPanel = new LotPanel(
    ui,
    () => actingIds,
    {
      buy: (lotId) => room.send("buyLot", { lotId }),
      list: (lotId, price) => room.send("listLot", { lotId, price }),
      unlist: (lotId) => room.send("unlistLot", { lotId }),
      enter: (lot) => {
        const def = buildingDefFor(lot.id);
        if (def) interior.enter(lot, def);
      },
      listRent: (lotId, rent) => room.send("listRent", { lotId, rent }),
      unlistRent: (lotId) => room.send("unlistRent", { lotId }),
      rentLot: (lotId) => room.send("rentLot", { lotId }),
      endTenancy: (lotId) => room.send("endTenancy", { lotId }),
      demolish: (lotId) => room.send("demolish", { lotId }),
      design: (lot) => {
        const st = lots.state.get(lot.id);
        const bay = constructions.dockFor(lot.id);
        const existing = {
          building: st?.building?.shape?.length ? { shape: st.building.shape } : undefined,
          source: st?.source?.shape?.length ? { type: st.source.type, shape: st.source.shape } : undefined,
          dock: bay ? { x: bay.x, y: bay.y } : undefined,
        };
        buildMode.enter(
          lot,
          existing.building || existing.source || existing.dock ? existing : null
        );
      },
      collect: (lotId) => room.send("collectSource", { lotId }),
      openWorkers: () => void workersPanel.refresh(),
      unassignWorker: (npc) => room.send("unassignWorker", { npc }),
      rename: (lotId, name) => room.send("renameLot", { lotId, name }),
      toggleSign: (lotId, on) => room.send("toggleSign", { lotId, on }),
    },
    isVacant,
    myCash,
    buildingDefFor
  );
  const companyPanel = new CompanyPanel(
    ui,
    selfId,
    {
      form: (name) => room.send("formCompany", { name }),
      moveCash: (company, amount) => room.send("companyCash", { company, amount }),
      transferLot: (company, lotId, toCompany) => room.send("companyLot", { company, lotId, toCompany }),
      buyPermit: (entity, category) => room.send("buyPermit", { entity, category }),
      ipo: (company, shares, floatPct, price) => room.send("ipo", { company, shares, floatPct, price }),
      setDividend: (company, ratio) => room.send("setDividend", { company, ratio }),
    },
    () =>
      [...lots.state.entries()]
        .filter(([, st]) => st.ownerType === "player" && actingIds.has(st.ownerId ?? ""))
        .map(([id, st]) => ({ id, ownerId: st.ownerId, name: lotLabel(id, st) }))
  );

  const workersPanel = new WorkersPanel(
    ui,
    selfId,
    {
      hire: (employer, wage, slots) => room.send("hireWorker", { employer, wage, slots }),
      cancelOffer: (offerId) => room.send("cancelOffer", { offerId }),
      assign: (npc, lotId, role) => room.send("assignWorker", { npc, lotId, role }),
      unassign: (npc) => room.send("unassignWorker", { npc }),
      fire: (npc) => room.send("fireWorker", { npc }),
      balance: () => myCash(),
    },
    () =>
      [...lots.state.entries()]
        .filter(([, st]) => st.ownerType === "player" && (actingIds.has(st.ownerId ?? "") || (!!st.tenantId && actingIds.has(st.tenantId))))
        .map(([id, st]) => {
          const base = lotLabel(id, st);
          // mark company-held lots so it's obvious where a worker is going
          const holder = st.ownerId !== selfId ? ` (${st.ownerName ?? "company"})` : "";
          return { id, name: `${base}${holder}` };
        })
  );

  room.onMessage("workforceChanged", () => {
    if (workersPanel.visible) void workersPanel.refresh();
  });
  const stocksPanel = new StocksPanel(ui, selfId, {
    trade: (company, side, qty) => room.send("tradeStock", { company, side, qty, market: true }),
    cancel: (orderId) => room.send("cancelStockOrder", { orderId }),
  });
  const cryptoPanel = new CryptoPanel(ui, selfId, {
    trade: (side, qty, coin) => room.send("tradeCoin", { side, qty, market: true, coin }),
    cancel: (orderId) => room.send("cancelCoinOrder", { orderId }),
  });
  // only one overlay at a time — panels never stack on each other.
  // Resolved lazily so panel construction order doesn't matter.
  type Overlay = { visible: boolean; toggle(): void; close(): void };
  const overlays = (): Record<string, Overlay> => ({
    workers: workersPanel,
    company: companyPanel,
    stocks: stocksPanel,
    crypto: cryptoPanel,
    economy: economyPanel,
  });
  const showOverlay = (which: string) => {
    const all = overlays();
    for (const [key, p] of Object.entries(all)) if (key !== which) p.close();
    all[which].toggle();
    syncHud();
  };
  // the highlight always reflects what's actually on screen — including when
  // a panel is dismissed by its own ✕ rather than the toolbar button
  const syncHud = () => {
    const all = overlays();
    const open = Object.entries(all).find(([, p]) => p.visible);
    hud.setActive(open ? open[0] : null);
  };
  new MutationObserver(syncHud).observe(ui, {
    attributes: true,
    attributeFilter: ["style"],
    subtree: true,
  });
  hud.onStocks(() => showOverlay("stocks"));
  hud.onCrypto(() => showOverlay("crypto"));
  hud.onWorkers(() => showOverlay("workers"));
  hud.onCompany(() => showOverlay("company"));
  hud.onEconomy(() => showOverlay("economy"));
  const economyPanel = new EconomyPanel(ui);

  room.onMessage("stk", () => {
    if (stocksPanel.visible) void stocksPanel.refresh();
  });
  room.onMessage("rackChanged", () => void rackPanel.refresh());
  room.onMessage("storeInv", (m: { furnId: number }) => {
    if (storagePanel.furnId === m.furnId && storagePanel.lotId !== null)
      void refreshFixtures(storagePanel.lotId);
  });
  room.onMessage("coin", () => {
    if (cryptoPanel.visible) void cryptoPanel.refresh();
  });
  room.onMessage("companiesChanged", async () => {
    await refreshCompanies();
    if (companyPanel.visible) void companyPanel.refresh();
  });
  room.onMessage("permitsChanged", (m: { category: string; fee: number }) => {
    toast(ui, `${m.category} permit issued — ${m.fee ? `$${m.fee}` : ""}`);
    if (companyPanel.visible) void companyPanel.refresh();
  });
  room.onMessage("lot", (row: LotState) => {
    lots.apply(row);
    applyCleared(row);
    constructions.sync();
    lotPanel.refresh(row);
    buildMode.onLotUpdate(row.id, !!row.building || !!row.source);
  });
  room.onMessage("note", (n: { msg: string }) => toast(ui, n.msg));
  room.onMessage("pocket", (inv: Record<string, number>) => {
    pocket = inv;
    pocketPanel.update(inv);
    if (storagePanel.lotId !== null) void refreshFixtures(storagePanel.lotId);
  });
  room.onMessage("mkt", () => void exchange.refresh());
  room.onMessage("pocketChanged", async () => {
    pocket = await fetch(`${SERVER_URL}/inventory`, { headers: authHeaders }).then((r) => r.json());
    pocketPanel.update(pocket);
    if (storagePanel.lotId !== null) void refreshFixtures(storagePanel.lotId);
    void interior.refreshStock();
  });
  room.onMessage("lotInv", (m: { lotId: number }) => void refreshFixtures(m.lotId));
  room.onMessage("lotInvChanged", (m: { lotId: number }) => {
    void refreshFixtures(m.lotId);
    void interior.refreshStock();
    if (shopPanel.lotId === m.lotId) void shopPanel.refresh();
  });
  room.onMessage("jobsChanged", (m: { lotId: number }) => {
    const st = lots.state.get(m.lotId);
    const lot = lots.defs.get(m.lotId);
    if (lot && st) lotPanel.refresh(st);
  });
  room.onMessage("shopChanged", (m: { lotId: number }) => {
    void interior.refreshShelves();
    if (shopPanel.lotId === m.lotId) void shopPanel.refresh();
  });
  room.onMessage("furn", (m: { lotId: number; placed: any }) =>
    interior.applyPlaced(m.lotId, m.placed)
  );
  room.onMessage("furnRemove", (m: { lotId: number; furnId: number }) =>
    interior.applyRemoved(m.lotId, m.furnId)
  );
  room.onMessage("err", (e: { msg: string }) => toast(ui, e.msg));

  const camOverride = new URLSearchParams(location.search).has("cam");
  const addPlayer = (p: any, id: string) => {
    if (players.position(id)) return; // already rendered (pre-sync replay)
    players.add(id, p.name, p.appearance, p.x, p.y);
    if (id === room.sessionId && !camOverride) engine.target.set(p.x, 0, p.y);
    let worn = p.appearance;
    p.onChange(() => {
      players.setDest(id, p.x, p.y);
      if (p.appearance !== worn) {
        worn = p.appearance;
        players.redress(id, worn);
      }
      if (id === room.sessionId) hud.setCash(p.cash);
    });
  };
  state.players.onAdd(addPlayer);
  state.players.onRemove((_p: any, id: string) => players.remove(id));
  // players synced before the callback registered still need rendering
  state.players.forEach(addPlayer);
  const addNpc = (n: any, id: string) => {
    if (npcs.position(id)) return; // already rendered
    npcs.add(id, n.name, n.appearance, n.x, n.y);
    n.onChange(() => npcs.setDest(id, n.x, n.y));
  };
  state.npcs.onAdd(addNpc);
  state.npcs.onRemove((_n: any, id: string) => npcs.remove(id));
  // entries synced before the callback registered still need rendering
  state.npcs.forEach(addNpc);
  if (import.meta.env.DEV) (window as any).__npcdbg = { npcs, players, state, engine, sessionId: room.sessionId }; // dev probe only

  // dev: ?cam=x,z aims the camera, ?zoom=n sets distance
  const params = new URLSearchParams(location.search);
  const cam = params.get("cam");
  if (cam) {
    const [cx, cz] = cam.split(",").map(Number);
    if (isFinite(cx) && isFinite(cz)) engine.target.set(cx, 0, cz);
  }
  const zoom = Number(params.get("zoom"));
  if (isFinite(zoom) && zoom > 0) engine.dist = engine.targetDist = zoom;
  const yawDeg = Number(params.get("yaw"));
  if (isFinite(yawDeg) && params.has("yaw")) engine.yaw = engine.targetYaw = (yawDeg * Math.PI) / 180;

  // dev: ?lot=id opens a lot's panel
  const lotParam = Number(params.get("lot"));
  if (Number.isInteger(lotParam) && lotParam > 0) {
    const lot = lots.defs.get(lotParam);
    const st = lots.state.get(lotParam);
    if (lot && st) setTimeout(() => lotPanel.open(lot, st), 800);
  }

  // dev: ?design=lotId opens the building designer
  const designParam = Number(params.get("design"));
  if (Number.isInteger(designParam) && designParam > 0) {
    const lot = lots.defs.get(designParam);
    if (lot) setTimeout(() => buildMode.enter(lot), 800);
  }

  // dev: ?interior=lotId jumps straight into interior edit mode
  const interiorParam = Number(params.get("interior"));
  if (Number.isInteger(interiorParam) && interiorParam > 0) {
    const lot = lots.defs.get(interiorParam);
    const def = buildingDefFor(interiorParam);
    if (lot && def) setTimeout(() => interior.enter(lot, def), 800);
  }

  // dev: freeze time of day with ?tod=0..1
  const todOverride = new URLSearchParams(location.search).get("tod");
  if (todOverride !== null) {
    engine.dayTime = parseFloat(todOverride);
    hud.setDayTime(engine.dayTime);
  } else {
    state.listen("dayTime", (v: number) => {
      engine.dayTime = v;
      hud.setDayTime(v);
    });
  }

  const controls = new Controls(engine, (x, z) => {
    if (interior.active || buildMode.active) return; // edit modes own clicks
    room.send("move", { x, y: z });
    // a delivery pad is a fixture you click, like a rack or a shelf — it opens
    // the bay rather than selecting the plot it stands on
    const dockLot = constructions.dockAtWorld(x, z);
    if (dockLot !== null) {
      lotPanel.close();
      dockPanel.open(dockLot);
      return;
    }
    dockPanel.close();
    // clicking a lot opens its panel; clicking elsewhere closes it
    const lot = lots.lotAtWorld(x, z);
    if (lot) {
      const st = lots.state.get(lot.id);
      if (st) lotPanel.open(lot, st);
    } else {
      lotPanel.close();
    }
  });

  // F — snap the camera back to your character; I — pocket
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (e.key.toLowerCase() === "i") pocketPanel.toggle();
    if (e.key.toLowerCase() === "m") exchange.toggle();
    if (e.key.toLowerCase() === "f") {
      const pos = players.position(room.sessionId);
      if (pos) engine.target.set(pos.x, 0, pos.y);
    }
  });

  let tickAcc = 0;
  engine.onFrame((dt) => {
    districtOverlay.update(engine.camera);
    npcs.update(dt, engine.camera, engine.target, 110);
    controls.update(dt);
    players.update(dt, engine.camera);
    hud.setOnline(state.players.size ?? 0);
    lots.update();
    tickAcc += dt;
    if (tickAcc > 2) {
      tickAcc = 0;
      constructions.tick(); // finishes scaffolding when build timers elapse
    }
  });

  done();
  engine.start();

  room.onLeave(() => {
    loadingOverlay(ui, "Disconnected — refresh to reconnect.");
  });
}

boot().catch((err) => {
  console.error(err);
  const ui = document.getElementById("ui")!;
  loadingOverlay(ui, `Failed to start: ${err.message ?? err}. Is the server running on :2567?`);
});
