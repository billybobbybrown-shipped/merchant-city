import * as THREE from "three";
import { makeGood } from "./goods3d.js";
import { furnitureById } from "@mc/shared";
import { makeDock } from "./dock.js";

const WOOD = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85 });
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: 0x5f4630, roughness: 0.9 });
const WOOD_PALE = new THREE.MeshStandardMaterial({ color: 0xb08d5e, roughness: 0.85 });
const METAL = new THREE.MeshStandardMaterial({ color: 0x7d838a, metalness: 0.55, roughness: 0.5 });
const STEEL_ORANGE = new THREE.MeshStandardMaterial({ color: 0xb35c2a, metalness: 0.4, roughness: 0.55 });
const FABRIC = new THREE.MeshStandardMaterial({ color: 0x7a4040, roughness: 0.95 });
const FABRIC_DARK = new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.95 });
const PLASTIC = new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.7 });
const SCREEN = new THREE.MeshStandardMaterial({
  color: 0x0d141a,
  emissive: 0x9fd8e8,
  emissiveIntensity: 0.35,
  roughness: 0.4,
});
const GREEN = new THREE.MeshStandardMaterial({ color: 0x4c7a3d, roughness: 0.9 });
const GREEN_DARK = new THREE.MeshStandardMaterial({ color: 0x3a6130, roughness: 0.9 });
const TERRACOTTA = new THREE.MeshStandardMaterial({ color: 0x9c5a3c, roughness: 0.85 });
const PAPER = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.95 });
const BRICK = new THREE.MeshStandardMaterial({ color: 0x9c4f38, roughness: 0.9 });
const BRICK_DARK = new THREE.MeshStandardMaterial({ color: 0x7a3c2a, roughness: 0.9 });
const EMBER = new THREE.MeshStandardMaterial({
  color: 0x1a0d08,
  emissive: 0xff7a2e,
  emissiveIntensity: 0.9,
  roughness: 0.6,
});
const STEEL_DARK = new THREE.MeshStandardMaterial({ color: 0x4b545c, metalness: 0.6, roughness: 0.45 });
const SAWBLADE = new THREE.MeshStandardMaterial({ color: 0xb9c2ca, metalness: 0.8, roughness: 0.3 });
const THREADS = new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.95 });
const GOODS = [
  new THREE.MeshStandardMaterial({ color: 0xa8433a, roughness: 0.8 }),
  new THREE.MeshStandardMaterial({ color: 0x3f6d9e, roughness: 0.8 }),
  new THREE.MeshStandardMaterial({ color: 0xc9a648, roughness: 0.8 }),
  new THREE.MeshStandardMaterial({ color: 0x55803f, roughness: 0.8 }),
  new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 }),
];

function bx(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// deterministic tiny "random" for goods variation without a seed
const pickG = (i: number) => GOODS[((i * 7) + 3) % GOODS.length];

const CARDBOARD = [
  new THREE.MeshStandardMaterial({ color: 0xb08d5e, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0xa07f52, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0xbf9c6c, roughness: 0.9 }),
];
const TAPE = new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.7 });
const LABEL = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.85 });

// cardboard box with lid seam, tape strip and a shipping label
function addCardboardBox(
  g: THREE.Group,
  x: number,
  yBottom: number,
  z: number,
  w: number,
  h: number,
  d: number,
  v: number
) {
  const mat = CARDBOARD[v % CARDBOARD.length];
  const body = bx(w, h, d, mat, x, yBottom + h / 2, z);
  body.rotation.y = ((v % 3) - 1) * 0.12; // slight scatter
  g.add(body);
  // tape strip across the lid (running front-to-back)
  const tape = bx(0.06, 0.012, d + 0.012, TAPE, x, yBottom + h + 0.004, z);
  tape.rotation.y = body.rotation.y;
  g.add(tape);
  // lid seam (thin dark line across the top, perpendicular to the tape)
  const seam = bx(w + 0.012, 0.008, 0.015, WOOD_DARK, x, yBottom + h + 0.002, z);
  seam.rotation.y = body.rotation.y;
  g.add(seam);
  // shipping label on the front face
  const label = bx(w * 0.32, h * 0.35, 0.008, LABEL, x, yBottom + h * 0.55, z + d / 2 + 0.002);
  label.rotation.y = body.rotation.y;
  g.add(label);
}

// Procedural model per catalog item, sized to its footprint (1 cell = 1 unit).
// Origin: center of the footprint at ground level, rot 0 orientation.
export function makeFurniture(
  itemId: string,
  fill = 0,
  contents: Record<string, number> = {}
): THREE.Group {
  const g = new THREE.Group();
  const def = furnitureById(itemId);
  if (!def) return g;
  const w = def.w;
  const d = def.h;

  switch (itemId) {
    case "shelf": {
      // retail gondola: plinth, back panel, side cheeks, 3 shelves of goods
      g.add(bx(w - 0.08, 0.12, d - 0.2, PLASTIC, 0, 0.06, 0));
      g.add(bx(w - 0.1, 1.75, 0.1, WOOD_DARK, 0, 0.92, -d / 2 + 0.1));
      for (const sx of [-1, 1]) g.add(bx(0.07, 1.75, d - 0.2, WOOD_DARK, (sx * (w - 0.15)) / 2, 0.92, 0));
      for (const y of [0.42, 0.92, 1.42]) {
        g.add(bx(w - 0.2, 0.05, d - 0.32, WOOD, 0, y, 0.04));
        g.add(bx(w - 0.2, 0.035, 0.02, GOODS[2], 0, y - 0.03, d / 2 - 0.14)); // price strip
      }
      // What is actually stocked, one facing per unit, filling the shelves from
      // the bottom up. An unstocked gondola stands empty — no phantom goods.
      const stocked: string[] = [];
      for (const [id, qty] of Object.entries(contents))
        for (let i = 0; i < qty && stocked.length < 15; i++) stocked.push(id);
      let slot = 0;
      for (const y of [0.42, 0.92, 1.42])
        for (let i = 0; i < 5; i++) {
          const id = stocked[slot++];
          if (!id) continue;
          const px = -w / 2 + 0.3 + i * ((w - 0.6) / 4);
          const unit = makeGood(id);
          unit.position.set(px, y + 0.03, 0);
          unit.rotation.y = ((slot * 7) % 5) * 0.08 - 0.16;
          g.add(unit);
        }
      break;
    }
    case "counter": {
      // service counter: paneled body, overhung top, register w/ screen, card reader
      g.add(bx(w - 0.12, 0.92, d - 0.36, WOOD_DARK, 0, 0.46, 0.03));
      for (let i = 0; i < 3; i++)
        g.add(bx((w - 0.3) / 3 - 0.06, 0.6, 0.03, WOOD, -w / 3 + 0.15 + (i * (w - 0.3)) / 3 + 0.08, 0.45, d / 2 - 0.16));
      g.add(bx(w, 0.08, d - 0.1, WOOD_PALE, 0, 1.0, 0)); // top with overhang
      // register
      g.add(bx(0.34, 0.16, 0.3, PLASTIC, w / 4, 1.12, -0.05));
      const screen = bx(0.3, 0.22, 0.03, SCREEN, w / 4, 1.34, -0.12);
      screen.rotation.x = -0.25;
      g.add(screen);
      g.add(bx(0.26, 0.03, 0.16, FABRIC_DARK, w / 4, 1.21, 0.06)); // keypad
      g.add(bx(0.09, 0.14, 0.07, PLASTIC, -w / 4, 1.11, 0.08)); // card reader
      g.add(bx(0.2, 0.005, 0.28, PAPER, -w / 4 + 0.3, 1.045, 0)); // receipt/paper
      break;
    }
    case "rack_s":
    case "rack_m":
    case "rack_l": {
      // industrial pallet rack: orange uprights, steel beams, pallets + crates
      const h = itemId === "rack_l" ? 2.2 : itemId === "rack_m" ? 1.9 : 1.7;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          g.add(bx(0.08, h, 0.08, STEEL_ORANGE, (sx * (w - 0.12)) / 2, h / 2, (sz * (d - 0.12)) / 2));
      const levels = itemId === "rack_s" ? [0.5, 1.15] : [0.5, 1.15, 1.8];
      for (const y of levels) {
        for (const sz of [-1, 1]) g.add(bx(w - 0.1, 0.06, 0.05, METAL, 0, y, (sz * (d - 0.16)) / 2));
        // pallet boards
        for (let i = 0; i < Math.max(2, w * 2); i++)
          g.add(bx(0.12, 0.03, d - 0.18, WOOD_PALE, -w / 2 + 0.2 + i * ((w - 0.4) / Math.max(1, w * 2 - 1)), y + 0.045, 0));
      }
      // detailed cardboard boxes only
      let ci = 0;
      for (const y of levels)
        for (let i = 0; i < Math.max(1, Math.floor(w)); i++) {
          const px = w >= 2 ? -w / 2 + 0.5 + i * ((w - 1) / Math.max(1, Math.floor(w) - 1)) : 0;
          const v = (ci * 5 + i * 3) % 4; // deterministic variety
          const bw = 0.36 + (v % 2) * 0.08;
          const bh = 0.26 + (v > 1 ? 0.08 : 0);
          addCardboardBox(g, px, y + 0.075, 0, bw, bh, d - 0.32, v);
          // some slots get a smaller box stacked on top
          if (v === 1 || v === 3)
            addCardboardBox(g, px + 0.04, y + 0.075 + bh, -0.03, bw * 0.6, 0.18, (d - 0.32) * 0.6, v + 2);
          ci++;
        }
      break;
    }
    case "metal_shop": {
      // Steel bench with a tool board bolted along its long side, an anvil on
      // its block, a vice and a grinder, and stock racked underneath.
      const topY = 0.88;
      g.add(bx(w - 0.04, 0.1, d - 0.06, METAL, 0, topY, 0));
      g.add(bx(w - 0.12, 0.06, d - 0.16, STEEL_DARK, 0, topY - 0.08, 0));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1])
          g.add(bx(0.1, topY - 0.08, 0.1, STEEL_DARK, (sx * (w - 0.18)) / 2, (topY - 0.08) / 2, (sz * (d - 0.24)) / 2));
        g.add(bx(0.05, 0.07, d - 0.34, STEEL_DARK, (sx * (w - 0.18)) / 2, 0.24, 0));
      }
      // stock racked on the lower shelf
      g.add(bx(w - 0.24, 0.04, d - 0.34, STEEL_DARK, 0, 0.28, 0));
      for (let i = 0; i < 4; i++) {
        const bar = cyl(0.032, 0.032, d - 0.5, METAL, -0.12 + i * 0.08, 0.33 + (i % 2) * 0.05, 0.04, 6);
        bar.rotation.x = Math.PI / 2;
        g.add(bar);
      }
      // tool board on posts down the long side
      const bkx = -w / 2 + 0.05;
      for (const sz of [-1, 1])
        g.add(bx(0.055, 0.6, 0.055, STEEL_DARK, bkx, topY + 0.32, (sz * (d - 0.4)) / 2));
      g.add(bx(0.04, 0.48, d - 0.3, STEEL_DARK, bkx, topY + 0.38, 0));
      // hung tools: tongs, hammers, files
      for (let i = 0; i < 4; i++) {
        const z = -d / 2 + 0.36 + i * ((d - 0.72) / 3);
        g.add(bx(0.028, 0.24, 0.035, METAL, bkx + 0.05, topY + 0.32, z));
        g.add(bx(0.028, 0.05, 0.1, i % 2 ? STEEL_DARK : METAL, bkx + 0.05, topY + 0.46, z));
      }
      // anvil on its block at the far end
      const az = -d / 2 + 0.42;
      g.add(cyl(0.14, 0.17, 0.26, WOOD_DARK, w / 8, topY + 0.13, az, 8));
      g.add(bx(0.17, 0.05, 0.3, STEEL_DARK, w / 8, topY + 0.28, az));
      g.add(bx(0.12, 0.08, 0.2, STEEL_DARK, w / 8, topY + 0.35, az));
      g.add(bx(0.16, 0.05, 0.34, METAL, w / 8, topY + 0.42, az));
      const horn = cyl(0.024, 0.075, 0.17, METAL, w / 8, topY + 0.41, az + 0.24, 8);
      horn.rotation.x = Math.PI / 2;
      g.add(horn);
      g.add(bx(0.05, 0.05, 0.22, WOOD_DARK, w / 8 + 0.16, topY + 0.47, az - 0.02)); // hammer resting on it
      g.add(bx(0.07, 0.07, 0.09, METAL, w / 8 + 0.16, topY + 0.47, az + 0.12));
      // grinder mid-bench
      g.add(bx(0.16, 0.05, 0.2, STEEL_DARK, w / 8, topY + 0.07, 0.1));
      g.add(cyl(0.075, 0.075, 0.16, PLASTIC, w / 8, topY + 0.16, 0.02, 10));
      const wheel = cyl(0.1, 0.1, 0.035, STEEL_DARK, w / 8, topY + 0.16, 0.16, 14);
      g.add(wheel);
      g.add(bx(0.09, 0.02, 0.06, METAL, w / 8, topY + 0.06, 0.2));
      // vice at the near end, jaws holding a bar
      const vz = d / 2 - 0.28;
      g.add(bx(0.14, 0.11, 0.15, STEEL_DARK, 0, topY + 0.1, vz));
      g.add(bx(0.18, 0.13, 0.05, METAL, 0, topY + 0.14, vz - 0.07));
      g.add(bx(0.18, 0.13, 0.05, METAL, 0, topY + 0.14, vz + 0.07));
      g.add(bx(0.05, 0.2, 0.05, METAL, 0, topY + 0.24, vz));
      const screw = cyl(0.017, 0.017, 0.2, METAL, 0, topY + 0.14, vz + 0.18, 6);
      screw.rotation.x = Math.PI / 2;
      g.add(screw);
      g.add(bx(0.11, 0.02, 0.02, METAL, 0, topY + 0.14, vz + 0.27));
      // lead coiled on the shelf
      for (let i = 0; i < 3; i++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.075 - i * 0.011, 0.014, 5, 12), PLASTIC);
        coil.position.set(0, 0.32 + i * 0.024, d / 2 - 0.36);
        coil.rotation.x = Math.PI / 2 - 0.15;
        coil.castShadow = true;
        g.add(coil);
      }
      break;
    }
    case "carpentry_bench": {
      // Butcher-block bench with a pegboard bolted to the long side, a vice at
      // the near end and the mess of a bench in use: offcuts, clamps, a plane.
      const topY = 0.86;
      g.add(bx(w - 0.04, 0.13, d - 0.06, WOOD_PALE, 0, topY, 0));
      g.add(bx(w - 0.1, 0.05, d - 0.14, WOOD_DARK, 0, topY - 0.09, 0));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1])
          g.add(bx(0.11, topY - 0.1, 0.11, WOOD_DARK, (sx * (w - 0.2)) / 2, (topY - 0.1) / 2, (sz * (d - 0.26)) / 2));
        g.add(bx(0.06, 0.08, d - 0.36, WOOD_DARK, (sx * (w - 0.2)) / 2, 0.26, 0));
      }
      // pegboard on posts, bolted along the back edge
      const bx0 = -w / 2 + 0.05;
      for (const sz of [-1, 1])
        g.add(bx(0.06, 0.62, 0.06, WOOD_DARK, bx0, topY + 0.33, (sz * (d - 0.4)) / 2));
      g.add(bx(0.045, 0.5, d - 0.3, WOOD, bx0, topY + 0.4, 0));
      // tools hung on it: saw, square, chisels, mallet
      g.add(bx(0.03, 0.26, 0.06, METAL, bx0 + 0.05, topY + 0.34, -d / 2 + 0.34));
      g.add(bx(0.03, 0.1, 0.22, METAL, bx0 + 0.05, topY + 0.5, -d / 2 + 0.34));
      for (let i = 0; i < 3; i++)
        g.add(bx(0.025, 0.2, 0.03, i === 1 ? WOOD_DARK : METAL, bx0 + 0.05, topY + 0.36, -0.1 + i * 0.1));
      g.add(bx(0.05, 0.16, 0.09, WOOD_DARK, bx0 + 0.06, topY + 0.36, d / 2 - 0.32));
      // vice under the near end
      g.add(bx(0.2, 0.16, 0.16, METAL, 0.04, topY - 0.12, d / 2 - 0.26));
      g.add(bx(0.22, 0.05, 0.05, METAL, 0.04, topY - 0.05, d / 2 - 0.18));
      g.add(cyl(0.018, 0.018, 0.2, METAL, 0.04, topY - 0.12, d / 2 - 0.1, 6));
      // work in progress on the top
      g.add(bx(w - 0.34, 0.05, 0.5, WOOD, 0.05, topY + 0.09, -d / 6));
      g.add(bx(w - 0.42, 0.04, 0.36, WOOD_PALE, 0.02, topY + 0.13, -d / 6 + 0.04));
      g.add(bx(0.12, 0.07, 0.22, METAL, w / 2 - 0.2, topY + 0.1, d / 5)); // plane
      g.add(bx(0.1, 0.05, 0.05, WOOD_DARK, w / 2 - 0.2, topY + 0.16, d / 5));
      for (let i = 0; i < 3; i++)
        g.add(bx(0.06, 0.03, 0.16, WOOD_PALE, -w / 4 + i * 0.05, topY + 0.08, d / 2 - 0.5));
      break;
    }
    case "sawmill": {
      // A breaking-down saw: heavy bed, blade rising through a slot in the
      // middle, log on the infeed and sawn boards stacked off the outfeed.
      const bedY = 0.72;
      g.add(bx(w - 0.06, 0.1, d - 0.08, METAL, 0, bedY, 0));
      g.add(bx(w - 0.02, 0.05, 0.07, STEEL_DARK, 0, bedY + 0.06, -d / 2 + 0.05));
      g.add(bx(w - 0.02, 0.05, 0.07, STEEL_DARK, 0, bedY + 0.06, d / 2 - 0.05));
      // frame: chunky legs with a stretcher down each long side
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1])
          g.add(bx(0.11, bedY - 0.05, 0.11, STEEL_DARK, (sx * (w - 0.18)) / 2, (bedY - 0.05) / 2, (sz * (d - 0.24)) / 2));
        g.add(bx(0.06, 0.07, d - 0.34, STEEL_DARK, (sx * (w - 0.18)) / 2, 0.24, 0));
      }
      // blade through the bed, guarded over the top
      const blade = cyl(0.36, 0.36, 0.035, SAWBLADE, 0, bedY + 0.16, 0, 20);
      blade.rotation.z = Math.PI / 2;
      g.add(blade);
      const hub = cyl(0.08, 0.08, 0.05, STEEL_DARK, 0, bedY + 0.16, 0, 10);
      hub.rotation.z = Math.PI / 2;
      g.add(hub);
      g.add(bx(0.09, 0.42, 0.1, STEEL_ORANGE, -w / 2 + 0.13, bedY + 0.2, 0));
      g.add(bx(0.09, 0.09, 0.62, STEEL_ORANGE, -w / 2 + 0.13, bedY + 0.44, 0));
      g.add(bx(0.04, 0.3, 0.5, STEEL_ORANGE, 0.02, bedY + 0.34, 0));
      // rip fence along the far side
      g.add(bx(0.05, 0.12, d - 0.3, METAL, w / 2 - 0.14, bedY + 0.11, 0));
      // log waiting on the infeed
      const log = cyl(0.16, 0.17, d * 0.4, WOOD_DARK, 0, bedY + 0.22, -d / 2 + d * 0.24, 10);
      log.rotation.x = Math.PI / 2;
      g.add(log);
      const logEnd = cyl(0.16, 0.16, 0.02, WOOD_PALE, 0, bedY + 0.22, -d / 2 + d * 0.44, 10);
      logEnd.rotation.x = Math.PI / 2;
      g.add(logEnd);
      // boards coming off the outfeed
      for (let i = 0; i < 3; i++)
        g.add(bx(w - 0.28 - i * 0.05, 0.05, d * 0.3, WOOD_PALE, i * 0.02, bedY + 0.08 + i * 0.055, d / 2 - d * 0.21));
      // sawdust under the blade
      g.add(cyl(0.22, 0.3, 0.06, WOOD_PALE, 0, 0.03, 0.1, 10));
      break;
    }
    case "smelter": {
      // steel furnace: tall body, tap slot glow, chimney pipe, crucible
      g.add(bx(w - 0.35, 1.35, d - 0.35, STEEL_DARK, -w * 0.1, 0.68, 0));
      g.add(bx(w - 0.25, 0.12, d - 0.25, METAL, -w * 0.1, 1.4, 0));
      g.add(bx(0.42, 0.16, 0.05, EMBER, -w * 0.1, 0.42, d / 2 - 0.19)); // tap glow
      g.add(cyl(0.1, 0.1, 0.9, METAL, -w * 0.1 + 0.25, 1.9, -d / 4, 10)); // chimney
      g.add(cyl(0.13, 0.13, 0.08, STEEL_DARK, -w * 0.1 + 0.25, 2.36, -d / 4, 10));
      g.add(cyl(0.14, 0.1, 0.22, METAL, w / 2 - 0.28, 0.11, d / 4, 10)); // crucible
      g.add(cyl(0.11, 0.11, 0.03, EMBER, w / 2 - 0.28, 0.23, d / 4, 10)); // molten top
      break;
    }
    case "loom": {
      // weaving loom: frame, warp threads, cloth roll
      for (const sx of [-1, 1]) g.add(bx(0.1, 1.1, 0.14, WOOD_DARK, (sx * (w - 0.2)) / 2, 0.55, 0));
      g.add(bx(w - 0.2, 0.1, 0.1, WOOD, 0, 1.05, -d / 4)); // top beam
      g.add(bx(w - 0.2, 0.1, 0.1, WOOD, 0, 0.35, d / 4)); // breast beam
      for (let i = 0; i < 9; i++) {
        const t = bx(0.02, 0.02, 0.86, THREADS, -w / 2 + 0.25 + i * ((w - 0.5) / 8), 0.72, 0);
        t.rotation.x = -0.65;
        g.add(t);
      }
      const roll = cyl(0.09, 0.09, w - 0.3, new THREE.MeshStandardMaterial({ color: 0x5d84b8, roughness: 0.9 }), 0, 0.32, d / 4, 10);
      roll.rotation.z = Math.PI / 2;
      g.add(roll);
      break;
    }
    case "refinery": {
      // oil refinery unit: horizontal tank on saddles + distillation column + pipes
      const tank = cyl(0.34, 0.34, w - 0.7, METAL, -0.2, 0.6, d / 5, 14);
      tank.rotation.z = Math.PI / 2;
      g.add(tank);
      for (const sx of [-1, 1]) g.add(bx(0.14, 0.3, 0.5, STEEL_DARK, -0.2 + (sx * (w - 1.1)) / 2, 0.15, d / 5));
      g.add(cyl(0.18, 0.18, 1.5, STEEL_DARK, w / 2 - 0.35, 0.75, -d / 3, 12)); // column
      g.add(cyl(0.2, 0.2, 0.06, METAL, w / 2 - 0.35, 1.53, -d / 3, 12));
      // pipe from tank to column
      const pipe = cyl(0.045, 0.045, 0.9, METAL, 0.35, 1.0, -d / 12, 8);
      pipe.rotation.z = Math.PI / 2.6;
      pipe.rotation.y = 0.5;
      g.add(pipe);
      g.add(bx(0.22, 0.16, 0.16, STEEL_ORANGE, -w / 2 + 0.3, 0.7, d / 5)); // valve block
      break;
    }
    case "oven": {
      // baker's oven: brick body, arched glowing chamber, wood store below
      g.add(bx(w - 0.15, 1.15, d - 0.2, BRICK, 0, 0.58, 0));
      g.add(bx(w - 0.05, 0.1, d - 0.1, BRICK_DARK, 0, 1.2, 0)); // top slab
      g.add(bx(0.55, 0.34, 0.05, EMBER, -w / 6, 0.82, d / 2 - 0.11)); // firing chamber
      g.add(bx(0.66, 0.08, 0.08, BRICK_DARK, -w / 6, 1.05, d / 2 - 0.12));
      // log store
      for (let i = 0; i < 3; i++) {
        const lg = cyl(0.07, 0.07, 0.4, WOOD_DARK, w / 4 + (i % 2) * 0.12, 0.16 + Math.floor(i / 2) * 0.14, d / 2 - 0.24, 8);
        lg.rotation.x = Math.PI / 2;
        g.add(lg);
      }
      g.add(bx(0.4, 0.03, 0.5, WOOD_PALE, -w / 6, 0.62, d / 2 - 0.3)); // peel board
      break;
    }
    case "assembly_line": {
      // conveyor running the long way with a stamping press over it, parts on
      // the belt, control box and safety rail at the back
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          g.add(bx(0.09, 0.52, 0.09, STEEL_DARK, (sx * (w - 0.5)) / 2, 0.26, (sz * (d - 0.6)) / 2)); // legs
      g.add(bx(w - 0.3, 0.1, 0.62, METAL, 0, 0.56, 0.06)); // belt table
      g.add(bx(w - 0.36, 0.05, 0.5, PLASTIC, 0, 0.63, 0.06)); // belt
      for (const sx of [-1, 1]) {
        const roll = cyl(0.09, 0.09, 0.5, STEEL_DARK, (sx * (w - 0.34)) / 2, 0.63, 0.06, 10);
        roll.rotation.x = Math.PI / 2;
        g.add(roll);
      }
      // parts riding the belt
      for (let i = 0; i < 3; i++) g.add(bx(0.16, 0.13, 0.16, pickG(i + 1), -w / 3 + i * 0.42, 0.72, 0.06));
      // gantry press over the middle of the belt
      for (const sx of [-1, 1]) g.add(bx(0.1, 0.72, 0.12, METAL, sx * 0.42, 1.02, -0.24));
      g.add(bx(1.06, 0.14, 0.16, METAL, 0, 1.42, -0.24)); // crossbeam
      g.add(bx(0.34, 0.26, 0.3, STEEL_DARK, 0, 1.18, -0.1)); // press head
      g.add(cyl(0.05, 0.05, 0.22, SAWBLADE, 0, 0.98, -0.1, 8)); // ram
      g.add(bx(0.4, 0.05, 0.34, STEEL_ORANGE, 0, 0.86, -0.1)); // die plate
      // control box
      g.add(bx(0.3, 0.44, 0.22, METAL, -w / 2 + 0.24, 0.78, -d / 2 + 0.22));
      const alScr = bx(0.22, 0.16, 0.02, SCREEN, -w / 2 + 0.24, 0.9, -d / 2 + 0.34);
      alScr.rotation.x = 0.2;
      g.add(alScr);
      for (let i = 0; i < 2; i++)
        g.add(cyl(0.035, 0.035, 0.03, i ? EMBER : GOODS[3], -w / 2 + 0.18 + i * 0.11, 0.74, -d / 2 + 0.34, 8));
      // safety rail along the back
      g.add(cyl(0.03, 0.03, 0.06, METAL, w / 2 - 0.22, 0.72, -d / 2 + 0.14, 6));
      const alRail = cyl(0.028, 0.028, w - 0.9, STEEL_ORANGE, 0.16, 0.75, -d / 2 + 0.14, 6);
      alRail.rotation.z = Math.PI / 2;
      g.add(alRail);
      break;
    }
    case "fabricator": {
      // chip fab: a sealed cabinet — exposure window up front, wafer cassette
      // on top, exhaust stack and gas bottles down the side
      g.add(bx(w - 0.14, 0.12, d - 0.14, STEEL_DARK, 0, 0.06, 0)); // plinth
      g.add(bx(w - 0.2, 1.24, d - 0.24, METAL, 0, 0.74, 0)); // cabinet
      g.add(bx(w - 0.34, 1.28, d - 0.34, STEEL_DARK, 0, 0.74, 0)); // recessed band
      const fz = (d - 0.24) / 2 + 0.01;
      g.add(bx(w - 0.36, 0.44, 0.03, STEEL_DARK, 0, 0.94, fz)); // window frame
      g.add(bx(w - 0.46, 0.34, 0.03, SCREEN, 0, 0.94, fz + 0.02)); // exposure glow
      g.add(bx(w - 0.46, 0.05, 0.06, STEEL_ORANGE, 0, 0.6, fz + 0.01)); // hatch lip
      g.add(bx(0.2, 0.14, 0.03, PLASTIC, 0.16, 1.24, fz + 0.02)); // control pad
      for (let i = 0; i < 3; i++) g.add(bx(0.04, 0.04, 0.02, pickG(i), -0.22 + i * 0.09, 1.24, fz + 0.03)); // status lamps
      // wafer cassette on top
      g.add(cyl(0.15, 0.16, 0.05, STEEL_DARK, -0.12, 1.39, -0.06, 12));
      for (let k = 0; k < 3; k++) g.add(cyl(0.13, 0.13, 0.014, SAWBLADE, -0.12, 1.45 + k * 0.045, -0.06, 12));
      // exhaust stack and gas feed
      g.add(cyl(0.07, 0.09, 0.34, METAL, w / 2 - 0.2, 1.53, -d / 2 + 0.2, 10));
      g.add(cyl(0.1, 0.07, 0.06, STEEL_DARK, w / 2 - 0.2, 1.73, -d / 2 + 0.2, 10));
      for (let i = 0; i < 2; i++)
        g.add(cyl(0.045, 0.045, 0.3, STEEL_ORANGE, -w / 2 + 0.16, 0.51, -d / 2 + 0.16 + i * 0.12, 8)); // bottles
      const fpipe = cyl(0.03, 0.03, 0.5, METAL, -w / 2 + 0.16, 0.72, -d / 2 + 0.22, 6);
      fpipe.rotation.x = Math.PI / 2;
      g.add(fpipe);
      break;
    }
    case "electronics_bench": {
      // electronics bench: desk, twin screens, parts tray, lamp
      g.add(bx(w - 0.1, 0.06, d - 0.15, WOOD_DARK, 0, 0.74, 0));
      for (const sx of [-1, 1])
        g.add(bx(0.07, 0.72, d - 0.3, METAL, (sx * (w - 0.25)) / 2, 0.37, 0));
      for (const sx of [-1, 1]) {
        const mon = bx(0.34, 0.24, 0.03, SCREEN, sx * 0.22, 1.0, -d / 6);
        mon.rotation.y = -sx * 0.25;
        mon.rotation.x = -0.06;
        g.add(mon);
        g.add(cyl(0.03, 0.06, 0.12, PLASTIC, sx * 0.22, 0.82, -d / 6, 8));
      }
      g.add(bx(0.3, 0.05, 0.2, PLASTIC, -w / 4, 0.79, d / 6)); // parts tray
      for (let i = 0; i < 3; i++)
        g.add(bx(0.05, 0.03, 0.05, pickG(i), -w / 4 - 0.08 + i * 0.09, 0.83, d / 6));
      g.add(bx(0.24, 0.02, 0.18, GOODS[4], w / 5, 0.77, d / 8)); // circuit board
      g.add(cyl(0.02, 0.02, 0.4, METAL, w / 2 - 0.3, 0.95, -d / 4, 6)); // lamp arm
      g.add(cyl(0.07, 0.05, 0.08, STEEL_ORANGE, w / 2 - 0.33, 1.16, -d / 4 + 0.03, 8));
      break;
    }
    case "brewery": {
      // brew kettles: two copper-topped vats on a platform, piping between
      g.add(bx(w - 0.2, 0.12, d - 0.2, WOOD_DARK, 0, 0.06, 0)); // platform
      for (const sx of [-1, 1]) {
        g.add(cyl(0.34, 0.38, 0.9, METAL, sx * (w / 4), 0.57, 0, 14)); // vat body
        g.add(cyl(0.05, 0.34, 0.26, STEEL_ORANGE, sx * (w / 4), 1.15, 0, 14)); // copper cone top
        g.add(cyl(0.035, 0.035, 0.2, STEEL_ORANGE, sx * (w / 4), 1.36, 0, 8)); // vent
        g.add(bx(0.1, 0.08, 0.06, STEEL_DARK, sx * (w / 4), 0.5, d / 2 - 0.28)); // tap
      }
      const brPipe = cyl(0.035, 0.035, w / 2 - 0.1, METAL, 0, 1.05, 0, 8);
      brPipe.rotation.z = Math.PI / 2;
      g.add(brPipe);
      g.add(bx(0.34, 0.28, 0.24, WOOD_PALE, 0, 0.26, d / 2 - 0.24)); // grain sack shelf
      break;
    }
    case "curing_barn": {
      // tobacco curing rig: open timber frame with hanging leaf bundles
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          g.add(bx(0.12, 1.5, 0.12, WOOD_DARK, (sx * (w - 0.3)) / 2, 0.75, (sz * (d - 0.3)) / 2));
      g.add(bx(w - 0.15, 0.1, 0.12, WOOD, 0, 1.5, -(d - 0.3) / 2)); // top rails
      g.add(bx(w - 0.15, 0.1, 0.12, WOOD, 0, 1.5, (d - 0.3) / 2));
      for (let r = 0; r < 2; r++) {
        const rail = bx(0.06, 0.06, d - 0.4, WOOD, -w / 6 + r * (w / 3), 1.42, 0);
        g.add(rail);
        for (let i = 0; i < 4; i++) {
          // hanging leaf bundle: stem + drooping leaves
          const zz = -d / 3 + i * (d / 4.5);
          const xx = -w / 6 + r * (w / 3);
          g.add(cyl(0.012, 0.012, 0.16, WOOD_DARK, xx, 1.32, zz, 5));
          g.add(cyl(0.02, 0.1, 0.5, r % 2 ? GREEN_DARK : TERRACOTTA, xx, 0.98, zz, 7));
        }
      }
      g.add(bx(0.5, 0.24, 0.34, WOOD_PALE, w / 3, 0.12, d / 3)); // packed crate
      break;
    }
    case "gun_mill": {
      // barrel mill: enclosed bed, spindle head driving a blank through the
      // chuck, chip tray and coolant line, control panel on the end
      g.add(bx(w - 0.2, 0.5, d - 0.24, STEEL_DARK, 0, 0.25, 0)); // cabinet base
      g.add(bx(w - 0.14, 0.1, d - 0.16, METAL, 0, 0.55, 0)); // bed
      for (const sx of [-1, 1]) g.add(bx(0.12, 0.1, d - 0.3, SAWBLADE, sx * 0.34, 0.63, 0)); // ways
      g.add(bx(0.5, 0.46, d - 0.28, METAL, -w / 2 + 0.36, 0.83, 0)); // headstock
      g.add(cyl(0.13, 0.13, 0.16, STEEL_DARK, -w / 2 + 0.66, 0.83, 0, 12).rotateZ(Math.PI / 2)); // chuck
      const gmBlank = cyl(0.05, 0.05, 0.92, SAWBLADE, 0.06, 0.83, 0, 10); // barrel blank
      gmBlank.rotation.z = Math.PI / 2;
      g.add(gmBlank);
      g.add(bx(0.26, 0.3, 0.22, STEEL_DARK, w / 2 - 0.42, 0.8, -0.1)); // tailstock
      g.add(bx(0.22, 0.16, 0.2, STEEL_ORANGE, -0.1, 0.72, d / 2 - 0.18)); // tool post
      g.add(bx(w - 0.5, 0.04, 0.16, METAL, 0.1, 0.6, d / 2 - 0.1)); // chip tray
      const gmCool = cyl(0.02, 0.02, 0.3, METAL, -0.2, 1.02, -0.08, 6);
      gmCool.rotation.z = 0.8;
      g.add(gmCool); // coolant line
      g.add(bx(0.24, 0.3, 0.04, SCREEN, w / 2 - 0.22, 0.92, d / 2 - 0.14)); // control panel
      for (let i = 0; i < 2; i++)
        g.add(cyl(0.03, 0.03, 0.03, i ? EMBER : GOODS[3], w / 2 - 0.28 + i * 0.11, 0.72, d / 2 - 0.14, 8));
      g.add(bx(0.3, 0.06, 0.3, STEEL_DARK, -w / 2 + 0.3, 0.03, 0)); // foot pad
      break;
    }
    case "delivery_space": {
      // exactly the pallets used outdoors, minus the ground apron — the
      // building's own floor shows through, with the bay marked out on it
      const MARK = new THREE.MeshStandardMaterial({ color: 0xc9a648, roughness: 0.9 });
      for (const sx of [-1, 1]) g.add(bx(w - 0.16, 0.012, 0.06, MARK, 0, 0.006, (sx * (d - 0.16)) / 2));
      for (const sz of [-1, 1]) g.add(bx(0.06, 0.012, d - 0.16, MARK, (sz * (w - 0.16)) / 2, 0.006, 0));
      g.add(makeDock(fill, 5, false));
      break;
    }
    case "mining_rack_s":
    case "mining_rack_m":
    case "mining_rack_l": {
      // server cabinets: dark frame, stacked unit faces with green status LEDs
      const LED = new THREE.MeshStandardMaterial({
        color: 0x0d1410,
        emissive: 0x51e07a,
        emissiveIntensity: 0.9,
        roughness: 0.5,
      });
      const cabinets = itemId === "mining_rack_l" ? 2 : 1;
      const cabW = itemId === "mining_rack_s" ? w - 0.25 : (w - 0.4) / cabinets;
      const cabH = itemId === "mining_rack_s" ? 1.15 : 1.9;
      const units = itemId === "mining_rack_s" ? 2 : 4;
      for (let cb = 0; cb < cabinets; cb++) {
        const cx = cabinets === 1 ? 0 : -w / 2 + 0.2 + cabW / 2 + cb * (cabW + 0.1);
        g.add(bx(cabW, cabH, d - 0.3, FABRIC_DARK, cx, cabH / 2, 0)); // frame
        for (let u = 0; u < units; u++) {
          const uy = 0.25 + (u + 0.5) * ((cabH - 0.35) / units);
          g.add(bx(cabW - 0.14, (cabH - 0.5) / units - 0.05, 0.05, u % 2 ? STEEL_DARK : METAL, cx, uy, d / 2 - 0.16));
          g.add(bx(0.05, 0.05, 0.03, LED, cx - cabW / 2 + 0.14, uy, d / 2 - 0.12));
          // vent slots
          for (let k = 0; k < 3; k++)
            g.add(bx(0.03, (cabH - 0.5) / units - 0.14, 0.02, FABRIC_DARK, cx + 0.06 + k * 0.09, uy, d / 2 - 0.13));
        }
      }
      // cable tray on top
      g.add(bx(w - 0.5, 0.06, 0.16, METAL, 0, (itemId === "mining_rack_s" ? 1.15 : 1.9) + 0.04, -d / 6));
      break;
    }
    case "desk": {
      // office desk: top, drawer pedestal with handles, monitor + keyboard + papers
      g.add(bx(w - 0.05, 0.06, d - 0.1, WOOD, 0, 0.74, 0));
      g.add(bx(0.08, 0.72, d - 0.2, WOOD_DARK, -(w - 0.2) / 2, 0.37, 0)); // left leg panel
      g.add(bx(0.5, 0.68, d - 0.18, WOOD_DARK, (w - 0.6) / 2, 0.35, 0)); // drawer unit
      for (const y of [0.2, 0.42])
        g.add(bx(0.3, 0.03, 0.04, METAL, (w - 0.6) / 2, y, d / 2 - 0.12)); // handles
      const mon = bx(0.4, 0.26, 0.03, SCREEN, -w / 6, 1.02, -d / 8);
      mon.rotation.x = -0.08;
      g.add(mon);
      g.add(cyl(0.04, 0.08, 0.14, PLASTIC, -w / 6, 0.83, -d / 8, 8)); // monitor stand
      g.add(bx(0.34, 0.02, 0.12, FABRIC_DARK, -w / 6, 0.78, d / 10)); // keyboard
      g.add(bx(0.2, 0.01, 0.28, PAPER, w / 5, 0.78, d / 10)); // papers
      break;
    }
    case "chair": {
      // office chair: cushioned seat/back, post, 5-star base
      g.add(bx(0.5, 0.09, 0.48, FABRIC, 0, 0.47, 0));
      const back = bx(0.48, 0.55, 0.08, FABRIC, 0, 0.82, -0.24);
      back.rotation.x = 0.08;
      g.add(back);
      g.add(cyl(0.035, 0.035, 0.3, METAL, 0, 0.28, 0, 8));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leg = bx(0.22, 0.04, 0.05, PLASTIC, Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14);
        leg.rotation.y = -a;
        g.add(leg);
      }
      break;
    }
    case "plant": {
      // terracotta pot with rim, trunk, layered foliage
      g.add(cyl(0.19, 0.14, 0.3, TERRACOTTA, 0, 0.15, 0));
      g.add(cyl(0.21, 0.2, 0.06, TERRACOTTA, 0, 0.3, 0));
      g.add(cyl(0.16, 0.16, 0.02, WOOD_DARK, 0, 0.31, 0)); // soil
      g.add(cyl(0.03, 0.045, 0.4, WOOD_DARK, 0, 0.5, 0, 6));
      const blob1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), GREEN);
      blob1.position.set(0.03, 0.82, 0);
      blob1.castShadow = true;
      const blob2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), GREEN_DARK);
      blob2.position.set(-0.12, 0.68, 0.08);
      blob2.castShadow = true;
      const blob3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), GREEN);
      blob3.position.set(0.1, 0.66, -0.12);
      blob3.castShadow = true;
      g.add(blob1, blob2, blob3);
      break;
    }
    case "rug": {
      // two-tone rug with border and slight thickness
      const base = bx(w - 0.12, 0.025, d - 0.12, FABRIC, 0, 0.013, 0);
      base.castShadow = false;
      g.add(base);
      const inner = bx(w - 0.45, 0.012, d - 0.45, new THREE.MeshStandardMaterial({ color: 0xa4756a, roughness: 1 }), 0, 0.032, 0);
      inner.castShadow = false;
      g.add(inner);
      const center = bx(w - 1.0, 0.012, d - 1.0, new THREE.MeshStandardMaterial({ color: 0x6d4a56, roughness: 1 }), 0, 0.042, 0);
      center.castShadow = false;
      if (w > 1.2 && d > 1.2) g.add(center);
      break;
    }
  }
  return g;
}
