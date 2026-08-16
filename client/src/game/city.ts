import * as THREE from "three";
import {
  buildingForLot,
  CityMap,
  chance,
  hashSeed,
  LotDef,
  mulberry32,
  rint,
  Tile,
  TILE_WORLD_SIZE as TS,
} from "@mc/shared";
import { buildGround } from "../render/ground.js";
import { makeBuilding } from "../assets/buildings.js";
import { makeHydrants, makeTrees, Placement, TREE_SPECIES } from "../assets/props.js";

// front facade is +z; rotation per stored lot facing (S, N, E, W)
const FACING_ROT = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

// derived (pre-existing city) building meshes by lot id — interiors hide them
export const derivedBuildings = new Map<number, THREE.Object3D>();

// kept so a single pre-existing building can be rebuilt when its owner renames
// it or turns its sign off, without regenerating the whole city
let cityRoot: THREE.Group | null = null;
let cityMap: CityMap | null = null;

function placeDerived(lot: LotDef, b: THREE.Object3D): void {
  b.position.set((lot.x + lot.w / 2) * TS, 0, (lot.y + lot.h / 2) * TS);
  b.rotation.y = FACING_ROT[lot.facing] ?? 0;
  b.updateMatrix();
}

// Re-render one pre-existing building with the owner's name on the sign, or
// with no sign at all. Returns false if this lot has no derived building.
export function restyleDerived(lotId: number, name: string | null, sign: boolean): boolean {
  const lot = cityMap?.lots.find((l) => l.id === lotId);
  if (!cityRoot || !cityMap || !lot) return false;
  const def = buildingForLot(cityMap.seed, lot);
  if (!def) return false;
  const sideways = lot.facing >= 2;
  const next = makeBuilding(
    { ...def, name: name?.trim() || def.name, sign },
    (sideways ? lot.h : lot.w) * TS,
    (sideways ? lot.w : lot.h) * TS
  );
  placeDerived(lot, next);
  const old = derivedBuildings.get(lotId);
  if (old) {
    next.visible = old.visible;
    cityRoot.remove(old);
  }
  cityRoot.add(next);
  derivedBuildings.set(lotId, next);
  return true;
}

export function buildCity(map: CityMap): THREE.Group {
  const root = new THREE.Group();
  root.name = "city";
  derivedBuildings.clear();
  cityRoot = root;
  cityMap = map;
  root.add(buildGround(map));

  // Countryside skirt so the horizon beyond the map edge is land, not sky-void.
  // It is a frame around the city rather than a sheet under it: anything dug in
  // below grade — a quarry, a mine — would otherwise be hidden behind it.
  const worldSize = map.width * TS;
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x4e7a3f, roughness: 1 });
  const span = worldSize * 3;
  for (const [w, d, x, z] of [
    [worldSize + span * 2, span, worldSize / 2, -span / 2],
    [worldSize + span * 2, span, worldSize / 2, worldSize + span / 2],
    [span, worldSize, -span / 2, worldSize / 2],
    [span, worldSize, worldSize + span / 2, worldSize / 2],
  ] as const) {
    const piece = new THREE.Mesh(new THREE.PlaneGeometry(w, d), skirtMat);
    piece.rotation.x = -Math.PI / 2;
    piece.position.set(x, -0.05, z);
    piece.receiveShadow = true;
    root.add(piece);
  }

  const tile = (x: number, y: number): Tile =>
    x < 0 || y < 0 || x >= map.width || y >= map.height
      ? Tile.Grass
      : (map.tiles[y * map.width + x] as Tile);

  // ---- buildings --------------------------------------------------------
  let buildingCount = 0;
  for (const lot of map.lots) {
    const def = buildingForLot(map.seed, lot);
    if (!def) continue;
    const sideways = lot.facing >= 2;
    const fw = (sideways ? lot.h : lot.w) * TS;
    const fd = (sideways ? lot.w : lot.h) * TS;
    const b = makeBuilding(def, fw, fd);
    placeDerived(lot, b);
    root.add(b);
    derivedBuildings.set(lot.id, b);
    buildingCount++;
  }
  console.log(`[city] ${buildingCount} buildings, ${map.lots.length} lots`);

  // ---- trees ------------------------------------------------------------
  const rng = mulberry32(hashSeed(map.seed, 0x960));
  const bySpecies: Placement[][] = Array.from({ length: TREE_SPECIES }, () => []);
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const t = tile(x, y);
      if (t === Tile.Grass && chance(rng, 0.10)) {
        bySpecies[rint(rng, 0, TREE_SPECIES - 1)].push({
          x: (x + 0.5 + (rng() - 0.5) * 0.6) * TS,
          z: (y + 0.5 + (rng() - 0.5) * 0.6) * TS,
          rot: rng() * Math.PI * 2,
          scale: 0.8 + rng() * 0.55,
        });
      }
    }
  root.add(makeTrees(bySpecies));

  // ---- streetlights ------------------------------------------------------
  // streetlights removed per owner preference — night is lit by building windows

  // ---- hydrants ------------------------------------------------------------
  const hydrantPlaces: Placement[] = [];
  for (const b of map.blocks) {
    if (chance(rng, 0.3)) {
      const x = b.x - 1;
      const y = b.y - 1;
      if (tile(x, y) === Tile.Sidewalk)
        hydrantPlaces.push({ x: (x + 0.5) * TS, z: (y + 0.5) * TS });
    }
  }
  const hydrants = makeHydrants(hydrantPlaces);
  if (hydrants) root.add(hydrants);

  // ---- water sheen ---------------------------------------------------------
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (tile(x, y) === Tile.Water) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      }
  if (isFinite(minX)) {
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry((maxX - minX) * TS, (maxY - minY) * TS),
      new THREE.MeshStandardMaterial({
        color: 0x1a4a66,
        metalness: 0.85,
        roughness: 0.15,
        transparent: true,
        opacity: 0.55,
        envMapIntensity: 1.2,
      })
    );
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.set(((minX + maxX) / 2) * TS, 0.06, ((minY + maxY) / 2) * TS);
    root.add(sheen);
  }

  return root;
}
