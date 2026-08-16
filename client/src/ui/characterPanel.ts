import * as THREE from "three";
import {
  type Appearance,
  CLOTH_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_STYLES,
  SHIRT_STYLES,
  SHOE_STYLES,
  SKIN_TONES,
  decodeAppearance,
  encodeAppearance,
  randomAppearance,
} from "@mc/shared";
import { AVATAR_MATERIAL, avatarGeometry } from "../assets/avatar.js";
import { tabStrip, wireTabs } from "./panelTabs.js";

interface CharacterActions {
  save(code: string): void;
}

// what each tab edits: an optional style list, and the palette its colour
// choice comes from
const TABS: Array<{
  key: string;
  label: string;
  styles?: { list: Array<{ id: string; label: string }>; field: keyof Appearance };
  palette: { list: string[]; field: keyof Appearance };
}> = [
  { key: "skin", label: "Skin", palette: { list: SKIN_TONES, field: "skin" } },
  {
    key: "hair",
    label: "Hair",
    styles: { list: HAIR_STYLES, field: "hair" },
    palette: { list: HAIR_COLORS, field: "hairColor" },
  },
  {
    key: "shirt",
    label: "Shirt",
    styles: { list: SHIRT_STYLES, field: "shirt" },
    palette: { list: CLOTH_COLORS, field: "shirtColor" },
  },
  {
    key: "pants",
    label: "Pants",
    styles: { list: PANTS_STYLES, field: "pants" },
    palette: { list: CLOTH_COLORS, field: "pantsColor" },
  },
  {
    key: "shoes",
    label: "Shoes",
    styles: { list: SHOE_STYLES, field: "shoes" },
    palette: { list: CLOTH_COLORS, field: "shoesColor" },
  },
];

// Character creation: a live 3D preview on the left, one tab per layer on the
// right. Opens by itself the first time you join and from the HUD after that.
export class CharacterPanel {
  private el: HTMLElement;
  private look: Appearance = decodeAppearance(null);
  private tab = "skin";
  private firstTime = false;
  private built = false;
  private visible = false;

  // preview scene — its own tiny renderer, built once and reused
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private mesh?: THREE.Mesh;
  private spin = 0.5;
  private dragging = false;
  private lastX = 0;
  private raf = 0;

  constructor(ui: HTMLElement, private actions: CharacterActions) {
    this.el = document.createElement("div");
    this.el.className = "panel char-panel";
    this.el.style.display = "none";
    ui.appendChild(this.el);
  }

  get isOpen() {
    return this.visible;
  }

  open(code: string, firstTime = false) {
    this.look = decodeAppearance(code);
    this.firstTime = firstTime;
    this.visible = true;
    this.el.style.display = "flex";
    if (!this.built) this.build();
    this.setPreview();
    this.startLoop();
    this.renderOptions();
  }

  close() {
    this.visible = false;
    this.el.style.display = "none";
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private setPreview() {
    if (!this.mesh) return;
    this.mesh.geometry.dispose();
    this.mesh.geometry = avatarGeometry(this.look);
  }

  // The preview owns a WebGL context, so its canvas is built once and never
  // touched again — only the options column re-renders when you pick something.
  private build() {
    this.el.innerHTML = `
      <div class="ch-preview"><canvas class="ch-canvas"></canvas><div class="ch-hint">Drag to turn</div></div>
      <div class="ch-side">
        <div class="ch-head"><span class="ch-title"></span><button class="lp-close ch-close">✕</button></div>
        <div class="ch-tabs"></div>
        <div class="ch-body"></div>
        <div class="ch-actions">
          <button class="btn-secondary ch-random">Randomise</button>
          <button class="btn-primary ch-save">Save</button>
        </div>
      </div>`;
    this.built = true;

    this.el.querySelector(".ch-close")!.addEventListener("click", () => this.close());
    this.el.querySelector(".ch-random")!.addEventListener("click", () => {
      this.look = randomAppearance();
      this.setPreview();
      this.renderOptions();
    });
    this.el.querySelector(".ch-save")!.addEventListener("click", () => {
      this.actions.save(encodeAppearance(this.look));
      this.close();
    });
    this.initPreview(this.el.querySelector<HTMLCanvasElement>(".ch-canvas")!);
  }

  private initPreview(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight(0x9fc4e8, 0.7);
    rim.position.set(-3, 2, -2.5);
    this.scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.85));
    // its own clone: the preview is a second WebGL context, and a material
    // shared across contexts ties their program caches together
    this.mesh = new THREE.Mesh(avatarGeometry(this.look), AVATAR_MATERIAL.clone());
    this.scene.add(this.mesh);
    // a plinth so the character isn't standing in the void
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.9, 0.06, 32),
      new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.9 })
    );
    disc.position.y = -0.03;
    this.scene.add(disc);
    this.camera.position.set(0, 1.25, 4.6);
    this.camera.lookAt(0, 1.0, 0);

    canvas.addEventListener("pointerdown", (ev) => {
      this.dragging = true;
      this.lastX = ev.clientX;
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (!this.dragging) return;
      this.spin += (ev.clientX - this.lastX) * 0.012;
      this.lastX = ev.clientX;
    });
    const stop = () => (this.dragging = false);
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  }

  private startLoop() {
    if (this.raf) return;
    const canvas = this.renderer!.domElement;
    let last = performance.now();
    const loop = () => {
      if (!this.visible) {
        this.raf = 0;
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.dragging) this.spin += dt * 0.35;
      this.mesh!.rotation.y = this.spin;
      // the panel is sized by CSS, so follow the canvas rather than assume
      const w = canvas.clientWidth || 300;
      const h = canvas.clientHeight || 400;
      if (canvas.width !== w * this.renderer!.getPixelRatio() || canvas.height !== h * this.renderer!.getPixelRatio()) {
        this.renderer!.setSize(w, h, false);
        this.camera!.aspect = w / h;
        this.camera!.updateProjectionMatrix();
      }
      this.renderer!.render(this.scene!, this.camera!);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private renderOptions() {
    const tab = TABS.find((t) => t.key === this.tab) ?? TABS[0];
    this.el.querySelector(".ch-title")!.textContent = this.firstTime ? "CREATE YOUR CHARACTER" : "APPEARANCE";
    (this.el.querySelector(".ch-close") as HTMLElement).style.display = this.firstTime ? "none" : "";
    this.el.querySelector(".ch-save")!.textContent = this.firstTime ? "Enter the city" : "Save";

    this.el.querySelector(".ch-tabs")!.innerHTML = tabStrip(
      TABS.map((t) => ({ key: t.key, label: t.label })),
      tab.key
    );
    const styleHtml = tab.styles
      ? `<div class="ch-cap">Style</div><div class="ch-styles">${tab.styles.list
          .map(
            (s, i) =>
              `<button class="ch-style${this.look[tab.styles!.field] === i ? " active" : ""}" data-style="${i}">${s.label}</button>`
          )
          .join("")}</div>`
      : "";
    this.el.querySelector(".ch-body")!.innerHTML =
      styleHtml +
      `<div class="ch-cap">${tab.key === "skin" ? "Skin tone" : "Colour"}</div>
       <div class="ch-colors">${tab.palette.list
         .map(
           (hex, i) =>
             `<button class="ch-color${this.look[tab.palette.field] === i ? " active" : ""}" data-color="${i}" style="--sw:${hex}" title="${hex}"></button>`
         )
         .join("")}</div>`;

    wireTabs(this.el, (k) => {
      this.tab = k;
      this.renderOptions();
    });
    const choose = (field: keyof Appearance, value: number) => {
      (this.look[field] as number) = value;
      this.setPreview();
      this.renderOptions();
    };
    this.el.querySelectorAll<HTMLElement>(".ch-style").forEach((b) =>
      b.addEventListener("click", () => choose(tab.styles!.field, Number(b.dataset.style)))
    );
    this.el.querySelectorAll<HTMLElement>(".ch-color").forEach((b) =>
      b.addEventListener("click", () => choose(tab.palette.field, Number(b.dataset.color)))
    );
  }
}
