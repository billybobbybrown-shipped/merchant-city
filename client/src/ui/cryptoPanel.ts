import { SERVER_URL, fmtMoney, fmtCap } from "../config.js";
import { drawCandles, fmtPrice, Candle, timeframeButtons, timeframeMs } from "./chart.js";
import { estimateFill, bookLadder, windowStats } from "./stocksPanel.js";
import { tabStrip, wireTabs } from "./panelTabs.js";
import { coinIcon, ic } from "./icons.js";
import { COIN_DESC } from "./marketMeta.js";

interface CoinData {
  bids: Array<{ price: number; qty: number }>;
  asks: Array<{ price: number; qty: number }>;
  trades: Array<{ price: number; qty: number; ts: number }>;
  stats: {
    code: string;
    name: string;
    symbol: string;
    maxSupply: number;
    mined: number;
    circulating: number;
    dailyEmission: number;
    worldHash: number;
    miners: number;
    lastPrice: number | null;
  };
}

interface CoinStats {
  code: string;
  name: string;
  symbol: string;
  maxSupply: number;
  mined: number;
  circulating: number;
  dailyEmission: number;
  worldHash: number;
  miners: number;
  lastPrice: number | null;
  prevClose: number | null;
}

interface Wallet {
  balance: number;
  orders: Array<{ id: number; side: string; qty: number; price: number }>;
  myHash: number;
  hashShare: number;
}

interface CryptoActions {
  trade(side: "buy" | "sell", qty: number, coin: string, price?: number): void;
  cancel(orderId: number): void;
}

// The crypto page: the coin's market and the mining network, in one place.
export class CryptoPanel {
  private el: HTMLElement;
  private res = "5m";
  private side: "buy" | "sell" = "buy";
  private mode: "market" | "limit" = "market";
  private tab: "market" | "mining" = "market";
  // the page opens on the listings; a coin's own market is a click away
  private view: "list" | "detail" | "portfolio" = "list";
  private coinCode = "duc";
  private coins: CoinStats[] = [];

  constructor(
    ui: HTMLElement,
    private selfEid: string,
    private actions: CryptoActions
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
    if (this.view === "list") return this.renderList();
    const c = this.coinCode;
    const [coin, history, oneMin, wallet, coins] = await Promise.all([
      fetch(`${SERVER_URL}/coin?c=${c}`).then((r) => r.json()).catch(() => null) as Promise<CoinData | null>,
      fetch(`${SERVER_URL}/market/candles?type=coin&key=${c}&res=${this.res}`).then((r) => r.json()).catch(() => []) as Promise<Candle[]>,
      fetch(`${SERVER_URL}/market/candles?type=coin&key=${c}&res=1m`).then((r) => r.json()).catch(() => []) as Promise<Candle[]>,
      fetch(`${SERVER_URL}/coin/balance/${this.selfEid}?c=${c}`).then((r) => r.json()).catch(() => null) as Promise<Wallet | null>,
      fetch(`${SERVER_URL}/coins`).then((r) => r.json()).catch(() => []) as Promise<CoinStats[]>,
    ]);
    this.coins = coins ?? [];
    if (!this.visible || !coin) return;
    this.render(coin, history, oneMin, wallet ?? { balance: 0, orders: [], myHash: 0, hashShare: 0 });
  }

  // ---------- portfolio ----------
  // What you hold, what it cost, and what it has made you. Mined coins arrive
  // free, so they pull the average cost down rather than counting as a purchase.

  private async renderPortfolio() {
    const p: {
      rows: Array<{
        code: string;
        name: string;
        held: number;
        mined: number;
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
    } = (await fetch(`${SERVER_URL}/coin/portfolio/${this.selfEid}`)
      .then((r) => r.json())
      .catch(() => null)) ?? { rows: [], value: 0, cost: 0, unrealised: 0, realised: 0 };
    if (!this.visible || this.view !== "portfolio") return;

    const pnl = (n: number) =>
      `<b class="${n > 0 ? "mkt-up" : n < 0 ? "mkt-down" : ""}">${n > 0 ? "+" : ""}${fmtMoney(n)}</b>`;
    const pct = (n: number, base: number) =>
      base > 0 ? `<span class="mkt-dim">${n >= 0 ? "+" : ""}${((n / base) * 100).toFixed(1)}%</span>` : "";

    const rows = p.rows
      .slice()
      .sort((a, b) => b.value - a.value)
      .map(
        (r) => `<div class="mkt-row pf-row" data-c="${r.code}">
            <span class="mkt-name">${ic(coinIcon(r.code), 20)} <span class="mkt-symtag">${r.code.toUpperCase()}</span>${r.name}
              <span class="mkt-sub">${r.held.toLocaleString()} @ ${fmtPrice(r.avgCost)}${
                r.mined > 0 ? ` · ${r.mined.toLocaleString()} mined` : ""
              }</span></span>
            <b class="mkt-px">${fmtPrice(r.price)}</b>
            <span class="mkt-dim">${fmtMoney(r.value)}</span>
            ${pnl(r.unrealised)}
            ${pct(r.unrealised, r.value - r.unrealised)}
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
                 <span>Coin</span><b class="mkt-px">Last</b>
                 <span class="mkt-dim">Value</span><span>Open P&L</span><span class="mkt-dim"></span>
               </div>
               <div class="mkt-list">${rows}</div>`
            : `<div class="mkt-empty">You don't hold any coin yet — buy on the market or point a rig at one</div>`
        }
      </div>`;

    this.el.querySelector(".mkt-close")?.addEventListener("click", () => this.close());
    this.el.querySelector(".mkt-back")?.addEventListener("click", () => {
      this.view = "list";
      void this.refresh();
    });
    this.el.querySelectorAll<HTMLElement>(".pf-row").forEach((r) =>
      r.addEventListener("click", () => {
        this.coinCode = r.dataset.c!;
        this.view = "detail";
        this.tab = "market";
        void this.refresh();
      })
    );
  }

  // ---------- listings ----------

  private async renderList() {
    const [coins, wallet] = await Promise.all([
      fetch(`${SERVER_URL}/coins`).then((r) => r.json()).catch(() => []) as Promise<CoinStats[]>,
      fetch(`${SERVER_URL}/coin/balance/${this.selfEid}`).then((r) => r.json()).catch(() => null) as Promise<
        (Wallet & { balances?: Record<string, number> }) | null
      >,
    ]);
    if (!this.visible || this.view !== "list") return;
    this.coins = coins ?? [];
    const held = wallet?.balances ?? {};
    const orders = wallet?.orders ?? [];

    let value = 0;
    for (const c of this.coins) value += (held[c.code] ?? 0) * (c.lastPrice ?? 0);

    const rows = this.coins
      .map((c) => {
        const chg =
          c.lastPrice !== null && c.prevClose !== null && c.prevClose > 0
            ? ((c.lastPrice - c.prevClose) / c.prevClose) * 100
            : null;
        const chgHtml =
          chg === null
            ? `<span class="mkt-chg mkt-flat">—</span>`
            : `<span class="mkt-chg ${chg >= 0 ? "mkt-up" : "mkt-down"}">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(1)}%</span>`;
        const mine = held[c.code] ?? 0;
        return `<div class="mkt-row" data-c="${c.code}">
            <span class="mkt-name">${ic(coinIcon(c.code), 20)} <span class="mkt-symtag">${c.code.toUpperCase()}</span>${c.name}
              ${mine > 0 ? `<span class="mkt-sub">${mine.toLocaleString()} held</span>` : ""}</span>
            <b class="mkt-px">${c.lastPrice !== null ? fmtPrice(c.lastPrice) : "—"}</b>
            ${chgHtml}
            <span class="mkt-dim">${c.lastPrice !== null ? fmtCap(c.lastPrice * c.mined) : ""}</span>
            <span class="mkt-dim">${c.miners} mining</span>
          </div>`;
      })
      .join("");

    const byCode = new Map(this.coins.map((c) => [c.code, c]));
    const ordersHtml = orders.length
      ? `<div class="mkt-section">Your open orders</div>` +
        orders
          .map(
            (o) => `<div class="mkt-order">
              <span class="${o.side === "buy" ? "mkt-up" : "mkt-down"}">${o.side.toUpperCase()}</span>
              <span>${o.qty.toLocaleString()} ${byCode.get((o as { item?: string }).item ?? "")?.name ?? ""} @ ${fmtPrice(o.price)}</span>
              <button class="gd-btn mkt-cancel" data-id="${o.id}">✕</button></div>`
          )
          .join("")
      : "";

    this.el.innerHTML = `
      <div class="ex-detail">
        <div class="mkt-header">
          <span class="mkt-title">Crypto Market</span>
          <button class="gd-btn mkt-toport">Portfolio${value > 0 ? ` <b>${fmtMoney(value)}</b>` : ""}</button>
          <button class="lp-close mkt-close">✕</button>
        </div>
        <div class="mkt-row mkt-head-row">
          <span>Coin</span><b class="mkt-px">Last</b><span class="mkt-chg">Day</span>
          <span class="mkt-dim">Market cap</span><span class="mkt-dim">Network</span>
        </div>
        <div class="mkt-list">${rows}</div>
        ${ordersHtml}
      </div>`;

    this.el.querySelector(".mkt-close")?.addEventListener("click", () => this.close());
    this.el.querySelectorAll<HTMLElement>(".mkt-row[data-c]").forEach((r) =>
      r.addEventListener("click", () => {
        this.coinCode = r.dataset.c!;
        this.view = "detail";
        this.tab = "market";
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

  private render(coin: CoinData, history: Candle[], oneMin: Candle[], wallet: Wallet) {
    const st = coin.stats;
    // gain/loss and volume over the chart's own timeframe
    const day = windowStats(oneMin, timeframeMs(this.res));
    let chgTxt = `<span class="mkt-chg mkt-flat">—</span>`;
    let chgUp = true;
    if (st.lastPrice !== null && day.ref !== null && day.ref > 0) {
      const chg = ((st.lastPrice - day.ref) / day.ref) * 100;
      chgUp = chg >= 0;
      chgTxt = `<span class="mkt-chg ${chg >= 0 ? "mkt-up" : "mkt-down"}">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(1)}%</span>`;
    }

    const mineHtml = wallet.orders.length
      ? wallet.orders
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
    const est =
      st.worldHash > 0 && wallet.myHash > 0
        ? (st.dailyEmission * wallet.myHash) / st.worldHash
        : 0;

    this.el.innerHTML = `
      <div class="ex-detail">
        <div class="mkt-header">
          <button class="gd-btn mkt-back">‹</button>
          <span class="mkt-symbox">
            <span class="mkt-symline">${ic(coinIcon(st.code), 18)}<span class="mkt-sym">${st.code.toUpperCase()}</span><span class="mkt-sector">Crypto</span></span>
            <span class="mkt-fullname">${st.name}</span>
          </span>
          <span class="mkt-header-right">
            ${timeframeButtons(this.res)}
            <button class="lp-close mkt-close">✕</button>
          </span>
        </div>
        ${tabStrip([{ key: "market", label: "Market" }, { key: "mining", label: "Mining" }], this.tab)}
        <div class="mkt-statbar">
          ${
            this.tab === "market"
              ? `<div class="mkt-stat mkt-stat-px"><span>Price</span>
                   <b class="${chgUp ? "mkt-up" : "mkt-down"}">${st.lastPrice !== null ? fmtPrice(st.lastPrice) : "—"}</b>
                   ${chgTxt}
                 </div>
                 ${stat("Volume", day.vol > 0 ? fmtCap(Math.round(day.vol)) : "—")}
                 ${stat("Mkt cap", st.lastPrice !== null ? fmtCap(st.lastPrice * st.mined) : "—")}
                 ${stat("Circulating", st.mined.toLocaleString(undefined, { maximumFractionDigits: 0 }))}
                 ${stat("Wallet", `${wallet.balance.toLocaleString()} ${st.symbol}`, wallet.balance > 0 ? "mkt-gold" : "")}
                 ${
                   wallet.balance > 0 && st.lastPrice !== null
                     ? stat("Worth", fmtMoney(wallet.balance * st.lastPrice))
                     : ""
                 }`
              : `${stat("World hash", String(st.worldHash))}
                 ${stat("Miners", String(st.miners))}
                 ${stat("Mined per day", `${st.dailyEmission} ${st.symbol}`)}
                 ${wallet.myHash > 0 ? stat("Your hash", `${wallet.myHash} (${(wallet.hashShare * 100).toFixed(1)}%)`) : ""}
                 ${est > 0 ? stat("Est. income", `~${est.toFixed(1)} ${st.symbol}/day`) : ""}`
          }
        </div>
        <canvas class="ex-chart" ${this.tab === "market" ? "" : 'style="display:none"'}></canvas>
        <div class="mkt-cols" ${this.tab === "market" ? "" : 'style="display:none"'}>
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
              <input class="lp-input mkt-qty" type="number" min="1" placeholder="coins" value="10" />
              ${this.mode === "limit" ? `<input class="lp-input mkt-limitpx" type="number" min="0.0001" step="0.0001" placeholder="price" value="${((this.side === "buy" ? coin.bids?.[0]?.price : coin.asks?.[0]?.price) ?? st.lastPrice ?? 1).toFixed(4)}" />` : ""}
            </div>
            <div class="mkt-quote"></div>
            <button class="btn-primary mkt-place"></button>
            ${wallet.orders.length ? `<div class="mkt-section">Your orders</div>${mineHtml}` : ""}
          </div>
          <div class="mkt-col">
            <div class="mkt-section">Order book</div>
            <div class="tt-book">${bookLadder(coin.bids ?? [], coin.asks ?? [])}</div>
            <div class="mkt-section">About ${st.name}</div>
            <div class="tt-desc">${COIN_DESC[st.code] ?? ""}</div>
          </div>
        </div>
        <div class="mkt-cols" ${this.tab === "mining" ? "" : 'style="display:none"'}>
          <div class="mkt-col">
            <div class="mkt-section">Your operation</div>
            <div class="gd-row"><span>Hashpower</span><b>${wallet.myHash || 0}</b></div>
            <div class="gd-row"><span>Network share</span><b>${(wallet.hashShare * 100).toFixed(1)}%</b></div>
            <div class="gd-row"><span>Estimated income</span><b>${est > 0 ? `~${est.toFixed(1)} ${st.symbol}/day` : "—"}</b></div>
            <div class="gd-row"><span>Wallet</span><b>${wallet.balance.toLocaleString()} ${st.symbol}</b></div>
          </div>
          <div class="mkt-col">
            <div class="mkt-section">The network</div>
            <div class="gd-row"><span>Total supply</span><b>${st.maxSupply.toLocaleString()}</b></div>
            <div class="gd-row"><span>In circulation</span><b>${st.mined.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>
            <div class="gd-row"><span>Left to mine</span><b>${(st.maxSupply - st.mined).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>
            <div class="gd-row"><span>World hashpower</span><b>${st.worldHash}</b></div>
            <div class="gd-row"><span>Active miners</span><b>${st.miners}</b></div>
            <div class="mkt-note">${st.name} is mined with racks: craft or buy components (CPU→ASIC, PSUs, cooling), install them in a placed mining rack, and earn a share of each day's new coins by hashpower. Total supply is capped at ${st.maxSupply.toLocaleString()} ${st.symbol}; what has been mined is what is in circulation. ${st.name} can't directly buy land, buildings, stocks or permits — cash out here.</div>
          </div>
        </div>
      </div>`;

    const cv = this.el.querySelector<HTMLCanvasElement>(".ex-chart");
    if (cv)
      drawCandles(cv, history, {
        bucketMs: timeframeMs(this.res),
        key: `${st.code}:${this.res}`,
        emptyText: `No ${st.name} trades yet`,
      });

    wireTabs(this.el, (k) => {
      this.tab = k as "market" | "mining";
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
      placeBtn.textContent = `${this.side === "buy" ? "Buy" : "Sell"}${q > 0 ? ` ${q.toLocaleString()}` : ""} ${st.symbol}`;
      if (this.mode === "limit") {
        const p = Number(pxEl?.value);
        quoteEl.innerHTML =
          q > 0 && p > 0
            ? `<span>Total</span><b>${fmtPrice(q * p)}</b><span class="mkt-warn">rests on the book at your price — cancel any time under Your orders</span>`
            : `<span class="mkt-empty">Set quantity and price</span>`;
        placeBtn.disabled = !(q > 0 && p > 0);
        return;
      }
      const levels = this.side === "buy" ? coin.asks : coin.bids;
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
        if (p > 0) this.actions.trade(this.side, q, this.coinCode, Math.round(p * 10000) / 10000);
      } else this.actions.trade(this.side, q, this.coinCode);
    });
  }
}
