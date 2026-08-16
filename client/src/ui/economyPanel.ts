import { itemById } from "@mc/shared";
import { SERVER_URL, fmtMoney } from "../config.js";
import { tabStrip, wireTabs } from "./panelTabs.js";
import { ic } from "./icons.js";

interface MacroRow {
  bucket: string;
  gdp: string;
  gdp_sectors: Record<string, number>;
  cpi: string;
  employed: number;
  labor_force: number;
  avg_wage: string | null;
  open_jobs: number;
  population: number;
  housing_occupancy: string | null;
  avg_rent: string | null;
  coin_supply: string;
  coin_emission: string;
  world_hash: string;
}

const SECTOR_LABEL: Record<string, string> = {
  retail_sale: "Retail",
  rent: "Property",
  wage: "Labor",
  construction: "Construction",
  production_setup: "Industry setup",
};

// The public world-economy dashboard: GDP, CPI, employment, housing, the coin
// network, stock indices, and per-commodity supply/demand — every number
// derived from real recorded activity.
export class EconomyPanel {
  private el: HTMLElement;
  private tab: "overview" | "markets" | "goods" = "overview";

  constructor(ui: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "panel economy-panel";
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
  }

  async refresh() {
    this.el.style.display = "block";
    this.el.innerHTML = `<div class="fx-head"><span>The Economy</span><button class="lp-close ec-close">✕</button></div><div class="fx-body">Loading…</div>`;
    this.el.querySelector(".ec-close")?.addEventListener("click", () => this.close());
    const [macro, indices, commodities] = await Promise.all([
      fetch(`${SERVER_URL}/econ/macro?days=30`).then((r) => r.json()).catch(() => []) as Promise<MacroRow[]>,
      fetch(`${SERVER_URL}/econ/indices?days=30`).then((r) => r.json()).catch(() => []),
      fetch(`${SERVER_URL}/econ/commodities`).then((r) => r.json()).catch(() => []),
    ]);
    if (!this.visible) return;
    this.render(macro, indices, commodities);
  }

  private render(
    macro: MacroRow[],
    indices: Array<{ bucket: number; name: string; value: number | null }>,
    commodities: Array<{ item: string; produced: number; consumed: number }>
  ) {
    const cur = macro[macro.length - 1];
    const prev = macro[macro.length - 2];
    let html = "";
    if (this.tab === "overview") {
    if (!cur) {
      html = `<div class="pk-empty">No statistics yet — the first game day is still closing.</div>`;
    } else {
      const growth =
        prev && Number(prev.gdp) > 0
          ? ((Number(cur.gdp) - Number(prev.gdp)) / Number(prev.gdp)) * 100
          : null;
      html += `<div class="gd-cap">Output — per game day</div>
        <div class="gd-row"><span>GDP</span><b>${fmtMoney(Number(cur.gdp))}</b>
          ${growth !== null ? `<b class="${growth >= 0 ? "cp-pos" : "cp-neg"}">${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%</b>` : ""}</div>`;
      const sectors = Object.entries(cur.gdp_sectors).sort((a, b) => b[1] - a[1]);
      const max = sectors.length ? sectors[0][1] : 1;
      for (const [k, v] of sectors)
        html += `<div class="gd-row ec-sector"><span>${SECTOR_LABEL[k] ?? k}</span>
          <div class="ec-bar"><div style="width:${Math.round((v / max) * 100)}%"></div></div>
          <b>${fmtMoney(v)}</b></div>`;

      html += `<div class="gd-cap gd-cap2">Prices &amp; labor</div>
        <div class="gd-row"><span>CPI (base 100)</span><b>${Number(cur.cpi).toFixed(1)}</b>
          ${prev ? `<span class="sp-cap">was ${Number(prev.cpi).toFixed(1)}</span>` : ""}</div>
        <div class="gd-row"><span>Employment</span><b>${cur.employed}/${cur.labor_force}</b>
          <span class="sp-cap">${((cur.employed / Math.max(1, cur.labor_force)) * 100).toFixed(0)}% · ${cur.open_jobs} open jobs</span></div>
        <div class="gd-row"><span>Average wage</span><b>${cur.avg_wage !== null ? fmtMoney(Number(cur.avg_wage)) : "—"}/day</b></div>
        <div class="gd-row"><span>Population</span><b>${cur.population}</b>
          <span class="sp-cap">${cur.housing_occupancy !== null ? `${(Number(cur.housing_occupancy) * 100).toFixed(0)}% housed` : ""}${cur.avg_rent !== null ? ` · rent ~${fmtMoney(Number(cur.avg_rent))}` : ""}</span></div>`;

      html += `<div class="gd-cap gd-cap2">Ducat network</div>
        <div class="gd-row"><span>Supply ${Number(cur.coin_supply).toLocaleString()}</span>
          <span>+${Number(cur.coin_emission)}/day</span>
          <span class="sp-cap">${Number(cur.world_hash)} world hash</span></div>`;
    }
    }

    // indices: latest value + day change per index
    const byName = new Map<string, Array<{ bucket: number; value: number | null }>>();
    for (const r of indices) {
      if (!byName.has(r.name)) byName.set(r.name, []);
      byName.get(r.name)!.push(r);
    }
    if (this.tab === "markets") {
    if (byName.size) {
      html += `<div class="gd-cap">Stock indices</div>`;
      for (const [name, rows] of [...byName.entries()].sort()) {
        const vals = rows.filter((r) => r.value !== null);
        const last = vals[vals.length - 1]?.value ?? null;
        const before = vals[vals.length - 2]?.value ?? null;
        const chg = last !== null && before !== null && before > 0 ? ((last - before) / before) * 100 : null;
        html += `<div class="gd-row"><span style="text-transform:capitalize">${name}</span>
          <b>${last !== null ? last.toFixed(2) : "—"}</b>
          ${chg !== null ? `<b class="${chg >= 0 ? "cp-pos" : "cp-neg"}">${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%</b>` : ""}</div>`;
      }
    } else html += `<div class="pk-empty">No index history yet</div>`;
    }

    const traded = commodities
      .filter((c) => c.produced > 0 || c.consumed > 0)
      .sort((a, b) => b.produced + b.consumed - (a.produced + a.consumed))
      .slice(0, 10);
    if (this.tab === "goods") {
    if (traded.length) {
      html += `<div class="gd-cap">Supply / demand — last game day</div>`;
      for (const c of traded) {
        const balance = c.produced - c.consumed;
        html += `<div class="gd-row">${ic(c.item)}<span>${itemById(c.item)?.label ?? c.item}</span>
          <span class="sp-cap">made ${c.produced} · bought ${c.consumed}</span>
          <b class="${balance >= 0 ? "cp-pos" : "cp-neg"}" title="${balance >= 0 ? "glut" : "shortage"}">${balance >= 0 ? "+" : ""}${balance}</b></div>`;
      }
    } else html += `<div class="pk-empty">No production or sales recorded yet</div>`;
    }

    this.el.innerHTML = `<div class="fx-head"><span>The Economy</span><button class="lp-close ec-close">✕</button></div>
      <div class="fx-body">${tabStrip(
        [
          { key: "overview", label: "Overview" },
          { key: "markets", label: "Markets" },
          { key: "goods", label: "Goods" },
        ],
        this.tab
      )}${html}</div>`;
    wireTabs(this.el, (k) => {
      this.tab = k as "overview" | "markets" | "goods";
      void this.refresh();
    });
    this.el.querySelector(".ec-close")?.addEventListener("click", () => this.close());
  }
}
