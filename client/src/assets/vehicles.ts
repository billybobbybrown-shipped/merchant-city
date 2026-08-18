import * as THREE from "three";
import { hashSeed, mulberry32, pick } from "@mc/shared";
import { registerNight } from "../render/lights.js";

// Procedural low-poly road vehicles, scaled to the world's 2m tiles and
// 1.75m citizens: sedans, SUVs, vans and pickup trucks. Real-car
// proportions, dark glasshouse, headlights and taillights that come on at
// night. Each vehicle is a small Group; materials are shared per palette
// entry so forty cars cost little.

export type VehicleType = "sedan" | "suv" | "van" | "truck";
export const VEHICLE_TYPES: VehicleType[] = ["sedan", "suv", "van", "truck"];

const BODY_COLORS = [
  0x9ea4a8, 0x2c3338, 0x7a1f1f, 0x1d3a5f, 0xd8d6d0, 0x3d4a3a, 0x5b3a24, 0x22262a,
  0x8c2f3f, 0x2f5d52, 0xc0c4c8, 0x4a4e55,
];

const glassMat = new THREE.MeshStandardMaterial({ color: 0x10171d, roughness: 0.25, metalness: 0.2 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0x8b9094, roughness: 0.5, metalness: 0.4 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.8 });
const bodyMats = new Map<number, THREE.MeshStandardMaterial>();
const bodyMat = (c: number) => {
  let m = bodyMats.get(c);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.25 });
    bodyMats.set(c, m);
  }
  return m;
};

function wheels(g: THREE.Group, positions: Array<[number, number]>, r = 0.34, w = 0.24) {
  for (const [x, z] of positions) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, r, z);
    g.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.02, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, r, z);
    g.add(hub);
  }
}

function lights(g: THREE.Group, halfW: number, y: number, frontZ: number, backZ: number) {
  const head = new THREE.MeshStandardMaterial({
    color: 0xd8dee2, emissive: 0xfff6d8, emissiveIntensity: 0, roughness: 0.4,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: 0x7d1f1f, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.4,
  });
  registerNight(head, 1.4);
  registerNight(tail, 1.0);
  for (const sx of [-halfW + 0.16, halfW - 0.16]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.05), head);
    h.position.set(sx, y, frontZ);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.05), tail);
    t.position.set(sx, y, backZ);
    g.add(t);
  }
}

// Vehicles face -Z (the direction of travel after lookAt-style yaw math).
export function makeVehicle(type: VehicleType, seed: number): THREE.Group {
  const rng = mulberry32(hashSeed(seed, 0xca7));
  const col = pick(rng, BODY_COLORS);
  const body = bodyMat(col);
  const g = new THREE.Group();

  if (type === "sedan") {
    // 4.4 x 1.78, low hood + trunk, cabin set inboard
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.5, 4.4), body);
    base.position.y = 0.48;
    base.castShadow = true;
    g.add(base);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.44, 2.2), body);
    cabin.position.set(0, 0.95, 0.15);
    cabin.castShadow = true;
    g.add(cabin);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.3, 2.0), glassMat);
    glass.position.set(0, 0.97, 0.15);
    g.add(glass);
    wheels(g, [[-0.78, -1.45], [0.78, -1.45], [-0.78, 1.45], [0.78, 1.45]]);
    lights(g, 0.89, 0.58, -2.21, 2.21);
  } else if (type === "suv") {
    // 4.6 x 1.9, tall body, near-full-length glasshouse
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 4.6), body);
    base.position.y = 0.62;
    base.castShadow = true;
    g.add(base);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.5, 3.1), body);
    cabin.position.set(0, 1.22, 0.25);
    cabin.castShadow = true;
    g.add(cabin);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.34, 2.9), glassMat);
    glass.position.set(0, 1.24, 0.25);
    g.add(glass);
    // roof rails
    for (const sx of [-0.7, 0.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 2.6), trimMat);
      rail.position.set(sx, 1.51, 0.25);
      g.add(rail);
    }
    wheels(g, [[-0.84, -1.5], [0.84, -1.5], [-0.84, 1.5], [0.84, 1.5]], 0.38, 0.26);
    lights(g, 0.95, 0.76, -2.31, 2.31);
  } else if (type === "van") {
    // 5.0 x 1.94, one tall volume with a short sloped nose
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.94, 1.34, 4.3), body);
    box.position.set(0, 1.03, 0.35);
    box.castShadow = true;
    g.add(box);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.62, 0.8), body);
    nose.position.set(0, 0.65, -2.1);
    nose.castShadow = true;
    g.add(nose);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.5, 0.06), glassMat);
    windshield.position.set(0, 1.28, -1.53);
    windshield.rotation.x = -0.22;
    g.add(windshield);
    for (const sx of [-0.98, 0.98]) {
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 1.4), glassMat);
      sideGlass.position.set(sx, 1.32, -0.7);
      g.add(sideGlass);
    }
    wheels(g, [[-0.86, -1.55], [0.86, -1.55], [-0.86, 1.45], [0.86, 1.45]], 0.36, 0.26);
    lights(g, 0.97, 0.7, -2.51, 2.51);
  } else {
    // pickup: cab forward, open bed behind
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 4.9), body);
    frame.position.y = 0.62;
    frame.castShadow = true;
    g.add(frame);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.62, 1.7), body);
    cab.position.set(0, 1.18, -0.75);
    cab.castShadow = true;
    g.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.4, 1.5), glassMat);
    glass.position.set(0, 1.2, -0.75);
    g.add(glass);
    // bed walls
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.06, 2.2), trimMat);
    bedFloor.position.set(0, 0.9, 1.35);
    g.add(bedFloor);
    for (const sx of [-0.88, 0.88]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 2.2), body);
      wall.position.set(sx, 1.05, 1.35);
      g.add(wall);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.36, 0.06), body);
    gate.position.set(0, 1.05, 2.42);
    g.add(gate);
    wheels(g, [[-0.86, -1.6], [0.86, -1.6], [-0.86, 1.6], [0.86, 1.6]], 0.4, 0.28);
    lights(g, 0.95, 0.72, -2.46, 2.46);
  }
  // scaled to sit right against the world's stylised people and 2m lanes
  g.scale.setScalar(0.78);
  return g;
}
