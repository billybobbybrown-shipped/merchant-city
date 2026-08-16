import { COOLING_CAPACITY, PROCESSOR_HASH, itemById, RAM_CAPACITY } from "@mc/shared";
import { SERVER_URL } from "../config.js";
import { coinIcon, ic } from "./icons.js";
import { tabStrip, wireTabs } from "./panelTabs.js";

interface RackActions {
  install(furnId: number, item: string): void;
  remove(furnId: number, slot: number): void;
  setCoin(furnId: number, coin: string): void;
}

const INSTALLABLE = [
  "cpu_basic",
  "cpu_adv",
  "gpu",
  "asic",
  "psu_unit",
  "cooling_fan",
  "cooling_liquid",
  "ram_ddr4",
  "ram_ddr5",
  "ram_ecc",
];

// what is already in the rack is paged by part type, so a full rack reads as
// four short lists instead of sixteen rows in a heap
const PART_PAGES: Array<{ key: string; label: string; items: string[] }> = [
  { key: "proc", label: "Processors", items: ["cpu_basic", "cpu_adv", "gpu", "asic"] },
  { key: "power", label: "Power", items: ["psu_unit"] },
  { key: "ram", label: "Memory", items: ["ram_ddr4", "ram_ddr5", "ram_ecc"] },
  { key: "cool", label: "Cooling", items: ["cooling_fan", "cooling_liquid"] },
];

// Mining rack management: typed component slots, live hashpower readout,
// per-component wear. Install from building storage or your bag.
export class RackPanel {
  private el: HTMLElement;
  furnId: number | null = null;
  private canManage = false;
  private page: string = "proc";

  constructor(
    ui: HTMLElement,
    private actions: RackActions,
    private stock: (lotId: number) => Promise<Record<string, number>>
  ) {
    this.el = document.createElement("div");
    this.el.className = "panel fixture-panel rack-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  private lotId: number | null = null;

  open(lotId: number, furnId: number, canManage: boolean) {
    this.furnId = furnId;
    this.lotId = lotId;
    this.canManage = canManage;
    this.el.style.display = "block";
    this.el.innerHTML = `<div class="fx-head"><span>Mining Rack</span><button class="lp-close fx-close">✕</button></div><div class="fx-body">Loading…</div>`;
    this.el.querySelector(".fx-close")?.addEventListener("click", () => this.close());
    void this.refresh();
  }

  close() {
    this.el.style.display = "none";
    this.furnId = null;
  }

  async refresh() {
    if (this.furnId === null || this.lotId === null) return;
    const furnId = this.furnId;
    const [rack, onHand] = await Promise.all([
      fetch(`${SERVER_URL}/rack/${furnId}`).then((r) => r.json()),
      this.canManage ? this.stock(this.lotId) : Promise.resolve({}),
    ]);
    if (this.furnId !== furnId) return;
    this.render(rack, onHand);
  }

  private render(
    rack: {
      spec: { proc: number; psu: number; cool: number; ram: number };
      components: Array<{ slot: number; item: string; wear: number }>;
      output: {
        hash: number;
        powered: number;
        cooledCapacity: number;
        memoryCapacity: number;
        perProcessor: Array<{ slot: number; active: boolean; throttled: boolean; starved: boolean }>;
      };
      coin?: string;
      coins?: Array<{ code: string; name: string; symbol: string }>;
    },
    onHand: Record<string, number>
  ) {
    const furnId = this.furnId!;
    const procState = new Map(rack.output.perProcessor.map((p) => [p.slot, p]));
    // which coin this rack's hashpower works for
    let html = "";
    if (rack.coins?.length && this.canManage) {
      html += `<div class="gd-cap">Mining</div><div class="cx-coins rk-coins">${rack.coins
        .map(
          (c) =>
            `<button class="gd-btn cx-coin ${c.code === rack.coin ? "active" : ""}" data-c="${c.code}">${ic(coinIcon(c.code), 16)} ${c.name}</button>`
        )
        .join("")}</div>`;
    }
    const tag = (i: string) =>
      PROCESSOR_HASH[i] !== undefined
        ? `${PROCESSOR_HASH[i]} hash`
        : i === "psu_unit"
          ? "powers 4"
          : COOLING_CAPACITY[i] !== undefined
            ? `cools ${COOLING_CAPACITY[i]}`
            : `feeds ${RAM_CAPACITY[i] ?? 0}`;
    if (this.canManage) {
      const installable = INSTALLABLE.filter((i) => (onHand[i] ?? 0) > 0);
      html += `<div class="gd-cap gd-cap2">Install from storage / bag</div>`;
      html += installable.length
        ? installable
            .map(
              (i) => `<div class="gd-row">${ic(i)}<span>${itemById(i)?.label}</span><b>${onHand[i]}</b>
                <span class="rk-wear">${tag(i)}</span>
                <button class="gd-btn rk-install" data-item="${i}">Install</button></div>`
            )
            .join("")
        : `<div class="pk-empty">No components on hand — craft at an electronics bench or buy on the exchange</div>`;
    }

    html += `<div class="gd-cap gd-cap2">Hashpower <b>${rack.output.hash}</b> · ${rack.output.powered} running · memory for ${rack.output.memoryCapacity} · cooling for ${rack.output.cooledCapacity}</div>`;

    const page = PART_PAGES.find((p) => p.key === this.page) ?? PART_PAGES[0];
    const fitted = rack.components.filter((c) => page.items.includes(c.item));
    html += tabStrip(
      PART_PAGES.map((p) => {
        const n = rack.components.filter((c) => p.items.includes(c.item)).length;
        return { key: p.key, label: n ? `${p.label} ${n}` : p.label };
      }),
      page.key
    );
    if (fitted.length) {
      for (const c of fitted) {
        const st = procState.get(c.slot);
        const status =
          c.wear >= 1
            ? `<b class="cp-neg">DEAD</b>`
            : st
              ? st.active
                ? st.throttled
                  ? `<b class="rk-hot">HOT</b>`
                  : st.starved
                    ? `<b class="rk-hot">NO RAM</b>`
                    : `<b class="cp-pos">OK</b>`
                : `<b class="cp-neg">no power</b>`
              : `<b class="cp-pos">OK</b>`;
        html += `<div class="gd-row">${ic(c.item)}<span>${itemById(c.item)?.label ?? c.item}</span>
          <span class="rk-wear">${Math.round(c.wear * 100)}% worn</span>${status}`;
        if (this.canManage) html += `<button class="gd-btn rk-remove" data-slot="${c.slot}" title="Remove">↩</button>`;
        html += `</div>`;
      }
    } else {
      html += `<div class="pk-empty">No ${page.label.toLowerCase()} fitted</div>`;
    }
    html += `<div class="lp-hint">Slots: ${rack.spec.proc} processors · ${rack.spec.psu} PSU · ${rack.spec.ram} memory · ${rack.spec.cool} cooling. No PSU and nothing runs; an undercooled processor throttles and wears 3× faster, and one with no memory behind it crawls.</div>`;

    this.el.innerHTML = `<div class="fx-head"><span>Mining Rack</span><button class="lp-close fx-close">✕</button></div><div class="fx-body">${html}</div>`;
    this.el.querySelector(".fx-close")?.addEventListener("click", () => this.close());
    wireTabs(this.el, (k) => {
      this.page = k;
      void this.refresh();
    });
    this.el.querySelectorAll<HTMLElement>(".rk-coins .cx-coin").forEach((b) =>
      b.addEventListener("click", () => this.actions.setCoin(furnId, b.dataset.c!))
    );
    this.el.querySelectorAll<HTMLElement>(".rk-install").forEach((b) =>
      b.addEventListener("click", () => this.actions.install(furnId, b.dataset.item!))
    );
    this.el.querySelectorAll<HTMLElement>(".rk-remove").forEach((b) =>
      b.addEventListener("click", () => this.actions.remove(furnId, Number(b.dataset.slot)))
    );
  }
}
