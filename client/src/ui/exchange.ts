import { ITEMS, SECTORS, itemById, sectorOf, BASE_PRICE } from "@mc/shared";
import { SERVER_URL } from "../config.js";
import { ic } from "./icons.js";

interface Summary {
  item: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  dayVol: number;
  totalVol: number;
}
interface Book {
  bids: Array<{ price: number; qty: number }>;
  asks: Array<{ price: number; qty: number }>;
  trades: Array<{ price: number; qty: number; ts: number }>;
}
interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}
interface MyOrder {
  id: number;
  side: "buy" | "sell";
  item: string;
  qty: number;
  price: number;
}

interface Actions {
  place(side: "buy" | "sell", item: string, qty: number, price: number): void;
  cancel(orderId: number): void;
}

import { drawCandles, fmtPrice as money } from "./chart.js";

// The commodity exchange — toggled with M. Opens on a searchable item
// directory; clicking an item drills into its market (chart, book, orders).
export class ExchangePanel {
  private el: HTMLElement;
  private visible = false;
  private view: "list" | "detail" = "list";
  private item = "wood";
  private search = "";
  private sector: string = "all";
  private sort: "volume" | "px_desc" | "px_asc" | "name" = "volume";
  private res: "1m" | "10m" = "10m";
  private side: "buy" | "sell" = "buy";
  private token: string;

  constructor(ui: HTMLElement, private actions: Actions, token: string) {
    this.token = token;
    this.el = document.createElement("div");
    this.el.className = "panel exchange-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  get isOpen() {
    return this.visible;
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? "flex" : "none";
    if (this.visible) {
      this.view = "list";
      this.search = "";
      void this.refresh();
    }
  }

  close() {
    this.visible = false;
    this.el.style.display = "none";
  }

  async refresh() {
    if (!this.visible) return;
    if (this.view === "list") {
      const summary = (await fetch(`${SERVER_URL}/market`).then((r) => r.json())) as Summary[];
      this.renderList(summary);
      return;
    }
    const [summary, book, history, mine] = await Promise.all([
      fetch(`${SERVER_URL}/market`).then((r) => r.json()) as Promise<Summary[]>,
      fetch(`${SERVER_URL}/market/${this.item}`).then((r) => r.json()) as Promise<Book>,
      fetch(`${SERVER_URL}/market/history/${this.item}?res=${this.res}`).then((r) => r.json()) as Promise<Candle[]>,
      fetch(`${SERVER_URL}/market/orders`, { headers: { authorization: `Bearer ${this.token}` } }).then((r) =>
        r.json()
      ) as Promise<MyOrder[]>,
    ]);
    this.render(summary, book, history, mine);
  }

  private renderList(summary: Summary[]) {
    const byItem = new Map(summary.map((s) => [s.item, s]));
    const SORTS: Array<[typeof this.sort, string]> = [
      ["volume", "Most traded"],
      ["px_desc", "Price: high to low"],
      ["px_asc", "Price: low to high"],
      ["name", "A–Z"],
    ];
    this.el.innerHTML = `
      <div class="exl-page">
        <div class="ex-head-row">
          <span>COMMODITY EXCHANGE</span>
          <button class="lp-close ex-close">✕</button>
        </div>
        <div class="exl-toolbar">
          <input class="lp-input exl-search" type="text" placeholder="Search items" />
          <select class="lp-input exl-sort">
            ${SORTS.map(([k, label]) => `<option value="${k}">${label}</option>`).join("")}
          </select>
          <span class="exl-count"></span>
        </div>
        <div class="exl-filters">
          <button class="gd-btn exl-sector" data-sector="all">All</button>
          ${SECTORS.map((sec) => `<button class="gd-btn exl-sector" data-sector="${sec.id}">${sec.label}</button>`).join("")}
        </div>
        <div class="exl-grid"></div>
      </div>`;

    const gridEl = this.el.querySelector<HTMLElement>(".exl-grid")!;
    const countEl = this.el.querySelector<HTMLElement>(".exl-count")!;
    const renderGrid = () => {
      const q = this.search.trim().toLowerCase();
      // the same number the card displays is the number the sort ranks —
      // anything else reads as a scrambled list
      const px = (id: string) => {
        const s = byItem.get(id);
        return s?.last ?? s?.ask ?? s?.bid ?? BASE_PRICE[id] ?? 10;
      };
      const items = ITEMS.filter((it) => {
        if (this.sector !== "all" && sectorOf(it.id) !== this.sector) return false;
        if (q && !it.label.toLowerCase().includes(q)) return false;
        return true;
      }).sort((a, b) => {
        if (this.sort === "name") return a.label.localeCompare(b.label);
        if (this.sort === "volume") {
          const av = byItem.get(a.id);
          const bv = byItem.get(b.id);
          const d = (bv?.totalVol ?? 0) - (av?.totalVol ?? 0);
          if (d !== 0) return d;
          const dd = (bv?.dayVol ?? 0) - (av?.dayVol ?? 0);
          return dd !== 0 ? dd : a.label.localeCompare(b.label);
        }
        return this.sort === "px_desc" ? px(b.id) - px(a.id) : px(a.id) - px(b.id);
      });
      countEl.textContent = `${items.length} of ${ITEMS.length}`;
      gridEl.innerHTML = items.length
        ? items
            .map((it) => {
              const s = byItem.get(it.id);
              const sub =
                s?.bid != null || s?.ask != null
                  ? `${s?.bid != null ? "bid " + money(s.bid) : ""}${s?.bid != null && s?.ask != null ? " · " : ""}${
                      s?.ask != null ? "ask " + money(s.ask) : ""
                    }`
                  : "no open orders";
              const volSub =
                this.sort === "volume" && (s?.totalVol ?? 0) > 0
                  ? `traded ${s!.totalVol.toLocaleString()}${(s?.dayVol ?? 0) > 0 ? ` · ${s!.dayVol.toLocaleString()} today` : ""}`
                  : null;
              // a good with no trades yet still has a price if someone is
              // quoting it — show that, so the price sorts read straight
              const quote = s?.ask ?? s?.bid ?? null;
              const price = money(s?.last ?? quote ?? BASE_PRICE[it.id] ?? 10);
              return `<div class="exl-card" data-item="${it.id}">
                ${ic(it.id, 26)}
                <div class="exl-card-name">${it.label}</div>
                <div class="exl-card-px">${price}</div>
                <div class="exl-card-sub">${volSub ?? sub}</div>
              </div>`;
            })
            .join("")
        : `<div class="pk-empty">${
            q ? `Nothing matches "${this.search}"` : "Nothing here right now — try another filter"
          }</div>`;
      this.el.querySelectorAll<HTMLElement>(".exl-card").forEach((cd) =>
        cd.addEventListener("click", () => {
          this.item = cd.dataset.item!;
          this.view = "detail";
          void this.refresh();
        })
      );
      this.el.querySelectorAll<HTMLElement>(".exl-sector").forEach((b) =>
        b.classList.toggle("active", b.dataset.sector === this.sector)
      );
    };
    renderGrid();

    this.el.querySelector(".ex-close")?.addEventListener("click", () => this.close());
    const searchEl = this.el.querySelector<HTMLInputElement>(".exl-search")!;
    searchEl.value = this.search;
    searchEl.focus();
    searchEl.addEventListener("input", () => {
      this.search = searchEl.value;
      renderGrid();
    });
    const sortEl = this.el.querySelector<HTMLSelectElement>("select.exl-sort")!;
    sortEl.value = this.sort;
    sortEl.addEventListener("change", () => {
      this.sort = sortEl.value as typeof this.sort;
      renderGrid();
    });
    this.el.querySelectorAll<HTMLElement>(".exl-sector").forEach((b) =>
      b.addEventListener("click", () => {
        this.sector = b.dataset.sector!;
        renderGrid();
      })
    );
  }

  private render(summary: Summary[], book: Book, history: Candle[], mine: MyOrder[]) {
    const byItem = new Map(summary.map((s) => [s.item, s]));
    const sel = itemById(this.item)!;
    const s = byItem.get(this.item);
    const asks = book.asks.slice(0, 6).reverse();
    const bids = book.bids.slice(0, 6);
    const bookHtml =
      asks
        .map(
          (a) => `<div class="ex-lvl ex-ask"><span>${money(a.price)}</span><b>${a.qty}</b></div>`
        )
        .join("") +
      `<div class="ex-spread">${
        s?.bid != null && s?.ask != null ? "spread " + money(Math.max(0, s.ask - s.bid)) : "—"
      }</div>` +
      bids
        .map(
          (b) => `<div class="ex-lvl ex-bid"><span>${money(b.price)}</span><b>${b.qty}</b></div>`
        )
        .join("");

    const tape = book.trades
      .slice(0, 8)
      .map((t) => `<div class="ex-lvl"><span>${money(t.price)}</span><b>${t.qty}</b></div>`)
      .join("");

    const mineHtml = mine.length
      ? mine
          .map(
            (o) => `<div class="ex-lvl ex-mine">
              <span class="${o.side === "buy" ? "ex-bid-t" : "ex-ask-t"}">${o.side.toUpperCase()}</span>
              ${ic(o.item, 14)}<span>${o.qty} @ ${money(o.price)}</span>
              <button class="gd-btn ex-cancel" data-id="${o.id}">✕</button></div>`
          )
          .join("")
      : `<div class="pk-empty">No open orders</div>`;

    this.el.innerHTML = `
      <div class="ex-detail">
        <div class="ex-head-row">
          <span class="ex-title">
            <button class="gd-btn ex-back">‹ All items</button>
            ${ic(this.item, 20)} ${sel.label}
            <b class="ex-last">${money(s?.last ?? BASE_PRICE[this.item] ?? 10)}</b></span>
          <span class="ex-head-right">
            <button class="gd-btn ex-res ${this.res === "1m" ? "active" : ""}" data-res="1m">1m</button>
            <button class="gd-btn ex-res ${this.res === "10m" ? "active" : ""}" data-res="10m">1 day</button>
            <button class="lp-close ex-close">✕</button>
          </span>
        </div>
        <canvas class="ex-chart"></canvas>
        <div class="ex-cols">
          <div class="ex-col">
            <div class="lp-sec-title">Order book</div>
            ${bookHtml}
          </div>
          <div class="ex-col">
            <div class="lp-sec-title">Place order</div>
            <div class="ex-sides">
              <button class="ex-side ${this.side === "buy" ? "ex-side-buy" : ""}" data-side="buy">Buy</button>
              <button class="ex-side ${this.side === "sell" ? "ex-side-sell" : ""}" data-side="sell">Sell</button>
            </div>
            <div class="lp-inline">
              <input class="lp-input ex-qty" type="number" min="1" placeholder="qty" value="10" />
              <input class="lp-input ex-price" type="number" min="0.01" step="0.01" placeholder="price"
                value="${(s?.last ?? (this.side === "buy" ? s?.ask ?? s?.bid : s?.bid ?? s?.ask) ?? BASE_PRICE[this.item] ?? 10).toFixed(2)}" />
            </div>
            <div class="lp-hint ex-total"></div>
            <button class="btn-primary ex-place">Place order</button>
            <div class="lp-sec-title ex-mine-title">Your orders</div>
            ${mineHtml}
          </div>
          <div class="ex-col">
            <div class="lp-sec-title">Recent trades</div>
            ${tape.length ? tape : `<div class="pk-empty">None yet</div>`}
          </div>
        </div>
      </div>`;

    const cv = this.el.querySelector<HTMLCanvasElement>(".ex-chart");
    if (cv) drawCandles(cv, history, { bucketMs: this.res === "1m" ? 60_000 : 600_000 });

    // wiring
    this.el.querySelector(".ex-close")?.addEventListener("click", () => this.close());
    this.el.querySelector(".ex-back")?.addEventListener("click", () => {
      this.view = "list";
      void this.refresh();
    });
    this.el.querySelectorAll<HTMLElement>(".ex-res").forEach((b) =>
      b.addEventListener("click", () => {
        this.res = b.dataset.res as "1m" | "10m";
        void this.refresh();
      })
    );
    this.el.querySelectorAll<HTMLElement>(".ex-side").forEach((b) =>
      b.addEventListener("click", () => {
        this.side = b.dataset.side as "buy" | "sell";
        void this.refresh();
      })
    );
    this.el.querySelectorAll<HTMLElement>(".ex-cancel").forEach((b) =>
      b.addEventListener("click", () => this.actions.cancel(Number(b.dataset.id)))
    );
    const qtyEl = this.el.querySelector<HTMLInputElement>(".ex-qty")!;
    const priceEl = this.el.querySelector<HTMLInputElement>(".ex-price")!;
    const totalEl = this.el.querySelector<HTMLElement>(".ex-total")!;
    const updTotal = () => {
      const q = Number(qtyEl.value);
      const p = Number(priceEl.value);
      totalEl.textContent =
        q > 0 && p > 0 ? `Total ${money(q * p)}${this.side === "sell" ? " (1% fee on fills)" : ""}` : "";
    };
    qtyEl.addEventListener("input", updTotal);
    priceEl.addEventListener("input", updTotal);
    updTotal();
    this.el.querySelector(".ex-place")?.addEventListener("click", () => {
      const q = Math.floor(Number(qtyEl.value));
      const p = Number(priceEl.value);
      if (q > 0 && p > 0) this.actions.place(this.side, this.item, q, p);
    });
  }

}
