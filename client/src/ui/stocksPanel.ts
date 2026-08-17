import { SERVER_URL, fmtMoney, fmtCap } from "../config.js";
import { drawCandles, fmtPrice, Candle, timeframeButtons, timeframeMs } from "./chart.js";
import { tabStrip, wireTabs } from "./panelTabs.js";

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
  trade(company: number, side: "buy" | "sell", qty: number): void;
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

// The stock market terminal: listed companies only (the coin has its own
// page). Directory → per-company workstation with chart, depth, ticket and
// fundamentals from the public books.
export class StocksPanel {
  private el: HTMLElement;
  private view: "list" | "detail" | "portfolio" = "list";
  private company: number | null = null;
  private res = "5m";
  private side: "buy" | "sell" = "buy";
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
            <span class="mkt-name">${r.name}<span class="mkt-sub">${r.shares.toLocaleString()} @ ${fmtPrice(r.avgCost)}</span></span>
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
    for (const s of rows) {
      const held = heldBy.get(s.company) ?? 0;
      listHtml += `<div class="mkt-row" data-c="${s.company}">
          <span class="mkt-name">${s.name}
            ${s.halted ? `<span class="mkt-halt">HALT</span>` : ""}
            ${held > 0 ? `<span class="mkt-sub">${held.toLocaleString()} held</span>` : ""}</span>
          <b class="mkt-px">${s.last !== null ? fmtPrice(s.last) : "—"}</b>
          ${chgTag(chgPct(s.last, s.prevClose))}
          <span class="mkt-dim">${s.marketCap !== null ? fmtCap(s.marketCap) : ""}</span>
          <span class="mkt-dim">${
            s.dps > 0 && s.last ? `${((s.dps * 52) / s.last * 100).toFixed(1)}%` : s.dividendRatio > 0 ? `${(s.dividendRatio * 100).toFixed(1)}%` : ""
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
    const [rows, d, history, mine, fin] = await Promise.all([
      fetch(`${SERVER_URL}/stocks`).then((r) => r.json()).catch(() => []) as Promise<StockRow[]>,
      fetch(`${SERVER_URL}/stocks/${company}`).then((r) => r.json()).catch(() => null),
      fetch(`${SERVER_URL}/market/candles?type=stock&key=s:${company}&res=${this.res}`).then((r) => r.json()).catch(() => []) as Promise<Candle[]>,
      fetch(`${SERVER_URL}/holdings/${this.selfEid}`).then((r) => r.json()).catch(() => ({ holdings: [], orders: [] })),
      fetch(`${SERVER_URL}/company/${company}/financials`).then((r) => r.json()).catch(() => null),
    ]);
    if (!this.visible || this.company !== company) return;
    const s = rows.find((x) => x.company === company);
    if (!s || !d) return;

    // trailing profit from the public books -> EPS -> P/E
    let pe = "—";
    if (fin?.days?.length && s.last !== null) {
      let profit = 0;
      for (const day of fin.days.slice(0, 7)) {
        for (const [k, v] of Object.entries(day.inflow as Record<string, number>))
          if (!["transfer", "ipo", "dividend"].includes(k)) profit += v;
        for (const [k, v] of Object.entries(day.outflow as Record<string, number>))
          if (!["transfer", "ipo", "dividend"].includes(k)) profit -= v;
      }
      const eps = ((profit / 7) * 365) / s.shares;
      if (eps > 0) pe = (s.last / eps).toFixed(1);
    }

    const held = (mine.holdings ?? []).find((h: { company: number }) => h.company === company)?.shares ?? 0;
    const myOrders = ((mine.orders ?? []) as Array<{ id: number; side: string; company: number; qty: number; price: number }>).filter(
      (o) => o.company === company
    );
    const chg = chgPct(s.last, s.prevClose);
    const divYield =
      s.dps > 0
        ? `${s.last ? `${((s.dps * 52) / s.last * 100).toFixed(1)}%/yr · ` : ""}$${
            s.dps < 0.01 ? s.dps.toFixed(4) : s.dps.toFixed(2)
          }/sh weekly · pays in ${s.payInDays}d`
        : s.dividendRatio > 0
          ? `${(s.dividendRatio * 100).toFixed(1)}%/yr target — first payment pending`
          : "none — growth company";

    const tape = (d.trades as Array<{ price: number; qty: number; ts: number }>)
      .slice(0, 12)
      .map(
        (t) => `<div class="mkt-tape"><span class="mkt-dim">${new Date(t.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <span>${fmtPrice(t.price)}</span><b>${t.qty.toLocaleString()}</b></div>`
      )
      .join("");

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

    const stat = (label: string, value: string) =>
      `<div class="mkt-stat"><span>${label}</span><b>${value}</b></div>`;

    this.el.innerHTML = `
      <div class="ex-detail">
        <div class="mkt-header">
          <button class="gd-btn mkt-back">‹ Listings</button>
          <span class="mkt-title">${s.name}</span>
          <b class="mkt-bigpx">${s.last !== null ? fmtPrice(s.last) : "—"}</b>
          ${chgTag(chg)}
          ${s.halted ? `<span class="mkt-halt">HALTED</span>` : ""}
          <span class="mkt-header-right">
            ${timeframeButtons(this.res)}
            <button class="lp-close mkt-close">✕</button>
          </span>
        </div>
        <div class="mkt-statbar">
          ${stat("Market cap", s.marketCap !== null ? fmtCap(s.marketCap) : "—")}
          ${stat("Shares", s.shares.toLocaleString())}
          ${stat("Float", s.floatShares.toLocaleString())}
          ${stat("Prev close", s.prevClose !== null ? fmtPrice(s.prevClose) : "—")}
          ${stat("P/E", pe)}
          ${stat("Dividend", s.dividendRatio > 0 ? `${(s.dividendRatio * 100).toFixed(1)}%` : "none")}
          ${held > 0 ? stat("You hold", held.toLocaleString()) : ""}
        </div>
        <canvas class="ex-chart"></canvas>
        ${tabStrip([{ key: "trade", label: "Trade" }, { key: "about", label: "Company" }], this.detailTab)}
        <div class="mkt-cols" ${this.detailTab === "trade" ? "" : 'style="display:none"'}>
          <div class="mkt-col mkt-trade-col">
            <div class="mkt-section">Trade</div>
            <div class="mkt-sides">
              <button class="mkt-side ${this.side === "buy" ? "mkt-side-buy" : ""}" data-side="buy">Buy</button>
              <button class="mkt-side ${this.side === "sell" ? "mkt-side-sell" : ""}" data-side="sell">Sell</button>
            </div>
            <div class="mkt-ticket">
              <input class="lp-input mkt-qty" type="number" min="1" placeholder="shares" value="100" />
            </div>
            <div class="mkt-quote"></div>
            <button class="btn-primary mkt-place"></button>
            <div class="mkt-note">Executes instantly at the market price.</div>
            ${myOrders.length ? `<div class="mkt-section">Your orders</div>${mineHtml}` : ""}
          </div>
          <div class="mkt-col">
            <div class="mkt-section">Tape</div>
            ${tape || `<div class="mkt-empty">No trades yet</div>`}
          </div>
        </div>
        <div class="mkt-cols" ${this.detailTab === "about" ? "" : 'style="display:none"'}>
          <div class="mkt-col">
            <div class="mkt-section">The business</div>
            <div class="gd-row"><span>Shares outstanding</span><b>${s.shares.toLocaleString()}</b></div>
            <div class="gd-row"><span>Float (tradable)</span><b>${s.floatShares.toLocaleString()}</b></div>
            <div class="gd-row"><span>Insider held</span><b>${(s.shares - s.floatShares).toLocaleString()}</b></div>
            <div class="gd-row"><span>Market cap</span><b>${s.marketCap !== null ? fmtCap(s.marketCap) : "—"}</b></div>
            <div class="gd-row"><span>P/E (7d annualised)</span><b>${pe}</b></div>
            <div class="mkt-note">Price follows the business: assets and trailing earnings set fair value, and the market trades around it.</div>
          </div>
          <div class="mkt-col">
            <div class="mkt-section">Shareholder returns</div>
            <div class="gd-row"><span>Dividend policy</span><b>${divYield}</b></div>
            <div class="gd-row"><span>Previous close</span><b>${s.prevClose !== null ? fmtPrice(s.prevClose) : "—"}</b></div>
            <div class="gd-row"><span>Your position</span><b>${held.toLocaleString()} shares</b></div>
            ${s.prevClose !== null ? `<div class="gd-row"><span>Daily band</span><b>${fmtPrice(s.prevClose * 0.7)} – ${fmtPrice(s.prevClose * 1.3)}</b></div>` : ""}
            <div class="mkt-note">Dividends are paid from real daily profit; growth companies pay none and reinvest instead.</div>
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
    this.el.querySelectorAll<HTMLElement>(".mkt-cancel").forEach((b) =>
      b.addEventListener("click", () => this.actions.cancel(Number(b.dataset.id)))
    );
    const qtyEl = this.el.querySelector<HTMLInputElement>(".mkt-qty")!;
    const quoteEl = this.el.querySelector<HTMLElement>(".mkt-quote")!;
    const placeBtn = this.el.querySelector<HTMLButtonElement>(".mkt-place")!;
    const upd = () => {
      const q = Math.floor(Number(qtyEl.value));
      const levels = this.side === "buy" ? d.asks : d.bids;
      const est = estimateFill(levels, Math.max(0, q));
      placeBtn.textContent = `${this.side === "buy" ? "Buy" : "Sell"}${q > 0 ? ` ${q.toLocaleString()}` : ""} shares`;
      if (q <= 0 || !levels.length) {
        quoteEl.innerHTML = levels.length
          ? `<span>Price</span><b>${fmtPrice(levels[0].price)}</b>`
          : `<span class="mkt-empty">No ${this.side === "buy" ? "sellers" : "buyers"} right now</span>`;
        placeBtn.disabled = !levels.length;
        return;
      }
      quoteEl.innerHTML = `<span>Price</span><b>${est.avg !== null ? fmtPrice(est.avg) : "—"}</b>
        <span>Total</span><b>${fmtPrice(est.total)}</b>
        ${q > est.available ? `<span class="mkt-warn">only ${est.available.toLocaleString()} available</span>` : ""}`;
      placeBtn.disabled = Math.min(q, est.available) <= 0;
    };
    qtyEl.addEventListener("input", upd);
    upd();
    placeBtn.addEventListener("click", () => {
      const q = Math.floor(Number(qtyEl.value));
      if (q > 0) this.actions.trade(company, this.side, q);
    });
  }
}
