import { SERVER_URL } from "../config.js";
import type { DistrictEntry } from "../game/districts.js";

// Legend for district view: color, name, who controls it. Clicking a row
// jumps the camera to that district.
export class DistrictLegend {
  private el: HTMLElement;
  private control = new Map<number, string | null>();

  constructor(
    ui: HTMLElement,
    private entries: DistrictEntry[],
    private focus: (cx: number, cz: number) => void
  ) {
    this.el = document.createElement("div");
    this.el.className = "panel district-legend";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  async show() {
    try {
      const rows = (await fetch(`${SERVER_URL}/districts`).then((r) => r.json())) as Array<{
        id: number;
        control: string | null;
      }>;
      this.control = new Map(rows.map((r) => [r.id, r.control]));
    } catch {
      /* legend still renders without control data */
    }
    this.render();
    this.el.style.display = "block";
  }

  hide() {
    this.el.style.display = "none";
  }

  private render() {
    const rows = this.entries
      .map((e) => {
        const control = this.control.get(e.id) ?? null;
        return `<div class="dl-row" data-id="${e.id}">
          <span class="dl-dot" style="background:${e.colorCss}"></span>
          <span class="dl-name">${e.name}</span>
          <span class="dl-control ${control ? "dl-held" : ""}">${control ?? "Unclaimed"}</span>
        </div>`;
      })
      .join("");
    this.el.innerHTML = `
      <div class="pk-head"><span>DISTRICTS</span></div>
      <div class="dl-rows">${rows}</div>
      <div class="lp-hint">Click a district to jump there</div>`;
    this.el.querySelectorAll<HTMLElement>(".dl-row").forEach((r) =>
      r.addEventListener("click", () => {
        const e = this.entries.find((x) => x.id === Number(r.dataset.id));
        if (e) this.focus(e.cx, e.cz);
      })
    );
  }
}
