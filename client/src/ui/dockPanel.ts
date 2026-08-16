import {
  DOCK_BUILD_COST,
  DOCK_CAPACITY,
  HAULER_CAPACITY,
  MANAGER_CAPACITY,
  ITEMS,
  itemById,
  lotName,
} from "@mc/shared";
import { SERVER_URL, fmtMoney } from "../config.js";
import { ic } from "./icons.js";
import { tabStrip, wireTabs } from "./panelTabs.js";

interface DockLine {
  id: number;
  direction: "in" | "out";
  item: string;
  perMin: number;
  partnerLot: number;
}

interface Mirrored {
  id: number;
  direction: "in" | "out";
  item: string;
  perMin: number;
  partnerLot: number;
}

interface DockView {
  lotId: number;
  onHand: Record<string, number>;
  produces: string | null;
  held: number;
  storeCapacity: number;
  stock: Record<string, number>;
  capacity: number;
  lines: DockLine[];
  mirrored: Mirrored[];
  haulers: number;
  managers: number;
}

interface DockActions {
  addLine(lotId: number, direction: string, item: string, perMin: number, partnerLot: number): void;
  removeLine(lineId: number): void;
  bayTransfer(lotId: number, item: string, qty: number, toStore: boolean): void;
  pocket(): Record<string, number>;
}

// The delivery space of one property: what's sitting on the bay right now,
// what it ships in and out, and whether it has the crew to actually move any
// of it.
export class DockPanel {
  private el: HTMLElement;
  lotId: number | null = null;
  private tab: "bay" | "shipping" = "bay";
  // the shipment being composed on the Shipping page
  private draft: { direction: "in" | "out"; item: string | null; partner: number | null; perMin: number } = {
    direction: "out",
    item: null,
    partner: null,
    perMin: 10,
  };

  constructor(
    ui: HTMLElement,
    private actions: DockActions,
    private myLots: () => Array<{ id: number; name: string }>
  ) {
    this.el = document.createElement("div");
    this.el.className = "panel fixture-panel dock-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  get visible() {
    return this.el.style.display !== "none";
  }

  open(lotId: number) {
    this.lotId = lotId;
    this.el.style.display = "block";
    void this.refresh();
  }

  close() {
    this.el.style.display = "none";
    this.lotId = null;
  }

  async refresh() {
    if (this.lotId === null) return;
    const lotId = this.lotId;
    const view: DockView | null = await fetch(`${SERVER_URL}/dock/${lotId}`)
      .then((r) => r.json())
      .catch(() => null);
    if (this.lotId !== lotId) return;
    this.render(lotId, view);
  }

  private render(lotId: number, view: DockView | null) {
    const head = `<div class="fx-head"><span>${ic("box", 16)} Delivery space</span>
        <button class="lp-close dk-close">✕</button></div>`;

    if (!view) {
      this.el.innerHTML = `${head}<div class="fx-body">
          <div class="pk-empty">No delivery space on this plot.</div>
          <div class="lp-hint">Add one from <b>Build</b> (${fmtMoney(DOCK_BUILD_COST)}). It's where goods enter and leave the property, and it holds ${DOCK_CAPACITY} units of storage in its own right — which is how a field or mine stockpiles what it produces. Haulers carry between the bays of two properties; managers walk goods between the pallets and the racks.</div>
        </div>`;
      this.el.querySelector(".dk-close")?.addEventListener("click", () => this.close());
      return;
    }

    // the bay's own contents only — what's in the racks is the racks' business,
    // and moving goods between the two is exactly what a manager is for
    const held = Object.values(view.stock).reduce((a, b) => a + b, 0);
    const cap = view.capacity;
    const crew = `<div class="pg-summary">
        <div class="pg-stat"><span>On the pallets</span><b class="${held >= cap ? "mkt-down" : ""}">${held}/${cap}</b></div>
        <div class="pg-stat"><span>Fleet</span><b class="${view.haulers ? "" : "mkt-down"}">${view.haulers}</b></div>
        <div class="pg-stat"><span>Bay crew</span><b class="${view.managers ? "" : "mkt-down"}">${view.managers}</b></div>
      </div>`;

    let warn = "";
    if (view.lines.length && !view.haulers)
      warn = `<div class="pg-warn">Nothing ships without a hauler — hire one in the Workforce panel and give them the hauler job. Haulers drive for every property you own.</div>`;
    else if (view.lines.length && !view.managers)
      warn = `<div class="pg-warn">Nobody works this bay. Assign a manager here — or on a farm or quarry, the workers already on the site load the pallets themselves.</div>`;

    let body = "";
    if (this.tab === "bay") {
      const rows = Object.entries(view.stock).filter(([, q]) => q > 0);
      body = rows.length
        ? rows
            .map(
              ([id, q]) =>
                `<div class="gd-row">${ic(id)}<span>${itemById(id)?.label ?? id}${
                  id === view.produces ? ` <span class="mkt-dim">· produced here</span>` : ""
                }</span><b>${q}</b>
                 <button class="gd-btn gd-btn-ic dk-take" data-item="${id}" title="Take 10 to your bag">${ic("arrow_out", 14)}${ic("bag", 14)}</button></div>`
            )
            .join("")
        : `<div class="pk-empty">Nothing on the pallets</div>`;
      const pk = Object.entries(this.actions.pocket()).filter(([, q]) => q > 0);
      body += `<div class="gd-cap gd-cap2">Your pocket</div>`;
      body += pk.length
        ? pk
            .map(
              ([id, q]) =>
                `<div class="gd-row">${ic(id)}<span>${itemById(id)?.label ?? id}</span><b>${q}</b>
                 <button class="gd-btn gd-btn-ic dk-put" data-item="${id}" title="Put 10 on the pallets">${ic("arrow_in", 14)}${ic("box", 14)}</button></div>`
            )
            .join("")
        : `<div class="pk-empty">Empty</div>`;
      if (held >= cap)
        body += `<div class="pg-warn">The pallets are full — nothing more can be staged or delivered here until a manager clears them into the racks.</div>`;
      body += `<div class="lp-hint">A delivery space holds ${DOCK_CAPACITY} units of the property's storage — a field or mine with no other storage stockpiles its output here, and work stops when it's full. Each hauler carries ${HAULER_CAPACITY} units a minute, shared across every route you run — they drive for all your properties, not just this one. Each person on the bay crew moves ${MANAGER_CAPACITY} units a minute between the pallets and the racks; on a farm or quarry that crew is the site's own workers.</div>`;
    } else {
      const lotLabel = (id: number) => this.myLots().find((l) => l.id === id)?.name ?? lotName(id);
      const mirrored = view.mirrored ?? [];
      const out = view.lines.filter((l) => l.direction === "out");
      const inb = view.lines.filter((l) => l.direction === "in");
      // arrangements made on the other property's bay — shown, not editable
      // from this end, so it's clear where to go to change them
      const mIn = mirrored.filter((l) => l.direction === "in");
      const mOut = mirrored.filter((l) => l.direction === "out");
      // an outbound shipment of something this property never has will sit
      // there forever, so say so instead of silently doing nothing
      const stuck = (l: DockLine) =>
        l.direction === "out" &&
        l.item !== view.produces &&
        !(view.onHand?.[l.item] > 0) &&
        !(view.stock[l.item] > 0);
      const lineRow = (l: DockLine) =>
        `<div class="gd-row${stuck(l) ? " dk-stuck" : ""}">${ic(l.item)}<span>${itemById(l.item)?.label ?? l.item}</span>
           <span class="mkt-dim">${l.perMin}/min ${l.direction === "out" ? "→" : "←"} ${lotLabel(l.partnerLot)}</span>
           ${stuck(l) ? `<span class="dk-stuck-tag" title="This property has no ${itemById(l.item)?.label ?? l.item}">never ships</span>` : ""}
           <button class="gd-btn dk-del" data-id="${l.id}">✕</button></div>`;
      const mirrorRow = (l: Mirrored) =>
        `<div class="gd-row dk-mirror">${ic(l.item)}<span>${itemById(l.item)?.label ?? l.item}</span>
           <span class="mkt-dim">${l.perMin}/min ${l.direction === "out" ? "→" : "←"} ${lotLabel(l.partnerLot)}</span>
           <span class="dk-elsewhere" title="Set up on ${lotLabel(l.partnerLot)}">auto</span></div>`;

      const d = this.draft;
      const itemLabel = d.item ? itemById(d.item)?.label ?? d.item : "";
      const partnerLabel = d.partner !== null ? lotLabel(d.partner) : "";
      const leaving = [...out.map(lineRow), ...mOut.map(mirrorRow)];
      const arriving = [...inb.map(lineRow), ...mIn.map(mirrorRow)];
      body = `<div class="gd-cap">Ships out</div>
        ${leaving.length ? leaving.join("") : `<div class="pk-empty">Nothing leaves here</div>`}
        <div class="gd-cap gd-cap2">Ships in</div>
        ${arriving.length ? arriving.join("") : `<div class="pk-empty">Nothing arrives here</div>`}
        ${mirrored.length ? `<div class="lp-hint">Rows marked <b>auto</b> are the other half of a shipment set up on the other property — you only ever set one end.</div>` : ""}

        <div class="gd-cap gd-cap2">New shipment</div>
        <div class="dk-form">
          <div class="dk-dirs">
            <button class="dk-dir ${d.direction === "out" ? "active" : ""}" data-dir="out">Ships out</button>
            <button class="dk-dir ${d.direction === "in" ? "active" : ""}" data-dir="in">Ships in</button>
          </div>

          <label class="dk-field">
            <span>Goods</span>
            <input class="lp-input dk-item-search" type="text" placeholder="Search goods…" value="${itemLabel}" />
            <div class="dk-results dk-item-results"></div>
          </label>

          <label class="dk-field">
            <span>${d.direction === "out" ? "Destination" : "Source"}</span>
            <input class="lp-input dk-lot-search" type="text" placeholder="Search your properties…" value="${partnerLabel}" />
            <div class="dk-results dk-lot-results"></div>
          </label>

          <label class="dk-field dk-qty-field">
            <span>Per minute</span>
            <input class="lp-input dk-qty" type="number" min="1" value="${d.perMin}" />
          </label>

          <button class="btn-primary dk-add" ${d.item && d.partner !== null ? "" : "disabled"}>Start shipping</button>
        </div>`;
    }

    this.el.innerHTML = `${head}<div class="fx-body">
        ${tabStrip([{ key: "bay", label: "Bay" }, { key: "shipping", label: `Shipping (${view.lines.length + (view.mirrored?.length ?? 0)})` }], this.tab)}
        ${crew}${warn}${body}
      </div>`;

    this.el.querySelector(".dk-close")?.addEventListener("click", () => this.close());
    wireTabs(this.el, (k) => {
      this.tab = k as "bay" | "shipping";
      this.render(lotId, view);
    });
    this.el.querySelectorAll<HTMLElement>(".dk-take").forEach((b) =>
      b.addEventListener("click", () =>
        this.actions.bayTransfer(lotId, b.dataset.item!, 10, false)
      )
    );
    this.el.querySelectorAll<HTMLElement>(".dk-put").forEach((b) =>
      b.addEventListener("click", () => this.actions.bayTransfer(lotId, b.dataset.item!, 10, true))
    );
    this.el.querySelectorAll<HTMLElement>(".dk-del").forEach((b) =>
      b.addEventListener("click", () => this.actions.removeLine(Number(b.dataset.id)))
    );
    // direction toggle
    this.el.querySelectorAll<HTMLElement>(".dk-dir").forEach((b) =>
      b.addEventListener("click", () => {
        this.draft.direction = b.dataset.dir as "in" | "out";
        this.render(lotId, view);
      })
    );

    // search-as-you-type pickers: the list filters under the field and a
    // click fills it in, so long names are never clipped by a dropdown
    const pick = <T>(
      inputSel: string,
      resultsSel: string,
      all: T[],
      label: (x: T) => string,
      icon: (x: T) => string,
      choose: (x: T) => void
    ) => {
      const input = this.el.querySelector<HTMLInputElement>(inputSel);
      const results = this.el.querySelector<HTMLElement>(resultsSel);
      if (!input || !results) return;
      const draw = (q: string) => {
        const hits = all
          .filter((x) => label(x).toLowerCase().includes(q.trim().toLowerCase()))
          .slice(0, 8);
        results.innerHTML = hits.length
          ? hits.map((x, i) => `<button class="dk-hit" data-i="${i}">${icon(x)}<span>${label(x)}</span></button>`).join("")
          : `<div class="pk-empty">No match</div>`;
        results.classList.add("open");
        results.querySelectorAll<HTMLElement>(".dk-hit").forEach((b) =>
          b.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            choose(hits[Number(b.dataset.i)]);
            this.render(lotId, view);
          })
        );
      };
      input.addEventListener("focus", () => draw(""));
      input.addEventListener("input", () => draw(input.value));
      input.addEventListener("blur", () => setTimeout(() => results.classList.remove("open"), 120));
    };

    // rank goods this property can actually ship first — its own produce, then
    // whatever is in its storage, then everything else
    const have = (id: string) => (view.onHand?.[id] ?? 0) + (view.stock[id] ?? 0);
    const rank = (id: string) => (id === view.produces ? 0 : have(id) > 0 ? 1 : 2);
    pick(
      ".dk-item-search",
      ".dk-item-results",
      [...ITEMS].sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label)),
      (i) =>
        i.id === view.produces
          ? `${i.label} — produced here`
          : have(i.id) > 0
            ? `${i.label} — ${have(i.id)} here`
            : i.label,
      (i) => ic(i.id, 16),
      (i) => (this.draft.item = i.id)
    );
    pick(
      ".dk-lot-search",
      ".dk-lot-results",
      this.myLots().filter((l) => l.id !== lotId),
      (l) => l.name,
      () => ic("box", 16),
      (l) => (this.draft.partner = l.id)
    );

    const qtyEl = this.el.querySelector<HTMLInputElement>(".dk-qty");
    qtyEl?.addEventListener("input", () => {
      const v = Math.floor(Number(qtyEl.value));
      if (v > 0) this.draft.perMin = v;
    });

    this.el.querySelector(".dk-add")?.addEventListener("click", () => {
      const { direction, item, partner, perMin } = this.draft;
      if (!item || partner === null || perMin <= 0) return;
      this.actions.addLine(lotId, direction, item, perMin, partner);
      this.draft.item = null;
      this.draft.partner = null;
    });
  }
}
