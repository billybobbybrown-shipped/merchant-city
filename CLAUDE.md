# Merchant City — working notes for Claude

Read this before changing anything. It covers what the game is, how the code is
arranged, the invariants that must not be broken, and the traps that have
already cost time.

## What it is

A browser MMO. You buy land, run farms and mines, process raw materials at
machines, build and furnish buildings, hire NPCs, and trade goods, company
shares and mined crypto on order books. The server is authoritative — the
client renders and sends intent, nothing more. Every 3D asset is generated
procedurally in code; there are no model files.

## Layout

```
/shared   types, constants, zod schemas, item + recipe tables, city generator,
          appearance model. Imported by BOTH client and server — the single
          source of truth for game rules.
/server   Colyseus room (20 ticks/s) + Express API + the economy simulation
/client   Three.js + Vite. All rendering, all panels.
/db       numbered SQL migrations, applied automatically at server boot
```

## Running it

Needs Node 20+ and a local Postgres.

```bash
createdb merchant_city
npm install
npm run dev:server    # :2567 — applies migrations, generates the world on first boot
npm run dev:client    # :5174
npm test              # unit tests (they live in shared/)
```

Every developer runs their own database, so **you get your own world** — your
own city, money, lots and citizens. `WORLD_SEED` in `server/.env` decides the
layout, so the same seed gives everyone the same streets with separate
economies. Config lives in `server/.env` (copy `server/.env.example`).

## Invariants — don't route around these

- **All money moves through `server/src/accounts.ts`.** `debit`, `credit` and
  `transfer` are the only ways funds change hands; they write ledger rows and
  enforce the wall between currencies. Never `update accounts set balance`.
- **One order book.** `server/src/orderbook.ts` is parameterized by `AssetHooks`
  and serves goods, stocks (`s:<entityId>`) and coins (the currency code) alike.
  A new tradable asset supplies hooks; it does not get its own matching engine.
- **Game rules live in `shared/`.** Items, recipes, prices, appearance catalogs.
  If the client and server could ever disagree about a rule, the rule is in the
  wrong place.
- **Migrations are timestamped and idempotent.** Create them with
  `npm run migration:new -- what it does`; never hand-name one with the next
  number. They run in filename order at boot, exactly once, and must be safe to
  re-run. Never edit one that has shipped — add another. The server refuses to
  start if two migrations share a numeric prefix.
- **Avatars are one draw call.** `client/src/assets/avatar.ts` merges every body
  part into a single skinned geometry with colours baked into vertex colours.
  Adding detail costs triangles, not draw calls. Keep it that way.

## Traps that have already cost time

- **Run the server from `server/`** (`npm run dev:server` handles it). Colyseus
  0.15 is CommonJS; running it from the repo root resolves the wrong module.
- **`psql` writes do not affect a running server.** The simulation holds state in
  memory. Change the database by hand and you must restart the server, or you
  will debug a ghost.
- **`THREE.Color.set()` already converts to linear** when colour management is
  on. Converting again silently darkens everything — this is why every swatch
  once rendered muddy.
- **A geometry's triangle count is `index.count / 3`, not `position.count / 3`.**
  Sphere and cylinder geometries are indexed; getting this wrong under-reports
  cost by roughly 3×.
- **Two UI panels share `.market-panel`** (stocks and crypto). Query the visible
  one, not the first one.
- **The dropdown enhancer copies a `<select>`'s classes onto its wrapper**, so
  `querySelector(".my-select")` can return a `div`. Query `select.my-select`.

## Conventions

- TypeScript strict everywhere. No `any` without a reason.
- Keep it minimal: no speculative abstractions, no defensive error handling for
  cases that cannot happen.
- Comment **why**, and only where the code isn't self-evident. Don't narrate.
- Match the surrounding code's idiom rather than importing a new style.

## Verifying changes

`npm test` covers the shared rules (economy maths, permits, appearance encoding,
mining). It does **not** cover rendering or the server room.

For anything visual or interactive, drive it headlessly with puppeteer against
the running dev server and assert on measurements — pixel counts, geometry
bounds, draw calls — rather than eyeballing. Several bugs in this codebase were
only caught that way: hair covering the face, characters floating above the
ground, a panel losing its WebGL context on every click.

For server behaviour, connect a `colyseus.js` client and assert on room state
and the database.

## Working together

- Keep `PROGRESS.md` up to date — it is the change log and the shared memory of
  why things are the way they are.
