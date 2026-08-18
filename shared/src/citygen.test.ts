import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCity, mapFromWire, mapToWire } from "./citygen.js";
import { buildingForLot } from "./buildings.js";
import { DisplayNameSchema, MoveIntentSchema } from "./schemas.js";
import { Tile } from "./constants.js";

test("city generation is deterministic", () => {
  const a = generateCity(42);
  const b = generateCity(42);
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.lots, b.lots);
  const c = generateCity(43);
  assert.notDeepEqual(a.tiles, c.tiles);
});

test("city has roads, sidewalks, lots and all zones", () => {
  const m = generateCity(42);
  const counts = new Map<number, number>();
  for (const t of m.tiles) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const t of [Tile.Road, Tile.Sidewalk, Tile.Lot, Tile.Grass])
    assert.ok((counts.get(t) ?? 0) > 0, `tile type ${t} missing`);
  assert.ok(m.lots.length > 100, "expected 100+ lots");
  const zones = new Set(m.lots.map((l) => l.zone));
  for (const z of ["commercial", "residential", "industrial", "mixed"])
    assert.ok(zones.has(z as never), `zone ${z} missing`);
  for (const l of m.lots) assert.ok(l.value > 0);
});

test("wire round-trip preserves the map", () => {
  const m = generateCity(7);
  const rt = mapFromWire(JSON.parse(JSON.stringify(mapToWire(m))));
  assert.deepEqual(rt.tiles, m.tiles);
  assert.deepEqual(rt.lots, m.lots);
});

test("buildings are deterministic per lot", () => {
  const m = generateCity(42);
  let built = 0;
  for (const lot of m.lots) {
    const a = buildingForLot(42, lot);
    const b = buildingForLot(42, lot);
    assert.deepEqual(a, b);
    if (a) built++;
  }
  assert.ok(built > m.lots.length * 0.6, "most lots should have buildings");
});

test("every lot faces a street (door is reachable)", () => {
  const m = generateCity(42);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= m.width || y >= m.height ? -1 : m.tiles[y * m.width + x];
  for (const lot of m.lots) {
    if (lot.yard) continue; // open-land parcels front no street by design
    // tile just outside the center of the lot's facing edge
    const cx = lot.x + Math.floor(lot.w / 2);
    const cy = lot.y + Math.floor(lot.h / 2);
    const probe =
      lot.facing === 0 ? at(cx, lot.y + lot.h)
      : lot.facing === 1 ? at(cx, lot.y - 1)
      : lot.facing === 2 ? at(lot.x + lot.w, cy)
      : at(lot.x - 1, cy);
    assert.ok(
      probe === Tile.Sidewalk || probe === Tile.Road,
      `lot ${lot.id} (${lot.zone}, facing ${lot.facing}) fronts tile type ${probe}`
    );
  }
});

test("display name validation", () => {
  assert.ok(DisplayNameSchema.safeParse("Trader_99").success);
  assert.ok(!DisplayNameSchema.safeParse("ab").success);
  assert.ok(!DisplayNameSchema.safeParse("has space").success);
  assert.ok(!DisplayNameSchema.safeParse("seventeen_chars__").success);
});

test("move intent validation", () => {
  assert.ok(MoveIntentSchema.safeParse({ x: 10, y: 20 }).success);
  assert.ok(!MoveIntentSchema.safeParse({ x: -1, y: 0 }).success);
  assert.ok(!MoveIntentSchema.safeParse({ x: 1e9, y: 0 }).success);
});

test("build templates fit check respects lot orientation", async () => {
  const { BUILD_TEMPLATES, templateFits } = await import("./templates.js");
  const small = { id: 1, x: 0, y: 0, w: 3, h: 3, zone: "residential", value: 1, facing: 0 } as never;
  const wide = { id: 2, x: 0, y: 0, w: 6, h: 4, zone: "commercial", value: 1, facing: 0 } as never;
  const tall = { id: 3, x: 0, y: 0, w: 4, h: 6, zone: "commercial", value: 1, facing: 0 } as never;
  const house = BUILD_TEMPLATES.find((t) => t.id === "house")!;
  const largeShop = BUILD_TEMPLATES.find((t) => t.id === "shop_l")!;
  assert.ok(templateFits(house, small));
  assert.ok(!templateFits(largeShop, small));
  assert.ok(templateFits(largeShop, wide));
  assert.ok(templateFits(largeShop, tall)); // rotated fit
  for (const t of BUILD_TEMPLATES) assert.ok(t.cost > 0 && t.buildMinutes > 0);
});

test("interior placement validation matches the building footprint", async () => {
  const { validatePlacement, doorCell, interiorSpec } = await import("./interior.js");
  const { buildingLayout } = await import("./footprint.js");
  const lot = { id: 1, x: 0, y: 0, w: 5, h: 5, zone: "commercial", value: 1, facing: 0 } as never;
  const bdef = { kind: "shop", floors: 2, style: 0, seed: 4242, name: "Test Goods" } as never;

  // interior grid must be strictly inside the structural footprint
  const L = buildingLayout(bdef as never, 10, 10);
  const spec = interiorSpec(lot, bdef);
  assert.ok(spec.w <= Math.floor(L.w), "grid wider than the building");
  assert.ok(spec.h <= Math.floor(L.d), "grid deeper than the main block");
  const door = doorCell(spec);
  assert.equal(door.y, spec.h - 1); // door on the street-facing front wall

  // valid placement in a corner
  assert.equal(validatePlacement(lot, bdef, [], { item: "chair", x: 0, y: 0, rot: 0, floor: 0 }), null);
  // out of bounds just past the footprint
  assert.ok(validatePlacement(lot, bdef, [], { item: "chair", x: spec.w, y: 0, rot: 0, floor: 0 }));
  // overlap
  const placed = [{ id: 1, item: "rack_s", x: 0, y: 0, rot: 0, floor: 0 }];
  assert.ok(validatePlacement(lot, bdef, placed, { item: "rack_s", x: 0, y: 0, rot: 0, floor: 0 }));
  // blocking the door
  assert.ok(validatePlacement(lot, bdef, [], { item: "rack_s", x: door.x, y: door.y, rot: 0, floor: 0 }));
  // sealing an item away from the door is rejected
  const trap: any[] = [{ id: 9, item: "chair", x: 0, y: 0, rot: 0, floor: 0 }];
  for (let x = 0; x < spec.w - 1; x++) trap.push({ id: 10 + x, item: "rack_s", x, y: 2, rot: 0, floor: 0 });
  assert.ok(validatePlacement(lot, bdef, trap, { item: "rack_s", x: spec.w - 1, y: 2, rot: 0, floor: 0 }));
  // rugs are walkable: solid items may sit on them
  const rug = [{ id: 50, item: "rug", x: 0, y: 0, rot: 0, floor: 0 }];
  assert.equal(validatePlacement(lot, bdef, rug, { item: "chair", x: 0, y: 0, rot: 0, floor: 0 }), null);
});

test("custom plan validation and cost", async () => {
  const { validatePlan, buildCost, planArea } = await import("./custom.js");
  const lot = { id: 1, x: 0, y: 0, w: 6, h: 6, zone: "commercial", value: 1, facing: 0 } as never;
  // lot cells 12×12
  const ok = { rects: [{ x: 1, y: 4, w: 6, h: 8 }], floors: 2 };
  assert.equal(validatePlan(lot, ok), null);
  // L-shape: connected second section
  const L = { rects: [{ x: 1, y: 4, w: 6, h: 8 }, { x: 7, y: 8, w: 4, h: 4 }], floors: 2 };
  assert.equal(validatePlan(lot, L), null);
  // disconnected sections are allowed — they become separate buildings
  const far = { rects: [{ x: 0, y: 0, w: 3, h: 3 }, { x: 9, y: 9, w: 3, h: 3 }], floors: 1 };
  assert.equal(validatePlan(lot, far), null);
  // out of lot / too small / bad floors
  assert.ok(validatePlan(lot, { rects: [{ x: 8, y: 0, w: 6, h: 3 }], floors: 1 }));
  assert.ok(validatePlan(lot, { rects: [{ x: 0, y: 0, w: 2, h: 3 }], floors: 1 }));
  assert.ok(validatePlan(lot, { rects: [{ x: 0, y: 0, w: 4, h: 4 }], floors: 99 }));
  // buildings cost materials + time, never cash; union area counts overlap once
  assert.equal(planArea(L), 6 * 8 + 4 * 4);
  const c1 = buildCost({ rects: [{ x: 0, y: 0, w: 4, h: 4 }], floors: 1 });
  const c3 = buildCost({ rects: [{ x: 0, y: 0, w: 4, h: 4 }], floors: 3 });
  assert.equal(c1.cash, 0);
  assert.equal(c3.cash, 0);
  assert.equal(c3.materials.wood, c1.materials.wood * 3); // wood is volume-linear
  assert.ok(c3.materials.stone > c1.materials.stone);
  assert.ok(c3.minutes >= c1.minutes);
  assert.ok(c1.materials.wood > 0 && c1.materials.stone > 0 && c1.materials.iron > 0);
});
