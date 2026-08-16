# Merchant City — state of play (2026-08-16)

Browser MMO: buy land, run farms/mines/quarries, process at machines, build and
furnish buildings, hire NPCs, trade goods, shares and mined coin.

## Done and playable

- **Foundation** — world generation, tiles, camera, movement, auth, persistence.
- **Property** — buying land, drawing production sites, construction with real
  material and time costs, multi-floor interiors you can walk up.
- **Goods economy** — raw extraction → machines → finished goods, an order-book
  exchange, shop shelves with per-shelf pricing, storage containers.
- **NPC residents** — retail demand, jobs, wages, rent; workers visibly walk
  their jobs (cashier at the register, stocker rack→shelf, farmer in the field,
  hauler between bays).
- **Companies and shares** — registration, share issue, dividends, a stock
  market with a portfolio page.
- **Crypto** — three coins (Ducat, Obol, Tiderium), mining rigs built from real
  components, whole-coin emission on a halving schedule, market + portfolio.
- **Logistics** — delivery bays, shipping routes, haulers moving goods per minute.
- **Permits** — liquor, tobacco and firearms licensing, priced per station.
- **Characters** — creation screen (skin, hair, shirt, pants, shoes, each with
  colour), one-draw-call skinned avatars, a proper walk cycle.

## Next

- **Phase 5** — dirty money: illegal production, black market, laundering, heat.
  The firearms permit work already sits underneath this.
- **Phase 6** — families, territory, conflict.
- **Phase 7** — balance, admin tooling, polish.

Known and deliberately unfinished: crude oil and fuel have no consumer since no
recipe burns fuel any more.

## Scaling

Profiled but not acted on. The client builds the entire city up front (~6,600
meshes) though only a handful of chunks are ever visible, and the day tick is
round-trip bound on per-entity queries rather than database bound. The intended
fix is spatial chunking — stream scenery by camera proximity and sync only
nearby citizens — rather than making everything individually cheaper. Run the
server with `MC_PROFILE_SQL=1` and hit `/dev/sql` to see where database time
goes.

Full change log: `PROGRESS.md`. Architecture and traps: `CLAUDE.md`.
