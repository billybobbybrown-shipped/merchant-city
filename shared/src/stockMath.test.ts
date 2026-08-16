import { test } from "node:test";
import assert from "node:assert/strict";
import {
  circuitBand,
  dividendPerShare,
  floatValid,
  ipoEligible,
  ipoPriceBand,
  majorityHolder,
} from "./stockMath.js";

const good = { ageDays: 10, revenue7d: 60_000, profit7d: 7_000, buildings: 3, employees: 2 };

test("IPO gating enforces age, revenue, profit and scale", () => {
  assert.equal(ipoEligible(good), null);
  assert.ok(ipoEligible({ ...good, ageDays: 3 }));
  assert.ok(ipoEligible({ ...good, revenue7d: 10_000 }));
  assert.ok(ipoEligible({ ...good, profit7d: -50 }));
  assert.ok(ipoEligible({ ...good, buildings: 1, employees: 2 }));
  assert.equal(ipoEligible({ ...good, buildings: 0, employees: 6 }), null, "employees alone can qualify");
});

test("IPO price band tracks earnings and share count", () => {
  const band = ipoPriceBand(7_000, 100_000);
  assert.ok(band.min < band.max);
  const bigger = ipoPriceBand(14_000, 100_000);
  assert.ok(bigger.min > band.min, "more profit, higher floor");
  const diluted = ipoPriceBand(7_000, 200_000);
  assert.ok(diluted.max < band.max, "more shares, lower per-share cap");
});

test("float bounds are 25-75%", () => {
  assert.ok(floatValid(0.25) && floatValid(0.5) && floatValid(0.75));
  assert.ok(!floatValid(0.2) && !floatValid(0.8));
});

test("dividends come from real profit, capped by cash, floored per share", () => {
  assert.equal(dividendPerShare(0.5, 1000, 10_000, 1000), 0.5);
  assert.equal(dividendPerShare(0.5, -500, 10_000, 1000), 0, "no dividend on a loss day");
  assert.equal(dividendPerShare(1, 1000, 300, 1000), 0.3, "cash-capped");
  assert.equal(dividendPerShare(0, 1000, 10_000, 1000), 0);
  assert.equal(dividendPerShare(0.25, 3312, 33_000, 100_000), 0.0082, "sub-cent per-share rates still pay");
});

test("majority control needs strictly over half the shares", () => {
  assert.equal(majorityHolder([{ holder: 7, shares: 501 }], 1000), 7);
  assert.equal(majorityHolder([{ holder: 7, shares: 500 }], 1000), null);
});

test("circuit band is ±30% of prev close, absent on IPO day", () => {
  const b = circuitBand(10);
  assert.deepEqual(b, { min: 7, max: 13 });
  assert.equal(circuitBand(null), null);
});
