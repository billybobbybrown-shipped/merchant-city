import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCE_TYPES, sourceWorkerRole } from "./items.js";
import { lotName } from "./templates.js";

// Every extraction site must resolve to a worker role, because that role is
// what loads the site's delivery bay — a site with no role would silently
// never ship anything.
test("every source site has a worker who can load its bay", () => {
  for (const s of SOURCE_TYPES) {
    const role = sourceWorkerRole(s.type);
    assert.ok(role === "farmer" || role === "miner", `${s.type} has no worker role`);
  }
});

test("mines and quarries are worked by miners, fields by farmers", () => {
  assert.equal(sourceWorkerRole("mine"), "miner");
  assert.equal(sourceWorkerRole("quarry"), "miner");
  assert.equal(sourceWorkerRole("oil_well"), "miner");
  assert.equal(sourceWorkerRole("farm_corn"), "farmer");
  assert.equal(sourceWorkerRole("logging"), "farmer");
});

test("a property is named by its owner, always carrying the lot number", () => {
  assert.equal(lotName(140), "Lot 140");
  assert.equal(lotName(140, null), "Lot 140");
  assert.equal(lotName(140, "   "), "Lot 140");
  assert.equal(lotName(140, "Sunrise Carrots"), "Sunrise Carrots (Lot 140)");
  // two properties sharing a name stay distinguishable
  assert.notEqual(lotName(12, "Back Field"), lotName(13, "Back Field"));
});
