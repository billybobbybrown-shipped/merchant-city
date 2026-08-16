import { BASE_PRICE, ITEMS, itemById } from "@mc/shared";
import { SERVER_URL, fmtMoney } from "../config.js";
import { ic } from "./icons.js";

interface ShopActions {
  stock(furnId: number, qty: number, toShelf: boolean): void;
  setListing(furnId: number, item: string | null, price: number | null): void;
  pocket(): Record<string, number>;
}

interface ShelfView {
  lotId: number;
  item: string | null;
  price: number | null;
  qty: number;
  capacity: number;
}

// One shop shelf. It sells a single item at a single price and holds its own
// stock — the building's racks are somewhere else entirely, and a stocker is
// what carries goods from there to here.
export class ShopPanel {
  private el: HTMLElement;
  lotId: number | null = null;
  furnId: number | null = null;
  private canManage = false;
  private picking = false;

  constructor(ui: HTMLElement, private actions: ShopActions) {
    this.el = document.createElement("div");
    this.el.className = "panel fixture-panel shop-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  open(lotId: number, canManage: boolean, furnId: number) {
    this.lotId = lotId;
    this.furnId = furnId;
    this.canManage = canManage;
    this.picking = false;
    this.el.style.display = "block";
    this.el.innerHTML = `${this.head()}<div class="fx-body">Loading…</div>`;
    this.el.querySelector(".fx-close")?.addEventListener("click", () => this.close());
    void this.refresh();
  }

  close() {
    this.el.style.display = "none";
    this.lotId = null;
    this.furnId = null;
  }

  private head() {
    return `<div class="fx-head"><span>${ic("shelf", 16)} Shop shelf</span><button class="lp-close fx-close">✕</button></div>`;
  }

  async refresh() {
    if (this.furnId === null) return;
    const furnId = this.furnId;
    const view: ShelfView | null = await fetch(`${SERVER_URL}/shelf/${furnId}`)
      .then((r) => r.json())
      .catch(() => null);
    if (this.furnId !== furnId || !view) return;
    this.render(view);
  }

  private render(view: ShelfView) {
    const furnId = this.furnId!;
    const fair = view.item ? BASE_PRICE[view.item] : undefined;
    const pocket = this.actions.pocket();

    // same shape as any other storage in the game: what's in it, then your bag
    const row = (id: string, q: number, dir: "out" | "in", disabled = false) => {
      const def = itemById(id);
      const arrow =
        dir === "out" ? ic("arrow_out", 14) + ic("bag", 14) : ic("arrow_in", 14) + ic("box", 14);
      return `<div class="gd-row">${ic(id)}<span>${def?.label ?? id}${
        BASE_PRICE[id] !== undefined ? `<i class="sp-fair">fair $${BASE_PRICE[id]}</i>` : ""
      }</span><b>${q}</b>
        <button class="gd-btn gd-btn-ic sp-move" data-a="${dir}" data-item="${id}" ${
          disabled ? "disabled" : ""
        } title="${
          disabled
            ? `This shelf sells ${itemById(view.item!)?.label ?? view.item}`
            : dir === "out"
              ? "Take 10 to pocket"
              : "Put 10 on the shelf"
        }">${arrow}</button></div>`;
    };

    let html = "";
    if (!view.item) {
      html += `<div class="gd-cap">This shelf isn't selling anything yet</div>`;
      html += this.canManage ? this.picker() : `<div class="pk-empty">Nothing for sale here</div>`;
    } else {
      const def = itemById(view.item);
      html += `<div class="gd-row sp-listing">${ic(view.item, 20)}
          <span>${def?.label ?? view.item}${
            fair !== undefined
              ? `<i class="sp-fair" title="What citizens consider fair — they pay up to about 4x, but cheaper sells faster">fair $${fair}</i>`
              : ""
          }</span>
          <b>${view.qty}/${view.capacity}</b>
          ${
            this.canManage && view.qty > 0
              ? `<button class="gd-btn gd-btn-ic sp-move" data-a="out" data-item="${view.item}" title="Take 10 to pocket">${ic("arrow_out", 14)}${ic("bag", 14)}</button>`
              : ""
          }</div>`;

      if (this.canManage) {
        html += `<div class="gd-cap gd-cap2">Price</div>
          <div class="sp-row">
            <input class="lp-input sp-price" type="number" min="0.01" step="0.01"
              value="${view.price !== null ? view.price.toFixed(2) : ""}"
              placeholder="${fair !== undefined ? (fair * 1.5).toFixed(2) : "price"}" />
            <button class="gd-btn sp-setprice">Set</button>
          </div>
          <div class="lp-hint">Around 1.5x fair is a healthy margin; above about 4x nobody buys.</div>
          <div class="sp-row">
            <button class="gd-btn sp-change">Sell something else</button>
            <button class="gd-btn sp-clear">Stop selling</button>
          </div>`;
        if (this.picking) html += this.picker();
        // your pocket last, the same as every other storage panel
        html += `<div class="gd-cap gd-cap2">Your pocket</div>`;
        const pk = Object.entries(pocket).filter(([, q]) => q > 0);
        html += pk.length
          ? pk.map(([id, q]) => row(id, q, "in", id !== view.item)).join("")
          : `<div class="pk-empty">Empty</div>`;
      }
    }

    this.el.innerHTML = `${this.head()}<div class="fx-body">${html}</div>`;
    this.el.querySelector(".fx-close")?.addEventListener("click", () => this.close());

    const price = () => {
      const v = Number(this.el.querySelector<HTMLInputElement>(".sp-price")?.value);
      return v > 0 ? v : null;
    };
    this.el.querySelectorAll<HTMLElement>(".sp-move").forEach((b) =>
      b.addEventListener("click", () => this.actions.stock(furnId, 10, b.dataset.a === "in"))
    );
    this.el.querySelector(".sp-setprice")?.addEventListener("click", () => {
      const p = price();
      if (p !== null && view.item) this.actions.setListing(furnId, view.item, p);
    });
    this.el.querySelector(".sp-clear")?.addEventListener("click", () =>
      this.actions.setListing(furnId, null, null)
    );
    this.el.querySelector(".sp-change")?.addEventListener("click", () => {
      this.picking = !this.picking;
      this.render(view);
    });

    // search-as-you-type item picker
    const input = this.el.querySelector<HTMLInputElement>(".sp-search");
    const results = this.el.querySelector<HTMLElement>(".sp-results");
    if (input && results) {
      const draw = (q: string) => {
        const hits = ITEMS.filter((i) =>
          i.label.toLowerCase().includes(q.trim().toLowerCase())
        ).slice(0, 8);
        results.innerHTML = hits.length
          ? hits
              .map(
                (i, n) =>
                  `<button class="dk-hit" data-i="${n}">${ic(i.id, 16)}<span>${i.label}${
                    BASE_PRICE[i.id] !== undefined ? ` — fair $${BASE_PRICE[i.id]}` : ""
                  }</span></button>`
              )
              .join("")
          : `<div class="pk-empty">No match</div>`;
        results.classList.add("open");
        results.querySelectorAll<HTMLElement>(".dk-hit").forEach((b) =>
          b.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            const item = hits[Number(b.dataset.i)];
            const suggested = BASE_PRICE[item.id] !== undefined ? BASE_PRICE[item.id] * 1.5 : 1;
            this.picking = false;
            this.actions.setListing(furnId, item.id, price() ?? Math.round(suggested * 100) / 100);
          })
        );
      };
      input.addEventListener("focus", () => draw(""));
      input.addEventListener("input", () => draw(input.value));
      input.addEventListener("blur", () => setTimeout(() => results.classList.remove("open"), 120));
    }
  }

  private picker() {
    return `<div class="gd-cap gd-cap2">What should this shelf sell?</div>
      <label class="dk-field">
        <input class="lp-input sp-search" type="text" placeholder="Search goods…" />
        <div class="dk-results sp-results"></div>
      </label>`;
  }
}
