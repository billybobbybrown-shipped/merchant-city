import { test } from "node:test";
import assert from "node:assert/strict";
import { capWeightedIndex, cpi, gdpFromLedger, indexDivisor, realizedRange, vwap } from "./econStats.js";

test("vwap weights by volume", () => {
  assert.equal(vwap([{ price: 10, qty: 1 }, { price: 20, qty: 3 }]), 17.5);
  assert.equal(vwap([]), null);
});

test("realized range", () => {
  assert.deepEqual(realizedRange([{ price: 5, qty: 1 }, { price: 9, qty: 1 }, { price: 7, qty: 2 }]), { high: 9, low: 5 });
  assert.equal(realizedRange([]), null);
});

test("CPI is 100 at reference prices and rises with observed prices", () => {
  const basket = { bread: 4, shirt: 1 };
  const ref = { bread: 6, shirt: 25 };
  assert.equal(cpi(basket, {}, ref), 100, "no observations = base level");
  assert.equal(cpi(basket, { bread: 6, shirt: 25 }, ref), 100);
  const inflated = cpi(basket, { bread: 12, shirt: 25 }, ref);
  assert.ok(inflated > 100);
  const deflated = cpi(basket, { bread: 3 }, ref);
  assert.ok(deflated < 100);
});

test("cap-weighted index is stable via its divisor", () => {
  const day1 = [{ last: 1, shares: 100_000 }, { last: 2, shares: 100_000 }];
  const div = indexDivisor(day1);
  assert.equal(capWeightedIndex(day1, div), 100);
  const day2 = [{ last: 1.5, shares: 100_000 }, { last: 2, shares: 100_000 }];
  assert.ok(capWeightedIndex(day2, div)! > 100);
  assert.equal(capWeightedIndex([{ last: null, shares: 1 }], div), null);
});

test("GDP counts production, not transfers, asset trades, or the shadow economy", () => {
  const { total, bySector } = gdpFromLedger([
    { category: "retail_sale", amount: 100 },
    { category: "rent", amount: 50 },
    { category: "wage", amount: 40 },
    { category: "transfer", amount: 9999 },
    { category: "trade", amount: 5000 },
    { category: "fee", amount: 77 },
    { category: "retail_sale", amount: 25, currency: "dirty" },
    { category: "bribe", amount: 500 },
  ]);
  assert.equal(total, 190);
  assert.equal(bySector.retail_sale, 100);
  assert.equal(bySector.transfer, undefined);
});
