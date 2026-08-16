import * as THREE from "three";

// Every sellable good gets a shape you can recognise on a shelf. There are far
// too many items for a bespoke model each, so they are grouped into product
// forms — a loaf, a bottle, a sack, an ingot — and tinted per item, which reads
// far better at shelf scale than a row of identical cubes.

export type GoodForm =
  | "loaf"
  | "bottle"
  | "can"
  | "sack"
  | "ingot"
  | "plank"
  | "bolt"
  | "board"
  | "slab"
  | "carton"
  | "produce"
  | "log"
  | "rock"
  | "tool"
  | "crate";

const FORMS: Record<string, GoodForm> = {
  // raw
  wood: "log",
  stone: "rock",
  iron_ore: "rock",
  nails: "carton",
  gold_ore: "rock",
  silicon_ingot: "ingot",
  gold_ingot: "ingot",
  wheat: "sack",
  corn: "produce",
  carrots: "produce",
  cotton: "sack",
  crude_oil: "can",
  tobacco: "sack",
  // intermediate
  planks: "plank",
  bricks: "board",
  iron: "ingot",
  flour: "sack",
  fabric: "bolt",
  fuel: "can",
  cured_tobacco: "sack",
  cpu_basic: "slab",
  cpu_adv: "slab",
  gpu: "board",
  asic: "board",
  psu_unit: "carton",
  ram_ddr4: "board",
  ram_ddr5: "board",
  ram_ecc: "board",
  cooling_fan: "slab",
  cooling_liquid: "bottle",
  gun_barrel: "tool",
  gun_action: "tool",
  gun_stock: "plank",
  // finished
  bread: "loaf",
  shirt: "bolt",
  phone: "slab",
  beer: "bottle",
  whiskey: "bottle",
  cigarettes: "carton",
  cigars: "carton",
  hunting_rifle: "tool",
  pistol: "tool",
  shotgun: "tool",
  ammo: "carton",
};

export function formOf(item: string): GoodForm {
  return FORMS[item] ?? "crate";
}

// stable colour per item so the same good always looks the same
const tintCache = new Map<string, THREE.Color>();
export function goodTint(item: string): THREE.Color {
  const hit = tintCache.get(item);
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < item.length; i++) h = (h * 31 + item.charCodeAt(i)) >>> 0;
  const c = new THREE.Color().setHSL((h % 360) / 360, 0.45, 0.52 + ((h >> 9) % 10) / 100);
  tintCache.set(item, c);
  return c;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(key: string, color: THREE.ColorRepresentation, rough = 0.8): THREE.MeshStandardMaterial {
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
  matCache.set(key, m);
  return m;
}

function put(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return g.add(mesh), mesh;
}

// One unit of a good, sitting on a shelf, base at y=0. `s` scales the whole
// thing so the same models work on a shelf or in a hand.
export function makeGood(item: string, s = 1): THREE.Group {
  const g = new THREE.Group();
  const tint = goodTint(item);
  const body = mat(`b:${item}`, tint);
  const dark = mat(`d:${item}`, tint.clone().multiplyScalar(0.62), 0.85);
  const light = mat(`l:${item}`, tint.clone().lerp(new THREE.Color(0xffffff), 0.4), 0.7);

  switch (formOf(item)) {
    case "loaf": {
      const loaf = put(g, new THREE.CapsuleGeometry(0.075, 0.11, 4, 10), body, 0, 0.085, 0);
      loaf.rotation.z = Math.PI / 2;
      loaf.scale.set(1, 1, 0.78);
      for (const dx of [-0.03, 0.03])
        put(g, new THREE.BoxGeometry(0.015, 0.01, 0.1), dark, dx, 0.155, 0);
      break;
    }
    case "bottle": {
      put(g, new THREE.CylinderGeometry(0.045, 0.05, 0.16, 10), body, 0, 0.08, 0);
      put(g, new THREE.CylinderGeometry(0.018, 0.032, 0.07, 8), body, 0, 0.19, 0);
      put(g, new THREE.CylinderGeometry(0.021, 0.021, 0.025, 8), dark, 0, 0.235, 0);
      put(g, new THREE.CylinderGeometry(0.051, 0.051, 0.06, 10), light, 0, 0.09, 0);
      break;
    }
    case "can": {
      put(g, new THREE.CylinderGeometry(0.055, 0.055, 0.17, 12), body, 0, 0.085, 0);
      put(g, new THREE.TorusGeometry(0.055, 0.006, 5, 14), dark, 0, 0.155, 0).rotation.x =
        Math.PI / 2;
      put(g, new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8), dark, 0, 0.18, 0);
      break;
    }
    case "sack": {
      const sack = put(g, new THREE.SphereGeometry(0.085, 10, 8), body, 0, 0.085, 0);
      sack.scale.set(1, 1.15, 0.85);
      put(g, new THREE.CylinderGeometry(0.03, 0.045, 0.045, 8), dark, 0, 0.185, 0);
      break;
    }
    case "ingot": {
      const bar = put(g, new THREE.CylinderGeometry(0.06, 0.08, 0.055, 4), body, 0, 0.028, 0);
      bar.rotation.y = Math.PI / 4;
      bar.scale.set(1.5, 1, 0.85);
      const bar2 = put(g, new THREE.CylinderGeometry(0.06, 0.08, 0.055, 4), light, 0, 0.083, 0);
      bar2.rotation.y = Math.PI / 4;
      bar2.scale.set(1.5, 1, 0.85);
      break;
    }
    case "plank": {
      for (let i = 0; i < 4; i++)
        put(g, new THREE.BoxGeometry(0.19, 0.022, 0.09), i % 2 ? light : body, 0, 0.012 + i * 0.024, 0);
      break;
    }
    case "board": {
      put(g, new THREE.BoxGeometry(0.17, 0.02, 0.11), body, 0, 0.05, 0);
      put(g, new THREE.BoxGeometry(0.05, 0.02, 0.04), dark, -0.03, 0.07, 0);
      put(g, new THREE.BoxGeometry(0.03, 0.015, 0.03), light, 0.045, 0.068, 0.02);
      put(g, new THREE.BoxGeometry(0.03, 0.04, 0.03), dark, 0, 0.02, 0);
      break;
    }
    case "bolt": {
      const roll = put(g, new THREE.CylinderGeometry(0.06, 0.06, 0.19, 12), body, 0, 0.06, 0);
      roll.rotation.z = Math.PI / 2;
      put(g, new THREE.BoxGeometry(0.2, 0.005, 0.07), light, 0, 0.115, 0.01);
      break;
    }
    case "slab": {
      put(g, new THREE.BoxGeometry(0.11, 0.02, 0.17), dark, 0, 0.01, 0);
      put(g, new THREE.BoxGeometry(0.095, 0.006, 0.155), light, 0, 0.023, 0);
      break;
    }
    case "carton": {
      put(g, new THREE.BoxGeometry(0.1, 0.16, 0.06), body, 0, 0.08, 0);
      put(g, new THREE.BoxGeometry(0.102, 0.035, 0.062), light, 0, 0.12, 0);
      break;
    }
    case "produce": {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const p = put(
          g,
          new THREE.SphereGeometry(0.05, 8, 6),
          i === 1 ? light : body,
          Math.cos(a) * 0.045,
          0.05,
          Math.sin(a) * 0.035
        );
        p.scale.set(0.8, 1.35, 0.8);
      }
      break;
    }
    case "log": {
      for (const [x, y] of [
        [-0.05, 0.045],
        [0.05, 0.045],
        [0, 0.125],
      ]) {
        const l = put(g, new THREE.CylinderGeometry(0.045, 0.045, 0.18, 8), body, x, y, 0);
        l.rotation.z = Math.PI / 2;
        put(g, new THREE.CylinderGeometry(0.046, 0.046, 0.006, 8), light, x + 0.09, y, 0).rotation.z =
          Math.PI / 2;
      }
      break;
    }
    case "rock": {
      for (let i = 0; i < 3; i++) {
        const r = put(
          g,
          new THREE.DodecahedronGeometry(0.055, 0),
          i === 1 ? light : body,
          (i - 1) * 0.06,
          0.045,
          (i % 2) * 0.03 - 0.015
        );
        r.rotation.set(i, i * 2, i * 0.5);
      }
      break;
    }
    case "tool": {
      const barrel = put(g, new THREE.CylinderGeometry(0.014, 0.014, 0.19, 8), dark, 0.01, 0.075, 0);
      barrel.rotation.z = Math.PI / 2.1;
      put(g, new THREE.BoxGeometry(0.07, 0.035, 0.03), body, -0.06, 0.045, 0);
      put(g, new THREE.BoxGeometry(0.03, 0.05, 0.025), body, -0.085, 0.025, 0);
      break;
    }
    default: {
      // a plain crate, for anything without a form of its own
      put(g, new THREE.BoxGeometry(0.16, 0.14, 0.13), body, 0, 0.07, 0);
      for (const dy of [0.03, 0.11])
        put(g, new THREE.BoxGeometry(0.165, 0.012, 0.135), dark, 0, dy, 0);
      break;
    }
  }
  g.scale.setScalar(s);
  return g;
}
