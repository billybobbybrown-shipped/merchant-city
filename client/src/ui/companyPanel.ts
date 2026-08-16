import { PERMIT_CATEGORIES } from "@mc/shared";
import { SERVER_URL, fmtMoney } from "../config.js";
import { tabStrip, wireTabs } from "./panelTabs.js";

interface CompanyRow {
  entityId: number;
  name: string;
  founder: number;
  share: number;
  cash: number;
}

interface Financials {
  cash: number;
  lots: Array<{ id: number; value: number }>;
  inventoryValue: number;
  days: Array<{ day: string; inflow: Record<string, number>; outflow: Record<string, number> }>;
}

interface CompanyActions {
  form(name: string): void;
  moveCash(company: number, amount: number): void;
  transferLot(company: number, lotId: number, toCompany: boolean): void;
  buyPermit(entity: number, category: string): void;
  ipo(company: number, shares: number, floatPct: number, price: number): void;
  setDividend(company: number, ratio: number): void;
}

type Page = "overview" | "books" | "permits" | "market";

// Your business holdings. One company is in focus at a time, chosen from the
// picker; its pages sit behind tabs so each screen answers one question:
// what is it worth, how is it trading, what may it produce, can it list.
export class CompanyPanel {
  private el: HTMLElement;
  private selected: number | null = null;
  private page: Page = "overview";
  private registering = false;

  constructor(
    ui: HTMLElement,
    private selfEid: string,
    private actions: CompanyActions,
    private myLots: () => Array<{ id: number; ownerId: string | null; name: string }>
  ) {
    this.el = document.createElement("div");
    this.el.className = "panel company-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  get visible() {
    return this.el.style.display !== "none";
  }

  toggle() {
    if (this.visible) this.close();
    else void this.refresh();
  }

  close() {
    this.el.style.display = "none";
    this.registering = false;
  }

  async refresh() {
    this.el.style.display = "block";
    const rows: CompanyRow[] = await fetch(`${SERVER_URL}/companies/of/${this.selfEid}`)
      .then((r) => r.json())
      .catch(() => []);
    if (!this.visible) return;
    if (this.selected === null || !rows.some((r) => r.entityId === this.selected))
      this.selected = rows[0]?.entityId ?? null;
    this.render(rows);
  }

  // ---------- chrome ----------

  private render(rows: CompanyRow[]) {
    const company = rows.find((r) => r.entityId === this.selected) ?? null;

    const head = `<div class="fx-head">
        <span>Companies</span>
        <span class="cp-head-actions">
          <button class="gd-btn cp-new">${this.registering ? "Cancel" : "+ New company"}</button>
          <button class="lp-close cp-close">✕</button>
        </span>
      </div>`;

    if (this.registering || !company) {
      this.el.innerHTML = `${head}<div class="fx-body">${this.registerForm(rows.length)}</div>`;
      this.wireChrome(rows);
      return;
    }

    const picker =
      rows.length > 1
        ? `<div class="wk-picker">
             <label>Company</label>
             <select class="lp-input cp-select">${rows
               .map(
                 (c) =>
                   `<option value="${c.entityId}" ${c.entityId === this.selected ? "selected" : ""}>${c.name}</option>`
               )
               .join("")}</select>
           </div>`
        : "";

    this.el.innerHTML = `${head}
      <div class="fx-body">
        ${picker}
        <div class="cp-ident">
          <div class="cp-ident-name">${company.name}</div>
          <div class="cp-ident-meta">${Math.round(company.share * 100)}% owned by you · ${fmtMoney(company.cash)} cash</div>
        </div>
        ${tabStrip(
          [
            { key: "overview", label: "Overview" },
            { key: "books", label: "Books" },
            { key: "permits", label: "Permits" },
            { key: "market", label: "Market" },
          ],
          this.page
        )}
        <div class="cp-page"><div class="lp-hint">Loading…</div></div>
      </div>`;

    this.wireChrome(rows);
    wireTabs(this.el, (k) => {
      this.page = k as Page;
      this.render(rows);
    });
    void this.renderPage(company);
  }

  private registerForm(existing: number): string {
    return `<div class="cp-ident">
        <div class="cp-ident-name">${existing ? "Register another company" : "Register a company"}</div>
        <div class="cp-ident-meta">$1,000 registration fee</div>
      </div>
      <div class="cp-group">
        <div class="gd-cap">Company name</div>
        <div class="lp-inline">
          <input class="lp-input cp-name" type="text" maxlength="40" placeholder="e.g. Harborline Trading" />
          <button class="btn-primary cp-form">Register</button>
        </div>
      </div>
      <div class="lp-hint">A company is its own legal entity: it holds cash, owns land and inventory, employs staff from its own purse, and keeps its own books. Once it has real revenue it can list on the stock market.</div>`;
  }

  private wireChrome(rows: CompanyRow[]) {
    this.el.querySelector(".cp-close")?.addEventListener("click", () => this.close());
    this.el.querySelector(".cp-new")?.addEventListener("click", () => {
      this.registering = !this.registering;
      this.render(rows);
    });
    this.el.querySelector<HTMLSelectElement>(".cp-select")?.addEventListener("change", (ev) => {
      this.selected = Number((ev.target as HTMLSelectElement).value);
      this.render(rows);
    });
    this.el.querySelector(".cp-form")?.addEventListener("click", () => {
      const name = this.el.querySelector<HTMLInputElement>(".cp-name")?.value.trim();
      if (name) {
        this.registering = false;
        this.actions.form(name);
      }
    });
  }

  // ---------- pages ----------

  private async renderPage(company: CompanyRow) {
    const host = this.el.querySelector<HTMLElement>(".cp-page");
    if (!host) return;
    if (this.page === "overview") return this.pageOverview(host, company);
    if (this.page === "books") return this.pageBooks(host, company);
    if (this.page === "permits") return this.pagePermits(host, company);
    return this.pageMarket(host, company);
  }

  // move money and property between you and the company
  private async pageOverview(host: HTMLElement, c: CompanyRow) {
    const personal = this.myLots().filter((l) => l.ownerId === this.selfEid);
    const held = this.myLots().filter((l) => l.ownerId === String(c.entityId));

    host.innerHTML = `
      <div class="cp-group">
        <div class="gd-cap">Capital</div>
        <div class="lp-inline">
          <input class="lp-input cp-amt" type="number" min="1" placeholder="amount" />
          <button class="gd-btn cp-dep">Deposit</button>
          <button class="gd-btn cp-wd">Withdraw</button>
        </div>
        <div class="lp-hint">Company cash is separate from yours — it pays its own staff and bills.</div>
      </div>
      <div class="cp-group">
        <div class="gd-cap">Property</div>
        ${
          personal.length
            ? `<div class="cp-sub">Held by you</div>
               <div class="lp-inline"><select class="lp-input cp-lot-in">${personal
                 .map((l) => `<option value="${l.id}">${l.name}</option>`)
                 .join("")}</select><button class="gd-btn cp-move-in">Sign over</button></div>`
            : ""
        }
        ${
          held.length
            ? `<div class="cp-sub">Held by the company</div>
               <div class="lp-inline"><select class="lp-input cp-lot-out">${held
                 .map((l) => `<option value="${l.id}">${l.name}</option>`)
                 .join("")}</select><button class="gd-btn cp-move-out">Take back</button></div>`
            : `<div class="pk-empty">The company holds no property</div>`
        }
        <div class="lp-hint">Signing a lot over puts it on the company's books — it collects the rent and carries the value.</div>
      </div>`;

    const amt = () => Number(host.querySelector<HTMLInputElement>(".cp-amt")?.value);
    host.querySelector(".cp-dep")?.addEventListener("click", () => {
      if (amt() > 0) this.actions.moveCash(c.entityId, amt());
    });
    host.querySelector(".cp-wd")?.addEventListener("click", () => {
      if (amt() > 0) this.actions.moveCash(c.entityId, -amt());
    });
    host.querySelector(".cp-move-in")?.addEventListener("click", () => {
      const lotId = Number(host.querySelector<HTMLSelectElement>(".cp-lot-in")?.value);
      if (Number.isInteger(lotId)) this.actions.transferLot(c.entityId, lotId, true);
    });
    host.querySelector(".cp-move-out")?.addEventListener("click", () => {
      const lotId = Number(host.querySelector<HTMLSelectElement>(".cp-lot-out")?.value);
      if (Number.isInteger(lotId)) this.actions.transferLot(c.entityId, lotId, false);
    });
  }

  // what it owns and what it earns — straight from the ledger
  private async pageBooks(host: HTMLElement, c: CompanyRow) {
    const fin: Financials | null = await fetch(`${SERVER_URL}/company/${c.entityId}/financials`)
      .then((r) => r.json())
      .catch(() => null);
    if (!fin) {
      host.innerHTML = `<div class="pk-empty">No books yet</div>`;
      return;
    }
    const land = fin.lots.reduce((a, l) => a + l.value, 0);
    const assets = fin.cash + land + fin.inventoryValue;

    let html = `<div class="cp-group">
        <div class="gd-cap">Balance sheet</div>
        <div class="gd-row"><span>Cash</span><b>${fmtMoney(fin.cash)}</b></div>
        <div class="gd-row"><span>Property (${fin.lots.length})</span><b>${fmtMoney(land)}</b></div>
        <div class="gd-row"><span>Inventory</span><b>${fmtMoney(fin.inventoryValue)}</b></div>
        <div class="gd-row cp-total"><span>Total assets</span><b>${fmtMoney(assets)}</b></div>
      </div>`;

    html += `<div class="cp-group"><div class="gd-cap">Daily profit &amp; loss</div>`;
    if (!fin.days.length) html += `<div class="pk-empty">No trading days recorded yet</div>`;
    else
      for (const d of fin.days.slice(0, 7)) {
        const rev = Object.values(d.inflow).reduce((a, b) => a + b, 0);
        const exp = Object.values(d.outflow).reduce((a, b) => a + b, 0);
        const net = rev - exp;
        html += `<div class="cp-pl">
            <span class="cp-pl-day">${d.day}</span>
            <span class="cp-pl-rev">+${fmtMoney(rev)}</span>
            <span class="cp-pl-exp">−${fmtMoney(exp)}</span>
            <b class="${net >= 0 ? "cp-pos" : "cp-neg"}">${net >= 0 ? "+" : "−"}${fmtMoney(Math.abs(net))}</b>
          </div>`;
      }
    html += `</div>`;
    host.innerHTML = html;
  }

  // licences held by this company, and separately by you
  private async pagePermits(host: HTMLElement, c: CompanyRow) {
    host.innerHTML = `<div class="cp-group cp-permits-co"><div class="gd-cap">${c.name}</div></div>
      <div class="cp-group cp-permits-me"><div class="gd-cap">You, personally</div></div>
      <div class="lp-hint">One permit covers producing and selling its category for 30 game days. The fee scales with how many machines you run.</div>`;
    await this.permitRows(host.querySelector(".cp-permits-co")!, c.entityId);
    await this.permitRows(host.querySelector(".cp-permits-me")!, Number(this.selfEid));
  }

  private async permitRows(host: HTMLElement, entityId: number) {
    const held: Array<{ category: string; active: boolean }> = await fetch(
      `${SERVER_URL}/permits/of/${entityId}`
    )
      .then((r) => r.json())
      .catch(() => []);
    for (const cat of PERMIT_CATEGORIES) {
      const active = held.some((h) => h.category === cat && h.active);
      const fee = await fetch(`${SERVER_URL}/permits/fee/${entityId}/${cat}`)
        .then((r) => r.json())
        .then((j) => j.fee)
        .catch(() => null);
      const row = document.createElement("div");
      row.className = "gd-row";
      row.innerHTML = `<span class="cp-permit-name">${cat}</span>
        ${active ? `<span class="lp-chip lp-chip-rentc">Active</span>` : ""}
        <button class="gd-btn">${active ? "Renew" : "Buy"}${fee !== null ? ` · ${fmtMoney(fee)}` : ""}</button>`;
      row.querySelector("button")?.addEventListener("click", () => this.actions.buyPermit(entityId, cat));
      host.appendChild(row);
    }
  }

  // listing status: go public, or set what shareholders are paid
  private async pageMarket(host: HTMLElement, c: CompanyRow) {
    const listed: Array<{ company: number; dividendRatio: number; last: number | null; shares: number }> =
      await fetch(`${SERVER_URL}/stocks`).then((r) => r.json()).catch(() => []);
    const stock = listed.find((s) => s.company === c.entityId);

    if (stock) {
      host.innerHTML = `<div class="cp-group">
          <div class="gd-cap">Listed on the exchange</div>
          <div class="gd-row"><span>Share price</span><b>${stock.last !== null ? fmtMoney(stock.last) : "—"}</b></div>
          <div class="gd-row"><span>Shares outstanding</span><b>${stock.shares.toLocaleString()}</b></div>
        </div>
        <div class="cp-group">
          <div class="gd-cap">Dividend policy</div>
          <div class="lp-inline">
            <input class="lp-input cp-divr" type="number" min="0" max="1" step="0.05" value="${stock.dividendRatio}" />
            <button class="gd-btn cp-setdiv">Set payout</button>
          </div>
          <div class="lp-hint">Share of each day's profit paid to shareholders from company cash. Zero makes it a growth company.</div>
        </div>`;
      host.querySelector(".cp-setdiv")?.addEventListener("click", () => {
        const v = Number(host.querySelector<HTMLInputElement>(".cp-divr")?.value);
        if (v >= 0 && v <= 1) this.actions.setDividend(c.entityId, v);
      });
      return;
    }

    host.innerHTML = `<div class="cp-group">
        <div class="gd-cap">Go public</div>
        <div class="cp-ipo-grid">
          <label>Shares<input class="lp-input cp-ipo-sh" type="number" min="1000" placeholder="1000000" /></label>
          <label>Float %<input class="lp-input cp-ipo-fl" type="number" min="25" max="75" placeholder="40" /></label>
          <label>Price<input class="lp-input cp-ipo-px" type="number" min="0.01" step="0.01" placeholder="5.00" /></label>
        </div>
        <button class="btn-primary cp-ipo">List on the exchange</button>
      </div>
      <div class="cp-group">
        <div class="gd-cap">Requirements</div>
        <div class="gd-row"><span>Company age</span><b>7 days</b></div>
        <div class="gd-row"><span>Trailing revenue</span><b>$50,000</b></div>
        <div class="gd-row"><span>Profitable</span><b>last 7 days</b></div>
        <div class="gd-row"><span>Scale</span><b>2 buildings or 5 staff</b></div>
        <div class="gd-row"><span>Audit fee</span><b>${fmtMoney(2500)}</b></div>
        <div class="lp-hint">Your asking price must sit inside a valuation band derived from real tracked earnings.</div>
      </div>`;
    host.querySelector(".cp-ipo")?.addEventListener("click", () => {
      const sh = Number(host.querySelector<HTMLInputElement>(".cp-ipo-sh")?.value);
      const fl = Number(host.querySelector<HTMLInputElement>(".cp-ipo-fl")?.value);
      const px = Number(host.querySelector<HTMLInputElement>(".cp-ipo-px")?.value);
      if (sh > 0 && fl > 0 && px > 0) this.actions.ipo(c.entityId, sh, fl / 100, px);
    });
  }
}
