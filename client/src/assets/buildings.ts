import * as THREE from "three";
import { BuildingDef, buildingLayout, BuildingLayout, clusterRects, mulberry32, hashSeed, PlanRect, rint, rrange, chance, pick, WingLayout } from "@mc/shared";
import { BlankRegion, facadeTexture, roofTexture, signTexture, awningColor } from "../render/textures.js";
import { registerNight } from "../render/lights.js";

const FLOOR_H = 2.6;

function gableRoofGeometry(w: number, d: number, h: number): THREE.BufferGeometry {
  const w2 = w / 2;
  const d2 = d / 2;
  // prettier-ignore
  const verts = new Float32Array([
    // south slope
    -w2, 0,  d2,   w2, 0,  d2,   w2, h, 0,
    -w2, 0,  d2,   w2, h, 0,   -w2, h, 0,
    // north slope
     w2, 0, -d2,  -w2, 0, -d2,  -w2, h, 0,
     w2, 0, -d2,  -w2, h, 0,    w2, h, 0,
    // east gable
     w2, 0,  d2,   w2, 0, -d2,   w2, h, 0,
    // west gable
    -w2, 0, -d2,  -w2, 0,  d2,  -w2, h, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

function wallMaterial(maps: ReturnType<typeof facadeTexture>): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: maps.map,
    emissiveMap: maps.emissiveMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    roughness: maps.glassy ? 0.25 : 0.85,
    metalness: maps.glassy ? 0.55 : 0.02,
    envMapIntensity: maps.glassy ? 0.9 : 0.25,
  });
  registerNight(mat, 1.05);
  return mat;
}

interface BoxOpts {
  door?: boolean; // street entrance on the front (+z) face
  frontBlankAll?: boolean; // +z face pressed against another block — bare wall
  backBlank?: BlankRegion; // -z face partially covered by an attached wing
}

const ALL_BLANK: BlankRegion = { c0: 0, c1: 999, rows: 999 };

function box(
  w: number,
  h: number,
  d: number,
  def: BuildingDef,
  seedSalt: number,
  opts: BoxOpts = {}
): THREE.Mesh {
  const colsFront = Math.max(2, Math.round(w / 1.5));
  const colsSide = Math.max(2, Math.round(d / 1.5));
  const floors = Math.max(1, Math.round(h / FLOOR_H));
  // same seed for every face so the whole building shares one base color;
  // ONLY the street-facing front gets a door — the back face gets a doorless
  // variant so touching/back-to-back buildings never show a door into a wall
  const front = wallMaterial(
    facadeTexture(
      def.kind, def.style, floors, colsFront, def.seed + seedSalt,
      opts.frontBlankAll ? false : !!opts.door,
      opts.frontBlankAll ? ALL_BLANK : undefined
    )
  );
  const back = wallMaterial(
    facadeTexture(def.kind, def.style, floors, colsFront, def.seed + seedSalt, false, opts.backBlank)
  );
  const side = wallMaterial(facadeTexture(def.kind, def.style, floors, colsSide, def.seed + seedSalt, false));
  const roof = new THREE.MeshStandardMaterial({ map: roofTexture(def.seed), roughness: 0.95 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, front, back]);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// edges: 0 = front (+z), 1 = back (-z), 2 = +x, 3 = -x
function addParapet(g: THREE.Group, w: number, d: number, y: number, color: number, skipEdges: number[] = []) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const t = 0.14;
  const hh = 0.35;
  const edges = [
    [0, d / 2 - t / 2, w, t],
    [0, -d / 2 + t / 2, w, t],
    [w / 2 - t / 2, 0, t, d - 2 * t],
    [-w / 2 + t / 2, 0, t, d - 2 * t],
  ] as const;
  edges.forEach(([sx, sz, lx, lz], i) => {
    if (skipEdges.includes(i)) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, hh, lz), mat);
    m.position.set(sx, y + hh / 2, sz);
    m.castShadow = true;
    g.add(m);
  });
}

// shared prop materials
const METAL = new THREE.MeshStandardMaterial({ color: 0xa8adb2, roughness: 0.5, metalness: 0.5 });
const METAL_DARK = new THREE.MeshStandardMaterial({ color: 0x4c5257, roughness: 0.55, metalness: 0.45 });
const GRILLE = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.9 });

// rooftop AC unit: housing on feet, fan grille with ring + blades, conduit pipe
function makeACUnit(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const s = rrange(rng, 0.7, 1.2);
  const bodyH = 0.5 * s;
  const body = new THREE.Mesh(new THREE.BoxGeometry(s, bodyH, s * 0.8), METAL);
  body.position.y = bodyH / 2 + 0.06;
  body.castShadow = true;
  g.add(body);
  for (const fx of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.06, s * 0.7), METAL_DARK);
    foot.position.set(fx * s * 0.35, 0.03, 0);
    g.add(foot);
  }
  const grille = new THREE.Mesh(new THREE.CircleGeometry(s * 0.27, 16), GRILLE);
  grille.rotation.x = -Math.PI / 2;
  grille.position.y = bodyH + 0.062;
  g.add(grille);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 0.27, 0.018 * s + 0.008, 6, 18), METAL_DARK);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = bodyH + 0.06;
  g.add(ring);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(s * 0.48, 0.014, 0.055 * s), METAL_DARK);
  blade.position.y = bodyH + 0.075;
  const blade2 = blade.clone();
  blade2.rotation.y = Math.PI / 2;
  g.add(blade, blade2);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, bodyH, 6), METAL_DARK);
  pipe.position.set(s * 0.53, bodyH / 2 + 0.05, s * 0.18);
  g.add(pipe);
  g.rotation.y = (Math.floor(rng() * 4) * Math.PI) / 2;
  return g;
}

// turbine roof vent: tapered stem, ribbed dome cap, finial
function makeVent(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const s = rrange(rng, 0.8, 1.15);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.14 * s, 0.4 * s, 10), METAL);
  stem.position.y = 0.2 * s;
  stem.castShadow = true;
  g.add(stem);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.1 * s, 0.06 * s, 10), METAL_DARK);
  collar.position.y = 0.42 * s;
  g.add(collar);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.17 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    METAL_DARK
  );
  cap.position.y = 0.44 * s;
  cap.castShadow = true;
  g.add(cap);
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 0.09 * s, 6), METAL);
  finial.position.y = 0.63 * s;
  g.add(finial);
  return g;
}

function addRoofClutter(g: THREE.Group, w: number, d: number, y: number, rng: () => number) {
  const n = rint(rng, 1, 3);
  for (let i = 0; i < n; i++) {
    const ac = makeACUnit(rng);
    ac.position.set(rrange(rng, -w / 3, w / 3), y, rrange(rng, -d / 3, d / 3));
    g.add(ac);
  }
  if (chance(rng, 0.6)) {
    const vent = makeVent(rng);
    vent.position.set(rrange(rng, -w / 3, w / 3), y, rrange(rng, -d / 3, d / 3));
    g.add(vent);
  }
}

// The facade texture leaves a windowless band above the top window row; the
// sign sits centered in that band so it never overlaps windows.
function addSign(g: THREE.Group, def: BuildingDef, w: number, d: number, h: number, floors: number) {
  if (def.sign === false) return;
  const tex = signTexture(def.name, def.seed);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.6,
  });
  registerNight(mat, 0.9);
  const texH = Math.max(72, floors * 36 + 16);
  const bandFrac = (texH - floors * 36 + 6) / texH;
  const signH = Math.min(h * bandFrac * 0.72, 1.2);
  const sw = Math.min(w * 0.85, signH * 4.5);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, signH), mat);
  sign.position.set(0, h * (1 - bandFrac / 2), d / 2 + 0.06);
  g.add(sign);
}

// Awning above the door; when a def is given the shop's sign is printed on the
// awning face itself instead of hanging on the wall.
function addAwning(g: THREE.Group, w: number, d: number, rng: () => number, def?: BuildingDef) {
  const mat = new THREE.MeshStandardMaterial({
    color: awningColor(rng as never),
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const aw = Math.min(w * 0.6, 4);
  const tilt = -0.55;
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(aw, 0.9), mat);
  awning.position.set(0, 2.15, d / 2 + 0.42);
  awning.rotation.x = tilt;
  awning.castShadow = true;
  g.add(awning);
  if (def && def.sign !== false) {
    const tex = signTexture(def.name, def.seed);
    const smat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    registerNight(smat, 0.9);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(aw * 0.9, 3.4), 0.55), smat);
    // sit flush on the awning surface, nudged out along its normal
    const n = new THREE.Vector3(0, Math.sin(-tilt), Math.cos(-tilt)).multiplyScalar(0.03);
    sign.position.set(0, 2.15 + n.y, d / 2 + 0.42 + n.z);
    sign.rotation.x = tilt;
    g.add(sign);
  }
}

// Rear wing planning/construction for L-shaped buildings. The wing is always
// lower than the main block, blank-walled where it meets it, parapet-free on
// the shared edge, and the main block skips the back windows the wing covers.
interface WingSpec {
  w2: number;
  floors2: number;
  side: number;
}

function addExposedBackRim(g: THREE.Group, w: number, d: number, y: number, color: number, wing: WingLayout) {
  const len = w - wing.w - 0.14;
  if (len < 0.3) return;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.14), mat);
  m.position.set((-wing.side * wing.w) / 2, y + 0.175, -d / 2 + 0.07);
  m.castShadow = true;
  g.add(m);
}

function backBlankFor(w: number, wing: WingLayout): BlankRegion {
  const colsFront = Math.max(2, Math.round(w / 1.5));
  const fx0 = wing.side === 1 ? 1 - wing.w / w : 0;
  const fx1 = wing.side === 1 ? 1 : wing.w / w;
  // the back (-z) face is mirrored in x relative to the front
  return {
    c0: Math.max(0, Math.floor((1 - fx1) * colsFront)),
    c1: Math.min(colsFront, Math.ceil((1 - fx0) * colsFront)),
    rows: wing.floors,
  };
}

function addRearWing(g: THREE.Group, def: BuildingDef, L: BuildingLayout, trim: number) {
  const wing = L.wing!;
  const sameH = wing.floors === def.floors;
  // the wing penetrates 0.3 into the main block so the walls join seamlessly
  const OVERLAP = 0.3;
  const h2 = wing.floors * FLOOR_H;
  const dRender = wing.d + OVERLAP;
  const mainBack = L.centerZ - L.d / 2;
  // 1.2cm inset from flush — a flush wing shares a wall plane with the main
  // block in the overlap zone and the windows z-fight
  const wingX = wing.side * ((L.w - wing.w) / 2 - 0.012);
  const wg = new THREE.Group();
  wg.add(box(wing.w, h2, dRender, def, 0, { frontBlankAll: true }));
  addParapet(wg, wing.w, dRender, h2, trim, [0]); // no parapet on the buried edge
  wg.position.set(wingX, 0, mainBack + (OVERLAP - wing.d) / 2);
  g.add(wg);

  if (sameH) {
    // one continuous borderless roof deck across both sections — covers the
    // boxes' own framed roof faces so no joint line or z-fighting shows
    const h = def.floors * FLOOR_H;
    const deckMat = new THREE.MeshStandardMaterial({
      map: roofTexture(def.seed, false),
      roughness: 0.95,
    });
    const deckMain = new THREE.Mesh(new THREE.BoxGeometry(L.w, 0.07, L.d), deckMat);
    deckMain.position.set(0, h + 0.035, L.centerZ);
    deckMain.receiveShadow = true;
    g.add(deckMain);
    const deckWing = new THREE.Mesh(new THREE.BoxGeometry(wing.w, 0.07, wing.d), deckMat);
    deckWing.position.set(wingX, h + 0.035, mainBack - wing.d / 2);
    deckWing.receiveShadow = true;
    g.add(deckWing);
  }
}

// Player-designed building: union of drawn sections. Sections share one color,
// join seamlessly (touching sides interpenetrate), one continuous roof deck,
// parapet traces the union outline, door on the street-most section.
function buildCustom(g: THREE.Group, def: BuildingDef, fw: number, fd: number, trim: number, rng: () => number) {
  const shape: PlanRect[] = def.shape ?? [];
  if (!shape.length) return;
  const lx = (cx: number) => -fw / 2 + cx;
  const lz = (cy: number) => -fd / 2 + cy;
  const inside = (x: number, y: number) =>
    shape.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  // per-cell roof height: the tallest section covering that cell
  const secH = (r: PlanRect) => (r.f ?? def.floors) * FLOOR_H;
  const heightAt = (x: number, y: number) => {
    let hh = 0;
    for (const r of shape)
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) hh = Math.max(hh, secH(r));
    return hh;
  };
  const levels = [...new Set(shape.map(secH))];

  // one door per connected cluster (separate buildings on one lot each get
  // their own entrance), on that cluster's street-most section
  const doorRects = new Set<PlanRect>();
  for (const cluster of clusterRects(shape)) {
    let front = cluster[0];
    for (const r of cluster) if (r.y + r.h > front.y + front.h) front = r;
    doorRects.add(front);
  }

  // walls: one box per section, expanded 0.15 into touching neighbours so the
  // joint is buried (never coplanar, never a slit)
  shape.forEach((r, i) => {
    let eL = 0, eR = 0, eF = 0, eB = 0;
    shape.forEach((o, j) => {
      if (i === j) return;
      const xOv = r.x < o.x + o.w && o.x < r.x + r.w;
      const yOv = r.y < o.y + o.h && o.y < r.y + r.h;
      if (xOv && o.y + o.h === r.y) eB = 0.15;
      if (xOv && r.y + r.h === o.y) eF = 0.15;
      if (yOv && o.x + o.w === r.x) eL = 0.15;
      if (yOv && r.x + r.w === o.x) eR = 0.15;
    });
    const bw = r.w + eL + eR;
    const bd = r.h + eF + eB;
    const m = box(bw, secH(r), bd, def, 0, { door: doorRects.has(r) });
    m.position.x = lx(r.x) + r.w / 2 + (eR - eL) / 2;
    m.position.z = lz(r.y) + r.h / 2 + (eF - eB) / 2;
    g.add(m);
  });

  // continuous roof deck from cell row-runs (butting slabs, never overlapping)
  const deckMat = new THREE.MeshStandardMaterial({
    map: roofTexture(def.seed, false),
    roughness: 0.95,
  });
  for (let y = 0; y < fd; y++) {
    let run = -1;
    let runH = 0;
    for (let x = 0; x <= fw; x++) {
      const hh = x < fw ? heightAt(x, y) : 0;
      if (hh !== runH && run >= 0) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(x - run, 0.07, 1), deckMat);
        slab.position.set(lx(run) + (x - run) / 2, runH + 0.035, lz(y) + 0.5);
        slab.receiveShadow = true;
        g.add(slab);
        run = -1;
      }
      if (hh > 0 && run < 0) {
        run = x;
        runH = hh;
      }
      if (hh === 0) runH = 0;
    }
  }

  // parapet traces the union outline (runs + corner posts, offset inward)
  const pMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.9 });
  const T = 0.14;
  const PH = 0.35;
  const seg = (w: number, d: number, x: number, z: number, atH: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, PH, d), pMat);
    m.position.set(x, atH + PH / 2, z);
    m.castShadow = true;
    g.add(m);
  };
  // each roof level gets its own parapet where it meets lower ground/outside
  for (const H of levels) {
    const inH = (x: number, y: number) => heightAt(x, y) === H;
    const lower = (x: number, y: number) => heightAt(x, y) < H;
    for (let y = 0; y <= fd; y++)
      for (const dir of [-1, 1] as const) {
        let run = -1;
        for (let x = 0; x <= fw; x++) {
          const edge =
            x < fw &&
            (dir === -1 ? inH(x, y) && lower(x, y - 1) : inH(x, y - 1) && lower(x, y));
          if (edge && run < 0) run = x;
          if (!edge && run >= 0) {
            seg(x - run, T, lx(run) + (x - run) / 2, lz(y) + (dir === -1 ? T / 2 : -T / 2), H);
            run = -1;
          }
        }
      }
    for (let x = 0; x <= fw; x++)
      for (const dir of [-1, 1] as const) {
        let run = -1;
        for (let y = 0; y <= fd; y++) {
          const edge =
            y < fd &&
            (dir === -1 ? inH(x, y) && lower(x - 1, y) : inH(x - 1, y) && lower(x, y));
          if (edge && run < 0) run = y;
          if (!edge && run >= 0) {
            seg(T, y - run, lx(x) + (dir === -1 ? T / 2 : -T / 2), lz(run) + (y - run) / 2, H);
            run = -1;
          }
        }
      }
    for (let vy = 0; vy <= fd; vy++)
      for (let vx = 0; vx <= fw; vx++) {
        const a = inH(vx - 1, vy - 1);
        const b2 = inH(vx, vy - 1);
        const c = inH(vx - 1, vy);
        const d2 = inH(vx, vy);
        const cnt = +a + +b2 + +c + +d2;
        if (cnt === 1) {
          const px = a || c ? -1 : 1;
          const pz = a || b2 ? -1 : 1;
          seg(T, T, lx(vx) + (px * T) / 2, lz(vy) + (pz * T) / 2, H);
        } else if (cnt === 3) {
          const px = !a || !c ? 1 : -1;
          const pz = !a || !b2 ? 1 : -1;
          seg(T, T, lx(vx) + (px * T) / 2, lz(vy) + (pz * T) / 2, H);
        }
      }
  }

  // roof clutter on the biggest section
  const big = shape.reduce((m, r) => (r.w * r.h > m.w * m.h ? r : m), shape[0]);
  const clutter = new THREE.Group();
  clutter.position.set(lx(big.x) + big.w / 2, 0, lz(big.y) + big.h / 2);
  addRoofClutter(clutter, big.w * 0.8, big.h * 0.8, secH(big) + 0.07, rng);
  g.add(clutter);
}

// Builds one building sized for a footprint (world units), origin at ground center.
// Front facade faces +z; city.ts rotates the group toward the lot's street.
export function makeBuilding(def: BuildingDef, fw: number, fd: number): THREE.Group {
  const g = new THREE.Group();
  const rng = mulberry32(hashSeed(def.seed, 0xa55e7));
  const trim = 0x3c4348;
  // structural dims come from the SHARED layout so interiors match exactly
  const layout = buildingLayout(def, fw, fd);

  switch (def.kind) {
    case "custom": {
      buildCustom(g, def, fw, fd, trim, rng);
      break;
    }
    case "house": {
      const w = layout.w;
      const d = layout.d;
      const h = def.floors * FLOOR_H * 0.92;
      g.add(box(w, h, d, def, 0, { door: true }));
      const roofMat = new THREE.MeshStandardMaterial({
        color: pick(rng, [0x6e4a3a, 0x54555a, 0x5a4a44, 0x475259]),
        roughness: 0.95,
      });
      const roof = new THREE.Mesh(
        gableRoofGeometry(w * 1.08, d * 1.12, rrange(rng, 1.1, 1.9)),
        roofMat
      );
      roof.position.set(0, h, 0);
      roof.castShadow = true;
      g.add(roof);
      break;
    }
    case "shop": {
      // street-wall width: rowhouse shops share walls with their neighbors
      const w = layout.w;
      const h = def.floors * FLOOR_H;
      const wing = layout.wing ?? null;
      const dMain = layout.d;
      const main = new THREE.Group();
      main.add(box(w, h, dMain, def, 0, { door: true, backBlank: wing ? backBlankFor(w, wing) : undefined }));
      const sameH = wing && wing.floors === def.floors;
      addParapet(main, w, dMain, h, trim, sameH ? [1] : []);
      if (sameH) addExposedBackRim(main, w, dMain, h, trim, wing);
      addRoofClutter(main, w, dMain, h, rng);
      if (chance(rng, 0.7)) addAwning(main, w, dMain, rng, def); // sign rides the awning
      else addSign(main, def, w, dMain, h, def.floors);
      main.position.z = layout.centerZ; // front stays on the street line
      g.add(main);
      if (wing) addRearWing(g, def, layout, trim);
      break;
    }
    case "office": {
      const w = layout.w;
      const h = def.floors * FLOOR_H;
      const wing = layout.wing ?? null;
      const dMain = layout.d;
      const main = new THREE.Group();
      main.add(box(w, h, dMain, def, 0, { door: true, backBlank: wing ? backBlankFor(w, wing) : undefined }));
      const sameH = wing && wing.floors === def.floors;
      addParapet(main, w, dMain, h, trim, sameH ? [1] : []);
      if (sameH) addExposedBackRim(main, w, dMain, h, trim, wing);
      addRoofClutter(main, w, dMain, h, rng);
      addSign(main, def, w, dMain, h, def.floors);
      main.position.z = layout.centerZ;
      g.add(main);
      if (wing) addRearWing(g, def, layout, trim);
      break;
    }
    case "skyscraper": {
      const w = layout.w;
      const d = layout.d;
      const massing = layout.variant ?? 1; // original stepped or monolith slab

      const addMast = (topY: number, tall: number) => {
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.09, tall, 6),
          new THREE.MeshStandardMaterial({ color: 0x8b9196, metalness: 0.6, roughness: 0.4 })
        );
        mast.position.y = topY + tall / 2;
        g.add(mast);
        const beacon = new THREE.MeshStandardMaterial({
          color: 0x330000,
          emissive: 0xff3020,
          emissiveIntensity: 0,
        });
        registerNight(beacon, 2.2);
        const bb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), beacon);
        bb.position.y = topY + tall;
        g.add(bb);
      };

      if (massing === 0) {
        // the original stepped design — the one stacked style we keep
        const f1 = Math.max(3, Math.round(def.floors * 0.5));
        const f2 = Math.max(2, Math.round(def.floors * 0.3));
        const f3 = Math.max(1, def.floors - f1 - f2);
        const h1 = f1 * FLOOR_H;
        const h2 = f2 * FLOOR_H;
        const h3 = f3 * FLOOR_H;
        g.add(box(w, h1, d, def, 0, { door: true }));
        const s2 = box(w * 0.82, h2, d * 0.82, def, 0);
        s2.position.y = h1 + h2 / 2;
        g.add(s2);
        const s3 = box(w * 0.64, h3, d * 0.64, def, 0);
        s3.position.y = h1 + h2 + h3 / 2;
        g.add(s3);
        addParapet(g, w, d, h1, trim);
        addParapet(g, w * 0.82, d * 0.82, h1 + h2, trim);
        addParapet(g, w * 0.64, d * 0.64, h1 + h2 + h3, trim);
        addRoofClutter(g, w * 0.64, d * 0.64, h1 + h2 + h3, rng);
        addMast(h1 + h2 + h3, 4.2);
        addSign(g, def, w, d, h1, f1);
      } else {
        // monolith slab: one full-height volume, mechanical penthouse crown
        const h = def.floors * FLOOR_H;
        const mw = w; // layout already applied the monolith inset
        const md = d;
        g.add(box(mw, h, md, def, 0, { door: true }));
        addParapet(g, mw, md, h, trim);
        const pent = new THREE.Mesh(
          new THREE.BoxGeometry(mw * 0.4, 1.7, md * 0.4),
          new THREE.MeshStandardMaterial({ color: 0x565b5e, roughness: 0.8 })
        );
        pent.position.y = h + 0.85;
        pent.castShadow = true;
        g.add(pent);
        addRoofClutter(g, mw * 0.55, md * 0.55, h, rng);
        addMast(h + 1.7, 3.6);
        addSign(g, def, mw, md, h, def.floors); // crown sign
      }
      break;
    }
    case "apartment": {
      const w = layout.w;
      const h = def.floors * FLOOR_H;
      const wing = layout.wing ?? null;
      const dMain = layout.d;
      const main = new THREE.Group();
      main.add(box(w, h, dMain, def, 0, { door: true, backBlank: wing ? backBlankFor(w, wing) : undefined }));
      const sameH = wing && wing.floors === def.floors;
      addParapet(main, w, dMain, h, trim, sameH ? [1] : []);
      if (sameH) addExposedBackRim(main, w, dMain, h, trim, wing);
      addRoofClutter(main, w, dMain, h, rng);
      main.position.z = layout.centerZ;
      g.add(main);
      if (wing) addRearWing(g, def, layout, trim);
      break;
    }
    case "tower": {
      const w = layout.w;
      const d = layout.d;
      const h = def.floors * FLOOR_H;
      g.add(box(w, h, d, def, 0, { door: true }));
      addParapet(g, w, d, h, trim);
      const pent = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.35, 1.4, d * 0.35),
        new THREE.MeshStandardMaterial({ color: 0x565b5e, roughness: 0.8 })
      );
      pent.position.y = h + 0.7;
      pent.castShadow = true;
      g.add(pent);
      addRoofClutter(g, w * 0.55, d * 0.55, h, rng);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.06, 2.4, 6),
        new THREE.MeshStandardMaterial({ color: 0x8b9196, metalness: 0.6, roughness: 0.4 })
      );
      mast.position.y = h + 1.4 + 1.2;
      g.add(mast);
      const beacon = new THREE.MeshStandardMaterial({
        color: 0x330000,
        emissive: 0xff3020,
        emissiveIntensity: 0,
      });
      registerNight(beacon, 2.2);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), beacon);
      b.position.y = h + 1.4 + 2.4;
      g.add(b);
      addSign(g, def, w, d, h, def.floors);
      break;
    }
    case "warehouse": {
      const w = layout.w;
      const d = layout.d;
      const h = rrange(rng, 3.8, 5.4);
      g.add(box(w, h, d, def, 0, { door: true }));
      addParapet(g, w, d, h, 0x50565a);
      addRoofClutter(g, w, d, h, rng);
      break;
    }
    case "factory": {
      const w = layout.w;
      const d = layout.d;
      const h = 2 * FLOOR_H;
      g.add(box(w, h, d, def, 0, { door: true }));
      addParapet(g, w, d, h, 0x50565a);

      // brick smokestack: tapered stack, mid band, steel collar, dark flue
      const chimney = new THREE.Group();
      const brickMat = new THREE.MeshStandardMaterial({ color: 0x7a4a3a, roughness: 0.95 });
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.54, 4.2, 12), brickMat);
      stack.position.y = 2.1;
      stack.castShadow = true;
      chimney.add(stack);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.49, 0.16, 12), METAL_DARK);
      band.position.y = 1.4;
      chimney.add(band);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.39, 0.34, 12), METAL_DARK);
      collar.position.y = 4.1;
      collar.castShadow = true;
      chimney.add(collar);
      const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12), GRILLE);
      flue.position.y = 4.28;
      chimney.add(flue);
      chimney.position.set(-w / 3, h - 0.4, -d / 4);
      g.add(chimney);

      // roof vents, the same ones every other roof carries
      for (const off of [
        [w / 3.2, d / 5],
        [w / 4.5, -d / 4.5],
      ]) {
        const vent = makeVent(rng);
        vent.position.set(off[0], h, off[1]);
        g.add(vent);
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
