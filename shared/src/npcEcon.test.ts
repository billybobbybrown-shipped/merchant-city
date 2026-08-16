import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreOffer,
  wageAcceptable,
  reservationWage,
  planLiquidation,
  retailPrice,
  BASE_PRICE,
} from "./npcEcon.js";

test("purchase scoring prefers cheap nearby inviting shops", () => {
  const cheapClose = scoreOffer({ item: "bread", price: 4, appeal: 3, dist: 20 });
  const cheapFar = scoreOffer({ item: "bread", price: 4, appeal: 3, dist: 200 });
  const priceyClose = scoreOffer({ item: "bread", price: 12, appeal: 3, dist: 20 });
  assert.ok(cheapClose > cheapFar, "distance hurts");
  assert.ok(cheapClose > priceyClose, "markup hurts");
  const appealing = scoreOffer({ item: "bread", price: 6, appeal: 6, dist: 50 });
  const bare = scoreOffer({ item: "bread", price: 6, appeal: 0, dist: 50 });
  assert.ok(appealing > bare, "appeal helps");
});

test("nobody pays over 4x reference", () => {
  assert.equal(scoreOffer({ item: "bread", price: BASE_PRICE.bread * 5, appeal: 6, dist: 1 }), -Infinity);
});

test("wage acceptance clears the reservation wage", () => {
  assert.ok(wageAcceptable("worker", 42));
  assert.ok(!wageAcceptable("worker", 41));
  assert.ok(wageAcceptable("saver", 48));
  assert.ok(!wageAcceptable("saver", 47.99));
  assert.ok(reservationWage("saver") > reservationWage("worker"));
});

test("liquidation dumps everything below reference", () => {
  const orders = planLiquidation({ bread: 12, iron: 5, junk_zero: 0 });
  assert.equal(orders.length, 2);
  for (const o of orders) {
    assert.ok(o.qty > 0);
    assert.ok(o.price < (BASE_PRICE[o.item] ?? 10), `${o.item} priced to clear`);
    assert.ok(o.price >= 0.5);
  }
});

test("retail pricing carries a margin over cost", () => {
  assert.equal(retailPrice(4), 6);
  assert.ok(retailPrice(10) > 10);
});
