import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  type Appearance,
  hairHex,
  hairStyle,
  pantsHex,
  pantsStyle,
  shirtHex,
  shirtStyle,
  shoeStyle,
  shoesHex,
  skinHex,
} from "@mc/shared";

// One avatar is one draw call: every part is baked into a single merged
// geometry with its colour written into vertex colours. Adding detail costs
// triangles, not draw calls — which matters with a few hundred citizens about.
//
// Two rules keep them looking like people rather than assembled shapes:
// detail that sits ON the body is a curved panel at the body's own radius, not
// a floating slab; and the trunk is only as wide as the limbs hanging off it.

const EYE = "#14181c";

export type BoneName =
  | "spine" | "head"
  | "armL" | "foreL" | "armR" | "foreR"
  | "legL" | "shinL" | "legR" | "shinR";

interface Part {
  geo: THREE.BufferGeometry;
  color: string;
  // which bone drives this piece; everything unmarked rides the spine
  bone?: BoneName;
  // for a surface that spans a colour change (the trunk, where the shirt meets
  // the trousers) — decided per vertex, so there's no seam in the geometry
  colorAt?: (y: number) => string;
}

// proportions — a slim trunk that the arms and legs actually belong to
const HEAD_Y = 1.665;
const HEAD_R = 0.2;
const HEAD_SQUASH: [number, number, number] = [1, 1.06, 0.94];
const BODY_Y = 1.12;
const BODY_R = 0.185; // trunk half-width; arms hang just outside it
const ARM_X = 0.225;
const HIP_Y = 0.62;
const LEG_X = 0.1;

const FZ = -1; // characters face -z, so a face offset is negative z
const FRONT_A = Math.PI; // and the front of a cylinder is a half turn round

// Limbs are built between explicit joints, so a limb always starts inside the
// part it hangs off and can never drift loose. `bone` lays a tapered cylinder
// from a to b whatever direction that is.
type P3 = [number, number, number];
const V = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);
const UP = new THREE.Vector3(0, 1, 0);
function bone(a: P3, b: P3, rA: number, rB: number, seg = 10) {
  const dir = V(b).sub(V(a));
  const len = dir.length();
  // the +y end of a cylinder is its "top", and that end lands on b
  const g = new THREE.CylinderGeometry(rB, rA, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
const joint = (p: P3, r: number, seg = 10) => at(sph(r, seg), p[0], p[1], p[2]);

// the skeleton: shoulders and hips sit INSIDE the trunk, so every limb roots
// under the body's surface instead of butting against it
const SHOULDER_Y = 1.375;
const SHOULDER_X = 0.082; // the hidden root; elbow and wrist set where the arm hangs
const ELBOW: P3 = [0.205, 0.99, 0.01];
const WRIST: P3 = [0.235, 0.66, 0.02];
const HIP_JOINT_Y = 0.8; // up inside the seat, not level with its underside
const KNEE_Y = 0.42;
const ANKLE_Y = 0.1;
const TRUNK_TOP = 1.33;
const TRUNK_BOT = 0.72;
const WAIST_Y = 0.9; // shirt hem: trunk is one shape, the colour changes here

const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, seg = 12) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2));

// an open curved panel wrapping a body of radius r, centred on angle `a`
const shell = (r: number, h: number, a: number, span: number, seg = 10) =>
  new THREE.CylinderGeometry(r, r, h, seg, 1, true, a - span / 2, span);

// a squashed sphere — the workhorse for hair, beards and soft shapes
function blob(r: number, sx: number, sy: number, sz: number, seg = 12) {
  const g = sph(r, seg);
  g.scale(sx, sy, sz);
  return g;
}

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

// Hair sits on the head like hair, not like a helmet: a crown that wraps the
// skull, sides and back with an arc left open at the front, plus a fringe cap
// that stops well above the eyes. Both use the head's own radius and squash,
// so they follow the skull rather than hovering off it.
// Hair is a single cap sitting on the skull, tilted back so its edge rides
// high across the forehead and low over the nape — the way a hairline runs.
// The previous face-shaped hole cut a square notch at the temples and stood
// off the head; this hugs it.
function hairCap(grow: number, theta: number, tilt = 0.3) {
  const g = new THREE.SphereGeometry(HEAD_R + grow, 22, 14, 0, Math.PI * 2, 0, theta);
  g.scale(HEAD_SQUASH[0], HEAD_SQUASH[1], HEAD_SQUASH[2]);
  g.rotateX(tilt);
  return at(g, 0, HEAD_Y, 0);
}

// The trunk is one lathed surface from seat to shoulders, so hips, waist and
// chest flow into each other with no seam to catch the eye. The waistline is a
// colour change on that surface, not a joint between two shapes.
const HEM_Y = 0.93;
export const TRUNK_PROFILE: Array<[number, number]> = [
  [0.001, 0.622],
  [0.072, 0.638],
  [0.118, 0.668],
  [0.148, 0.702],
  [0.168, 0.748],
  [0.172, 0.79],
  [0.166, 0.86],
  // a tight pair of rings either side of the hem: vertex colours blend between
  // rings, so without these the shirt would airbrush into the trousers
  [0.1546, 0.924],
  [0.1538, 0.936],
  [0.153, 0.95],
  [0.157, 1.05],
  [0.166, 1.16],
  [0.173, 1.27],
  [0.172, 1.32],
  [0.162, 1.36],
  [0.13, 1.392],
  [0.08, 1.412],
  [0.001, 1.425],
];

function trunk(a: Appearance, parts: Part[]) {
  const shirt = shirtHex(a);
  const pants = pantsHex(a);
  const geo = new THREE.LatheGeometry(
    TRUNK_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
    34
  );
  geo.computeVertexNormals();
  parts.push({ geo, color: shirt, colorAt: (y) => (y < HEM_Y ? pants : shirt) });
}

function arms(a: Appearance, parts: Part[]) {
  const skin = skinHex(a);
  const cloth = shirtHex(a);
  const long = shirtStyle(a) === "long";
  for (const sx of [-1, 1]) {
    // the shoulder end is buried in the chest — that's what keeps an arm on —
    // and it's narrow there, widening into the deltoid before tapering away
    const shoulder: P3 = [sx * SHOULDER_X, SHOULDER_Y, 0];
    const elbow: P3 = [sx * ELBOW[0], ELBOW[1], ELBOW[2]];
    const wrist: P3 = [sx * WRIST[0], WRIST[1], WRIST[2]];
    const along = (t: number): P3 => [
      shoulder[0] + (elbow[0] - shoulder[0]) * t,
      shoulder[1] + (elbow[1] - shoulder[1]) * t,
      0,
    ];
    const sleeveCloth = long ? cloth : skin;
    const upper: BoneName = sx < 0 ? "armL" : "armR";
    const fore: BoneName = sx < 0 ? "foreL" : "foreR";
    // A rounded deltoid where the arm leaves the chest. Two solids crossing at
    // an angle leave a hard crease; a sphere across the join turns that into a
    // smooth curve, and it stays under the shirt's surface.
    parts.push({ geo: joint([sx * 0.088, 1.298, 0], 0.072, 20), color: cloth, bone: upper });
    parts.push({ geo: bone(shoulder, along(0.3), 0.052, 0.063, 14), color: sleeveCloth, bone: upper });
    parts.push({ geo: bone(along(0.3), elbow, 0.063, 0.05, 14), color: sleeveCloth, bone: upper });
    parts.push({ geo: joint(elbow, 0.05), color: sleeveCloth, bone: fore });
    parts.push({ geo: bone(elbow, wrist, 0.05, 0.043), color: long ? cloth : skin, bone: fore });
    parts.push({ geo: joint(wrist, 0.044, 8), color: skin, bone: fore });
    parts.push({ geo: at(blob(0.05, 1, 1.2, 0.8, 8), wrist[0], wrist[1] - 0.06, wrist[2]), color: skin, bone: fore }); // hand
    if (long) {
      parts.push({ geo: at(blob(0.049, 1.06, 0.5, 1.06, 8), wrist[0], wrist[1] + 0.03, wrist[2]), color: cloth, bone: fore }); // cuff
    } else {
      // the sleeve starts far enough down the arm that its wide end stays under
      // the shoulder rather than showing as a rim
      parts.push({ geo: bone(along(0.19), along(0.66), 0.069, 0.064, 14), color: cloth, bone: upper });
    }
  }
}

function legs(a: Appearance, parts: Part[]) {
  const short = pantsStyle(a) === "shorts";
  const skin = skinHex(a);
  const cloth = pantsHex(a);

  for (const sx of [-1, 1]) {
    // hips start inside the trunk, same trick as the shoulders
    const hip: P3 = [sx * 0.05, HIP_JOINT_Y, 0];
    const knee: P3 = [sx * 0.092, KNEE_Y, 0];
    const ankle: P3 = [sx * 0.098, ANKLE_Y, 0];
    const hem: P3 = short ? [sx * 0.091, KNEE_Y + 0.075, 0] : knee;
    const thigh: BoneName = sx < 0 ? "legL" : "legR";
    const shin: BoneName = sx < 0 ? "shinL" : "shinR";
    parts.push({ geo: bone(hip, hem, 0.098, short ? 0.092 : 0.08, 18), color: cloth, bone: thigh });
    if (short) {
      parts.push({ geo: bone(hem, knee, 0.07, 0.066), color: skin, bone: thigh });
      parts.push({ geo: joint(knee, 0.066), color: skin, bone: shin });
      parts.push({ geo: bone(knee, ankle, 0.066, 0.056), color: skin, bone: shin });
    } else {
      parts.push({ geo: joint(knee, 0.08, 14), color: cloth, bone: shin });
      parts.push({ geo: bone(knee, ankle, 0.08, 0.068, 16), color: cloth, bone: shin });
    }
  }
}

function shoes(a: Appearance, parts: Part[]) {
  const style = shoeStyle(a);
  const skin = skinHex(a);
  if (style === "bare") {
    // still needs feet — a leg ending in a stump reads as a peg
    for (const sx of [-1, 1])
      parts.push({
        geo: at(blob(0.075, 0.9, 0.52, 1.5, 12), sx * LEG_X, 0.04, FZ * 0.035),
        color: skin,
        bone: sx < 0 ? "shinL" : "shinR",
      });
    return;
  }
  const c = shoesHex(a);
  for (const sx of [-1, 1]) {
    const x = sx * LEG_X;
    const shin: BoneName = sx < 0 ? "shinL" : "shinR";
    parts.push({ geo: at(blob(0.09, 0.85, 0.5, 1.45, 14), x, 0.045, FZ * 0.04), color: c, bone: shin });
    if (style === "boots") parts.push({ geo: at(cyl(0.08, 0.085, 0.19, 12), x, 0.15, 0), color: c, bone: shin });
    else parts.push({ geo: at(blob(0.092, 0.86, 0.15, 1.5, 14), x, 0.014, FZ * 0.04), color: "#eceff2", bone: shin }); // sneaker sole
  }
}

function head(a: Appearance, parts: Part[]) {
  const skin = skinHex(a);
  parts.push({ geo: bone([0, TRUNK_TOP - 0.06, 0], [0, HEAD_Y - 0.12, 0], 0.066, 0.049, 12), color: skin, bone: "head" }); // neck
  parts.push({ geo: at(blob(HEAD_R, HEAD_SQUASH[0], HEAD_SQUASH[1], HEAD_SQUASH[2], 16), 0, HEAD_Y, 0), color: skin, bone: "head" });
  // eyes, and nothing else on the face
  for (const sx of [-1, 1])
    parts.push({ geo: at(blob(0.037, 1, 1.12, 0.55, 10), sx * 0.072, HEAD_Y + 0.022, FZ * 0.168), color: EYE, bone: "head" });
}

function hair(a: Appearance, parts: Part[]) {
  const style = hairStyle(a);
  if (style === "bald") return;
  const c = hairHex(a);

  switch (style) {
    case "buzz":
      parts.push({ geo: hairCap(0.016, 1.3, 0.4), color: c, bone: "head" });
      break;
    case "bun":
      parts.push({ geo: hairCap(0.022, 1.36, 0.4), color: c, bone: "head" });
      parts.push({ geo: at(blob(0.088, 1, 0.94, 1, 14), 0, HEAD_Y + 0.14, 0.125), color: c, bone: "head" });
      break;
    case "afro": {
      // Volume comes entirely from closed puffs sitting on a tight cap. An
      // oversized open cap would show its rim as a flat plane from the side.
      parts.push({ geo: hairCap(0.02, 1.36, 0.4), color: c, bone: "head" });
      const ring = (count: number, reach: number, r: number, lift: number, spread = 1.95) => {
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
          const az = t * spread; // 0 is the back of the head; stops short of the face
          parts.push({
            geo: at(blob(r, 1, 0.94, 1, 9), Math.sin(az) * reach, HEAD_Y + lift, Math.cos(az) * reach),
            color: c,
            bone: "head",
          });
        }
      };
      ring(5, 0.13, 0.1, 0.175, 1.7); // crown
      ring(7, 0.195, 0.108, 0.085);
      ring(7, 0.215, 0.112, -0.02);
      ring(5, 0.185, 0.095, -0.12, 1.75);
      break;
    }
    case "mohawk":
      // nothing but the crest: a tall thin blade, short from front to back
      parts.push({ geo: at(blob(0.17, 0.17, 1.55, 0.82, 14), 0, HEAD_Y + 0.13, 0.005), color: c, bone: "head" });
      break;
  }
}

export function avatarParts(a: Appearance): Part[] {
  const parts: Part[] = [];
  trunk(a, parts);
  legs(a, parts);
  shoes(a, parts);
  arms(a, parts);
  head(a, parts);
  hair(a, parts);
  return parts;
}

export function avatarGeometry(a: Appearance): THREE.BufferGeometry {
  const parts = avatarParts(a);
  const col = new THREE.Color();
  for (const p of parts) {
    // Color.set() already lands in the renderer's linear working space with
    // colour management on — converting again is what turned every swatch
    // muddy, so the hex goes straight in
    col.set(p.color);
    const n = p.geo.attributes.position.count;
    const pos = p.geo.attributes.position;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (p.colorAt) col.set(p.colorAt(pos.getY(i)));
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    p.geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    // rigid skinning: every vertex of a piece rides one bone at full weight.
    // The pieces are small and joints are spheres, so nothing needs blending.
    const bi = BONE_ORDER.indexOf(p.bone ?? "spine");
    const idx = new Uint16Array(n * 4);
    const wt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = bi;
      wt[i * 4] = 1;
    }
    p.geo.setAttribute("skinIndex", new THREE.BufferAttribute(idx, 4));
    p.geo.setAttribute("skinWeight", new THREE.BufferAttribute(wt, 4));
    // merging needs matching attribute sets — drop what the material ignores
    p.geo.deleteAttribute("uv");
  }
  const merged = mergeGeometries(parts.map((p) => p.geo))!;
  for (const p of parts) p.geo.dispose();
  merged.computeBoundingSphere();
  return merged;
}

export const AVATAR_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.82,
  metalness: 0,
  // curved panels and shells are open surfaces; they need both faces
  side: THREE.DoubleSide,
});

// ---- rig ----------------------------------------------------------------
// The whole character is one mesh, so limbs can only move if it's skinned.
// The skeleton is deliberately small: hips and spine, an upper and lower bone
// per limb, and a head.

export const BONE_ORDER: BoneName[] = [
  "spine", "head", "armL", "foreL", "armR", "foreR", "legL", "shinL", "legR", "shinR",
];

export interface AvatarRig {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Record<BoneName, THREE.Bone>;
  root: THREE.Bone;
}

function makeBone(x: number, y: number, z: number, name = "") {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  return b;
}

export function makeAvatarRig(a: Appearance): AvatarRig {
  const group = new THREE.Group();
  const root = makeBone(0, 0, 0, "root");
  const pelvis = makeBone(0, HIP_JOINT_Y, 0, "pelvis");
  // positions are relative to the parent bone; at rest they land exactly where
  // the geometry was built, so binding leaves the model untouched
  const spine = makeBone(0, WAIST_Y - HIP_JOINT_Y, 0, "spine");
  const head = makeBone(0, HEAD_Y - 0.16 - WAIST_Y, 0, "head");
  const arm = (sx: number) => makeBone(sx * SHOULDER_X, SHOULDER_Y - WAIST_Y, 0);
  const fore = (sx: number) => makeBone(sx * (ELBOW[0] - SHOULDER_X), ELBOW[1] - SHOULDER_Y, ELBOW[2]);
  const leg = (sx: number) => makeBone(sx * 0.05, 0, 0);
  const shin = (sx: number) => makeBone(sx * 0.042, KNEE_Y - HIP_JOINT_Y, 0);

  const armL = arm(-1), armR = arm(1);
  const foreL = fore(-1), foreR = fore(1);
  const legL = leg(-1), legR = leg(1);
  const shinL = shin(-1), shinR = shin(1);

  root.add(pelvis);
  pelvis.add(spine, legL, legR);
  spine.add(head, armL, armR);
  armL.add(foreL);
  armR.add(foreR);
  legL.add(shinL);
  legR.add(shinR);
  root.updateMatrixWorld(true);

  const bones: Record<BoneName, THREE.Bone> = {
    spine, head, armL, foreL, armR, foreR, legL, shinL, legR, shinR,
  };
  const skeleton = new THREE.Skeleton(BONE_ORDER.map((n) => bones[n]));
  const mesh = new THREE.SkinnedMesh(avatarGeometry(a), AVATAR_MATERIAL);
  mesh.castShadow = true;
  mesh.add(root);
  mesh.bind(skeleton);
  group.add(mesh);
  return { group, mesh, bones, root };
}

// A walk, not a hop: legs swing from the hip and bend at the knee on the way
// through, arms counter-swing, the chest twists against the stride, and the
// body rises twice per stride — once over each leg.
export function poseWalk(rig: AvatarRig, phase: number, blend: number): number {
  const b = rig.bones;
  const k = Math.min(1, Math.max(0, blend));
  const swing = Math.sin(phase);
  // hips: one leg forward while the other drives back
  b.legL.rotation.x = swing * 0.34 * k;
  b.legR.rotation.x = -swing * 0.34 * k;
  // knees only ever bend one way, and most on the back swing
  b.shinL.rotation.x = -Math.max(0, -Math.sin(phase - 0.7)) * 0.5 * k;
  b.shinR.rotation.x = -Math.max(0, -Math.sin(phase + Math.PI - 0.7)) * 0.5 * k;
  // arms opposite the legs, elbows carried with a slight bend
  b.armL.rotation.x = -swing * 0.3 * k;
  b.armR.rotation.x = swing * 0.3 * k;
  b.foreL.rotation.x = (-0.14 - Math.max(0, -swing) * 0.3) * k;
  b.foreR.rotation.x = (-0.14 - Math.max(0, swing) * 0.3) * k;
  // the chest counter-rotates, and leans into the walk
  b.spine.rotation.y = swing * 0.09 * k;
  b.spine.rotation.x = -0.045 * k;
  b.head.rotation.y = -swing * 0.05 * k;
  // vertical travel of the body: two rises per stride, small
  return (0.5 - Math.cos(phase * 2) * 0.5) * 0.035 * k;
}
