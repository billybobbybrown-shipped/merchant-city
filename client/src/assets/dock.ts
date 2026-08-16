import * as THREE from "three";
import { DOCK_SIZE } from "@mc/shared";

// weathered timber, in three tones so the boards don't read as one slab
const DECK = [
  new THREE.MeshStandardMaterial({ color: 0xa8845a, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x9a7850, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0xb18e63, roughness: 0.95 }),
];
const BLOCK = new THREE.MeshStandardMaterial({ color: 0x7d6242, roughness: 0.96 });
const GROUND = new THREE.MeshStandardMaterial({ color: 0x54585e, roughness: 0.98 });
const CARD = [
  new THREE.MeshStandardMaterial({ color: 0xc39a68, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0xb08d5e, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0xa88052, roughness: 0.9 }),
];
const TAPE = new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.75 });
const LABEL = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.92 });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rot = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rot;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// One timber pallet: bottom boards, three stringer blocks each side, and a
// slatted top deck with the gaps you'd actually see.
function pallet(size: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const H = 0.14; // deck height off the ground
  // bottom runners
  for (const z of [-size / 2 + 0.06, 0, size / 2 - 0.06])
    g.add(box(size, 0.03, 0.1, BLOCK, 0, 0.015, z));
  // corner + centre blocks
  for (const x of [-size / 2 + 0.08, 0, size / 2 - 0.08])
    for (const z of [-size / 2 + 0.08, 0, size / 2 - 0.08])
      g.add(box(0.12, H - 0.05, 0.12, BLOCK, x, 0.03 + (H - 0.05) / 2, z));
  // slatted top deck — 5 boards with gaps between them
  const boards = 5;
  const gap = 0.045;
  const bw = (size - gap * (boards - 1)) / boards;
  for (let i = 0; i < boards; i++) {
    const x = -size / 2 + bw / 2 + i * (bw + gap);
    g.add(box(bw, 0.035, size, DECK[(seed + i) % DECK.length], x, H, 0));
  }
  return g;
}

// a packed carton, taped and labelled
function carton(size: number, seed: number, x: number, y: number, z: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const h = size * 0.78;
  g.add(box(size, h, size, CARD[seed % CARD.length], x, y + h / 2, z, rot));
  const tape = box(0.05, 0.012, size + 0.01, TAPE, x, y + h + 0.004, z, rot);
  g.add(tape);
  const seam = box(size + 0.01, 0.008, 0.012, BLOCK, x, y + h + 0.001, z, rot);
  g.add(seam);
  const label = box(size * 0.34, h * 0.3, 0.008, LABEL, x, y + h * 0.58, z, rot);
  label.position.add(new THREE.Vector3(Math.sin(rot) * (size / 2), 0, Math.cos(rot) * (size / 2)));
  g.add(label);
  return g;
}

// The delivery space: four timber pallets on a swept apron, loading up with
// cartons as the bay fills. `fill` is 0..1 of the bay's capacity.
export function makeDock(fill: number, seed: number, apron = true): THREE.Group {
  const g = new THREE.Group();
  const S = DOCK_SIZE;

  // swept ground under the pallet, kept subtle so the timber reads first.
  // Indoors the building already has a floor, so the apron is dropped.
  if (apron) g.add(box(S - 0.04, 0.03, S - 0.04, GROUND, 0, 0.015, 0));

  const palletSize = S - 0.14;
  const p = pallet(palletSize, seed);
  p.position.set(0, 0.03, 0);
  p.rotation.y = (seed % 4) * 0.03;
  g.add(p);

  // Cartons stack onto the one pallet as the bay fills: a square of four to a
  // layer, two layers deep, so a full bay is a proper stack and an empty one
  // is bare timber.
  const perLayer = 4;
  const layers = 2;
  const clamped = Math.max(0, Math.min(1, fill));
  const loaded = clamped <= 0 ? 0 : Math.max(1, Math.round(clamped * perLayer * layers));
  const size = palletSize * 0.42;
  const half = palletSize * 0.21;
  for (let i = 0; i < loaded; i++) {
    const lvl = Math.floor(i / perLayer);
    const slot = i % perLayer;
    const cx = slot % 2 === 0 ? -half : half;
    const cz = slot < 2 ? -half : half;
    const y = 0.03 + 0.175 + lvl * (size * 0.82);
    const jx = (((seed + i * 7) % 5) - 2) / 160;
    const jz = (((seed + i * 11) % 5) - 2) / 160;
    g.add(carton(size * (1 - lvl * 0.05), seed + i * 3, cx + jx, y, cz + jz, ((seed + i) % 6) * 0.05));
  }
  return g;
}
