import { mulberry32, hashSeed } from "./rng.js";

const FIRST = [
  "Ada", "Ben", "Cora", "Dex", "Elsie", "Felix", "Greta", "Hank", "Iris", "Jonah",
  "Kit", "Lena", "Milo", "Nora", "Otis", "Pearl", "Quinn", "Rosa", "Silas", "Tessa",
  "Ursula", "Victor", "Wren", "Xavier", "Yara", "Zeke", "Alma", "Bruno", "Celia", "Dario",
];
const LAST = [
  "Ashford", "Barlow", "Cutler", "Danner", "Eastman", "Fairbanks", "Granger", "Holloway",
  "Ives", "Jasper", "Kessler", "Lockwood", "Mercer", "Norwood", "Ogden", "Pemberton",
  "Quimby", "Rutledge", "Sable", "Thorne", "Underhill", "Vance", "Whitlock", "Yates",
];

export function npcName(seed: number): string {
  const rng = mulberry32(hashSeed(seed, 0x11a3e));
  return `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
}
