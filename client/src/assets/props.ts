import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, hashSeed } from "@mc/shared";
import { registerNight } from "../render/lights.js";

export interface Placement {
  x: number;
  z: number;
  rot?: number;
  scale?: number;
}

function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  places: Placement[],
  castShadow = true
): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, places.length);
  const M = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  places.forEach((p, i) => {
    q.setFromAxisAngle(up, p.rot ?? 0);
    const s = p.scale ?? 1;
    M.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(s, s, s));
    m.setMatrixAt(i, M);
  });
  m.castShadow = castShadow;
  m.receiveShadow = true;
  m.instanceMatrix.needsUpdate = true;
  return m;
}

// -------------------------------------------------------------- trees

export const TREE_SPECIES = 3;

export function treeGeometries(species: number): { trunk: THREE.BufferGeometry; foliage: THREE.BufferGeometry } {
  const rng = mulberry32(hashSeed(species, 0x7ee5));

  // A canopy is built around the trunk axis: lobes sit on a ring at even
  // angles, so the crown is always centred over the trunk. The old version
  // offset each blob independently, which let a tree end up with its whole
  // canopy hanging off to one side.
  const ring = (count: number, radius: number, y: number, size: number, lift: number) => {
    const out: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.35;
      const b = new THREE.IcosahedronGeometry(size * (0.85 + rng() * 0.3), 1);
      b.translate(Math.cos(a) * radius, y + (rng() - 0.5) * lift, Math.sin(a) * radius);
      out.push(b);
    }
    return out;
  };
  const trunk = (rTop: number, rBase: number, h: number) =>
    new THREE.CylinderGeometry(rTop, rBase, h, 7).translate(0, h / 2, 0);

  if (species === 1) {
    // conifer: four tiers tapering to a point
    const cones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.ConeGeometry(1.12 - i * 0.25, 1.3, 8);
      c.translate(0, 1.5 + i * 0.68, 0);
      cones.push(c);
    }
    return { trunk: trunk(0.09, 0.16, 1.5), foliage: mergeGeometries(cones)! };
  }

  if (species === 2) {
    // small ornamental: one rounded crown, slightly flattened, with low lobes
    const crown = new THREE.IcosahedronGeometry(0.92, 1);
    crown.scale(1, 0.86, 1);
    crown.translate(0, 2.0, 0);
    return {
      trunk: trunk(0.08, 0.14, 1.7),
      foliage: mergeGeometries([crown, ...ring(3, 0.5, 1.82, 0.5, 0.1)])!,
    };
  }

  // broadleaf: a centred crown with a ring of lobes below it
  const crown = new THREE.IcosahedronGeometry(0.98, 1);
  crown.translate(0, 2.55, 0);
  return {
    trunk: trunk(0.1, 0.18, 2.0),
    foliage: mergeGeometries([crown, ...ring(4, 0.66, 2.15, 0.64, 0.16)])!,
  };
}

const FOLIAGE_COLORS = [
  [0x4e7a38, 0x5b8a42, 0x44702f],
  [0x3a5f3a, 0x2f5233, 0x466b46],
  [0x7a8a3a, 0x6b7a33, 0x8a9a4a],
];

export function makeTrees(placesBySpecies: Placement[][]): THREE.Group {
  const g = new THREE.Group();
  g.name = "trees";
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4433, roughness: 0.95 });
  for (let s = 0; s < TREE_SPECIES; s++) {
    const places = placesBySpecies[s];
    if (!places?.length) continue;
    const { trunk, foliage } = treeGeometries(s);
    const foliageMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const fol = instanced(foliage, foliageMat, places);
    const colors = FOLIAGE_COLORS[s];
    const rng = mulberry32(hashSeed(s, 0xc0102));
    const c = new THREE.Color();
    places.forEach((_, i) => {
      c.setHex(colors[Math.floor(rng() * colors.length)]);
      c.offsetHSL(0, 0, (rng() - 0.5) * 0.06);
      fol.setColorAt(i, c);
    });
    fol.instanceColor!.needsUpdate = true;
    g.add(instanced(trunk, trunkMat, places), fol);
  }
  return g;
}

// -------------------------------------------------------------- streetlights

export function makeStreetlights(places: Placement[]): THREE.Group {
  const g = new THREE.Group();
  g.name = "streetlights";
  if (!places.length) return g;
  const pole = new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6).translate(0, 2.1, 0);
  const arm = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6);
  arm.rotateX(Math.PI / 2);
  arm.translate(0, 4.1, 0.55);
  const poleGeo = mergeGeometries([pole, arm])!;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f3438, metalness: 0.6, roughness: 0.5 });
  g.add(instanced(poleGeo, poleMat, places));

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0x222018,
    emissive: 0xffc873,
    emissiveIntensity: 0,
  });
  registerNight(bulbMat, 4.0);
  const bulb = new THREE.SphereGeometry(0.13, 8, 8);
  bulb.scale(1, 0.6, 1.6);
  bulb.translate(0, 4.05, 1.05);
  g.add(instanced(bulb, bulbMat, places, false));

  // soft radial light pool on the pavement (no hard edge), faded in at night
  const poolCanvas = document.createElement("canvas");
  poolCanvas.width = poolCanvas.height = 128;
  const pctx = poolCanvas.getContext("2d")!;
  const grad = pctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, 128, 128);
  const poolTex = new THREE.CanvasTexture(poolCanvas);
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    color: 0xffc37a,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  registerNight(poolMat as never, 0.55);
  const pool = new THREE.PlaneGeometry(5.2, 5.2);
  pool.rotateX(-Math.PI / 2);
  pool.translate(0, 0.04, 1.05);
  g.add(instanced(pool, poolMat, places, false));

  // volumetric light cone from the lamp head down to the pool
  const coneCanvas = document.createElement("canvas");
  coneCanvas.width = 16;
  coneCanvas.height = 128;
  const cctx = coneCanvas.getContext("2d")!;
  const cgrad = cctx.createLinearGradient(0, 0, 0, 128);
  cgrad.addColorStop(0, "rgba(255,255,255,0.85)");
  cgrad.addColorStop(0.5, "rgba(255,255,255,0.25)");
  cgrad.addColorStop(1, "rgba(255,255,255,0)");
  cctx.fillStyle = cgrad;
  cctx.fillRect(0, 0, 16, 128);
  const coneTex = new THREE.CanvasTexture(coneCanvas);
  const coneMat = new THREE.MeshBasicMaterial({
    map: coneTex,
    color: 0xffc37a,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  registerNight(coneMat as never, 0.16);
  const cone = new THREE.ConeGeometry(1.9, 3.95, 16, 1, true);
  cone.translate(0, 4.05 - 3.95 / 2, 1.05); // apex at the bulb, base on the pool
  g.add(instanced(cone, coneMat, places, false));
  return g;
}

// -------------------------------------------------------------- street furniture

export function makeBenches(places: Placement[]): THREE.InstancedMesh | null {
  if (!places.length) return null;
  const parts: THREE.BufferGeometry[] = [];
  const seat = new THREE.BoxGeometry(1.5, 0.08, 0.45).translate(0, 0.45, 0);
  const back = new THREE.BoxGeometry(1.5, 0.4, 0.07).translate(0, 0.75, -0.2);
  const legL = new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(-0.6, 0.22, 0);
  const legR = new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(0.6, 0.22, 0);
  parts.push(seat, back, legL, legR);
  const geo = mergeGeometries(parts)!;
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.9 });
  return instanced(geo, mat, places);
}

export function makeHydrants(places: Placement[]): THREE.InstancedMesh | null {
  if (!places.length) return null;
  const body = new THREE.CylinderGeometry(0.14, 0.17, 0.55, 8).translate(0, 0.28, 0);
  const cap = new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.58, 0);
  const nozzle = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6);
  nozzle.rotateZ(Math.PI / 2);
  nozzle.translate(0, 0.4, 0);
  const geo = mergeGeometries([body, cap, nozzle])!;
  const mat = new THREE.MeshStandardMaterial({ color: 0xa33327, roughness: 0.6, metalness: 0.2 });
  return instanced(geo, mat, places);
}
