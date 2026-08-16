import { fmtMoney } from "../config.js";

export class HUD {
  private cashEl: HTMLElement;
  private clockEl: HTMLElement;
  private onlineEl: HTMLElement;
  private districtsBtn: HTMLElement;
  private companyBtn: HTMLElement;
  private workersBtn: HTMLElement;
  private stocksBtn: HTMLElement;
  private economyBtn: HTMLElement;
  private cryptoBtn: HTMLElement;
  private nameBtn: HTMLElement;

  constructor(ui: HTMLElement, playerName: string) {
    const top = document.createElement("div");
    top.className = "hud-top";
    top.innerHTML = `
      <div class="panel hud-chip">
        <button class="name name-btn" title="Appearance">${playerName}</button>
        <span class="cash">$0</span>
      </div>
      <div class="panel hud-chip hud-nav">
        <button class="hud-btn districts-btn">Districts</button>
        <span class="hud-sep"></span>
        <button class="hud-btn workers-btn">Workers</button>
        <button class="hud-btn company-btn">Company</button>
        <span class="hud-sep"></span>
        <button class="hud-btn stocks-btn">Stocks</button>
        <button class="hud-btn crypto-btn">Crypto</button>
        <button class="hud-btn economy-btn">Economy</button>
        <span class="hud-sep"></span>
        <span class="clock">--:--</span>
        <span class="online"></span>
      </div>`;
    ui.appendChild(top);
    const hint = document.createElement("div");
    hint.className = "panel hud-hint";
    hint.textContent = "Left click — walk · WASD — pan · Q/E or right-drag — rotate · Scroll — zoom";
    ui.appendChild(hint);

    this.cashEl = top.querySelector(".cash")!;
    this.clockEl = top.querySelector(".clock")!;
    this.onlineEl = top.querySelector(".online")!;
    this.districtsBtn = top.querySelector(".districts-btn")!;
    this.companyBtn = top.querySelector(".company-btn")!;
    this.workersBtn = top.querySelector(".workers-btn")!;
    this.stocksBtn = top.querySelector(".stocks-btn")!;
    this.economyBtn = top.querySelector(".economy-btn")!;
    this.cryptoBtn = top.querySelector(".crypto-btn")!;
    this.nameBtn = top.querySelector(".name-btn")!;
  }

  onDistricts(fn: () => boolean) {
    this.districtsBtn.addEventListener("click", () => {
      const on = fn();
      this.districtsBtn.classList.toggle("active", on);
    });
  }

  // your name opens your character
  onName(fn: () => void) {
    this.nameBtn.addEventListener("click", fn);
  }

  onCompany(fn: () => void) {
    this.companyBtn.addEventListener("click", fn);
  }

  // highlight whichever overlay is currently open
  setActive(which: string | null) {
    for (const [key, btn] of [
      ["workers", this.workersBtn],
      ["company", this.companyBtn],
      ["stocks", this.stocksBtn],
      ["crypto", this.cryptoBtn],
      ["economy", this.economyBtn],
    ] as const)
      btn.classList.toggle("active", key === which);
  }

  onWorkers(fn: () => void) {
    this.workersBtn.addEventListener("click", fn);
  }

  onStocks(fn: () => void) {
    this.stocksBtn.addEventListener("click", fn);
  }

  onEconomy(fn: () => void) {
    this.economyBtn.addEventListener("click", fn);
  }

  onCrypto(fn: () => void) {
    this.cryptoBtn.addEventListener("click", fn);
  }

  setCash(v: number) {
    this.cashEl.textContent = fmtMoney(v);
  }

  setDayTime(t: number) {
    const mins = Math.floor(((t * 24) % 24) * 60) % 60;
    const hours = Math.floor(t * 24) % 24;
    this.clockEl.textContent = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  setOnline(n: number) {
    this.onlineEl.textContent = `${n} online`;
  }
}
