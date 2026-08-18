import * as THREE from "three";
import { CityMap, TILE_WORLD_SIZE as TS, hashSeed, mulberry32 } from "@mc/shared";
import { Engine } from "../render/engine.js";
import { makeVehicle, VEHICLE_TYPES } from "../assets/vehicles.js";

// Ambient road traffic. Cars wander the street network the way citizens
// wander the sidewalks: American rules — drive on the RIGHT, come to a stop
// at every intersection, keep distance from the car ahead, and turn onto
// crossing streets on a whim. Pure client-side ambience: no network cost.

interface Seg {
  vertical: boolean;
  // fixed cross-axis position (tile of the road's left/top edge) and width
  fixed: number;
  w: number;
  lo: number; // along-axis extent, world units
  hi: number;
  crossings: Crossing[]; // sorted by `at`
}

interface Crossing {
  at: number; // along-axis world coordinate of the crossing centre
  other: Seg;
  otherAt: number; // where this seg sits along the OTHER seg's axis
  // a FULL intersection: road tiles continue on all four sides of the box —
  // the same test that paints the crosswalks. Aligned side streets meeting an
  // arterial from both sides count, exactly as they read on screen.
  full: boolean;
}

interface Car {
  seg: Seg;
  t: number; // along-axis position, world units
  dir: 1 | -1;
  lane: number; // 0 = kerb lane; arterials also have an inner lane 1
  speed: number;
  top: number; // cruising speed
  stopUntil: number; // epoch ms while halted at a stop line
  waitingSince: number; // when the car first reached this stop line (0 = not waiting)
  planAt: number | null; // the crossing this car has already made its mind up about
  planTurn: boolean;
  // mid-turn state: a bezier arc from the stop line, around the corner, onto
  // the new street's lane — driven, not teleported
  turning: {
    p0: { x: number; z: number };
    p1: { x: number; z: number };
    p2: { x: number; z: number };
    s: number;
    len: number;
    seg: Seg;
    dir: 1 | -1;
    lane: number;
    exitT: number;
    clearedUntil: number;
  } | null;
  clearedUntil: number; // along-axis point beyond which the last stop is done
  yaw: number;
  group: THREE.Group;
  length: number;
}

const STOP_MS = 650;
const GAP = 4.4; // comfortable following distance, centre to centre
const MIN_GAP = 4.0; // hard floor — a car NEVER advances closer than this
// the stop line sits clear of the JUNCTION BOX — which is as wide as the
// wider of the two roads — so a waiting car can never read as "inside" it
const stopDistFor = (seg: Seg, cr: Crossing) => (Math.max(seg.w, cr.other.w) / 2) * TS + 1.8;

// Right-hand LANE centre, not just the right half: lane 0 is the outermost
// (kerb) lane, lane 1 the inner one on 4-wide arterials. A 2-wide street has
// a single lane per direction. Vertical & heading +z (south): west of centre.
function laneOffset(seg: Seg, dir: 1 | -1, lane: number): number {
  const lanes = seg.w / 2; // lanes per direction
  const li = Math.min(lane, lanes - 1);
  const off = (lanes - 0.5 - li) * TS;
  return seg.vertical ? (dir === 1 ? -off : off) : dir === 1 ? off : -off;
}

function centreLine(seg: Seg): number {
  return (seg.fixed + seg.w / 2) * TS;
}

export class Traffic {
  private cars: Car[] = [];
  private segs: Seg[] = [];
  private root = new THREE.Group();

  constructor(private engine: Engine, map: CityMap) {
    this.root.name = "traffic";
    engine.scene.add(this.root);

    // ---- the drivable network, from the same segments the ground paints ----
    const V: Seg[] = map.segsV.map((s) => ({
      vertical: true,
      fixed: s.x,
      w: s.w,
      lo: s.y0 * TS,
      hi: (s.y1 + 1) * TS,
      crossings: [],
    }));
    const H: Seg[] = map.segsH.map((s) => ({
      vertical: false,
      fixed: s.y,
      w: s.w,
      lo: s.x0 * TS,
      hi: (s.x1 + 1) * TS,
      crossings: [],
    }));
    const roadTile = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < map.width && y < map.height && map.tiles[y * map.width + x] === 1; // Tile.Road
    for (const v of V)
      for (const h of H) {
        const vx = centreLine(v);
        const hz = centreLine(h);
        const crossesV = hz >= v.lo && hz <= v.hi;
        const crossesH = vx >= h.lo && vx <= h.hi;
        if (!crossesV || !crossesH) continue;
        const midX = Math.floor(v.fixed + v.w / 2);
        const midY = Math.floor(h.fixed + h.w / 2);
        const full =
          roadTile(midX, h.fixed - 1) &&
          roadTile(midX, h.fixed + h.w) &&
          roadTile(v.fixed - 1, midY) &&
          roadTile(v.fixed + v.w, midY);
        v.crossings.push({ at: hz, other: h, otherAt: vx, full });
        h.crossings.push({ at: vx, other: v, otherAt: hz, full });
      }
    for (const s of [...V, ...H]) s.crossings.sort((a, b) => a.at - b.at);
    this.segs = [...V, ...H].filter((s) => s.hi - s.lo > 8 * TS);

    // ---- the fleet ----
    const rng = mulberry32(hashSeed(map.seed, 0xd21f));
    const count = Math.min(36, Math.max(12, Math.floor(this.segs.length * 1.4)));
    for (let i = 0; i < count; i++) {
      const seg = this.segs[Math.floor(rng() * this.segs.length)];
      const type = VEHICLE_TYPES[Math.floor(rng() * VEHICLE_TYPES.length)];
      const group = makeVehicle(type, hashSeed(map.seed, i, 0xbeef));
      const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
      const top = 7.5 + rng() * 3.5;
      const car: Car = {
        seg,
        t: seg.lo + 4 + rng() * (seg.hi - seg.lo - 8),
        dir,
        lane: rng() < 0.55 ? 0 : 1,
        speed: top,
        top,
        stopUntil: 0,
        waitingSince: 0,
        planAt: null,
        planTurn: false,
        turning: null,
        clearedUntil: 0, // set to the spawn point below
        yaw: 0,
        group,
        length: 4.6,
      };
      car.clearedUntil = car.t;
      car.yaw = this.headingYaw(car);
      group.rotation.y = car.yaw;
      this.placeMesh(car);
      this.root.add(group);
      this.cars.push(car);
    }
  }

  private headingYaw(c: Car): number {
    // a yaw-0 vehicle faces -Z; forward after yaw θ is (-sinθ, 0, -cosθ)
    if (c.seg.vertical) return c.dir === 1 ? Math.PI : 0;
    return c.dir === 1 ? -Math.PI / 2 : Math.PI / 2;
  }

  private placeMesh(c: Car) {
    const lane = centreLine(c.seg) + laneOffset(c.seg, c.dir, c.lane);
    const x = c.seg.vertical ? lane : c.t;
    const z = c.seg.vertical ? c.t : lane;
    c.group.position.set(x, 0.02, z);
  }

  // the next unhandled crossing in the direction of travel: everything on
  // the far side of `clearedUntil`, nearest first
  private nextCrossing(c: Car): Crossing | null {
    if (c.dir === 1) {
      for (const cr of c.seg.crossings) if (cr.at > c.clearedUntil) return cr;
      return null;
    }
    for (let i = c.seg.crossings.length - 1; i >= 0; i--)
      if (c.seg.crossings[i].at < c.clearedUntil) return c.seg.crossings[i];
    return null;
  }

  // is any other car inside this junction's box right now?
  private junctionBusy(c: Car, cross: Crossing): boolean {
    const jx = c.seg.vertical ? centreLine(c.seg) : cross.at;
    const jz = c.seg.vertical ? cross.at : centreLine(c.seg);
    const r = Math.max(c.seg.w, cross.other.w) * TS * 0.5 + 1.5;
    for (const o of this.cars) {
      if (o === c) continue;
      const p = o.group.position;
      if (Math.abs(p.x - jx) < r && Math.abs(p.z - jz) < r) return true;
    }
    return false;
  }

  // through traffic bearing down on a junction: anything on the given road
  // approaching within striking distance (or already past the line into it)
  private approachingThrough(road: Seg, atOnRoad: number, exclude: Car): boolean {
    for (const o of this.cars) {
      if (o === exclude || o.seg !== road) continue;
      const dist = (atOnRoad - o.t) * o.dir; // >0: heading toward the junction
      if (dist > -4 && dist < 20) return true;
    }
    return false;
  }

  // oncoming cars on my own road near the junction — what a left turn crosses
  private oncomingNear(c: Car, at: number): boolean {
    for (const o of this.cars) {
      if (o === c || o.seg !== c.seg || o.dir === c.dir) continue;
      const dist = (at - o.t) * o.dir;
      if (dist > -4 && dist < 16) return true;
    }
    return false;
  }

  update(dt: number) {
    const now = Date.now();
    for (const c of this.cars) {
      // ---- mid-turn: follow the arc around the corner ----
      if (c.turning) {
        // serve the stop/yield pause first, then pull out around the corner
        if (now < c.stopUntil) {
          c.speed = 0;
          continue;
        }
        const T = c.turning;
        T.s = Math.min(1, T.s + (4.2 * dt) / T.len);
        const u = T.s;
        const iu = 1 - u;
        const x = iu * iu * T.p0.x + 2 * iu * u * T.p1.x + u * u * T.p2.x;
        const z = iu * iu * T.p0.z + 2 * iu * u * T.p1.z + u * u * T.p2.z;
        // tangent for the heading
        const dx = 2 * iu * (T.p1.x - T.p0.x) + 2 * u * (T.p2.x - T.p1.x);
        const dz = 2 * iu * (T.p1.z - T.p0.z) + 2 * u * (T.p2.z - T.p1.z);
        c.group.position.set(x, 0.02, z);
        if (dx * dx + dz * dz > 1e-6) {
          const targetYaw = Math.atan2(-dx, -dz);
          let d = targetYaw - c.yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          c.yaw += d * Math.min(1, dt * 10);
          c.group.rotation.y = c.yaw;
        }
        if (T.s >= 1) {
          c.seg = T.seg;
          c.dir = T.dir;
          c.lane = T.lane;
          c.t = T.exitT;
          c.clearedUntil = T.clearedUntil;
          c.speed = 3.5;
          c.turning = null;
        }
        continue;
      }

      // ---- halted at a stop line ----
      if (now < c.stopUntil) {
        c.speed = 0;
        continue;
      }

      // ---- car following: ease off approaching the car ahead ----
      let desired = c.top;
      let leaderAhead = Infinity;
      const myLane = Math.min(c.lane, c.seg.w / 2 - 1);
      for (const o of this.cars) {
        if (o === c || o.seg !== c.seg || o.dir !== c.dir) continue;
        if (Math.min(o.lane, o.seg.w / 2 - 1) !== myLane) continue; // next lane over is theirs
        const ahead = (o.t - c.t) * c.dir;
        if (ahead > 0 && ahead < leaderAhead) leaderAhead = ahead;
      }
      if (leaderAhead < GAP) desired = 0;
      else if (leaderAhead < GAP * 2) desired = Math.min(desired, c.top * ((leaderAhead - GAP) / GAP));

      // ---- junctions, with real right-of-way ----
      // A side street terminating into a through road is a TURN, not an
      // intersection: through traffic doesn't stop; the car entering from
      // (or turning into) the side street yields until the way is clear.
      // Only true four-way crossings stop everyone.
      const cross = this.nextCrossing(c);
      if (cross) {
        const stopDist = stopDistFor(c.seg, cross);
        const dist = (cross.at - c.t) * c.dir - stopDist;
        const runway = c.dir === 1 ? c.seg.hi - cross.at : cross.at - c.seg.lo;
        const mineEnds = runway < 10;
        // everyone stops at a FULL intersection (the crosswalk-box test);
        // everything else is a turn junction with through right-of-way
        const fourWay = cross.full;
        const otherEnds = !cross.full;

        // decide intent ONCE per crossing, while still approaching
        if (dist < 14 && c.planAt !== cross.at) {
          c.planAt = cross.at;
          c.planTurn = mineEnds || Math.random() < (fourWay ? 0.35 : 0.18);
        }

        // through road, going straight past a side street: no stop at all
        if (otherEnds && !mineEnds && !c.planTurn) {
          if (dist <= 0.15) c.clearedUntil = cross.at + c.dir * (stopDist + 0.5);
        } else if (dist <= 0.15) {
          if (!c.waitingSince) c.waitingSince = now;
          // Yielding, like a licensed driver: the box must be empty, AND —
          // at turn junctions — the through road must offer a real gap.
          // A side-street car waits for through traffic in both directions;
          // a through car turning across waits for oncoming. Four-way stops
          // only need the box. Nobody waits past 5s of gridlock.
          const noGap = fourWay
            ? false
            : mineEnds
              ? this.approachingThrough(cross.other, cross.otherAt, c)
              : c.planTurn && this.oncomingNear(c, cross.at);
          if ((this.junctionBusy(c, cross) || noGap) && now - c.waitingSince < 5000) {
            c.stopUntil = now + 200;
            c.speed = 0;
            continue;
          }
          c.waitingSince = 0;
          if (fourWay) c.stopUntil = now + STOP_MS + Math.random() * 350;
          else c.stopUntil = now + 180; // a yield, not a stop sign
          if (c.planTurn) {
            const o = cross.other;
            const dirs: Array<1 | -1> = [];
            if (cross.otherAt < o.hi - 10) dirs.push(1);
            if (cross.otherAt > o.lo + 10) dirs.push(-1);
            if (dirs.length) {
              const nd = dirs[Math.floor(Math.random() * dirs.length)];
              // the box being cleared on the NEW street is the OLD street's width
              const clearance = (c.seg.w / 2) * TS + 2.1;
              const newLane = o.w >= 4 && Math.random() < 0.45 ? 1 : 0;
              const exitT = cross.otherAt + nd * clearance;
              const oldLaneLine = centreLine(c.seg) + laneOffset(c.seg, c.dir, c.lane);
              const newLaneLine = centreLine(o) + laneOffset(o, nd, newLane);
              const p0 = c.seg.vertical
                ? { x: oldLaneLine, z: c.t }
                : { x: c.t, z: oldLaneLine };
              const p2 = o.vertical ? { x: newLaneLine, z: exitT } : { x: exitT, z: newLaneLine };
              // the corner: where the old lane line meets the new one
              const p1 = c.seg.vertical ? { x: p0.x, z: p2.z } : { x: p2.x, z: p0.z };
              const len =
                Math.hypot(p1.x - p0.x, p1.z - p0.z) + Math.hypot(p2.x - p1.x, p2.z - p1.z);
              c.turning = { p0, p1, p2, s: 0, len: Math.max(2, len), seg: o, dir: nd, lane: newLane, exitT, clearedUntil: exitT };
              c.planAt = null;
              c.speed = 0;
              continue;
            }
          }
          c.clearedUntil = cross.at + c.dir * (stopDist + 0.5);
          c.planAt = null;
          c.speed = 0;
          continue;
        }
        // braking: hard for stops/yields, gentle roll-off for turners on the
        // through road, none for straight-through traffic
        if (!(otherEnds && !mineEnds && !c.planTurn) && dist < 8)
          desired = Math.min(desired, Math.max(1.1, dist * 1.5));
      }

      // ---- integrate, with a HARD spacing floor: never into the car ahead ----
      c.speed += (desired - c.speed) * Math.min(1, dt * (desired > c.speed ? 1.6 : 7));
      let move = c.speed * dt;
      if (leaderAhead !== Infinity) move = Math.max(0, Math.min(move, leaderAhead - MIN_GAP));
      c.t += move * c.dir;

      // ---- safety net: a true dead end (shouldn't happen) turns back ----
      if ((c.dir === 1 && c.t > c.seg.hi - 1.2) || (c.dir === -1 && c.t < c.seg.lo + 1.2)) {
        c.dir = (c.dir * -1) as 1 | -1;
        c.clearedUntil = c.t;
        c.speed = 0;
      }

      // ---- pose: slide into the lane, face the travel direction ----
      const targetYaw = this.headingYaw(c);
      let d = targetYaw - c.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      c.yaw += d * Math.min(1, dt * 7);
      c.group.rotation.y = c.yaw;
      const lane = centreLine(c.seg) + laneOffset(c.seg, c.dir, c.lane);
      const p = c.group.position;
      const x = c.seg.vertical ? lane : c.t;
      const z = c.seg.vertical ? c.t : lane;
      p.x += (x - p.x) * Math.min(1, dt * 6);
      p.z += (z - p.z) * Math.min(1, dt * 6);
    }
  }
}
