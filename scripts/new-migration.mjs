#!/usr/bin/env node
// Creates a migration whose name can't collide with anyone else's.
//
//   npm run migration:new -- add gold refinery
//
// Sequential numbers (045_, 046_) mean two people working at once both reach
// for the same one. A timestamp is unique per author without coordination, and
// still sorts into the order the migrations were written.

import { writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db");

const name = process.argv
  .slice(2)
  .join(" ")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

if (!name) {
  console.error("usage: npm run migration:new -- what it does");
  process.exit(1);
}

const d = new Date();
const p = (n, w = 2) => String(n).padStart(w, "0");
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
const file = path.join(DIR, `${stamp}_${name}.sql`);

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
if (existsSync(file)) {
  console.error(`${file} already exists`);
  process.exit(1);
}

writeFileSync(
  file,
  `-- ${name.replace(/_/g, " ")}
-- Applied automatically at server boot, in filename order, exactly once.
-- Must be safe to re-run: use "if not exists" / "on conflict do nothing".

`
);

const applied = readdirSync(DIR).filter((f) => f.endsWith(".sql")).length;
console.log(`created db/${path.basename(file)}  (${applied} migrations total)`);
