import { SERVER_URL, fmtMoney, fmtCap } from "../config.js";
import { drawCandles, fmtPrice, Candle, timeframeButtons, timeframeMs } from "./chart.js";
import { tabStrip, wireTabs } from "./panelTabs.js";
import { stockMeta, tapeTone } from "./marketMeta.js";

interface StockRow {
  company: number;
  name: string;
  shares: number;
  floatShares: number;
  dividendRatio: number;
  dps: number;
  payInDays: number;
  prevClose: number | null;
  last: number | null;
  marketCap: number | null;
  halted: boolean;
}

interface StockActions {
  trade(company: number, side: "buy" | "sell", qty: number, price?: number): void;
  cancel(orderId: number): void;
}

const chgPct = (last: number | null, prev: number | null): number | null =>
  last !== null && prev !== null && prev > 0 ? ((last - prev) / prev) * 100 : null;

const chgTag = (chg: number | null) =>
  chg === null
    ? `<span class="mkt-chg mkt-flat">—</span>`
    : `<span class="mkt-chg ${chg >= 0 ? "mkt-up" : "mkt-down"}">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(1)}%</span>`;

// walk the book to estimate what a market order would actually fill at
export function estimateFill(
  levels: Array<{ price: number; qty: number }>,
  qty: number
): { total: number; avg: number | null; available: number } {
  let remaining = qty;
  let total = 0;
  let available = 0;
  for (const l of levels) {
    available += l.qty;
    if (remaining > 0) {
      const take = Math.min(remaining, l.qty);
      total += take * l.price;
      remaining -= take;
    }
  }
  const filled = qty - remaining;
  return { total, avg: filled > 0 ? total / filled : null, available };
}

type Level = { price: number; qty: number };

// The live depth book, exchange-style: buys down the left, sells down the
// right, best prices meeting at the top, size bars scaled to the biggest
// level on display. Fits without scrolling.
export function bookLadder(bids: Level[], asks: Level[], depth = 7): string {
  const b = bids.slice(0, depth);
  const a = asks.slice(0, depth);
  const maxQ = Math.max(1, ...b.map((l) => l.qty), ...a.map((l) => l.qty));
  const row = (l: Level, side: "bid" | "ask") =>
    `<div class="mkt-lvl mkt-${side}">
       <div class="mkt-lvl-bar" style="width:${Math.max(3, Math.round((l.qty / maxQ) * 100))}%"></div>
       <span>${fmtPrice(l.price)}</span><b>${l.qty.toLocaleString()}</b>
     </div>`;
  return `<div class="tt-book2">
      <div class="tt-book-col">
        <div class="tt-book-cap mkt-up">Buys</div>
        ${b.map((l) => row(l, "bid")).join("") || `<div class="mkt-empty">none</div>`}
      </div>
      <div class="tt-book-col">
        <div class="tt-book-cap mkt-down">Sells</div>
        ${a.map((l) => row(l, "ask")).join("") || `<div class="mkt-empty">none</div>`}
      </div>
    </div>`;
}

// time & sales, coloured print-over-print like a real tape
export function tapeHtml(trades: Array<{ price: number; qty: number; ts: number }>, n = 16): string {
  return trades
    .slice(0, n)
    .map(
      (t, i, arr) => `<div class="mkt-tape">
        <span class="mkt-dim">${new Date(t.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        <span class="${tapeTone(t.price, arr[i + 1]?.price)}">${fmtPrice(t.price)}</span><b>${t.qty.toLocaleString()}</b>
      </div>`
    )
    .join("");
}

// Stats over the chart's OWN timeframe: on the 5m chart, volume is the last
// five minutes' dollar turnover and the gain/loss is the move over those five
// minutes. Volume is dollars (price x quantity) — unit counts read as
// "broken" the moment prices differ from $1.
export function windowStats(oneMin: Candle[], windowMs: number): { vol: number; ref: number | null } {
  const cut = Date.now() - windowMs;
  let vol = 0;
  let ref: number | null = null;
  for (const c of oneMin) {
    if (c.t < cut) {
      ref = c.c; // the last close before the window opens = the baseline
      continue;
    }
    if (c.v > 0) vol += c.v * c.c;
  }
  if (ref === null && oneMin.length && oneMin[0].t >= cut) ref = oneMin[0].o;
  return { vol, ref };
}

// The stock market terminal: listed companies only (the coin has its own
// page). Directory → per-company workstation with chart, live depth, tape,
// ticket and fundamentals from the public books.
export class StocksPanel {
  private el: HTMLElement;
  private view: "list" | "detail" | "portfolio" = "list";
  private company: number | null = null;
  private res = "5m";
  private side: "buy" | "sell" = "buy";
  private mode: "market" | "limit" = "market";
  private detailTab: "trade" | "about" = "trade";

  constructor(
    ui: HTMLElement,
    private selfEid: string,
    private actions: StockActions
  ) {
    this.el = document.createElement("div");
    this.el.className = "panel exchange-panel market-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  get visible() {
    return this.el.style.display !== "none";
  }

  toggle() {
    if (this.visible) this.close();
    else {
      this.view = "list";
      void this.refresh();
    }
  }

  close() {
    this.el.style.display = "none";
  }

  async refresh() {
    this.el.style.display = "flex";
    if (this.view === "portfolio") return this.renderPortfolio();
    if (this.view === "detail" && this.company !== null) return this.renderDetail(this.company);
    return this.renderList();
  }

  // ---------- portfolio ----------
  // What you hold, what it cost, and what it has made you.

  private async renderPortfolio() {
    const mine = await fetch(`${SERVER_URL}/holdings/${this.selfEid}`)
      .then((r) => r.json())
      .catch(() => null);
    if (!this.visible) return;
    const p: {
      rows: Array<{
        company: number;
        name: string;
        shares: number;
        avgCost: number;
        price: number;
        value: number;
        unrealised: number;
        realised: number;
      }>;
      value: number;
      cost: number;
      unrealised: number;
      realised: number;
    } = mine?.portfolio ?? { rows: [], value: 0, cost: 0, unrealised: 0, realised: 0 };

    const pnl = (n: number) =>
      `<b class="${n > 0 ? "mkt-up" : n < 0 ? "mkt-down" : ""}">${n > 0 ? "+" : ""}${fmtMoney(n)}</b>`;
    const pct = (n: number, base: number) =>
      base > 0 ? `<span class="mkt-dim">${n >= 0 ? "+" : ""}${((n / base) * 100).toFixed(1)}%</span>` : "";

    const rows = p.rows
      .slice()
      .sort((a, b) => b.value - a.value)
      .map(
        (r) => `<div class="mkt-row pf-row" data-c="${r.company}">
            <span class="mkt-name"><span class="mkt-symtag">${stockMeta(r.name).sym}</span>${r.name}<span class="mkt-sub">${r.shares.toLocaleString()} @ ${fmtPrice(r.avgCost)}</span></span>
            <b class="mkt-px">${fmtPrice(r.price)}</b>
            <span class="mkt-dim">${fmtMoney(r.value)}</span>
            ${pnl(r.unrealised)}
            ${pct(r.unrealised, r.shares * r.avgCost)}
          </div>`
      )
      .join("");

    this.el.innerHTML = `
      <div class="ex-detail">
        <div class="mkt-header">
          <button class="gd-btn mkt-back">← Market</button>
          <span class="mkt-title">Portfolio</span>
          <button class="lp-close mkt-close">✕</button>
        </div>
        <div class="pg-summary">
          <div class="pg-stat"><span>Market value</span><b>${fmtMoney(p.value)}</b></div>
          <div class="pg-stat"><span>Cost basis</span><b>${fmtMoney(p.cost)}</b></div>
          <div class="pg-stat"><span>Open P&L</span>${pnl(p.unrealised)}</div>
          <div class="pg-stat"><span>Realised</span>${pnl(p.realised)}</div>
        </div>
        ${
          p.rows.length
            ? `<div class="mkt-row mkt-head-row">
                 <span>Holding</span><b class="mkt-px">Last</b>
                 <span class="mkt-dim">Value</span><span>Open P&L</span><span class="mkt-dim"></span>
               </div>
               <div class="mkt-list">${rows}</div>`
            : `<div class="pk-empty">You don't own any shares yet</div>`
        }
      </div>`;

    this.el.querySelector(".mkt-close")?.addEventListener("click", () => this.close());
    this.el.querySelector(".mkt-back")?.addEventListener("click", () => {
      this.view = "list";
      void this.refresh();
    });
    this.el.querySelectorAll<HTMLElement>(".pf-row").forEach((r) =>
      r.addEventListener("click", () => {
        this.company = Number(r.dataset.c);
        this.view = "detail";
        void this.refresh();
      })
    );
  }

  // ---------- directory ----------

  private async renderList() {
    const [rows, mine] = await Promise.all([
      fetch(`${SERVER_URL}/stocks`).then((r) => r.json()).catch(() => []) as Promise<StockRow[]>,
      fetch(`${SERVER_URL}/holdings/${this.selfEid}`).then((r) => r.json()).catch(() => ({ holdings: [], orders: [] })),
    ]);
    if (!this.visible) return;
    const holdings: Array<{ company: number; name: string; shares: number }> = mine.holdings ?? [];
    const heldBy = new Map(holdings.map((h) => [h.company, h.shares]));
    const lastBy = new Map(rows.map((r) => [r.company, r.last]));

    // portfolio strip
    let portValue = 0;
    for (const h of holdings) portValue += (lastBy.get(h.company) ?? 0)! * h.shares;

    let listHtml = "";
    for (const s of [...rows].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))) {
      const held = heldBy.get(s.company) ?? 0;
      const meta = stockMeta(s.name);
      listHtml += `<div class="mkt-row" data-c="${s.company}">
          <span class="mkt-name"><span class="mkt-symtag">${meta.sym}</span>${s.name}
            ${s.halted ? `<span class="mkt-halt">HALT</span>` : ""}
            ${held > 0 ? `<span class="mkt-sub">${held.toLocaleString()} held</span>` : ""}</span>
          <b class="mkt-px">${s.last !== null ? fmtPrice(s.last) : "—"}</b>
          ${chgTag(chgPct(s.last, s.prevClose))}
          <span class="mkt-dim">${s.marketCap !== null ? fmtCap(s.marketCap) : ""}</span>
          <span class="mkt-dim">${
            s.dps > 0 && s.last ? `${((s.dps * 52) / s.last * 100).toFixed(1)}%` : s.dividendRatio > 0 ? `${(s.dividendRatio * 100).toFixed(1)}%` : "none"
          }</span>
        </div>`;
    }

    const orders = (mine.orders ?? []) as Array<{ id: number; side: string; name: string; qty: number; price: number }>;
    const ordersHtml = orders.length
      ? `<div class="mkt-section">Your open orders</div>` +
        orders
          .map(
            (o) => `<div class="mkt-order">
              <span class="${o.side === "buy" ? "mkt-up" : "mkt-down"}">${o.side.toUpperCase()}</span>
              <span>${o.qty.toLocaleString()} ${o.name}</span><b>${fmtPrice(o.price)}</b>
              <button class="gd-btn mkt-cancel" data-id="${o.id}">✕</button></div>`
          )
          .join("")
      : "";

    this.el.innerHTML = `
      <div class="ex-detail">
        <div class="mkt-header">
          <span class="mkt-title">Stock Market</span>
          <button class="gd-btn mkt-toport">Portfolio${
            holdings.length ? ` <b>${fmtMoney(portValue)}</b>` : ""
          }</button>
          <button class="lp-close mkt-close">✕</button>
        </div>
        <div class="mkt-row mkt-head-row">
          <span>Company</span><b class="mkt-px">Last</b><span class="mkt-chg">Day</span>
          <span class="mkt-dim">Mkt cap</span><span class="mkt-dim">Dividend</span>
        </div>
        <div class="mkt-list">${listHtml}</div>
        ${ordersHtml}
      </div>`;
    this.el.querySelector(".mkt-close")?.addEventListener("click", () => this.close());
    this.el.querySelectorAll<HTMLElement>(".mkt-row[data-c]").forEach((r) =>
      r.addEventListener("click", () => {
        this.company = Number(r.dataset.c);
        this.view = "detail";
        void this.refresh();
      })
    );
    this.el.querySelector(".mkt-toport")?.addEventListener("click", () => {
      this.view = "portfolio";
      void this.refresh();
    });
    this.el.querySelectorAll<HTMLElement>(".mkt-cancel").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.actions.cancel(Number(b.dataset.id));
      })
    );
  }

  // ---------- workstation ----------

  private async renderDetail(company: number) {
    const [rows, d, history, oneMin, mine, fin] = await Promise.all([
      fetch(`${SERVER_URL}/stocks`).then((r) => r.json()).catch(() => []) as Promise<StockRow[]>,
      fetch(`${SERVER_URL}/stocks/${company}`).then((r) => r.json()).catch(() => null),
      fetch(`${SERVER_URL}/market/candles?type=stock&key=s:${company}&res=${this.res}`).then((r) => r.json()).catch(() => []) as Promise<Candle[]>,
      fetch(`${SERVER_URL}/market/candles?type=stock&key=s:${company}&res=1m`).then((r) => r.json()).catch(() => []) as Promise<Candle[]>,
      fetch(`${SERVER_URL}/holdings/${this.selfEid}`).then((r) => r.json()).catch(() => ({ holdings: [], orders: [] })),
      fetch(`${SERVER_URL}/company/${company}/financials`).then((r) => r.json()).catch(() => null),
    ]);
    if (!this.visible || this.company !== company) return;
    const s = rows.find((x) => x.company === company);
    if (!s || !d) return;
    const meta = stockMeta(s.name);

    // trailing OPERATING profit from the public books -> EPS -> P/E.
    // Capital spending is an asset swap, not a loss; and these companies sit
    // on big idle cash piles, so the BUSINESS is priced ex-cash — the
    // standard cash-adjusted P/E.
    // selling your own shares raises capital; it doesn't earn a cent
    const NON_OPERATING = ["transfer", "ipo", "dividend", "shares", "land", "construction", "furniture", "demolition", "production_setup"];
    let pe = "—";
    let epsTxt = "—";
    let revDay = 0;
    let costDay = 0;
    if (fin?.days?.length) {
      const win = fin.days.slice(0, 7);
      let inn = 0;
      let out = 0;
      for (const day of win) {
        for (const [k, v] of Object.entries(day.inflow as Record<string, number>))
          if (!NON_OPERATING.includes(k)) inn += v;
        for (const [k, v] of Object.entries(day.outflow as Record<string, number>))
          if (!NON_OPERATING.includes(k)) out += v;
      }
      revDay = inn / win.length;
      costDay = out / win.length;
      const eps = (((inn - out) / win.length) * 365) / s.shares;
      if (eps !== 0) epsTxt = `$${Math.abs(eps) < 0.01 ? eps.toFixed(4) : eps.toFixed(2)}`;
      if (eps > 0 && s.last !== null) {
        const exCash = Math.max(0.01, s.last - (fin.cash ?? 0) / s.shares);
        pe = (exCash / eps).toFixed(1);
      }
    }
    const landValue = (fin?.lots ?? []).reduce((a: number, l: { value: number }) => a + Number(l.value), 0);
    const bookPerShare = fin ? ((fin.cash ?? 0) + landValue + (fin.inventoryValue ?? 0)) / s.shares : null;

    const held = (mine.holdings ?? []).find((h: { company: number }) => h.company === company)?.shares ?? 0;
    const myOrders = ((mine.orders ?? []) as Array<{ id: number; side: string; company: number; qty: number; price: number }>).filter(
      (o) => o.company === company
    );
    const day = windowStats(oneMin, timeframeMs(this.res));
    const chg = chgPct(s.last, day.ref);
    const yieldTxt =
      s.dps > 0 && s.last
        ? `${((s.dps * 52) / s.last * 100).toFixed(1)}%`
        : s.dividendRatio > 0
          ? `${(s.dividendRatio * 100).toFixed(1)}%*`
          : "none";

    const mineHtml = myOrders.length
      ? myOrders
          .map(
            (o) => `<div class="mkt-order">
              <span class="${o.side === "buy" ? "mkt-up" : "mkt-down"}">${o.side.toUpperCase()}</span>
              <span>${o.qty.toLocaleString()} @ ${fmtPrice(o.price)}</span>
              <button class="gd-btn mkt-cancel" data-id="${o.id}">✕</button></div>`
          )
          .join("")
      : `<div class="mkt-empty">No open orders</div>`;

    const stat = (label: string, value: string, tone = "") =>
      `<div class="mkt-stat"><span>${label}</span><b class="${tone}">${value}</b></div>`;

    this.el.innerHTML = `
      <div class="ex-detail">
        <div class="mkt-header">
          <button class="gd-btn mkt-back">‹</button>
          <span class="mkt-symbox">
            <span class="mkt-symline"><span class="mkt-sym">${meta.sym}</span><span class="mkt-sector">${meta.sector}</span>${s.halted ? `<span class="mkt-halt">HALTED</span>` : ""}</span>
            <span class="mkt-fullname">${s.name}</span>
          </span>
          <span class="mkt-header-right">
            ${timeframeButtons(this.res)}
            <button class="lp-close mkt-close">✕</button>
          </span>
        </div>
        <div class="mkt-statbar">
          <div class="mkt-stat mkt-stat-px"><span>Price</span>
            <b class="${chg === null ? "" : chg >= 0 ? "mkt-up" : "mkt-down"}">${s.last !== null ? fmtPrice(s.last) : "—"}</b>
            ${chgTag(chg)}
          </div>
          ${stat("Volume", day.vol > 0 ? fmtCap(Math.round(day.vol)) : "—")}
          ${stat("Mkt cap", s.marketCap !== null ? fmtCap(s.marketCap) : "—")}
          ${stat("Dividend", yieldTxt, s.dps > 0 ? "mkt-up" : "")}
          ${held > 0 ? stat("Position", `${held.toLocaleString()} sh`, "mkt-gold") : ""}
        </div>
        <canvas class="ex-chart"></canvas>
        ${tabStrip([{ key: "trade", label: "Trade" }, { key: "about", label: "Company" }], this.detailTab)}
        <div class="mkt-cols" ${this.detailTab === "trade" ? "" : 'style="display:none"'}>
          <div class="mkt-col mkt-trade-col">
            <div class="mkt-sides">
              <button class="mkt-side ${this.side === "buy" ? "mkt-side-buy" : ""}" data-side="buy">Buy</button>
              <button class="mkt-side ${this.side === "sell" ? "mkt-side-sell" : ""}" data-side="sell">Sell</button>
            </div>
            <div class="mkt-modes">
              <button class="gd-btn mkt-mode ${this.mode === "market" ? "active" : ""}" data-mode="market">Market</button>
              <button class="gd-btn mkt-mode ${this.mode === "limit" ? "active" : ""}" data-mode="limit">Limit</button>
            </div>
            <div class="mkt-ticket">
              <input class="lp-input mkt-qty" type="number" min="1" placeholder="shares" value="100" />
              ${this.mode === "limit" ? `<input class="lp-input mkt-limitpx" type="number" min="0.01" step="0.01" placeholder="price" value="${((this.side === "buy" ? d.bids?.[0]?.price : d.asks?.[0]?.price) ?? s.last ?? 1).toFixed(2)}" />` : ""}
            </div>
            <div class="mkt-quote"></div>
            <button class="btn-primary mkt-place"></button>
            ${myOrders.length ? `<div class="mkt-section">Your orders</div>${mineHtml}` : ""}
          </div>
          <div class="mkt-col">
            <div class="mkt-section">Order book</div>
            <div class="tt-book">${bookLadder(d.bids ?? [], d.asks ?? [])}</div>
          </div>
        </div>
        <div class="mkt-cols" ${this.detailTab === "about" ? "" : 'style="display:none"'}>
          <div class="mkt-col">
            <div class="mkt-section">${meta.sector} · what they do</div>
            <div class="tt-desc">${meta.desc || "A listed company operating in the city."}</div>
            <div class="mkt-section">Share structure</div>
            <div class="gd-row"><span>Shares outstanding</span><b>${s.shares.toLocaleString()}</b></div>
            <div class="gd-row"><span>Float (tradable)</span><b>${s.floatShares.toLocaleString()} · ${((s.floatShares / s.shares) * 100).toFixed(0)}%</b></div>
            <div class="gd-row"><span>Insider held</span><b>${(s.shares - s.floatShares).toLocaleString()}</b></div>
            ${s.prevClose !== null ? `<div class="gd-row"><span>Daily band (±30%)</span><b>${fmtPrice(s.prevClose * 0.7)} – ${fmtPrice(s.prevClose * 1.3)}</b></div>` : ""}
          </div>
          <div class="mkt-col">
            <div class="mkt-section">Fundamentals — from the public books</div>
            <div class="gd-row"><span>P/E</span><b>${pe}</b></div>
            <div class="gd-row"><span>EPS / year</span><b>${epsTxt}</b></div>
            ${bookPerShare !== null ? `<div class="gd-row"><span>Book value / share</span><b>${fmtPrice(bookPerShare)}</b></div>` : ""}
            <div class="gd-row"><span>Revenue / day</span><b>${fmtMoney(revDay)}</b></div>
            <div class="gd-row"><span>Operating costs / day</span><b>${fmtMoney(costDay)}</b></div>
            <div class="gd-row"><span>Operating profit / day</span><b class="${revDay - costDay >= 0 ? "mkt-up" : "mkt-down"}">${fmtMoney(revDay - costDay)}</b></div>
            <div class="gd-row"><span>Cash</span><b>${fin ? fmtMoney(fin.cash ?? 0) : "—"}</b></div>
            <div class="gd-row"><span>Assets</span><b>${fin ? fmtMoney(landValue + (fin.inventoryValue ?? 0)) : "—"}</b></div>
            <div class="mkt-section">Shareholder returns</div>
            <div class="gd-row"><span>Dividend yield</span><b>${
              s.dps > 0 && s.last
                ? `${((s.dps * 52) / s.last * 100).toFixed(1)}%`
                : s.dividendRatio > 0
                  ? `${(s.dividendRatio * 100).toFixed(1)}%`
                  : "none"
            }</b></div>
          </div>
        </div>
      </div>`;

    const cv = this.el.querySelector<HTMLCanvasElement>(".ex-chart");
    if (cv) drawCandles(cv, history, { bucketMs: timeframeMs(this.res), key: `s:${company}:${this.res}` });

    wireTabs(this.el, (k) => {
      this.detailTab = k as "trade" | "about";
      void this.refresh();
    });
    this.el.querySelector(".mkt-close")?.addEventListener("click", () => this.close());
    this.el.querySelector(".mkt-back")?.addEventListener("click", () => {
      this.view = "list";
      void this.refresh();
    });
    this.el.querySelectorAll<HTMLElement>(".mkt-res").forEach((b) =>
      b.addEventListener("click", () => {
        this.res = b.dataset.res!;
        void this.refresh();
      })
    );
    this.el.querySelectorAll<HTMLElement>(".mkt-side").forEach((b) =>
      b.addEventListener("click", () => {
        this.side = b.dataset.side as "buy" | "sell";
        void this.refresh();
      })
    );
    this.el.querySelectorAll<HTMLElement>(".mkt-mode").forEach((b) =>
      b.addEventListener("click", () => {
        this.mode = b.dataset.mode as "market" | "limit";
        void this.refresh();
      })
    );
    this.el.querySelectorAll<HTMLElement>(".mkt-cancel").forEach((b) =>
      b.addEventListener("click", () => this.actions.cancel(Number(b.dataset.id)))
    );
    const qtyEl = this.el.querySelector<HTMLInputElement>(".mkt-qty")!;
    const pxEl = this.el.querySelector<HTMLInputElement>(".mkt-limitpx");
    const quoteEl = this.el.querySelector<HTMLElement>(".mkt-quote")!;
    const placeBtn = this.el.querySelector<HTMLButtonElement>(".mkt-place")!;
    const upd = () => {
      const q = Math.floor(Number(qtyEl.value));
      placeBtn.textContent = `${this.side === "buy" ? "Buy" : "Sell"}${q > 0 ? ` ${q.toLocaleString()}` : ""} ${meta.sym}`;
      if (this.mode === "limit") {
        // your price, your order: it rests on the book until someone meets it
        const p = Number(pxEl?.value);
        quoteEl.innerHTML =
          q > 0 && p > 0
            ? `<span>Total</span><b>${fmtPrice(q * p)}</b><span class="mkt-warn">rests on the book at your price — cancel any time under Your orders</span>`
            : `<span class="mkt-empty">Set quantity and price</span>`;
        placeBtn.disabled = !(q > 0 && p > 0);
        return;
      }
      const levels = this.side === "buy" ? d.asks : d.bids;
      const est = estimateFill(levels, Math.max(0, q));
      if (q <= 0 || !levels.length) {
        quoteEl.innerHTML = levels.length
          ? `<span>Price</span><b>${fmtPrice(levels[0].price)}</b>`
          : `<span class="mkt-empty">No ${this.side === "buy" ? "sellers" : "buyers"} right now</span>`;
        placeBtn.disabled = !levels.length;
        return;
      }
      quoteEl.innerHTML = `<span>Avg price</span><b>${est.avg !== null ? fmtPrice(est.avg) : "—"}</b>
        <span>Total</span><b>${fmtPrice(est.total)}</b>
        ${q > est.available ? `<span class="mkt-warn">only ${est.available.toLocaleString()} available</span>` : ""}`;
      placeBtn.disabled = Math.min(q, est.available) <= 0;
    };
    qtyEl.addEventListener("input", upd);
    pxEl?.addEventListener("input", upd);
    upd();
    placeBtn.addEventListener("click", () => {
      const q = Math.floor(Number(qtyEl.value));
      if (q <= 0) return;
      if (this.mode === "limit") {
        const p = Number(pxEl?.value);
        if (p > 0) this.actions.trade(company, this.side, q, Math.round(p * 100) / 100);
      } else this.actions.trade(company, this.side, q);
    });
  }
}
