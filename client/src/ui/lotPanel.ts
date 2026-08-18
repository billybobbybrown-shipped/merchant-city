import {
  BuildingDef,
  buildingFloors,
  LotDef,
  LotState,
  itemById,
  lotName,
  sourceByType,
  sourceYield,
} from "@mc/shared";
import { ic } from "./icons.js";
import { fmtMoney, SERVER_URL } from "../config.js";

export interface LotPanelActions {
  buy(lotId: number): void;
  list(lotId: number, price: number): void;
  unlist(lotId: number): void;
  enter(lot: LotDef): void;
  listRent(lotId: number, rent: number): void;
  unlistRent(lotId: number): void;
  rentLot(lotId: number): void;
  endTenancy(lotId: number): void;
  demolish(lotId: number): void;
  design(lot: LotDef): void;
  collect(lotId: number): void;
  openWorkers(): void;
  unassignWorker(npc: number): void;
  rename(lotId: number, name: string): void;
  toggleSign(lotId: number, on: boolean): void;
}

const kindIcon = (kind: string | undefined) =>
  ic(
    ["house", "shop", "office", "apartment", "tower", "skyscraper", "warehouse", "factory", "gas_station", "custom"].includes(kind ?? "")
      ? `kind_${kind}`
      : "kind_custom",
    20
  );

export class LotPanel {
  private el: HTMLElement;
  private current: { lot: LotDef; state: LotState } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    ui: HTMLElement,
    private acting: () => Set<string>, // self + controlled companies
    private actions: LotPanelActions,
    private isVacant: (lotId: number) => boolean,
    private myCash: () => number,
    private buildingDefFor: (lotId: number) => BuildingDef | null = () => null
  ) {
    this.el = document.createElement("div");
    this.el.className = "panel lot-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  close() {
    this.el.style.display = "none";
    this.current = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // re-render on lot updates so open panels stay fresh
  refresh(state: LotState) {
    if (this.current && this.current.state.id === state.id)
      this.open(this.current.lot, state);
  }

  open(lot: LotDef, state: LotState) {
    this.current = { lot, state };
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    const mine = state.ownerType === "player" && this.acting().has(state.ownerId ?? "");
    const tenantMe = !!state.tenantId && this.acting().has(state.tenantId);
    const src = state.source;
    const srcDef = src ? sourceByType(src.type) : undefined;
    const vacant = this.isVacant(lot.id) && !src;
    const cash = this.myCash();
    const b = state.building;
    const underConstruction = !!b && Date.now() < b.doneAt;
    const owner = state.ownerType === "city" ? "City" : mine ? "You" : state.ownerName ?? "Player";

    // ---------- header ----------
    const chips = [
      state.forSale ? `<span class="lp-chip lp-chip-sale">FOR SALE</span>` : "",
      state.forRent && !state.tenantId ? `<span class="lp-chip lp-chip-rentc">FOR RENT</span>` : "",
      underConstruction ? `<span class="lp-chip lp-chip-build">BUILDING</span>` : "",
      vacant ? `<span class="lp-chip lp-chip-vacant">VACANT</span>` : "",
    ].join("");

    // ---------- info grid ----------
    const storeys = b
      ? buildingFloors(b as unknown as BuildingDef)
      : vacant
        ? 0
        : buildingFloors((this.buildingDefFor(lot.id) ?? { floors: 1 }) as BuildingDef);
    let info = `
      <div class="lp-kv"><span>Size</span><b>${lot.w * 2}×${lot.h * 2} m</b></div>
      ${storeys ? `<div class="lp-kv"><span>Floors</span><b>${storeys}</b></div>` : ""}
      <div class="lp-kv"><span>Assessed</span><b>${fmtMoney(lot.value)}</b></div>
      <div class="lp-kv"><span>Owner</span><b>${owner}</b></div>`;
    if (state.tenantId)
      info += `<div class="lp-kv"><span>Tenant</span><b>${tenantMe ? "You" : state.tenantName ?? "Player"}${
        state.rent ? ` · ${fmtMoney(state.rent)}/day` : ""
      }</b></div>`;
    else if (state.forRent)
      info += `<div class="lp-kv"><span>Rent</span><b>${fmtMoney(state.rent)}/day</b></div>`;

    // ---------- building card ----------
    const signName = state.name?.trim();
    const signToggle = !mine
      ? ""
      : `<label class="lp-toggle"><input type="checkbox" class="lp-sign" ${state.sign ? "checked" : ""} />
           <span>Show sign${signName ? `: “${signName}”` : ""}</span></label>
         ${signName ? "" : `<div class="lp-hint">Name this property (✎ by the title) and the sign will read that name.</div>`}`;

    let buildingCard = "";
    const bdefKind = b?.kind;
    if (b && underConstruction) {
      const total = Math.max(60_000, b.doneAt - (b as any).startedAt || 5 * 60_000);
      const pct = Math.min(99, Math.round((1 - (b.doneAt - Date.now()) / total) * 100));
      buildingCard = `
        <div class="lp-bcard">
          <div class="lp-bname">${ic("construction", 20)} ${b.name}</div>
          <div class="lp-bar"><div class="lp-bar-fill lp-bar-build" style="width:${pct}%"></div></div>
          <div class="lp-bar-label lp-countdown" data-done="${b.doneAt}" data-total="${total}">building…</div>
        </div>`;
    } else if (b) {
      buildingCard = `
        <div class="lp-bcard">
          <div class="lp-bname">${kindIcon(b.kind)} ${signName || b.name}</div>
          ${signToggle}
        </div>`;
    } else if (src && srcDef) {
      // the working numbers — daily yield, stock waiting, reserves left —
      // are the operator's business; a passer-by sees what the site IS
      buildingCard = `<div class="lp-bcard">
            <div class="lp-bname">${ic(srcDef.item, 20)} ${srcDef.label}</div>
            ${
              mine || tenantMe
                ? `<div class="lp-bar-label">Produces ${sourceYield(srcDef, src.area)} ${itemById(srcDef.item)?.label ?? srcDef.item} per day · <span class="lp-stock">checking stock…</span></div>
            ${
              src.reserve
                ? (() => {
                    const left = Math.max(0, src.reserve - (src.extracted ?? 0));
                    const pct = Math.round((left / src.reserve) * 100);
                    return `<div class="lp-bar"><div class="lp-bar-fill" style="width:${pct}%"></div></div>
                      <div class="lp-bar-label">${
                        left > 0
                          ? `${left.toLocaleString()} of ${src.reserve.toLocaleString()} left in the ground`
                          : `<b class="mkt-down">Worked out — nothing left to dig</b>`
                      }</div>`;
                  })()
                : ""
            }`
                : ""
            }
          </div>`;
    } else if (!vacant) {
      // pre-existing city-built structure: show its real derived identity
      const d = this.buildingDefFor(lot.id);
      buildingCard = `<div class="lp-bcard">
        <div class="lp-bname">${kindIcon(d?.kind)} ${signName || d?.name || "Building"}</div>
        ${signToggle}
      </div>`;
    }

    // ---------- primary actions ----------
    let primary = "";
    if (state.forSale && !mine) {
      const afford = cash >= state.price;
      primary += `<button class="btn-primary lp-buy" ${afford ? "" : "disabled"}>Buy · ${fmtMoney(state.price)}</button>`;
      if (!afford) primary += `<div class="lp-hint">You have ${fmtMoney(cash)}</div>`;
    }
    if (!mine && !tenantMe && state.forRent && !state.tenantId && !vacant)
      primary += `<button class="btn-primary lp-rent" ${cash >= state.rent ? "" : "disabled"}>Rent · ${fmtMoney(state.rent)}/day</button>`;
    // any finished building is enterable — walk into shops, look around.
    // What you can TOUCH inside stays keyed to who operates the place.
    if (!vacant && !underConstruction && !src)
      primary += `<button class="btn-primary lp-enter">Enter building</button>`;

    // ---------- owner sections ----------
    let sections = "";
    if (mine) {
      // market
      const market = state.forSale
        ? `<div class="lp-row">Listed at <b>${fmtMoney(state.price)}</b></div>
           <button class="btn-secondary lp-unlist">Cancel sale listing</button>`
        : `<div class="lp-inline">
             <input class="lp-input lp-price" type="number" min="1" value="${lot.value}" />
             <button class="btn-secondary lp-list">List for sale</button>
           </div>`;
      sections += `<div class="lp-section"><div class="lp-sec-title">Market</div>${market}</div>`;

      // production site: collect yields
      if (src && !underConstruction) {
        sections += `<div class="lp-section"><div class="lp-sec-title">Production</div>
          <button class="btn-primary lp-collect">${ic(srcDef?.item ?? "box", 15)} Collect</button>
          <div class="lp-hint lp-store">checking storage…</div>
          </div>`;
      }

      // leasing (needs a finished building)
      if (!vacant && !underConstruction && !src) {
        let leasing = "";
        if (state.tenantId)
          leasing = `<button class="btn-secondary lp-endrent">End tenancy</button>`;
        else if (state.forRent)
          leasing = `<div class="lp-row">Asking <b>${fmtMoney(state.rent)}/day</b></div>
            <button class="btn-secondary lp-unrent">Cancel rent listing</button>`;
        else
          leasing = `<div class="lp-inline">
              <input class="lp-input lp-rentprice" type="number" min="1" value="${Math.max(1, Math.round(lot.value / 20))}" />
              <button class="btn-secondary lp-listrent">List for rent</button>
            </div><div class="lp-hint">per game day</div>`;
        sections += `<div class="lp-section"><div class="lp-sec-title">Leasing</div>${leasing}</div>`;

      }

      // staffing — hire NPCs to run the place
      if ((b || src || !vacant) && !underConstruction) {
        sections += `<div class="lp-section"><div class="lp-sec-title">Workers here</div>
          <div class="lp-jobs"><div class="lp-hint">checking staff…</div></div>
          <button class="btn-secondary lp-openworkers">Manage workers</button>
          <div class="lp-hint">Hire and assign staff in the Workers panel.</div></div>`;
      }

      // build, with tearing down as its opposite right beneath it
      if (!underConstruction && !state.tenantId) {
        sections += `<div class="lp-section"><div class="lp-sec-title">Develop</div>
          <button class="btn-primary lp-design">${ic("design", 16)} Build</button>
          <button class="btn-danger lp-demolish">Demolish · ${fmtMoney(250)}</button></div>`;
      }
    }
    if (tenantMe)
      sections += `<div class="lp-section"><div class="lp-sec-title">Leasing</div>
        <button class="btn-secondary lp-endrent">End tenancy</button></div>`;

    this.el.innerHTML = `
      <div class="lp-head">
        <div class="lp-head-left">
          <span class="lp-title">${lotName(lot.id, state.name)}</span>
          ${mine ? `<button class="lp-rename" title="Rename this property">${ic("edit", 13)}</button>` : ""}
          <span class="lp-chips">${chips}</span>
        </div>
        <button class="lp-close">✕</button>
      </div>
      <div class="lp-info">${info}</div>
      ${buildingCard}
      ${primary ? `<div class="lp-primary">${primary}</div>` : ""}
      <div class="lp-sections">${sections}</div>`;
    this.el.style.display = "block";

    // live construction countdown
    const countdown = this.el.querySelector<HTMLElement>(".lp-countdown");
    if (countdown) {
      const update = () => {
        const done = Number(countdown.dataset.done);
        const total = Number(countdown.dataset.total);
        const left = done - Date.now();
        if (left <= 0) {
          if (this.timer) clearInterval(this.timer);
          if (this.current) this.open(this.current.lot, this.current.state);
          return;
        }
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        countdown.textContent = `${m}:${String(s).padStart(2, "0")} remaining`;
        const bar = this.el.querySelector<HTMLElement>(".lp-bar-build");
        if (bar) bar.style.width = `${Math.min(99, Math.round((1 - left / total) * 100))}%`;
      };
      update();
      this.timer = setInterval(update, 1000);
    }

    const on = (sel: string, fn: () => void) =>
      this.el.querySelector(sel)?.addEventListener("click", fn);
    on(".lp-close", () => this.close());
    this.el.querySelector<HTMLInputElement>(".lp-sign")?.addEventListener("change", (ev) =>
      this.actions.toggleSign(lot.id, (ev.target as HTMLInputElement).checked)
    );
    on(".lp-rename", () => {
      const title = this.el.querySelector<HTMLElement>(".lp-title");
      if (!title) return;
      const input = document.createElement("input");
      input.className = "lp-input lp-name";
      input.maxLength = 30;
      input.placeholder = `Lot ${lot.id}`;
      input.value = state.name ?? "";
      title.replaceWith(input);
      this.el.querySelector<HTMLElement>(".lp-rename")?.remove();
      input.focus();
      input.select();
      let done = false;
      const commit = (save: boolean) => {
        if (done) return;
        done = true;
        if (save && input.value.trim() !== (state.name ?? "")) this.actions.rename(lot.id, input.value);
        else if (this.current) this.open(this.current.lot, this.current.state);
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") commit(true);
        if (ev.key === "Escape") commit(false);
      });
      input.addEventListener("blur", () => commit(true));
    });
    on(".lp-buy", () => this.actions.buy(lot.id));
    on(".lp-rent", () => this.actions.rentLot(lot.id));
    on(".lp-enter", () => {
      this.close();
      this.actions.enter(lot);
    });
    on(".lp-unlist", () => this.actions.unlist(lot.id));
    on(".lp-list", () => {
      const price = Number((this.el.querySelector(".lp-price") as HTMLInputElement)?.value);
      if (price > 0) this.actions.list(lot.id, price);
    });
    on(".lp-endrent", () => this.actions.endTenancy(lot.id));
    on(".lp-unrent", () => this.actions.unlistRent(lot.id));
    on(".lp-listrent", () => {
      const rent = Number((this.el.querySelector(".lp-rentprice") as HTMLInputElement)?.value);
      if (rent > 0) this.actions.listRent(lot.id, rent);
    });
    on(".lp-demolish", () => this.actions.demolish(lot.id));
    on(".lp-collect", () => this.actions.collect(lot.id));
    on(".lp-openworkers", () => this.actions.openWorkers());
    // async staff list
    const jobsEl = this.el.querySelector<HTMLElement>(".lp-jobs");
    if (jobsEl) {
      void fetch(`${SERVER_URL}/jobs/${lot.id}`)
        .then((r) => r.json())
        .then((rows: Array<{ eid: number; name: string; role: string; wage: number }>) => {
          if (!rows.length) {
            jobsEl.innerHTML = `<div class="lp-hint">Nobody works here yet</div>`;
            return;
          }
          jobsEl.innerHTML = rows
            .map(
              (w) => `<div class="lp-jobrow"><b>${w.role}</b>
                <span>${w.name} · $${w.wage}/day</span>
                <button class="lp-close lp-jobdel" data-npc="${w.eid}" title="Unassign">✕</button></div>`
            )
            .join("");
          jobsEl.querySelectorAll<HTMLElement>(".lp-jobdel").forEach((b) =>
            b.addEventListener("click", () => this.actions.unassignWorker(Number(b.dataset.npc)))
          );
        })
        .catch(() => (jobsEl.textContent = ""));
    }
    // async stock readout for production sites
    const stockEl = this.el.querySelector<HTMLElement>(".lp-stock");
    if (stockEl && srcDef) {
      void fetch(`${SERVER_URL}/lotinv/${lot.id}`)
        .then((r) => r.json())
        .then((d) => {
          stockEl.textContent = `${d.items?.[srcDef.item] ?? 0} ready to collect`;
          const storeEl = this.el.querySelector<HTMLElement>(".lp-store");
          if (storeEl) {
            const used = Number(
              d.held ?? Object.values((d.items ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
            );
            const cap = Number(d.capacity ?? 0);
            storeEl.innerHTML = !cap
              ? `<b class="mkt-down">No storage here — nothing can be harvested.</b> Put a delivery space on this property, or storage racks inside a building on it.`
              : used >= cap
                ? `<b class="mkt-down">Storage full (${used}/${cap}) — work has stopped.</b> Collect it, ship it out, or add more storage.`
                : `Storage ${used}/${cap}. Work stops when it fills.`;
          }
        })
        .catch(() => (stockEl.textContent = ""));
    }
    on(".lp-design", () => {
      this.close();
      this.actions.design(lot);
    });
  }
}

export function toast(ui: HTMLElement, msg: string) {
  const t = document.createElement("div");
  t.className = "panel toast";
  t.textContent = msg;
  ui.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2600);
}
