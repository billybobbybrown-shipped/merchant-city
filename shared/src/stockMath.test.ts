import { test } from "node:test";
import assert from "node:assert/strict";
import {
  circuitBand,
  declaredDps,
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

test("declared dividends: realistic annual yield, sticky, cash-capped", () => {
  // 5.2% target on a $10 stock = exactly $0.01/share each weekly period
  assert.equal(declaredDps(0.052, 10, 0, 1e9, 1000), 0.01);
  // annualized payout lands on the target yield
  const dps = declaredDps(0.04, 25, 0, 1e9, 1_000_000);
  assert.ok(Math.abs((dps * 52) / 25 - 0.04) < 0.005, "≈4%/yr");
  assert.equal(declaredDps(0, 10, 0.01, 1e9, 1000), 0, "no policy, no dividend");
  assert.equal(declaredDps(0.05, 0, 0.01, 1e9, 1000), 0, "no price, no dividend");
  // sticky: a price spike only lifts the rate 25% in one period
  assert.equal(declaredDps(0.052, 30, 0.01, 1e9, 1000), 0.0125);
  // and a crash only trims it 25%
  assert.equal(declaredDps(0.052, 2, 0.01, 1e9, 1000), 0.0075);
  // the period pool never exceeds 5% of cash
  assert.equal(declaredDps(0.052, 10, 0, 100, 1000), 0.005, "cash-capped");
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
