import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEARANCE_VERSION,
  CLOTH_COLORS,
  DEFAULT_APPEARANCE,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_STYLES,
  SHIRT_STYLES,
  SHOE_STYLES,
  SKIN_TONES,
  appearanceFromSeed,
  decodeAppearance,
  encodeAppearance,
  randomAppearance,
} from "./appearance.js";
import { mulberry32 } from "./rng.js";

test("a look survives a round trip through the wire format", () => {
  const a = randomAppearance(mulberry32(99));
  assert.deepEqual(decodeAppearance(encodeAppearance(a)), a);
  assert.equal(encodeAppearance(a)[0], APPEARANCE_VERSION);
});

test("decoding junk gives the default look instead of throwing", () => {
  for (const bad of ["", "0abc", "xyz", "1", "1zz", null, undefined, "9999999999999"])
    assert.deepEqual(decodeAppearance(bad as string), DEFAULT_APPEARANCE);
});

test("out-of-range choices clamp into their catalog", () => {
  const wild = { ...DEFAULT_APPEARANCE, skin: 99, hair: -4, shirtColor: 1e9 };
  const back = decodeAppearance(encodeAppearance(wild));
  assert.equal(back.skin, SKIN_TONES.length - 1);
  assert.equal(back.hair, 0);
  assert.equal(back.shirtColor, CLOTH_COLORS.length - 1);
});

test("a seed always yields the same look, and looks differ between seeds", () => {
  assert.deepEqual(appearanceFromSeed(1234), appearanceFromSeed(1234));
  const codes = new Set(Array.from({ length: 40 }, (_, i) => encodeAppearance(appearanceFromSeed(i))));
  assert.ok(codes.size > 30, `seeds collapse into ${codes.size} looks`);
});

test("every catalog fits one base36 digit and has an entry for each choice", () => {
  for (const cat of [SKIN_TONES, HAIR_COLORS, CLOTH_COLORS, HAIR_STYLES, SHIRT_STYLES, PANTS_STYLES, SHOE_STYLES])
    assert.ok(cat.length > 1 && cat.length <= 36, `catalog of ${cat.length} won't encode`);
  for (const hex of [...SKIN_TONES, ...HAIR_COLORS, ...CLOTH_COLORS])
    assert.match(hex, /^#[0-9a-f]{6}$/, `${hex} is not a hex colour`);
  for (const st of [...HAIR_STYLES, ...SHIRT_STYLES, ...PANTS_STYLES, ...SHOE_STYLES])
    assert.ok(st.id && st.label, "style option missing id or label");
});
