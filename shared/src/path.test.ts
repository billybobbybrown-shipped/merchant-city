import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "./citygen.js";
import { findPath, tileWalkable } from "./path.js";
import { Tile } from "./constants.js";

const map = generateCity(20260814);

test("no lot tile is a dead end — a path out always exists", () => {
  // sample lot tiles across the map, including deep inside big blocks; every
  // one must be able to path to a distant sidewalk (pockets snap to mainland)
  let goal: { x: number; y: number } | null = null;
  for (let y = 90; y < 120 && !goal; y++)
    for (let x = 90; x < 120 && !goal; x++)
      if (map.tiles[y * map.width + x] === Tile.Sidewalk) goal = { x, y };
  assert.ok(goal);
  let tried = 0;
  for (let y = 5; y < map.height - 5; y += 7)
    for (let x = 5; x < map.width - 5; x += 7) {
      if (map.tiles[y * map.width + x] !== Tile.Lot) continue;
      tried++;
      const p = findPath(map, x, y, goal!.x, goal!.y);
      assert.ok(p !== null, `stranded at lot tile (${x},${y})`);
    }
  assert.ok(tried > 100, `only ${tried} lot tiles sampled`);
});

test("walkable pockets exist, and both directions bridge to the mainland", () => {
  // the seed world has sealed courtyards; walks into and out of one must work
  const pocket = { x: 174, y: 147 }; // enclosed residential centre on this seed
  assert.ok(!tileWalkable(map.tiles[pocket.y * map.width + pocket.x] as Tile));
  const out = findPath(map, pocket.x, pocket.y, 100, 100);
  const back = findPath(map, 100, 100, pocket.x, pocket.y);
  assert.ok(out && out.length > 0, "no way out of the pocket");
  assert.ok(back && back.length > 0, "no way toward the pocket");
});
