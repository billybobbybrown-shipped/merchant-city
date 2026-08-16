import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEMS, SECTORS, sectorOf } from "./items.js";

test("every tradable item lands in exactly one exchange sector", () => {
  const known = new Set(SECTORS.map((s) => s.id));
  for (const it of ITEMS) assert.ok(known.has(sectorOf(it.id)), `${it.id} has no sector`);
});

test("sector labels are unique and every sector holds something", () => {
  assert.equal(new Set(SECTORS.map((s) => s.label)).size, SECTORS.length);
  for (const s of SECTORS)
    assert.ok(ITEMS.some((it) => sectorOf(it.id) === s.id), `${s.id} is empty`);
});

test("raw goods sort into their own chains, not one bucket", () => {
  assert.equal(sectorOf("corn"), "farm");
  assert.equal(sectorOf("iron_ore"), "metals");
  assert.equal(sectorOf("silicon"), "tech");
  assert.equal(sectorOf("shotgun"), "arms");
  assert.equal(sectorOf("whiskey"), "vice");
  // anything unlisted — fixtures, machines, racks — is equipment
  assert.equal(sectorOf("mining_rack_l"), "equipment");
  assert.equal(sectorOf("fabricator"), "equipment");
  assert.equal(sectorOf("nonsense_item"), "equipment");
});
