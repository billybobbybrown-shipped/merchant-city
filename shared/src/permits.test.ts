import { test } from "node:test";
import assert from "node:assert/strict";
import { PERMIT_BASE_FEE, PERMIT_STATIONS, RECIPES, permitFee, permitFor } from "./items.js";

test("permitted items map to their category", () => {
  assert.equal(permitFor("beer"), "liquor");
  assert.equal(permitFor("whiskey"), "liquor");
  assert.equal(permitFor("cigarettes"), "tobacco");
  assert.equal(permitFor("cigars"), "tobacco");
  assert.equal(permitFor("hunting_rifle"), "firearms");
  assert.equal(permitFor("ammo"), "firearms");
  // raw tobacco is legal to grow and trade — only processing is licensed
  assert.equal(permitFor("tobacco"), undefined);
  assert.equal(permitFor("bread"), undefined);
});

test("every permitted recipe carries the same category as its output", () => {
  // The licence follows the goods, not the furniture: controlled parts can be
  // machined on a general station (gun barrels at a metal shop) and still need
  // the lot's permit. What must hold is that a recipe's permit matches what it
  // makes, in both directions.
  for (const r of RECIPES) {
    const cat = permitFor(r.out);
    if (cat) assert.equal(r.permit, cat, `${r.id} should require the ${cat} permit`);
    if (r.permit) assert.equal(cat, r.permit, `${r.id} requires a permit its output doesn't need`);
  }
  // the fee-scaling list only means something if each listed station actually
  // hosts work of that category
  for (const [cat, stations] of Object.entries(PERMIT_STATIONS))
    for (const st of stations)
      assert.ok(
        RECIPES.some((r) => r.station === st && r.permit === cat),
        `${st} is listed under ${cat} but hosts no ${cat} recipe`
      );
});

test("permit fee scales with station count from the category base", () => {
  assert.equal(permitFee("liquor", 0), PERMIT_BASE_FEE.liquor);
  assert.equal(permitFee("liquor", 4) - permitFee("liquor", 1), 3 * 250);
  assert.ok(permitFee("firearms", 0) > permitFee("tobacco", 0), "firearms licenses cost the most");
});
