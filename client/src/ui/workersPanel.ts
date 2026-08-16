import { reservationWage, lotName } from "@mc/shared";
import { SERVER_URL, fmtMoney } from "../config.js";
import { tabStrip, wireTabs } from "./panelTabs.js";

interface Worker {
  eid: number;
  name: string;
  wage: number;
  lotId: number | null;
  role: string | null;
  employer: number;
  employerName: string;
}

interface Offer {
  id: number;
  employer: number;
  wage: number;
  slots: number;
  assignLot: number | null;
  assignRole: string | null;
  employerName: string;
}

interface Employer {
  eid: number;
  name: string;
  kind: string;
  cash: number;
}

interface WorkerActions {
  balance(): number;
  hire(employer: number, wage: number, slots: number): void;
  cancelOffer(offerId: number): void;
  assign(npc: number, lotId: number | null, role: string): void;
  unassign(npc: number): void;
  fire(npc: number): void;
}

const ROLES = ["cashier", "stocker", "crafter", "farmer", "miner", "manager", "hauler"];

// Your workforce: hire workers here, then put them on any job at any lot you
// operate — and move them around whenever you like.
export class WorkersPanel {
  private el: HTMLElement;
  private tab: "staff" | "hiring" = "staff";
  // whose payroll you're looking at: your own, or a company you control
  private viewing: number | null = null;

  constructor(
    ui: HTMLElement,
    private selfEid: string,
    private actions: WorkerActions,
    private myLots: () => Array<{ id: number; name: string }>
  ) {
    this.el = document.createElement("div");
    this.el.className = "panel workers-panel";
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
    const data = await fetch(`${SERVER_URL}/workforce/${this.selfEid}`)
      .then((r) => r.json())
      .catch(() => ({ employers: [], workers: [], offers: [] }));
    if (!this.visible) return;
    this.render(data.workers ?? [], data.offers ?? [], data.employers ?? []);
  }

  private render(workers: Worker[], offers: Offer[], employers: Employer[]) {
    const lots = this.myLots();
    const lotLabel = (id: number | null) =>
      id === null ? "" : lots.find((l) => l.id === id)?.name ?? lotName(id);
    const multi = employers.length > 1;

    // which payroll is on screen — default to yourself
    if (this.viewing === null || !employers.some((e) => e.eid === this.viewing))
      this.viewing = employers.find((e) => e.kind === "player")?.eid ?? employers[0]?.eid ?? null;
    const current = employers.find((e) => e.eid === this.viewing) ?? null;
    const staff = workers.filter((w) => w.employer === this.viewing);
    const myOffers = offers.filter((o) => o.employer === this.viewing);

    // the picker: one dropdown that switches the whole panel between you and
    // each company you control
    const picker = multi
      ? `<div class="wk-picker">
           <label>Viewing</label>
           <select class="lp-input wk-view">${employers
             .map(
               (e) =>
                 `<option value="${e.eid}" ${e.eid === this.viewing ? "selected" : ""}>${
                   e.kind === "player" ? "You" : e.name
                 }${workers.filter((w) => w.employer === e.eid).length ? ` · ${workers.filter((w) => w.employer === e.eid).length} staff` : ""}</option>`
             )
             .join("")}</select>
         </div>`
      : "";

    let html = "";
    if (this.tab === "staff") {
      if (!staff.length)
        html += `<div class="pk-empty">${
          current?.kind === "player" ? "You have" : `${current?.name ?? "This company"} has`
        } no staff yet — hire someone on the Hiring page.</div>`;
      for (const w of staff) html += this.workerRow(w, lotLabel, lots);
    } else {
    // ---- hiring page ----
    if (myOffers.length) {
      html += `<div class="gd-cap">Waiting for takers</div>`;
      for (const o of myOffers)
        html += `<div class="gd-row"><span>$${o.wage}/day × ${o.slots}${
          o.assignRole ? ` <span class="mkt-sub">→ ${o.assignRole} @ ${lotLabel(o.assignLot)}</span>` : ""
        }</span>
          <button class="gd-btn wk-canceloffer" data-id="${o.id}">✕</button></div>`;
    }

    else html += `<div class="pk-empty">No offers posted</div>`;
    html += `<div class="gd-cap gd-cap2">Post an offer</div>
      <div class="lp-inline">
        <input class="lp-input wk-wage" type="number" min="1" value="45" title="wage/day" />
        <input class="lp-input wk-slots" type="number" min="1" max="10" value="1" title="how many" />
        <button class="btn-secondary wk-hire">Post offer</button>
      </div>
      <div class="lp-hint">Citizens take offers at $${reservationWage("worker")}+/day ($${reservationWage("saver")}+ for wealthier ones). Hired by <b>${current?.kind === "player" ? "you" : current?.name}</b>, who pays their wage — but you can post them to any lot you control, company-held or personal.</div>`;
    }

    // payroll health up front: what staff cost per day and how long the
    // money lasts — the thing you actually need to know before hiring
    const totalPay = staff.reduce((a, w) => a + w.wage, 0);
    const cash = current ? (current.kind === "player" ? this.actions.balance() : current.cash) : 0;
    const days = totalPay > 0 ? Math.floor(cash / totalPay) : null;
    const tight = days !== null && days < 4;
    const summary = `<div class="pg-summary">
        <div class="pg-stat"><span>Staff</span><b>${staff.length}</b></div>
        <div class="pg-stat"><span>Payroll</span><b>${fmtMoney(totalPay)}/day</b></div>
        <div class="pg-stat"><span>${current?.kind === "player" ? "Your cash" : "Company cash"}</span><b>${fmtMoney(cash)}</b></div>
        ${days !== null ? `<div class="pg-stat"><span>Covers</span><b class="${tight ? "mkt-down" : ""}">${days} day${days === 1 ? "" : "s"}</b></div>` : ""}
      </div>
      ${tight ? `<div class="pg-warn">Payroll runs out in ${days} days — workers quit the day you can't pay them.</div>` : ""}`;

    this.el.innerHTML = `<div class="fx-head"><span>Workforce</span><button class="lp-close wk-close">✕</button></div>
      <div class="fx-body">
        ${tabStrip([{ key: "staff", label: `Staff (${staff.length})` }, { key: "hiring", label: `Hiring${myOffers.length ? ` (${myOffers.length})` : ""}` }], this.tab)}
        ${picker}${summary}${html}
      </div>`;
    wireTabs(this.el, (k) => {
      this.tab = k as "staff" | "hiring";
      void this.refresh();
    });
    this.el.querySelector<HTMLSelectElement>(".wk-view")?.addEventListener("change", (ev) => {
      this.viewing = Number((ev.target as HTMLSelectElement).value);
      this.render(workers, offers, employers);
    });
    this.el.querySelector(".wk-close")?.addEventListener("click", () => this.close());
    this.el.querySelector(".wk-hire")?.addEventListener("click", () => {
      const wage = Number(this.el.querySelector<HTMLInputElement>(".wk-wage")?.value);
      const slots = Number(this.el.querySelector<HTMLInputElement>(".wk-slots")?.value);
      const employer = this.viewing ?? Number(this.selfEid);
      if (wage > 0 && slots > 0) this.actions.hire(employer, wage, Math.floor(slots));
    });
    this.el.querySelectorAll<HTMLElement>(".wk-canceloffer").forEach((b) =>
      b.addEventListener("click", () => this.actions.cancelOffer(Number(b.dataset.id)))
    );
    // choosing from a dropdown IS the instruction — no confirm step
    this.el.querySelectorAll<HTMLElement>(".wk-row").forEach((row) => {
      const npc = Number(row.dataset.npc);
      const roleEl = row.querySelector<HTMLSelectElement>(".wk-role");
      const lotEl = row.querySelector<HTMLSelectElement>(".wk-lot");
      const apply = () => {
        const role = roleEl?.value ?? "";
        if (!role) {
          this.actions.unassign(npc);
          return;
        }
        // a hauler works the whole network; everyone else needs an address
        if (role === "hauler") {
          this.actions.assign(npc, null, role);
          return;
        }
        const raw = lotEl?.value ?? "";
        if (raw === "") return; // waiting on a property
        this.actions.assign(npc, Number(raw), role);
      };
      roleEl?.addEventListener("change", apply);
      lotEl?.addEventListener("change", apply);
      row.querySelector(".wk-fire")?.addEventListener("click", () => this.actions.fire(npc));
    });
  }

  private workerRow(
    w: Worker,
    lotLabel: (id: number | null) => string,
    lots: Array<{ id: number; name: string }>
  ): string {
    const fleet = w.role === "hauler";
    const assigned = w.role !== null && (fleet || w.lotId !== null);
    const where = fleet ? "the fleet" : w.lotId !== null ? lotLabel(w.lotId) : "";
    return `<div class="wk-row" data-npc="${w.eid}">
        <div class="wk-line">
          <b>${w.name}</b><span class="wk-wage">$${w.wage}/day</span>
          <span class="wk-job">${assigned ? `${w.role} · ${where}` : "no job yet"}</span>
        </div>
        <div class="wk-actions">
          <select class="lp-input wk-role">
            <option value="" ${w.role === null ? "selected" : ""}>— pick a job —</option>
            ${ROLES.map((r) => `<option value="${r}" ${r === w.role ? "selected" : ""}>${r}</option>`).join("")}
          </select>
          <select class="lp-input wk-lot" ${fleet ? "disabled" : ""}>
            ${
              fleet
                ? `<option>Whole network</option>`
                : `<option value="" ${w.lotId === null ? "selected" : ""}>— where —</option>` +
                  lots
                    .map((l) => `<option value="${l.id}" ${l.id === w.lotId ? "selected" : ""}>${l.name}</option>`)
                    .join("")
            }
          </select>
          <button class="gd-btn wk-fire" title="Fire">✕</button>
        </div>
      </div>`;
  }
}
