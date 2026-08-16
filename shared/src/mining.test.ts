import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COIN_MAX_SUPPLY,
  INITIAL_DAILY_EMISSION,
  RACK_SPECS,
  dailyEmission,
  dailyWear,
  emissionShare,
  halvingEra,
  nextHalvingSupply,
  rackOutput,
  allocateEmission,
  RAM_CAPACITY,
  NO_RAM_PENALTY,
} from "./mining.js";

const S = RACK_SPECS.mining_rack_s;

test("empty racks mine nothing", () => {
  assert.equal(rackOutput(S, []).hash, 0);
});

test("processors beyond PSU rating don't run", () => {
  const out = rackOutput(S, [
    { slot: 0, item: "psu_unit", wear: 0 },
    { slot: 9, item: "ram_ecc", wear: 0 },
    ...[1, 2, 3, 4].map((slot) => ({ slot, item: "cpu_basic", wear: 0 })),
  ]);
  // 1 PSU powers 4 — all run; fed by memory but with no cooling they halve
  assert.equal(out.powered, 4);
  assert.equal(out.hash, 4 * 0.5);
  const noPsu = rackOutput(S, [{ slot: 1, item: "gpu", wear: 0 }]);
  assert.equal(noPsu.powered, 0);
  assert.equal(noPsu.hash, 0);
});

test("undercooled processors throttle; cooling restores full rate", () => {
  const base = [
    { slot: 0, item: "psu_unit", wear: 0 },
    { slot: 9, item: "ram_ecc", wear: 0 },
    { slot: 1, item: "cpu_adv", wear: 0 },
    { slot: 2, item: "cpu_adv", wear: 0 },
  ];
  const uncooled = rackOutput(S, base);
  assert.equal(uncooled.hash, 4 * 0.5 + 4 * 0.5);
  const cooled = rackOutput(S, [...base, { slot: 3, item: "cooling_fan", wear: 0 }]);
  assert.equal(cooled.hash, 4 + 4, "fan covers 2 processors");
});

test("dead components are inert", () => {
  const out = rackOutput(S, [
    { slot: 0, item: "psu_unit", wear: 1 },
    { slot: 1, item: "asic", wear: 0 },
  ]);
  assert.equal(out.hash, 0, "dead PSU powers nothing");
  const deadProc = rackOutput(S, [
    { slot: 0, item: "psu_unit", wear: 0 },
    { slot: 1, item: "asic", wear: 1 },
  ]);
  assert.equal(deadProc.hash, 0, "dead processor doesn't hash");
});

test("wear is faster when heat-throttled, zero when idle", () => {
  assert.ok(dailyWear(true, true) > dailyWear(true, false));
  assert.equal(dailyWear(false, false), 0);
});

test("emission splits pro-rata and total never exceeds the daily pool", () => {
  assert.equal(emissionShare(50, 100, 1000), 500);
  assert.equal(emissionShare(1, 3, 1000) * 3 <= 1000, true);
  assert.equal(emissionShare(0, 100, 1000), 0);
  assert.equal(emissionShare(10, 0, 1000), 0, "no hashpower, no emission");
  // more world hashpower shrinks the individual share, pool unchanged
  assert.ok(emissionShare(50, 200, 1000) < emissionShare(50, 100, 1000));
});

test("supply schedule: halvings at mined milestones, hard cap, zero at the end", () => {
  assert.equal(halvingEra(0), 0);
  assert.equal(dailyEmission(0), INITIAL_DAILY_EMISSION);
  // first halving at half the max supply
  assert.equal(halvingEra(COIN_MAX_SUPPLY / 2 - 1), 0);
  assert.equal(halvingEra(COIN_MAX_SUPPLY / 2), 1);
  assert.equal(dailyEmission(COIN_MAX_SUPPLY / 2), INITIAL_DAILY_EMISSION / 2);
  // second halving at 3/4
  assert.equal(halvingEra(COIN_MAX_SUPPLY * 0.75), 2);
  assert.equal(dailyEmission(COIN_MAX_SUPPLY * 0.75), INITIAL_DAILY_EMISSION / 4);
  assert.equal(nextHalvingSupply(0), COIN_MAX_SUPPLY / 2);
  assert.equal(nextHalvingSupply(COIN_MAX_SUPPLY / 2), COIN_MAX_SUPPLY * 0.75);
  // near the cap the era reward is tiny but never overshoots the remainder
  const tail = dailyEmission(COIN_MAX_SUPPLY - 3);
  assert.ok(tail > 0 && tail <= 3);
  assert.equal(dailyEmission(COIN_MAX_SUPPLY), 0);
  // mining is a long arc: era 0 alone runs for thousands of game days
  assert.ok(COIN_MAX_SUPPLY / 2 / INITIAL_DAILY_EMISSION > 4000);
});

test("emission is paid in whole coins and the pool is fully allocated", () => {
  const hashes: Array<[number, number]> = [
    [1, 100],
    [2, 55],
    [3, 30],
    [4, 3],
  ];
  const world = 188;
  const out = allocateEmission(hashes, world, 40);
  for (const [, n] of out) assert.equal(n, Math.floor(n), "fractional coin paid out");
  assert.equal(out.reduce((a, [, n]) => a + n, 0), 40, "pool not fully paid");
  // the biggest miner takes the biggest share
  assert.equal(out.find(([eid]) => eid === 1)![1], Math.max(...out.map(([, n]) => n)));
  // nothing to mine, nothing paid
  assert.deepEqual(allocateEmission(hashes, world, 0), []);
  assert.deepEqual(allocateEmission([], 0, 40), []);
});

test("memory keeps processors fed; without it they crawl", () => {
  const procs = [0, 1, 2].map((slot) => ({ slot: slot + 1, item: "gpu", wear: 0 }));
  const power = [
    { slot: 0, item: "psu_unit", wear: 0 },
    { slot: 8, item: "cooling_liquid", wear: 0 },
  ];
  const starved = rackOutput(S, [...power, ...procs]);
  assert.equal(starved.memoryCapacity, 0);
  assert.equal(starved.hash, 3 * 12 * NO_RAM_PENALTY, "no memory, no speed");

  const oneStick = rackOutput(S, [...power, ...procs, { slot: 9, item: "ram_ddr4", wear: 0 }]);
  assert.equal(oneStick.memoryCapacity, RAM_CAPACITY.ram_ddr4);
  assert.equal(oneStick.hash, 3 * 12, "a stick feeds three processors");

  // only as many modules as the rack has memory slots count
  const overfilled = rackOutput(S, [
    ...power,
    ...procs,
    { slot: 9, item: "ram_ddr4", wear: 0 },
    { slot: 10, item: "ram_ddr4", wear: 0 },
  ]);
  assert.equal(overfilled.memoryCapacity, RAM_CAPACITY.ram_ddr4, "one memory slot on a small rack");
});
