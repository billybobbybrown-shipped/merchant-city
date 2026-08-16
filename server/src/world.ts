import {
  CityMap,
  generateCity,
  mapToWire,
  tilesToBase64,
  Tile,
  TILE_WORLD_SIZE,
} from "@mc/shared";
import { pool } from "./db.js";

const WORLD_ID = 1;
const WORLD_SEED = Number(process.env.WORLD_SEED ?? 20260814); // Phase R world

export interface LoadedWorld {
  map: CityMap;
  wireJson: string; // cached /map response body
}

// The map is deterministic from its seed; Postgres stores the seed + tiles as
// the source of truth and the lots table carries mutable state (ownership).
export async function loadOrCreateWorld(): Promise<LoadedWorld> {
  const existing = await pool.query("select seed, width, tiles_b64 from worlds where id = $1", [
    WORLD_ID,
  ]);
  let map: CityMap;
  if (existing.rowCount) {
    const { seed, width, tiles_b64 } = existing.rows[0];
    map = generateCity(Number(seed), width);
    if (tilesToBase64(map.tiles) !== tiles_b64)
      throw new Error("stored world tiles do not match regeneration — generator changed under a live world");
    console.log(`[world] loaded world (seed ${seed}, ${map.lots.length} lots)`);
  } else {
    map = generateCity(WORLD_SEED);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "insert into worlds (id, seed, width, height, tiles_b64) values ($1,$2,$3,$4,$5)",
        [WORLD_ID, WORLD_SEED, map.width, map.height, tilesToBase64(map.tiles)]
      );
      for (const l of map.lots)
        await client.query(
          `insert into lots (world_id, id, x, y, w, h, zone, value, owner_entity_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
          [WORLD_ID, l.id, l.x, l.y, l.w, l.h, l.zone, l.value]
        );
      for (const d of map.districts)
        await client.query(
          `insert into districts (world_id, id, name, block_ids) values ($1,$2,$3,$4)`,
          [WORLD_ID, d.id, d.name, d.blocks]
        );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    console.log(`[world] generated new world (seed ${WORLD_SEED}, ${map.lots.length} lots)`);
  }
  return { map, wireJson: JSON.stringify(mapToWire(map)) };
}

// Deterministic spawn: the sidewalk tile nearest the city center.
export function findSpawn(map: CityMap): { x: number; y: number } {
  const c = map.width / 2;
  let best = { x: c, y: c };
  let bestD = Infinity;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y * map.width + x] !== Tile.Sidewalk) continue;
      const d = Math.hypot(x - c, y - c);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return {
    x: (best.x + 0.5) * TILE_WORLD_SIZE,
    y: (best.y + 0.5) * TILE_WORLD_SIZE,
  };
}
