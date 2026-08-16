import * as THREE from "three";
import { mulberry32, hashSeed, rrange, SourceType, PlanRect } from "@mc/shared";

const DIRT = new THREE.MeshStandardMaterial({ color: 0x6b5537, roughness: 1 });
const DIRT_DARK = new THREE.MeshStandardMaterial({ color: 0x584631, roughness: 1 });
const WHEAT_CROP = new THREE.MeshStandardMaterial({ color: 0xc9a648, roughness: 0.95 });
const CORN_CROP = new THREE.MeshStandardMaterial({ color: 0x6f9a3f, roughness: 0.95 });
const CARROT_CROP = new THREE.MeshStandardMaterial({ color: 0x4e7a38, roughness: 0.95 });
const COTTON_PLANT = new THREE.MeshStandardMaterial({ color: 0x7a9a5a, roughness: 0.95 });
const COTTON_BOLL = new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.9 });
const ROCK = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.95 });
const ROCK_DARK = new THREE.MeshStandardMaterial({ color: 0x6f7275, roughness: 0.95 });
const GRAVEL = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 1 });
const TIMBER = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.9 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x5a6066, metalness: 0.55, roughness: 0.5 });
const TRUNK = new THREE.MeshStandardMaterial({ color: 0x5a4433, roughness: 0.95 });
const LEAF = new THREE.MeshStandardMaterial({ color: 0x4e7a38, roughness: 0.9 });
const LEAF_DARK = new THREE.MeshStandardMaterial({ color: 0x3a5f30, roughness: 0.9 });

function bx(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Production-site visuals built over the UNION of the drawn sections, so
// adjacent sections merge into one continuous field/site — same idea as
// building sections sharing walls and a continuous roof.
// rects are in lot cells; W/H are the lot cell dims; origin = lot center,
// front toward +z (caller rotates like buildings).
// A worked pit, dug in below grade. The ground over it is cut away (see
// cutGroundHole), so what you see through the gap is this: benches stepping
// down the sides to a floor well below the surface.
// `spent` (0..1) is how much of the deposit has come out — the pit gets deeper
// and its benches step further in as it is worked.
function makePit(
  x0: number,
  z0: number,
  w: number,
  d: number,
  rng: () => number,
  spent: number,
  rock: THREE.Material,
  rockDark: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  const dug = Math.max(0.05, Math.min(1, spent));
  const benches = 2 + Math.round(dug * 3);
  const depth = 0.5 + dug * 3.2; // how far below grade the floor lies
  const reach = 0.16 + dug * 0.26; // how much of the claim the benches eat into

  for (let i = 0; i < benches; i++) {
    const t = i / benches;
    const inset = reach * t * Math.min(w, d);
    const next = ((reach * (i + 1)) / benches) * Math.min(w, d);
    const band = Math.max(0.35, next - inset);
    // this bench's floor, and the wall dropping to the one below it
    const y = -depth * t;
    const ow = w - inset * 2;
    const od = d - inset * 2;
    const mat = i % 2 ? rockDark : rock;
    const cx = x0 + w / 2;
    const cz = z0 + d / 2;
    const wallH = depth / benches + 0.06;
    g.add(bx(ow, wallH, band, mat, cx, y - wallH / 2, cz - od / 2 + band / 2));
    g.add(bx(ow, wallH, band, mat, cx, y - wallH / 2, cz + od / 2 - band / 2));
    g.add(bx(band, wallH, od - band * 2, mat, cx - ow / 2 + band / 2, y - wallH / 2, cz));
    g.add(bx(band, wallH, od - band * 2, mat, cx + ow / 2 - band / 2, y - wallH / 2, cz));
  }

  // the floor of the working
  const eat = reach * Math.min(w, d) * 2;
  const fw = Math.max(0.8, w - eat);
  const fd = Math.max(0.8, d - eat);
  g.add(bx(fw, 0.12, fd, rockDark, x0 + w / 2, -depth - 0.06, z0 + d / 2));
  return g;
}

export function makeSourceArea(
  type: SourceType,
  seed: number,
  rects: PlanRect[],
  W: number,
  H: number,
  spent = 0
): THREE.Group {
  const g = new THREE.Group();
  const rng = mulberry32(hashSeed(seed, 0x50c3e));

  // cell union
  const cells = new Set<number>();
  for (const r of rects)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) cells.add(y * 512 + x);
  const inside = (x: number, y: number) => cells.has(y * 512 + x);
  const lx = (cx: number) => -W / 2 + cx; // left edge of cell column
  const lz = (cy: number) => -H / 2 + cy; // top edge of cell row

  // contiguous x-runs per row → seamless ground slabs, no overlaps
  const runs: Array<{ y: number; x0: number; x1: number }> = [];
  for (let y = 0; y < H; y++) {
    let start = -1;
    for (let x = 0; x <= W; x++) {
      const inCell = x < W && inside(x, y);
      if (inCell && start < 0) start = x;
      if (!inCell && start >= 0) {
        runs.push({ y, x0: start, x1: x });
        start = -1;
      }
    }
  }
  const ground = (mat: THREE.Material, h: number) => {
    for (const r of runs)
      g.add(bx(r.x1 - r.x0, h, 1, mat, lx(r.x0) + (r.x1 - r.x0) / 2, h / 2, lz(r.y) + 0.5));
  };
  // biggest drawn section hosts the landmark structure (pit, portal, pump…)
  const main = rects.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a), rects[0]);
  const mainC = { x: lx(main.x) + main.w / 2, z: lz(main.y) + main.h / 2 };
  const cellList = [...cells].map((k) => ({ x: k % 512, y: Math.floor(k / 512) }));

  switch (type) {
    case "logging": {
      ground(DIRT, 0.07);
      for (const c of cellList) {
        if (rng() > 0.55) continue;
        const x = lx(c.x) + 0.5 + rrange(rng, -0.22, 0.22);
        const z = lz(c.y) + 0.5 + rrange(rng, -0.22, 0.22);
        const s = rrange(rng, 0.7, 1.2);
        if (rng() < 0.18) {
          // stump
          const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.17 * s, 0.3 * s, 6), TRUNK);
          stump.position.set(x, 0.15 * s, z);
          stump.castShadow = true;
          g.add(stump);
          continue;
        }
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.14 * s, 1.6 * s, 6), TRUNK);
        trunk.position.set(x, 0.8 * s, z);
        trunk.castShadow = true;
        g.add(trunk);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 * s, 1), rng() < 0.5 ? LEAF : LEAF_DARK);
        crown.position.set(x, 1.85 * s, z);
        crown.castShadow = true;
        g.add(crown);
      }
      // felled log pile on the main section's front edge
      for (let i = 0; i < 3; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, rrange(rng, 1.1, 1.8), 7), TRUNK);
        log.rotation.z = Math.PI / 2;
        log.position.set(mainC.x + rrange(rng, -0.5, 0.5), 0.14 + i * 0.11, lz(main.y + main.h) - 0.55);
        log.castShadow = true;
        g.add(log);
      }
      break;
    }
    case "farm_wheat":
    case "farm_corn":
    case "farm_carrots":
    case "cotton_field": {
      ground(DIRT, 0.09);
      // furrow ridges: one continuous strip per ground run
      for (const r of runs)
        g.add(bx(r.x1 - r.x0 - 0.12, 0.1, 0.26, DIRT_DARK, lx(r.x0) + (r.x1 - r.x0) / 2, 0.14, lz(r.y) + 0.5));
      // one plant per cell — rows read continuous across merged sections
      for (const c of cellList) {
        const x = lx(c.x) + 0.5 + rrange(rng, -0.12, 0.12);
        const z = lz(c.y) + 0.5;
        if (type !== "cotton_field") {
          const mat =
            type === "farm_wheat" ? WHEAT_CROP : type === "farm_corn" ? CORN_CROP : CARROT_CROP;
          g.add(bx(0.3, rrange(rng, 0.35, 0.55), 0.22, mat, x, 0.35, z));
        } else {
          g.add(bx(0.24, 0.32, 0.2, COTTON_PLANT, x, 0.3, z));
          const boll = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), COTTON_BOLL);
          boll.position.set(x, 0.52, z);
          boll.castShadow = true;
          g.add(boll);
        }
      }
      break;
    }
    case "quarry_stone":
    case "quarry_iron":
    case "quarry_gold": {
      // the pit takes the whole area that was marked out for it
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const r of rects) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
      }
      g.add(
        makePit(lx(minX), lz(minY), maxX - minX, maxY - minY, rng, spent, ROCK, ROCK_DARK)
      );
      // remember the mouth so the caller can cut the ground over it
      (g.userData as { pitMouth?: { x: number; z: number; halfW: number; halfD: number } }).pitMouth = {
        x: lx(minX) + (maxX - minX) / 2,
        z: lz(minY) + (maxY - minY) / 2,
        halfW: (maxX - minX) / 2,
        halfD: (maxY - minY) / 2,
      };
      break;
    }
    case "oil_well": {
      ground(DIRT, 0.07);
      // pump jack on the biggest section
      const px = mainC.x;
      const pz = mainC.z;
      g.add(bx(2.6, 0.25, 1.2, STEEL, px, 0.13, pz));
      g.add(bx(0.18, 1.7, 0.18, STEEL, px - 0.5, 1.1, pz - 0.3));
      g.add(bx(0.18, 1.7, 0.18, STEEL, px - 0.5, 1.1, pz + 0.3));
      const beam = bx(2.4, 0.16, 0.3, STEEL, px, 1.95, pz);
      beam.rotation.z = -0.12;
      g.add(beam);
      const head = bx(0.42, 0.55, 0.34, new THREE.MeshStandardMaterial({ color: 0x8a4b2f, roughness: 0.7 }), px + 1.1, 1.8, pz);
      head.rotation.z = -0.12;
      g.add(head);
      g.add(bx(0.5, 0.6, 0.4, STEEL, px - 1.15, 1.62, pz));
      const wellhead = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.8, 8), STEEL);
      wellhead.position.set(px + 1.1, 0.4, pz);
      wellhead.castShadow = true;
      g.add(wellhead);
      // barrels scattered on outlying cells
      let barrels = 0;
      for (const c of cellList) {
        if (barrels >= 4 || rng() > 0.12) continue;
        const b = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.26, 0.62, 9),
          new THREE.MeshStandardMaterial({ color: 0x7a3b2a, roughness: 0.7 })
        );
        b.position.set(lx(c.x) + 0.5, 0.31, lz(c.y) + 0.5);
        b.castShadow = true;
        g.add(b);
        barrels++;
      }
      break;
    }
  }
  g.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  return g;
}
