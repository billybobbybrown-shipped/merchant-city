import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CityMap, LotDef, LotState, TILE_WORLD_SIZE as TS } from "@mc/shared";
import { SERVER_URL } from "../config.js";

// Client-side mirror of the lot market + ownership overlays on the ground.
export class Lots {
  readonly group = new THREE.Group();
  readonly defs = new Map<number, LotDef>();
  readonly state = new Map<number, LotState>();
  private tileIndex = new Map<number, number>(); // tileY*W+tileX -> lotId
  private overlay: THREE.Group | null = null;
  private dirty = true;

  constructor(private map: CityMap, public selfId: string) {
    for (const l of map.lots) {
      this.defs.set(l.id, l);
      for (let y = l.y; y < l.y + l.h; y++)
        for (let x = l.x; x < l.x + l.w; x++) this.tileIndex.set(y * map.width + x, l.id);
    }
  }

  async fetch() {
    const rows: LotState[] = await fetch(`${SERVER_URL}/lots`).then((r) => r.json());
    for (const r of rows) this.state.set(r.id, r);
    this.dirty = true;
  }

  apply(row: LotState) {
    this.state.set(row.id, row);
    this.dirty = true;
  }

  lotAtWorld(wx: number, wz: number): LotDef | null {
    const x = Math.floor(wx / TS);
    const y = Math.floor(wz / TS);
    const id = this.tileIndex.get(y * this.map.width + x);
    return id ? this.defs.get(id) ?? null : null;
  }

  // thin ground outlines: gold = for sale, green = yours, slate = other players'
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    if (this.overlay) this.group.remove(this.overlay);
    this.overlay = new THREE.Group();

    const cats: Record<string, THREE.BufferGeometry[]> = { sale: [], mine: [], other: [] };
    for (const [id, st] of this.state.entries()) {
      const lot = this.defs.get(id);
      if (!lot) continue;
      let cat: string | null = null;
      if (st.ownerType === "player" && st.ownerId === this.selfId) cat = "mine";
      else if (st.forSale) cat = "sale";
      else if (st.ownerType === "player") cat = "other";
      if (!cat) continue;
      const x0 = lot.x * TS;
      const z0 = lot.y * TS;
      const w = lot.w * TS;
      const d = lot.h * TS;
      const t = 0.22;
      const parts = [
        new THREE.BoxGeometry(w, 0.06, t).translate(x0 + w / 2, 0, z0 + t / 2),
        new THREE.BoxGeometry(w, 0.06, t).translate(x0 + w / 2, 0, z0 + d - t / 2),
        new THREE.BoxGeometry(t, 0.06, d - 2 * t).translate(x0 + t / 2, 0, z0 + d / 2),
        new THREE.BoxGeometry(t, 0.06, d - 2 * t).translate(x0 + w - t / 2, 0, z0 + d / 2),
      ];
      cats[cat].push(...parts);
    }
    const colors: Record<string, number> = { sale: 0xd9a94a, mine: 0x5fae6b, other: 0x5a7d9c };
    for (const cat of Object.keys(cats)) {
      if (!cats[cat].length) continue;
      const geo = mergeGeometries(cats[cat])!;
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: colors[cat], transparent: true, opacity: 0.85 })
      );
      mesh.position.y = 0.05;
      this.overlay.add(mesh);
    }
    this.group.add(this.overlay);
  }
}
