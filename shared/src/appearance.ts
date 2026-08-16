// Character appearance. Faces are deliberately spare — eyes and nothing else —
// so the look comes from silhouette and colour: hair, facial hair, and three
// layers of clothing, each with its own palette choice.

import { mulberry32 } from "./rng.js";

export interface Appearance {
  skin: number;
  hair: number;
  hairColor: number;
  shirt: number;
  shirtColor: number;
  pants: number;
  pantsColor: number;
  shoes: number;
  shoesColor: number;
}

export interface StyleOption {
  id: string;
  label: string;
}

// a plain human range, light to deep, with both warm and cool undertones
export const SKIN_TONES = [
  "#f8e0c8", "#f2d3b0", "#e8bd97", "#dda87c", "#cf9163",
  "#bd7d4f", "#a3663d", "#8a5330", "#6d4025", "#52301b", "#3a2114", "#e0b9a0",
];

export const HAIR_COLORS = [
  "#141110", "#2a1f1a", "#3f2c20", "#5b3d27", "#7c5230", "#a06c34",
  "#c9954a", "#e3c98d", "#efe6d6", "#9a9a9a", "#cfcbc6", "#7d2f2f",
  "#2f4f7d", "#54306e", "#2f6b4a", "#c25a2c",
];

export const CLOTH_COLORS = [
  "#f2f4f6", "#c9ced4", "#8d959d", "#565e66", "#2c3238", "#14181c",
  "#8c2f2f", "#c0453a", "#d97b3c", "#e0b64a", "#6f8f3c", "#3f7a4e",
  "#2f7d7d", "#33608f", "#2b3f7a", "#5a3a7a", "#9b4a7a", "#7a5230",
];

export const HAIR_STYLES: StyleOption[] = [
  { id: "bald", label: "Bald" },
  { id: "buzz", label: "Buzz" },
  { id: "bun", label: "Bun" },
  { id: "afro", label: "Afro" },
  { id: "mohawk", label: "Mohawk" },
];

export const SHIRT_STYLES: StyleOption[] = [
  { id: "tee", label: "T-Shirt" },
  { id: "long", label: "Long Sleeve" },
];

export const PANTS_STYLES: StyleOption[] = [
  { id: "trousers", label: "Trousers" },
  { id: "shorts", label: "Shorts" },
];

export const SHOE_STYLES: StyleOption[] = [
  { id: "sneakers", label: "Sneakers" },
  { id: "boots", label: "Boots" },
  { id: "bare", label: "Barefoot" },
];

// field order is the wire format — append only, never reorder
const FIELDS: Array<[keyof Appearance, number]> = [
  ["skin", SKIN_TONES.length],
  ["hair", HAIR_STYLES.length],
  ["hairColor", HAIR_COLORS.length],
  ["shirt", SHIRT_STYLES.length],
  ["shirtColor", CLOTH_COLORS.length],
  ["pants", PANTS_STYLES.length],
  ["pantsColor", CLOTH_COLORS.length],
  ["shoes", SHOE_STYLES.length],
  ["shoesColor", CLOTH_COLORS.length],
];

export const APPEARANCE_VERSION = "1";

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 2,
  hair: 1,
  hairColor: 2,
  shirt: 0,
  shirtColor: 13,
  pants: 0,
  pantsColor: 4,
  shoes: 0,
  shoesColor: 5,
};

const clamp = (v: number, n: number) => (Number.isFinite(v) ? Math.min(n - 1, Math.max(0, Math.floor(v))) : 0);

// one base36 digit per field after a version char — short enough to sit in a
// schema string that ships with every player and NPC
export function encodeAppearance(a: Appearance): string {
  return APPEARANCE_VERSION + FIELDS.map(([k, n]) => clamp(a[k], n).toString(36)).join("");
}

// never throws: anything unparseable falls back to the default look, so a bad
// row or an old code can't stop someone rendering
export function decodeAppearance(code: string | null | undefined): Appearance {
  const out = { ...DEFAULT_APPEARANCE };
  if (typeof code !== "string" || code[0] !== APPEARANCE_VERSION) return out;
  const body = code.slice(1);
  if (body.length < FIELDS.length) return out;
  FIELDS.forEach(([k, n], i) => {
    const v = parseInt(body[i], 36);
    out[k] = Number.isNaN(v) ? DEFAULT_APPEARANCE[k] : clamp(v, n);
  });
  return out;
}

export function randomAppearance(rand: () => number = Math.random): Appearance {
  const pick = (n: number) => Math.floor(rand() * n);
  return {
    skin: pick(SKIN_TONES.length),
    hair: pick(HAIR_STYLES.length),
    hairColor: pick(HAIR_COLORS.length),
    shirt: pick(SHIRT_STYLES.length),
    shirtColor: pick(CLOTH_COLORS.length),
    pants: pick(PANTS_STYLES.length),
    pantsColor: pick(CLOTH_COLORS.length),
    shoes: pick(SHOE_STYLES.length),
    shoesColor: pick(CLOTH_COLORS.length),
  };
}

// citizens and legacy players get a stable look from the seed they already have
export function appearanceFromSeed(seed: number): Appearance {
  return randomAppearance(mulberry32(seed >>> 0));
}

export const skinHex = (a: Appearance) => SKIN_TONES[clamp(a.skin, SKIN_TONES.length)];
export const hairHex = (a: Appearance) => HAIR_COLORS[clamp(a.hairColor, HAIR_COLORS.length)];
export const shirtHex = (a: Appearance) => CLOTH_COLORS[clamp(a.shirtColor, CLOTH_COLORS.length)];
export const pantsHex = (a: Appearance) => CLOTH_COLORS[clamp(a.pantsColor, CLOTH_COLORS.length)];
export const shoesHex = (a: Appearance) => CLOTH_COLORS[clamp(a.shoesColor, CLOTH_COLORS.length)];

export const hairStyle = (a: Appearance) => HAIR_STYLES[clamp(a.hair, HAIR_STYLES.length)].id;
export const shirtStyle = (a: Appearance) => SHIRT_STYLES[clamp(a.shirt, SHIRT_STYLES.length)].id;
export const pantsStyle = (a: Appearance) => PANTS_STYLES[clamp(a.pants, PANTS_STYLES.length)].id;
export const shoeStyle = (a: Appearance) => SHOE_STYLES[clamp(a.shoes, SHOE_STYLES.length)].id;
