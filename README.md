# Merchant City

Browser-based top-down persistent-world economy MMO. Server-authoritative
(Colyseus), player-driven economy with NPC agents, companies, a stock market and
mined crypto. All 3D assets — buildings, machines, goods, characters — are
generated procedurally in code; there are no model files.

```
/client   Three.js + Vite app
/server   Colyseus + economy simulation (20 tick/s)
/shared   types, constants, zod schemas, items + recipes, city generator — used by both sides
/db       numbered SQL migrations (applied automatically at server boot)
```

## Getting it running

Requires **Node 20+** and a local **Postgres**.

```bash
createdb merchant_city
cp server/.env.example server/.env     # defaults work for local dev
npm install
npm run dev:server                     # http://localhost:2567
npm run dev:client                     # http://localhost:5174
```

Open the client, register a name, and you're in. The first server boot applies
every migration and generates the city; nothing else to set up.

**Everyone gets their own world.** The database is local to your machine, so
your city, money, lots and citizens are yours alone. `WORLD_SEED` in
`server/.env` decides the layout — keep the same seed and we all get the same
streets to talk about, with separate economies to play in.

Other commands:

```bash
npm test                # unit tests (economy maths, permits, mining, appearance)
npm run build           # typecheck + build all three packages
```

Asset viewer (every procedural asset, time-of-day slider):
`http://localhost:5174/dev/asset-viewer/`

## Where things are

| | |
|---|---|
| `CLAUDE.md` | architecture, invariants and known traps — **read first** |
| `PROGRESS.md` | change log; why things are the way they are |
| `server/src/accounts.ts` | every money movement in the game |
| `server/src/orderbook.ts` | the one matching engine, for goods, shares and coin |
| `shared/src/items.ts` | items, recipes, which machine makes what |
| `client/src/assets/` | all procedural geometry |

## Deployment

Config is env-driven — see `server/.env.example`. Point `DATABASE_URL` at
Supabase and set `SUPABASE_JWT_SECRET` / `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` to move auth and persistence there.

## Working on it together

Create migrations with:

```bash
npm run migration:new -- add gold refinery
```

That writes `db/20260816153000_add_gold_refinery.sql`. The timestamp is unique
per author, so we can both write one at the same time without coordinating, and
they still apply in the order they were written. The server refuses to boot if
two migrations ever share a number, rather than applying them in an order that
depends on the rest of the filename.

Never edit a migration that has already been applied — add a new one.
