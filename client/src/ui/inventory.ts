import { itemById, POCKET_SLOTS, stackLimit } from "@mc/shared";
import { ic } from "./icons.js";

export type Inv = Record<string, number>;

// The player's bag — slot-based inventory, toggled with I. Each slot holds one
// stack of a single item; big quantities span multiple slots.
export class PocketPanel {
  private el: HTMLElement;
  private inv: Inv = {};

  constructor(ui: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "panel pocket-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
    this.render();
  }

  toggle() {
    this.el.style.display = this.el.style.display === "none" ? "block" : "none";
  }

  update(inv: Inv) {
    this.inv = inv;
    this.render();
  }

  get(): Inv {
    return this.inv;
  }

  private render() {
    // split each item into stacks of its stack limit
    const stacks: Array<{ id: string; q: number }> = [];
    for (const [id, qty] of Object.entries(this.inv)) {
      const lim = stackLimit(id);
      let left = qty;
      while (left > 0) {
        stacks.push({ id, q: Math.min(lim, left) });
        left -= lim;
      }
    }
    const slotCount = Math.max(POCKET_SLOTS, Math.ceil(stacks.length / 5) * 5);
    const cells = Array.from({ length: slotCount }, (_, i) => {
      const st = stacks[i];
      if (!st) return `<div class="inv-slot"></div>`;
      const def = itemById(st.id);
      return `<div class="inv-slot inv-filled" title="${def?.label ?? st.id} — ${st.q} (stack of ${stackLimit(st.id)})">
        ${ic(st.id, 30)}<span class="inv-qty">${st.q}</span>
      </div>`;
    }).join("");
    this.el.innerHTML = `
      <div class="pk-head"><span>${ic("bag", 16)} INVENTORY</span><button class="lp-close inv-close">✕</button></div>
      <div class="inv-grid">${cells}</div>
      <div class="inv-capwrap">
        <span class="inv-captext${stacks.length >= POCKET_SLOTS ? " inv-captext-full" : ""}">${stacks.length} / ${POCKET_SLOTS} slots</span>
      </div>`;
    this.el.querySelector(".inv-close")?.addEventListener("click", () => {
      this.el.style.display = "none";
    });
  }
}
