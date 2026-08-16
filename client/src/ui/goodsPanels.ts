import { furnitureById, itemById, RECIPES } from "@mc/shared";
import { ic } from "./icons.js";

export interface GoodsData {
  items: Record<string, number>;
  capacity: number;
  crafts: Array<{ recipe: string; count: number; doneAt: number }>;
}

interface GoodsActions {
  transfer(lotId: number, item: string, qty: number, toLot: boolean): void;
  craft(lotId: number, recipe: string, count: number): void;
}

// Storage panel — opened by clicking a rack/shelf inside a building.
export class StoragePanel {
  private el: HTMLElement;
  lotId: number | null = null;
  furnId: number | null = null;
  private title = "Storage";

  constructor(ui: HTMLElement, private actions: GoodsActions) {
    this.el = document.createElement("div");
    this.el.className = "panel fixture-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  open(lotId: number, title: string, furnId: number | null = null) {
    this.lotId = lotId;
    this.furnId = furnId;
    this.title = title;
    this.el.style.display = "block";
    this.el.innerHTML = `<div class="fx-head"><span>${ic("box")} ${title}</span><button class="lp-close fx-close">✕</button></div><div class="fx-body">Loading…</div>`;
    this.el.querySelector(".fx-close")?.addEventListener("click", () => this.close());
  }

  close() {
    this.el.style.display = "none";
    this.lotId = null;
    this.furnId = null;
  }

  render(data: GoodsData, pocket: Record<string, number>) {
    if (this.lotId === null) return;
    const lotId = this.lotId;
    const lotEntries = Object.entries(data.items).filter(([, q]) => q > 0);
    const total = lotEntries.reduce((a, [, q]) => a + q, 0);
    const row = (id: string, q: number, dir: "out" | "in") => {
      const def = itemById(id);
      const arrow = dir === "out" ? ic("arrow_out", 14) + ic("bag", 14) : ic("arrow_in", 14) + ic("box", 14);
      return `<div class="gd-row">${ic(id)}<span>${def?.label ?? id}</span><b>${q}</b>
        <button class="gd-btn gd-btn-ic" data-a="${dir}" data-item="${id}" title="${dir === "out" ? "Take 10 to pocket" : "Store 10 here"}">${arrow}</button></div>`;
    };
    let html = `<div class="gd-cap">${this.furnId === null ? "Building storage" : "In this unit"} ${total}/${data.capacity}</div>`;
    html += lotEntries.length
      ? lotEntries.map(([id, q]) => row(id, q, "out")).join("")
      : `<div class="pk-empty">Empty</div>`;
    const pk = Object.entries(pocket).filter(([, q]) => q > 0);
    html += `<div class="gd-cap gd-cap2">Your pocket</div>`;
    html += pk.length ? pk.map(([id, q]) => row(id, q, "in")).join("") : `<div class="pk-empty">Empty</div>`;
    this.el.innerHTML = `<div class="fx-head"><span>${ic("box")} ${this.title}</span><button class="lp-close fx-close">✕</button></div><div class="fx-body">${html}</div>`;
    this.el.querySelector(".fx-close")?.addEventListener("click", () => this.close());
    this.el.querySelectorAll<HTMLElement>(".gd-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const item = b.dataset.item!;
        if (b.dataset.a === "out") {
          const q = Math.min(10, data.items[item] ?? 0);
          if (q > 0) this.actions.transfer(lotId, item, q, false);
        } else {
          const q = Math.min(10, pocket[item] ?? 0);
          if (q > 0) this.actions.transfer(lotId, item, q, true);
        }
      })
    );
  }
}

// Production panel — opened by clicking a machine. Pick a product, see the
// materials it needs vs what's in storage, set a quantity, start the run.
export class CraftPanel {
  private el: HTMLElement;
  lotId: number | null = null;
  private station = "";
  private selected = "";
  private qty = 1;
  private pickerOpen = true;
  private data: GoodsData | null = null;

  constructor(ui: HTMLElement, private actions: GoodsActions) {
    this.el = document.createElement("div");
    this.el.className = "panel fixture-panel craft-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  private stationLabel() {
    return furnitureById(this.station)?.label ?? "Machine";
  }

  open(lotId: number, station: string) {
    this.lotId = lotId;
    if (this.station !== station) {
      this.station = station;
      this.selected = RECIPES.find((r) => r.station === station)?.id ?? "";
      this.qty = 1;
    }
    this.el.style.display = "block";
    this.el.innerHTML = `<div class="fx-head"><span>${ic(this.station)} ${this.stationLabel()}</span><button class="lp-close fx-close">✕</button></div><div class="fx-body">Loading…</div>`;
    this.el.querySelector(".fx-close")?.addEventListener("click", () => this.close());
  }

  close() {
    this.el.style.display = "none";
    this.lotId = null;
  }

  render(data: GoodsData) {
    if (this.lotId === null) return;
    this.data = data;
    const lotId = this.lotId;
    const recipes = RECIPES.filter((r) => r.station === this.station);
    if (!recipes.some((r) => r.id === this.selected)) this.selected = recipes[0]?.id ?? "";
    const sel = recipes.find((r) => r.id === this.selected);

    let html = "";
    // running jobs
    if (data.crafts.length) {
      html += `<div class="lp-sec-title">In production</div>`;
      for (const c of data.crafts) {
        const r = RECIPES.find((x) => x.id === c.recipe);
        const out = itemById(r?.out ?? "");
        const mins = Math.max(0, Math.ceil((c.doneAt - Date.now()) / 60000));
        html += `<div class="cp-job">${ic(r?.out ?? "", 20)}
          <span>${out?.label ?? c.recipe} <b>×${(r?.outQty ?? 1) * c.count}</b></span>
          <span class="cp-job-t">~${mins}m left</span></div>`;
      }
    }
    // product picker (hidden when the machine makes only one thing). On a
    // busy machine the list is long, so it folds away — what's selected and
    // what's running stay on screen either way.
    if (recipes.length > 1) {
      html += `<button class="lp-sec-title cp-fold${this.pickerOpen ? " open" : ""}">
        <span class="cp-caret"></span>Product<span class="cp-fold-n">${recipes.length}</span></button>`;
      if (this.pickerOpen) {
        html += `<div class="cp-picker">`;
        for (const r of recipes) {
          const out = itemById(r.out);
          html += `<button class="cp-chip ${r.id === this.selected ? "active" : ""}" data-recipe="${r.id}" title="${out?.label}">
            ${ic(r.out, 22)}<span>${out?.label}</span></button>`;
        }
        html += `</div>`;
      }
    }

    if (sel) {
      const out = itemById(sel.out);
      // clamp qty to something sane
      this.qty = Math.max(1, Math.min(50, Math.floor(this.qty)));
      const n = this.qty;
      const maxBy = Math.min(
        50,
        ...Object.entries(sel.inputs).map(([id, need]) => Math.floor((data.items[id] ?? 0) / need))
      );
      const canAll = Object.entries(sel.inputs).every(([id, need]) => (data.items[id] ?? 0) >= need * n);

      html += `<div class="cp-output">
        ${ic(sel.out, 34)}
        <div class="cp-output-txt">
          <b>${out?.label}${sel.permit ? ` <span class="cp-permit">${sel.permit} permit</span>` : ""}</b>
          <span>makes ×${sel.outQty} per run · ${sel.minutes}m each</span>
        </div>
      </div>`;

      html += `<div class="lp-sec-title">Materials needed</div>`;
      for (const [id, need] of Object.entries(sel.inputs)) {
        const have = data.items[id] ?? 0;
        const ok = have >= need * n;
        html += `<div class="cp-mat">
          ${ic(id, 18)}<span>${itemById(id)?.label ?? id}</span>
          <b class="${ok ? "cp-ok" : "cp-short"}">${need * n}</b>
          <span class="cp-have">of ${have} in storage</span>
        </div>`;
      }

      html += `<div class="lp-sec-title">Quantity</div>
      <div class="cp-qty">
        <button class="cp-step" data-d="-1">−</button>
        <span class="cp-n">${n}</span>
        <button class="cp-step" data-d="1">+</button>
        <button class="cp-max" ${maxBy < 1 ? "disabled" : ""}>Max${maxBy >= 1 ? " (" + maxBy + ")" : ""}</button>
      </div>
      <div class="cp-sum">You get <b>${sel.outQty * n} ${out?.label}</b> in ~${sel.minutes * n}m</div>
      <button class="btn-primary cp-start" ${canAll ? "" : "disabled"}>
        ${canAll ? "Start production" : "Not enough materials"}
      </button>
      <div class="lp-hint">Materials come from this building's storage; output lands there too.</div>`;
    } else {
      html += `<div class="pk-empty">This machine has no recipes</div>`;
    }

    this.el.innerHTML = `<div class="fx-head"><span>${ic(this.station)} ${this.stationLabel()}</span><button class="lp-close fx-close">✕</button></div><div class="fx-body">${html}</div>`;
    this.el.querySelector(".fx-close")?.addEventListener("click", () => this.close());
    this.el.querySelector(".cp-fold")?.addEventListener("click", () => {
      this.pickerOpen = !this.pickerOpen;
      this.render(this.data!);
    });
    this.el.querySelectorAll<HTMLElement>(".cp-chip").forEach((b) =>
      b.addEventListener("click", () => {
        this.selected = b.dataset.recipe!;
        this.qty = 1;
        this.render(this.data!);
      })
    );
    this.el.querySelectorAll<HTMLElement>(".cp-step").forEach((b) =>
      b.addEventListener("click", () => {
        this.qty = Math.max(1, Math.min(50, this.qty + Number(b.dataset.d)));
        this.render(this.data!);
      })
    );
    this.el.querySelector(".cp-max")?.addEventListener("click", () => {
      if (!sel) return;
      const maxBy = Math.min(
        50,
        ...Object.entries(sel.inputs).map(([id, need]) => Math.floor((this.data!.items[id] ?? 0) / need))
      );
      if (maxBy >= 1) {
        this.qty = maxBy;
        this.render(this.data!);
      }
    });
    this.el.querySelector(".cp-start")?.addEventListener("click", () => {
      if (sel) this.actions.craft(lotId, sel.id, this.qty);
    });
  }
}
