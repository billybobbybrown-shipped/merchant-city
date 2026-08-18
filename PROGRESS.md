# PROGRESS

## Phase 0 — Foundation (2026-08-12)

### Pallets unified; manager role and lot names fixed (2026-08-15)
- **The indoor fitting now uses the outdoor builder**, so there's one pallet design rather than two drifting copies — `makeDock(fill, seed, apron)` serves both, the apron dropped indoors where the building's own floor shows through under hazard markings. Rendered side by side to confirm they match.
- **BUG: manager and hauler were missing from the assignment dropdown.** The Workers panel had a hardcoded role list that was never updated when logistics added the two new jobs, so you couldn't put anyone on a delivery bay. All seven roles are now offered: cashier, stocker, crafter, farmer, extractor, manager, hauler.
- **BUG: properties were listed by raw type** — "farm carrots", "farm wheat". Every list (worker assignment, shipping destinations, company property transfers) now names a property by its building's name, else the proper label of what it produces: **"Wheat Farm"**, "Carrot Farm", "Iron Mine". One helper decides it, so the three lists can't drift apart.
- Verified in-browser: assignment dropdown lists all seven roles; properties read "Wheat Farm (Keeper Agriculture)" and "Lot #77".

### Delivery space: pallets, indoor fitting, searchable shipping (2026-08-15)
- **Timber pallet model.** The pad is now four proper pallets — bottom runners, nine stringer blocks, a five-board slatted deck with real gaps, in three weathered tones — standing on a swept apron. Cartons load pallet by pallet, three high, each taped, seamed and labelled, sized and jittered per crate. An empty bay is bare pallets; a full one is a stacked pile.
- **BUG: the placement ghost was always red.** A delivery pad reports no source type, so it was being validated against the 3×3 *building* minimum and a 2×2 pad could never pass. It's now judged on its own size and whether it fits the plot — green when placeable.
- **Click the pad, not the plot.** A pad is a fixture like a rack or shelf: clicking the pallets opens the bay (hit-tested against its 2×2 footprint in the lot's local frame, so it works at any lot rotation) instead of selecting the plot underneath.
- **Also a placeable furniture fitting**: `Delivery Space` (2×2) can be built at a carpentry bench (6 planks + 1 iron) and placed indoors, where it becomes that plot's loading bay — hazard-striped floor markings with two loaded pallets, clicking it opens the same panel. One bay per plot either way; pulling out the last indoor fitting closes the bay. Outdoor rendering skips indoor bays.
- **Shipping page rebuilt**: direction is a two-button toggle, and goods and destination are now **search-as-you-type fields** with an icon list underneath — no more cramped dropdowns clipping long names. Quantity is its own labelled field, and the submit button states the whole instruction ("Ship 20 Wheat to Lot #77") and stays disabled until it's complete. Panel widened to 340px; fields are 310px.
- Verified in-browser: typing "whe" filters to Wheat, the property picker lists your other plots, no JS errors.

### Delivery space is a real 2×2 pad (2026-08-15)
- The bay is no longer an invisible property flag — it's a **2×2 loading pad you place on the plot**. In the designer, picking Delivery space shows a 2×2 ghost that follows the cursor; one click stamps where it goes, and the bar then quotes the price. Position is stored per dock (migration 024).
- **3D model** (`assets/dock.ts`): a marked apron with a low kerb and painted hatching so it reads as a loading bay even when empty, then **crates stack up as the bay fills** — four columns filling in order across three levels, sized and jittered per crate with taped lids, driven by the bay's actual stock against its 240-unit capacity.
- Bays render alongside buildings and fields on the same lot (they're not a production type, so they coexist). `/docks` feeds position + fill to the client, refreshed whenever a bay changes.
- Verified in-world: the farm's half-full bay draws six crates on its pad beside the wheat field; no render errors.

### Delivery space fixes (2026-08-15)
- **BUG: Delivery space was unclickable in Build.** A plot that already has a production type locks every other kind in the designer ("this lot already has a different production type") — and the new delivery-space kind was caught by that lock, so on a farm or mine it was silently disabled. A delivery space isn't a production type, so it's now exempt and can sit alongside whatever the plot grows or digs. Verified on the wheat farm: quarry/mine/oil well correctly locked, **dock enabled**, confirm reads "Add delivery space · $150".
- **Removed the Deliveries button from the lot panel's Develop section.** Building happens in Build; the panel now shows a **Delivery space** section only on plots that actually have one, summarising it ("2 shipments · 40 on the bay") and opening the bay to configure it.
- Farm crop picker confirmed carrying the full family: Wheat, Corn, Carrots, Cotton, Tobacco, Wood.

### Delivery space in Build; farms grouped (2026-08-15)
- **Delivery space moved into the Build designer** as its own type, beside Quarry / Iron Mine / Oil Well / Farm. It's a fixed fitting rather than an area you draw, so picking it hides the floors and undo controls and the bar just quotes the price. **$150** (was $600). The lot panel's button is now "Deliveries" and only opens the bay to configure shipping.
- **Logging Camp is now Tree Farm**, and it's grouped under Farm with the other crops — Wheat, Corn, Carrots, Cotton, **Tobacco** and Wood now all sit behind the one Farm option, with the crop chosen underneath. Top-level types are just Building, Farm, Quarry, Iron Mine, Oil Well, Delivery space.
- Grouping lives in one shared list (`FARM_TYPES`), which also decides who works the site: anything grown is worked by a **farmer**, everything extracted by an **extractor**. Tree farms and tobacco farms therefore hire farmers now.
- Verified: delivery space builds from the designer path and charges $150 to the ledger.

### LOGISTICS — delivery spaces, haulers, managers (2026-08-15)
Goods now move between properties on their own, so a supply chain keeps earning while its owner is offline.
- **Delivery space**: a loading bay laid on any plot you operate — including plots with no building, so farms and mines can ship. Cheap ($150) and built from the lot's **Develop** section beside Build. It holds up to 240 units and is the only place goods cross the property line. DB: `docks` + a new `dock` inventory holder.
- **Shipping instructions per bay**: each bay sets what ships **out** (to a named property) and what ships **in** (pulled from one), with a per-day quantity. Configured from the bay's Shipping page; you can ship between your own plots and your companies' freely.
- **Two new jobs**, both hired and paid through the normal workforce:
  - **Hauler** — carries between the bays of two properties, up to 60 units/day each.
  - **Manager** — walks goods between the bay and the building's storage racks, 120 units/day. Stages outbound goods before pickup and puts arrivals away after, so the bay doesn't clog.
- Runs on the day tick in order: production → managers stage → haulers carry → managers store → rents. Today's harvest can reach the workshop the same day.
- **Verified end to end with nobody playing**: 120 wheat seeded at the farm, one manager + one hauler there and a manager at the destination. Day 1: 40 delivered (farm 120→80, destination 0→40). Day 2: 80. Day 3: 120, with the farm's own production feeding the next run.
- **Not yet done**: the bay has no 3D model on the plot — it exists and works, but you can't see it in the world yet.

### Dropdown sizing + stocks crash fix (2026-08-15)
- **BUG: no stock could be opened.** Clicking any listing threw `divYield is not defined` — the variable was dropped when the detail view was split into Trade/Company tabs, so `renderDetail` crashed before painting and the panel silently stayed on the list. Restored (and reworded: "35% of profit" / "none — growth company"). Verified: clicking Atlas Provisions now opens the chart, ticket and tape, and the Company tab renders cap/shares/float/P-E.
- **Dropdowns sized for real names.** Control padding and type bumped (13px), entity pickers now put their label above the control so it spans the full panel width (342px, up from ~238px), and menus size to their content (`width: max-content`, capped at 420px) so a long name reads in full even when the closed control would clip it. Worker assignment rows give the lot name a full-width line with the role beside it.
- Verified with a 37-character company name across a two-company picker: closed label not truncated, every menu item fully visible, no errors.

### Custom dropdowns + stuck toolbar highlight (2026-08-15)
- **Every dropdown in the game is now a styled control.** A native `<select>` renders the operating system's own menu, which looked nothing like the rest of the interface. `ui/dropdown.ts` upgrades each one into a game-styled button + menu (dark surface, gold active row, animated caret, ellipsis on long names, opens upward when there's no room below, Esc/click-outside to dismiss, arrow keys to step values, visible focus ring). **No call site changed**: the real `<select>` stays in the DOM as the source of truth and still fires `change`, so every existing handler works untouched. A MutationObserver upgrades selects as panels re-render, so new markup is covered automatically.
- **Toolbar highlight no longer sticks.** Closing a panel with its own ✕ never told the HUD, so the button stayed lit. The active state is now derived from what's actually visible (a MutationObserver on panel style), so it can't drift no matter how a panel is dismissed.
- Verified in-browser: highlight lit on open, cleared after ✕; dropdown opens, selecting an option updates the underlying select value (2 → 279), fires change and closes the menu; native selects confirmed hidden; no JS errors.

### Fit pass — nothing wraps or overflows (2026-08-15)
- Audited every panel in-browser for horizontal overflow and unwanted wrapping. Real bug found and fixed: the Companies tab strip overflowed its panel (297px of tabs in a 290px body).
- **Rules now enforced system-wide** so variable-length content can't break a row:
  - Tab strips stay on one line and scroll (hidden scrollbar) instead of wrapping.
  - Names truncate with an ellipsis — company names, worker names, job assignments, stock names, district names, item cards — while figures and buttons keep their natural size. The label is the flexible part of every row, never the number.
  - Stat strips wrap as whole cells with row spacing, never mid-label.
  - Buttons never break mid-word; selects hold long lot names without stretching their row; ticket fields grow while the action button holds its width.
  - Fixed earlier in this pass: inline rows put `flex: 1` on the field and `flex: 0 0 auto` on buttons (the bug that made Register huge and the name box tiny).
- Company panel widened to 372px to match the workforce panel.
- Stress-tested with a 41-character company name ("Keeper Agricultural Holdings International") across the Company and Workforce panels — no overflow anywhere.

### Companies panel rebuilt (2026-08-15)
- **Register moved into the header** as a `+ New company` button — it toggles a focused registration screen (name + fee + what a company actually is) instead of sitting buried under the balance sheet at the bottom of a long scroll. Also the empty state: with no companies, the panel opens straight on registration.
- **One company in focus, four pages.** A picker selects the company (when you have more than one), an identity block states its name, your stake and cash, and its detail is split into tabs so each screen answers one question:
  - `Overview` — capital in/out, property moved between you and the company
  - `Books` — balance sheet (cash / property / inventory / total) and a proper day-by-day P&L grid with revenue, costs and net
  - `Permits` — the company's licences and, separately, your personal ones
  - `Market` — dividend policy when listed; otherwise the IPO form beside the actual requirements (age, revenue, profitability, scale, audit fee)
- Every section is now a bordered group with its own label rather than one continuous run of rows; P&L uses a four-column grid with tabular numerals so days line up.
- Verified in-browser across all four tabs plus the register flow: renders correctly, no JS errors.

### Entity picker for payroll and companies (2026-08-15)
- **Workforce panel now has a "Viewing" dropdown** — switch between your own payroll and each company you control. The whole page follows the selection: staff list, open offers, the summary strip (staff count, payroll, **that entity's own cash**, days of runway), and new hires are posted under whoever you're viewing. Removed the separate employer dropdown from the hire form since the selection already says who pays.
- **Companies panel has a matching "Managing" dropdown** — pick a company and its detail (deposit/withdraw, lot transfers, balance sheet, daily P&L, permits, IPO/dividends) renders below a summary strip showing name, your stake and cash. Replaces the old click-each-row-to-expand list.
- Server: `/workforce/:eid` employers now carry their own clean-cash balance so company runway is real, not the player's.
- Verified in-browser: picker lists "You" and "Keeper Agriculture · 1 staff"; switching shows Staff (1), $45/day payroll, $4,000 company cash, 88 days covered, and the worker row with its assignment controls.

### Panels get their own pages (2026-08-15)
- Replaced the cross-panel tab strip (wrong idea — it navigated *between* panels) with **per-panel pages**, so each panel organises its own content:
  - **Workforce**: `Staff` (roster, assignment, payroll health) · `Hiring` (open offers + post an offer)
  - **Companies**: `Companies` (list, detail, register) · `Permits` (your personal permits)
  - **The Economy**: `Overview` (GDP, prices, labour, population, coin network) · `Markets` (stock indices) · `Goods` (supply vs demand)
  - **Coin**: `Market` (chart, book, ticket, tape) · `Mining` (your hashpower, network share, estimated income, network supply)
  - **Stocks** detail: `Trade` (book, ticket, tape) · `Company` (shares, float, insider held, cap, P/E, dividend policy, daily band)
- Tab labels carry live counts (`Staff (3)`, `Hiring (2)`, `Companies (1)`) so the panel tells you what's inside before you click.
- Verified headlessly: every panel shows only its own tabs, switching re-renders correctly, no JS errors.

### Hiring feedback + panel organisation (2026-08-14)
- **"Can't hire more than 2" diagnosed**: hiring was never limited — a 4-slot offer hires 4 people in one game day (verified). The real failure was **silence**. Posting an offer gave no confirmation, nobody told you when a citizen accepted, and when workers quit because payroll couldn't be met they simply vanished. Fixed: the employer is now notified when someone accepts an offer ("Alma Whitlock accepted your offer — $50/day, assign them a job") and when someone quits ("… quit — you couldn't cover $45 in wages"), with the Workers panel refreshing live on both.
- **Payroll health up front**: the Workers page opens with staff count, daily payroll, your cash, and how many days that cash covers — with a red warning when it's under four days. Workers quitting for non-payment is no longer a mystery.
- **Overlays are now pages of one app.** Added a shared tab strip (Workers · Company · Stocks · Crypto · Economy) at the top of each big panel, so you can move between them without going back to the HUD. Verified headlessly: navigating purely through in-panel tabs leaves exactly one overlay open at each step, no JS errors.

### UI design pass (2026-08-14)
- **One design system.** Added a token layer (palette, type scale, radii, spacing) at the end of `styles.css` that harmonises every panel: consistent surfaces (subtle gradient + one border/radius/shadow), one header treatment across lot/fixture/market/workers/company/economy panels, one section-label voice, unified button families (primary/secondary/danger/ghost/active), unified inputs and focus states, quiet custom scrollbars, and tabular numerals on every number in the game.
- **Semantic colour is defined once**: up/down/money/gold/warn each have a single definition, replacing the dozens of hardcoded hexes that had drifted apart (three different greens, four different golds).
- **HUD reorganised** into a grouped toolbar — world (Districts) | operations (Workers, Company) | markets (Stocks, Crypto, Economy) — with separators, and the active panel's button now highlights.
- **Overlays are mutually exclusive**: opening any large panel closes the others, so they never stack. Verified headlessly — every nav button leaves exactly one overlay visible, no JS errors.

### Bigger coin supply, living stock prices, chain deadlock fixed (2026-08-14)
- **Coin supply scaled up**: hard cap 100k → **500,000 ◈**, circulating float → **50,000 ◈**, era-0 reward → 40/game-day. The coin's monetary share (used for fair value) moved to 25% so per-coin prices stay sensible with 5x the float.
- **Stocks now trade like the coin AND follow their businesses.** Per-company mood random-walks (trends form and fade), the anchor follows the last print so runs compound, and quotes are pulled toward a **fundamental fair value computed from the real ledger**: company cash + land + a ~6x multiple on trailing earnings, per share. Companies that earn drift up, companies that bleed drift down. Verified: prices track book value (Atlas $21 vs $22.58 book; Consolidated carries an earnings premium) and move both ways day to day.
- **CRITICAL: the mining supply chain had deadlocked.** Nordvik couldn't buy iron because nobody in the world sold any, so it never crafted components, HashWorks' processors wore out unreplaced, and world hashpower hit zero — the coin stopped being mined entirely. Fixes: (1) the **city industrial depot** now always lists staples (iron, planks, bricks, fuel, ore, wood, stone) at 2x base price, so no production chain can starve — and it acts as a price ceiling players can undercut; (2) NPC buyers no longer stack duplicate orders (HashWorks had 20 identical bids resting); (3) NPC workshops don't queue work on an already-busy bench. Chain verified end to end: depot iron → Nordvik crafts CPUs → HashWorks installs 8 → hashpower back to 6 and supply growing again.

### Coin price dynamics, settled (2026-08-14)
- **Emission cut**: era-0 reward 50 → **12 ◈/game-day**. Mining was minting far too much against an 8k float, which was the actual source of the one-way slide.
- **Miners sell for reasons, not on a schedule.** Removed every fixed percentage. A miner now raises exactly what a cash shortfall requires; separately it may take some off the top when the market trades above its own recent average (how keen it is scales with how far above, and it doesn't act every time it's tempted); and occasionally it just wants cash for expansion. Observed live: stacked seven straight days selling nothing, then sold on the eighth.
- **Market mood + fundamentals**: market-maker quotes lean on a persistent mood that random-walks and decays, anchored to the last price (so runs compound into trends) and pulled toward a fair value derived from citizen money supply ÷ circulating float — the level itself rises as the city gets richer and falls as mining adds supply. Occasional whale takers move the tape.
- Result: price recovered $2.5 → $3.8 as supply pressure eased, now oscillating with ~3-6% swings against a $3.93 fair value, moving in both directions instead of only bleeding down.

### Coin market dynamics + stock variety (2026-08-14)
- **Root cause of the one-way coin price found**: not the miner, the float. Genesis put 150,000 ◈ into citizens' hands while the whole citizen economy held ~$309k cash — coin was 32% of their net worth against a 10-20% target, so EVERY holder was structurally a seller (the book showed 95 resting asks vs 1 bid). Rescaled the design: max supply 1M → **100,000 ◈**, genesis circulation → **12,000 ◈**, era-0 emission 1,000 → **50/game-day**. Coin is now scarce relative to the money supply.
- **Miners run a treasury, not a faucet.** HashWorks sells to cover an operating runway, adds a steady 12-22% of the stack on top, takes 30-45% when price runs 8%+ above its recent average, and holds back to 5% when price is depressed and costs are covered — it never dumps the whole day's mining.
- **Real demand side**: citizens target ~10-20% of net worth in coin and buy toward it, trimming only when 60%+ over-allocated. Market-maker asks now come only from sizeable stacks (25+) and offer a slice, with three bidders to two askers.
- Result over 16 game days: price rose $1.96 → $2.70, decelerating as it went, asks reappeared once holders reached target allocation, and citizens settled at 15.5% of net worth in coin — a market that finds equilibrium instead of bleeding out.
- **Stocks: varied share counts and floats.** Share counts are banded by size (small 500-750k, mid 1-1.25M, large 1.5-2M) so bigger companies still generally carry higher prices, but no two listings are identical; insiders keep 40-65%, so floats range 35-56%. Live market spans $4.26/2.1M cap to $30.79/46.2M cap.

### Workforce across entities + stock price/cap coherence (2026-08-14)
- **Company-held assets no longer hide your staff.** The Workers panel now spans everything you control: `/workforce/:eid` returns every entity in your acting set (you + controlled companies) with their payrolls grouped by employer, each worker tagged with who pays them. Hiring has an employer picker (personal vs company purse) when you control more than one entity, and the lot dropdown labels company-held lots.
- **Assignment follows control, not the payer.** A worker on your personal payroll can be assigned to a company-held lot (and vice versa) as long as you control both — wages still come from whoever employs them. Verified: personally-paid Alma Whitlock assigned to the company-owned farm on lot 380, which now runs three farmers and produced 144 wheat.
- **Hiring removed from the lot panel** — it lists who works there and links to the Workers panel, so there's one place to manage people.
- **Stock price/cap coherence, settled**: every listing now has the SAME 1,000,000 shares outstanding, so share price is exactly market cap ÷ 1M and a higher-priced stock is always a bigger company. Companies differ by capital tier, valuation multiple, sector and dividend policy instead of by share-count denominators. Live market spans $2.15 (Bluebird, $2.15M cap, 50% payout) to $46.88 (Atlas, $46.88M cap, 35% payout); every row verified price × shares = cap.

### Market realism pass + tick bugfix (2026-08-14)
- **The coin is the Ducat (◈ DUC)**; crypto page stat bar trimmed to circulation / world hash / miners / wallet (reward + halving-era readouts removed from the UI; the schedule still runs underneath).
- **Stocks now behave like a real exchange.** Companies launch at three size tiers — small (~$1-2M capital, 250-500k shares), mid (~$3-8M, 1-2M shares), large (~$12-30M, 2.5-5M shares) — with share price derived from valuation ÷ shares, so cap and price are always coherent. Market caps span $0.9M to $46M with prices from $2 to $14; nobody buys a company off the shelf with starting cash.
- **Dividend policies differ per company**: income names pay 10-50% of daily profit, growth names (Vesper, Ironline, HashWorks) pay nothing and carry a richer valuation multiple instead. Verified: Atlas (35%) paid $11,199.92 across 15 shareholders on a $40k profit day while Vesper paid $0 on identical profit.
- **CRITICAL FIX — the daily economy tick was crashing.** `consumeOffer` decremented a hire offer's slots to zero, violating the `slots > 0` constraint and aborting `runDay()` entirely: no wages, rents, production, company ops, dividends or stats for the whole tick. The last slot now deletes the row instead. Tick verified healthy again ("2 sites produced, 77 values updated").
- Market-maker order sizes scale with the new share counts and are capped by what the citizen can actually afford.

### Workforce rework + market fixes (2026-08-14)
- **Hiring reworked around workers, not job posts**: you post hire offers (wage × slots) from the new HUD Workers panel; citizens accept on the daily job hunt (reservation wages unchanged); hired workers belong to YOU and are assigned — and freely reassigned — to any (lot, role) you operate: cashier/stocker/crafter/farmer/extractor. Unassign and fire anytime; wages pay daily from the employer entity directly; nonpayment still makes them quit. Lot panel shows who works here with a quick "hire for this" that posts a preset offer (accepted workers arrive pre-assigned). NPC entrepreneurs/companies staff through the same system (`ensureStaffed`). DB: `job_listings` → `hire_offers` + `npcs.employer_entity` (migration preserved existing employment).
- **Stock anchor bug fixed**: market makers anchored never-traded stocks at a global $1, dragging every IPO to the same price. Anchors now fall back to the listing's own IPO price; the polluted market was repaired (escrow refunds, trades wiped, closes reset) — all 10 listings trade at their own levels ($2.87–$11.56) and stay distinct through MM activity.
- **Coin genesis circulation**: the chain now predates the city — 150,000 ◈ of the 1M cap starts in circulation (HashWorks 40k, Nordvik 10k, ~100k across 50 citizen savers), counted as mined. The coin trades from minute one while mining continues toward the cap, bitcoin-style.

### PHASE 4E — real economics (2026-08-14)
- **Stats service** (`server/src/stats.ts`): every game day, real records aggregate into snapshot tables (`stat_asset`, `stat_commodity`, `stat_macro`, `stat_index`) — dashboards read cheap precomputed rows. Pure math lives in `shared/src/econStats.ts` (VWAP, realized range, CPI, cap-weighted index with inception divisor, GDP-from-ledger) with tests.
- **Per-asset stats**: last/VWAP/volume/high-low/best-bid-ask/book-depth per asset per day, market cap for stocks — one pipeline for commodities, equities, and the coin.
- **Macro dashboard** (HUD → Economy): GDP per game day with growth and sector bars (retail/property/labor/construction — from ledger categories, clean currency only), CPI from actually-transacted shop prices (fixed basket: bread/shirt/beer/phone, base 100), employment (employed/labor force/open jobs/avg wage), population + housing occupancy + avg rent, coin network stats, all five stock indices (composite + retail/vice/industrials/mining), and per-commodity supply vs demand with glut/shortage badges. First live snapshot: GDP $28,964 (wages 20.3k, rents 6.4k, retail 2.3k), CPI 100.0, 15/250 employed, indices at 100 inception.
- **The criminal economy is invisible**: dirty-currency rows and bribe/seizure categories are excluded from every public aggregate by construction — laundering will be the only way dirty money ever shows up in GDP.
- **Stats feed back into behavior**: NPC stock speculators tilt their limit prices by the published composite's day-over-day momentum — the same number players read.
- Tests: 35/35 shared (adds VWAP, CPI base/inflation, index divisor stability, GDP category/currency exclusions).

PHASE 4 COMPLETE — companies, permits with three licensed industries, a stock market with 10 operating NPC public companies, component-based coin mining, and a fully derived public economics layer, all on one order-book engine and one money choke point.

### PHASE 4D — crypto & component mining (2026-08-14)
- **The coin**: third consumer of the shared order book — trades against clean cash (`asset_type='coin'`), wallet-to-wallet transfers, coin legs ledgered as `transfer` in the coin currency. **Purchase wall at the account layer**: coin is blocked from land, construction, production setup, trade, and now fees (permits/audits) — cash out on the exchange to spend.
- **Mining is component-based, not place-a-rig**: 3 rack tiers as furniture (small 4/1/1, server 8/2/2, industrial 16/4/4 proc/PSU/cooling slots). Components are craftable/tradeable items up the electronics chain (iron → basic CPU → advanced CPU → GPU → ASIC, plus PSUs and fan/liquid cooling). Empty racks mine nothing; processors beyond PSU rating don't run; undercooled ones throttle to half rate and wear 3× faster (2%/day vs 6%); dead components (100% wear) are inert and scrap on removal.
- **Emission**: flat 1,000 coin/game-day (shared constant, no cap/halvings), split pro-rata by each entity's share of world hashpower — emission goes to the lot's OPERATING entity, so company-run farms pay the company. Verified live: a small rack with 1 PSU + fan + 4 CPUs produced exactly 3.0 hash (2 full + 2 throttled), took the full day's 1,000 coins as the only miner, and wore 2%/6% per the spec.
- **The two seeded mining names got their industries**: Nordvik Mining Systems buys iron on the exchange and CRAFTS components at a real electronics bench, selling them as exchange asks; HashWorks Mining buys components, runs a server rack, and sells mined coin into the market. Citizen savers speculate small coin orders — bids sat at ~$1.93–2.02 within one game day.
- Client: click a placed rack → component panel (per-slot wear/status/hashpower, install from storage/bag with capability tags); Stocks panel gained a Coin section (price, wallet, supply/emission/hashpower network stats, trade form); 10 new procedural icons (clip-checked) + 3D server-cabinet models with status LEDs.
- Tests: 30/30 shared (adds rack gating: PSU limits, cooling throttle, dead components, wear rates, pro-rata emission).

### PHASE 4C — generic order book + stock market (2026-08-14)
- **One matching engine, every asset class**: extracted `server/src/orderbook.ts` — price-time priority, atomic cash legs, seller fees to Treasury, self-cross resting, resting-buyer voiding — parameterized by AssetHooks (escrow/deliver/refund/buyGuard). Commodities refit onto it (zero behavior change, regression-tested); stocks are the second consumer; coin will be the third. Orders/trades tables gained `asset_type` ('item'|'stock'|'coin'); stock keys are `s:<entity>`.
- **Stock market**: `stocks` + `share_holdings` registries (shares are NOT inventory). Clean-money only via the existing account-layer wall (dirty/coin blocked from 'trade'). Circuit breakers: order prices bounded to ±30% of prev close, band-edge fills halt the day. Daily close rolls prev_close, lifts halts, pays **dividends from real ledger profit** (payout ratio × day profit, cash-capped, 4-decimal per-share precision) — own-share sale proceeds excluded from operating P&L.
- **Control follows shares**: >50% of outstanding takes the company (hostile takeovers live), recomputed on every fill and injected into the company control resolver; founder keeps operating control absent a majority.
- **Player IPO**: server-enforced gates from real books (7+ days, $50k trailing revenue, profitable, 2+ buildings or 5+ employees, $2.5k audit fee, float 25–75%, price inside an earnings valuation band); the float rests as a company sell order so proceeds land in company cash as it fills.
- **10 NPC public companies seeded and OPERATING** (incl. Nordvik Mining Systems + HashWorks Mining, idle until crypto lands): real citizen founders/shareholders, real permits bought (Crestfield liquor, Bluebird tobacco), and a daily ops loop — they buy storefront lots from the city, place shelves, post cashier jobs, source goods on the exchange and price at retail. Verified: 8 storefronts bought, 32 NPC retail sales, 78 stock trades from citizen speculators discovering prices, dividends paid to 34 holders on a profitable day.
- Client: Stocks panel (tickers with Δ/cap/halt, per-company book + trade form + your portfolio/orders) and Company panel gains IPO + dividend-ratio controls.
- Tests: 24/24 shared (adds IPO gates, valuation band, dividend math incl. sub-cent rates, majority control, circuit band).

### PHASE 4B — permits + liquor/tobacco/firearms chains (2026-08-14)
- **Three permitted industries**: liquor (wheat→brewery→beer, corn→distillery→whiskey), tobacco (new open-air tobacco farm crop — growing is legal — then curing barn → cured tobacco → cigarettes/cigars), civilian firearms (iron → gun parts → hunting rifle / pistol / ammo at the gunsmith bench). 4 new machines (craftable at the carpentry bench, placeable, with full 3D interior models), 13 new items, procedural icons for all (clip-checked).
- **One permit covers producing AND retailing its category** (`shared` permit model: `permitFor`, `permitFee` = base + $250/station, 30-game-day term). Issued to any entity — player or company — fee to the Treasury, renewable (extends from current expiry), public registry at `/permits`.
- **Three legal-channel gates, one choke point** (`requirePermit` on the lot's operating entity): crafting permitted recipes, pricing/stocking shelves, and placing exchange SELL orders. Buying is free. NPC crafters share the same gate and idle if a permit lapses.
- **NPC vice demand**: 34 citizens carry a vice trait; they make discretionary runs to permitted shops (beer/whiskey/cigarettes/cigars) — real retail sales, no need refilled, pure spend.
- UI: permit badges on gated recipes in the craft panel; Buy/Renew per category (live fee quote) for yourself and each company in the Company panel.
- Verified live: selling beer unpermitted → blocked; pricing beer on a company lot with only a PERSONAL permit → still blocked (permits are entity-scoped); company fee correctly rejected at $755 < $800 then paid after a deposit; registry shows player + company permits; an NPC bought beer at $12 from the permitted company shop.
- Tests: 18/18 shared (permit mapping, recipe/category consistency, fee scaling).

### PHASE 4A — companies (2026-08-14)
- **Registered companies**: `formCompany` creates a company entity with its own clean account for a $1,000 fee (ledger category `fee` → Treasury). 100% founder ownership via `entity_ownership`; control = >50% share.
- **One control choke point**: `CompaniesStore.actingSet` is injected into `LotStore` as a control resolver, so `ownsLot` (and everything that funnels through it — shelves, jobs, interiors, goods) accepts a controller acting for a company with zero per-store changes. Client mirrors this with an `actingIds` set.
- **Asset moves**: deposit/withdraw capital (`transfer` ledger rows), move lots between personal and company ownership (no money moves, for-sale flags cleared, broadcast shows the company as owner).
- **Company payroll**: job listings now record the lot's operating entity (tenant, else owner) as employer — staff on company lots are paid from the company account.
- **Auto financials** from the ledger alone: `/company/:eid/financials` returns per-day inflow/outflow by category plus a balance sheet (cash + lot values + inventory at reference prices). Company panel (HUD → Company) shows register/deposit/withdraw/lot-transfer and daily P&L.
- Verified live: Keeper Holdings Two formed, $800 deposited, lot 1 transferred in, stocker posted on the company lot, Pearl Mercer hired and paid $45 by the company (800 → 755), financials reflect it all.

### PHASE 3D — entrepreneurs, wealth, tests (2026-08-14)
- **Managers removed** per owner call (stock upkeep will get a different mechanic later); roles are cashier/stocker/crafter/extractor.
- **Pure econ helpers** in `shared/src/npcEcon.ts` (scoreOffer, reservation wages, planLiquidation, retailPrice) — the sim consumes them and `npcEcon.test.ts` covers them (5 tests: purchase scoring, 4x-reference cap, wage acceptance, liquidation pricing, retail margin).
- **Entrepreneur NPCs** (8% tier) run REAL businesses: buy a commercial city lot when flush (< 55% of balance), place a shelf, post a cashier listing, source stock with exchange BUY orders (limit 1.3x reference — real demand for player goods), haul fills pocket→storage→shelf, and price at retail margin. **Bankruptcy** below $150: staff fired, pocket goods dumped as sell orders at 0.8x reference, the lot (with remaining stock inside) listed at 90% of value, tier drops to worker.
- **Housing upgrades**: savers/entrepreneurs above $4k move to pricier residential with vacancy (≤5 moves/day) — richer tenants, richer rents for landlords.
- Verified live: Quinn Ives founded a shop on lot 6 (shelf + $52 cashier listing filled by Pearl Mercer — who'd been fired from the player's shop; labor mobility works), stocked 10 exchange-bought bread at $11.70; forced bankruptcy produced the exact liquidation trail (sell 10 bread @ $4.80, lot listed $1,652, listings cleared, tier=worker).

PHASE 3 COMPLETE — 250 citizens with homes, wages, hunger, shopping, jobs, and NPC-run businesses in one economy with players.

### PHASE 3C — jobs & hiring (2026-08-14)
- **Job listings** (`db/013_jobs.sql`, `server/src/jobs.ts`): owners post roles on their buildings/sites (cashier, stocker, crafter, extractor, manager) with wage/day and slots; Staff section in the lot panel shows listings + who holds them. One job per NPC.
- **NPC employment**: unemployed citizens job-hunt each game day — best wage minus commute, above a reservation wage that beats the city floor; hired NPCs are paid daily by the EMPLOYER's account (categorized `wage`), and quit if the employer can't pay. Unemployed NPCs still draw the $40 city floor.
- **Staffing gates what buildings do**: no cashier = register closed (unstaffed shops are excluded from the retail offer index — stock sits untouched); stockers/managers auto-refill priced shelf items from building storage every ~30s; crafters auto-run machine recipes toward whatever the shop has priced (batch 3/day); extractor-staffed production sites accumulate to 3× the stock cap before pausing.
- **Hunger retuned**: needs drain continuously (food ~1.5 game days, goods ~4.5) instead of a once-a-day step, so shopping spreads naturally across the day.
- Verified live: Pearl Mercer hired as cashier + Milo Ives as stocker ($115/day wages from the owner), continuous staffed sales incl. a visible stocker refill mid-run, 90 total sales/$360 revenue on the shop, and a stocked shelf with NO cashier holding at 20 units for 80s — register closed.
- Stub: manager's bounded exchange auto-buy (manager currently covers stocker duties) — noted for 3D/7.

### PHASE 3B — needs, shelves, shopping (2026-08-14)
- **Retail shelves** (`db/012_shelves.sql`): shelf stock is its own inventory holder, stocked from building storage (capacity = 40/shelf placed); `shelf_prices` set per lot per item by the owner. Shop panel (click a shelf): stock/pull, price inputs, live shelf/storage view; read-only price list for visitors.
- **Needs loop live**: food/goods decay per game day; hungry NPCs pick a shop by score = appeal − 1.6×(price/reference) − distance/90 (offers indexed from shelf stock+prices every 30s), walk there via A*, and buy — a guarded shelf decrement + `retail_sale` transfer to the shop owner in one transaction, need refilled. Corn/carrots/bread all count as food; shirt/phone as goods. Desperate NPCs with nothing on any shelf buy from the city vendor at a premium (sink recycling the wage faucet).
- **District stats live**: per-day foot_traffic (real movement, players + NPCs) and wealth (avg resident balance) written to the districts table.
- Bug fixes: pre-sync `onAdd` replay applied to players too (multi-player join rendering); debug handle dev-gated.
- Verified live: a bread shop priced at $4 (< $6 reference) sold out 30 loaves in <20s to hungry citizens — $120 to the owner in 30 categorized ledger rows.

### PHASE 3A — NPC foundation (2026-08-14)
- 250 NPC citizens live: each is an entity with a clean account ($300-1800 starting), generated name + appearance, and a home in a real residential building (houses hold 2, apartments 3/floor). `db/011_npcs.sql`; vice stat scaffolded (85% zero), wealth tiers rolled (worker/saver/entrepreneur).
- Server sim (`server/src/npcs.ts`): A* pathfinding over the tile grid (`shared/src/path.ts` — sidewalks preferred, roads ok, grass costly; start/goal snap to nearest walkable so building interiors work), staggered decisions, continuous movement at 3.4 u/s, foot-traffic recording feeds land values. Day tick: city wage floor ($40 faucet) + rent paid to each home's REAL owner through accounts.
- Sync: NpcState in the room schema, movement published with a 0.6-unit distance gate; client renders NPCs through the shared avatar system with 110-unit distance culling and replay of entries synced before callback registration (colyseus 0.15 gotcha).
- Verified live: 190/250 NPCs moving within 8s of boot, walking sidewalks with name tags across the whole map.

### PHASE R — entities, accounts, districts (2026-08-14)
- **R1 Generic entities** (`db/009_entities.sql`): `entities(kind: player|npc|company|family|city)` with `parent_entity_id` + `entity_ownership` share table (shell/holding substrate for Phase 5). Players 1:1 backfilled; City Treasury = entity 1. Lots (`owner_entity_id`, `tenant_entity_id`), inventories (`holder_type: entity|lot`), orders (`owner_entity`), trades (entity cols) all migrated with data intact.
- **R2 Accounts**: `accounts(entity_id, currency clean|dirty|coin, balance >= 0)`; `players.cash` is dead. ONE money choke point: `server/src/accounts.ts` `debit/credit/transfer` — guarded balances, categorized ledger rows (`land, rent, trade, fee, wage, construction, ...` + currency + from/to account ids), and the dirty/coin spend wall (can never pay for land, construction, production setup, or public-exchange trades) enforced only here. Every store (lots/market/interiors/goods) rewritten onto entity ids + the helper; fees/sinks now credit the City Treasury (trackable money supply instead of destruction). Client identity = entity id (`session.entityId`). Fresh signup creates entity + clean account transactionally.
- **R3 Districts + new world** (sanctioned regeneration, seed 20260814): deterministic district generation in citygen (blocks grouped on a 4×4 super-grid, seeded two-part names) → 16 districts ("Copper Green", "Grand Hollow", ...); `districts` table with stat scaffolding (foot_traffic, wealth, heat, controlling_family_id, ambient_crime_level) populated by later phases; map API serves districts; client renders a subtle per-district tint + billboarded name labels that fade in when zoomed out. Old world wiped; player entities/accounts/bags survive.
- Verified: land buy moves $6,029 buyer→treasury with a categorized ledger row; sell-order escrow; farm collect; machine crafting; fresh registration; both balances reconcile in `accounts`.

### What works (verified end-to-end)
- **Monorepo**: npm workspaces — `/client` (Three.js + Vite), `/server` (Colyseus 0.15 @ 20 tick/s), `/shared` (types, zod schemas, constants, seeded RNG, city generator), `/db` (numbered idempotent SQL migrations, runner applies on boot).
- **Accounts**: register/login (email+password), HMAC session tokens, unique display name (3–16 chars, case-insensitive unique index in Postgres), $10,000 starting cash with `cash >= 0` DB constraint. Duplicate/invalid names correctly rejected (tested).
- **World**: deterministic 128×128 city from seed 20260812 — road grid (denser downtown), sidewalks with curbs, 202 lots across commercial/mixed/residential/industrial zones, 2 parks, 1 lake, land values from zone base × center proximity. Persisted to Postgres on first boot; later boots regenerate from seed and verify against stored tiles.
- **Buildings**: 173 buildings derived deterministically per lot (towers, shops w/ awnings+signs, apartments, houses w/ gable roofs, warehouses, factories w/ chimney+tank), 4 architectural styles, canvas-baked facades with emissive night windows, rooftop clutter, business-name signage.
- **Rendering**: PCFSoft sun shadows + hemisphere light, full day/night cycle (10 min/day, server-synced clock) with dawn/dusk grading, night window/sign/streetlamp emissives, EffectComposer with SSAO + bloom + ACES tone mapping + SMAA, RoomEnvironment reflections (glass towers, lake sheen). Instanced trees (3 species w/ per-instance color), streetlights with light pools, benches, hydrants. Ground baked to one canvas texture per 16×16 chunk (lane lines, crosswalks, pavers, curbs).
- **Multiplayer**: Colyseus room with onAuth token verification, zod-validated + rate-limited move intents, server-side movement at 7 u/s with water collision, position persisted every 30 s and on leave (verified via node WS test: state sync, movement speed, invalid intent rejection, bad-token rejection).
- **Client**: auth + name UI (dark minimal), HUD (name, formatted cash, in-game clock, online count), WASD/edge pan + scroll zoom + click-to-move + F to recenter, interpolated avatars with procedural color variation, name tags, walk bobbing.
- **Dev tools**: `/dev/asset-viewer/` — every building kind × 4 styles + all props, orbit camera, time-of-day slider.
- **Tests**: 6 unit tests (citygen determinism, zone/tile coverage, wire round-trip, building determinism, name + move-intent validation) — all green. `npm test`.

### How to run
```
npm install
npm run dev:server   # :2567 — migrates + generates/loads world automatically
npm run dev:client   # :5173 (or next free port)
```
Local Postgres (homebrew, db `merchant_city`) by default; set `DATABASE_URL` + `SUPABASE_JWT_SECRET` (+ client `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) to move to Supabase — both auth paths are already in the code.

### Stubbed / deferred
- **Supabase**: code paths exist (JWT verify server-side, supabase-js client-side) but unverified — no Supabase project provisioned yet; dev auth (server-issued HMAC tokens, scrypt password hashes in local Postgres) is the active path.
- Buildings are display-only Phase 0 dressing derived from lot seeds (not DB rows yet — Phase 1 construction will make them real assets). Lots are all City-owned, no marketplace yet.
- Foot-traffic counter, land-value daily recompute: value computed once at generation.
- Player cash is in state but nothing spends/earns yet.

### Fixed after first user test (2026-08-12)
- **Black screen**: three r170's `SSAOPass` output solid black for this scene (its depth/normal pre-pass chokes here) — replaced with `GTAOPass` after a `RenderPass`. Do not reintroduce SSAOPass.
- Name-tag `Sprite`s rendered as black bars under GTAO — replaced with camera-billboarded planes (`MeshBasicMaterial`).
- Night was pitch black / day-night flat: `scene.environment` (RoomEnvironment IBL) floods constant light — now scaled via `scene.environmentIntensity` with the day cycle; night floor lighting raised to moonlit-city levels.
- Dev flags added: `?tod=0..1` freezes time of day, `?post=off` disables the composer, `?ssao=off` / `?bloom=off` / `?smaa=off` bisect passes.

### Visual polish pass (owner feedback, 2026-08-12)
- Streetlights now cast a soft radial light pool + volumetric cone from the lamp head (additive, night-faded) instead of a flat yellow circle.
- Facade generator: ground-floor windows skip the door bay; doors only render on the street-facing front face (sides/back and tower upper sections have none); all faces of one building share a single base color — fixes the "two colors at night" and "stacked buildings with a floating door" looks. Removed the half-lit two-tone window effect.
- Trees spawn on grass tiles only (sidewalk street-trees removed); random park benches removed (bench asset kept in the kit for Phase 1 furniture).

### Variety pass (owner feedback #2, 2026-08-12)
- Facades: removed random blank window bays (the "missing windows"); doors redrawn as real paneled doors (frame, inset panels, handle, threshold shadow) with **no** night emissive.
- City generator: heavily jittered road spacing (blocks ~9–20 tiles), per-block jittered lot subdivision, occasional full-block landmark lots, occasional unplatted gaps; commercial/mixed zone radii widened. World regenerated (234 lots).
- Building kit: new **office** (4–8 fl) and **skyscraper** (15–24 fl, 3 stepped tiers, glass-biased, mast + beacon) kinds; all kinds take per-seed footprint/height variance; houses sit off-center on their yards with varied gable pitch; wider floor ranges. Mix at seed 20260812: 3 skyscrapers, 5 towers, 25 offices, 29 shops, 26 apartments, 93 houses, 11 warehouses, 7 factories.
- NOTE: citygen changed → stored world truncated and regenerated (players keep accounts; positions may be off-street once).

### Street & block realism pass (owner feedback #3, 2026-08-12)
- **Road network rebuilt**: full-span arterials spaced 28–44 tiles apart + sparse secondary streets that span only their superblock → long stretches without intersections, T-junctions instead of a uniform grid (43 blocks vs ~90). `CityMap` now carries road *segments* (`segsV`/`segsH`) instead of full-span line lists; ground painter and streetlight placement are segment-driven.
- **Perimeter blocks**: lots line each street edge of a block (buildings touch, rowhouse-style street walls), big blocks keep grassy interior courtyards, shallow blocks get back-to-back rows. Every `LotDef` stores its `facing` — the door always opens onto that street. Unit test enforces the invariant (probe tile outside each lot's facing edge must be sidewalk/road).
- **Massing variety**: shops/offices/apartments can be L-shaped (front block + offset rear wing, varied wing height); street-wall kinds fill their full lot width so neighbors touch; big parcels are almost never vacant (giant empty pads looked barren).
- Dev flags: `?cam=x,z` + `?zoom=n` aim the camera anywhere for inspection.
- Mix at seed 20260812: 3 skyscrapers, 2 towers, 23 offices, 23 shops, 27 apartments, 46 houses, 17 warehouses, 14 factories (155 buildings, 186 lots).

### Detail pass (owner feedback #4, 2026-08-12)
- Box builder gave the **back** face the front texture — back-to-back rowhouses showed a door pressed into the neighbor behind. Back faces now use a doorless variant; doors exist only on the street-facing front.
- Warehouses/factories get a paneled personnel door beside the roller door.
- Roof props rebuilt with real detail: AC units (housing on feet, fan grille + ring + blades, conduit), turbine vents (stem, collar, ribbed dome, finial), factory smokestack (taper, mid band, steel collar, dark flue), storage tank (legs, seam, dome, outlet pipe + valve wheel). Shared metal/grille materials.
- Asset viewer accepts ?t=x,y,z / ?c=x,y,z camera params.

### Scatter & polish pass (owner feedback #5, 2026-08-13)
- **Probabilistic zoning**: every zone can appear anywhere, weighted by distance from center (downtown skews commercial, fringe skews residential, industry scattered with an edge pull). The old hard "industrial = east side" rule is gone. World regenerated (212 lots).
- **Shared walls**: street-wall kinds (shop/office/apartment) now fill their lot width exactly (minus 2 cm) — touching buildings share the wall plane. The random 0–6 % width jitter was leaving sliver gaps that read as blank glitchy side walls; verified in isolation (viewer `?def=kind,floors,style,seed` param renders any exact building) that all exposed faces carry full windows.
- **Lake removed**; also the map edge no longer shows blue void that read as water — a large grass "countryside" skirt surrounds the city.

### Camera rotation + facade refresh (owner feedback #6, 2026-08-13)
- Camera yaw: Q/E keys and right-mouse drag orbit the camera (smoothed); WASD/edge panning is screen-relative at any rotation. Hint bar updated.
- Retired the blue glass curtain-wall facade (style 2) — replaced with a graphite panel style (dark warm gray, darker spandrel band per floor, fine panel seams) that sits naturally beside brick/concrete/stucco. Glassy material special-casing removed.

### Wing color match (owner feedback #7, 2026-08-13)
- L-shaped rear wings used seed salt 3 vs the main block's 0 → wings often picked a different base color and read as a separate building glued on. Wings now use salt 0 — identical color/texture family, guaranteed by construction. Verified with a rear render: main block + lower wing read as one building.
- Confirmed separate touching buildings (rowhouses/back-to-back rows) already have doors only on their street-facing fronts — never on a shared wall.

### Wing seams, same-height wings, scattered warehouses (owner feedback #8, 2026-08-13)
- L-shape seams rebuilt: no parapet on the wing edge that meets the main block; the wing's face against the main wall is bare (blank facade, 2 cm shy of the wall — no clipping); the main block skips its rear windows where the wing covers them (`facadeTexture` gained a blank-region param, `box()` takes per-face opts). Verified both wing orientations from the rear.
- ~45 % of wings now run the full height of the main block (one shared roofline; the main block's back parapet keeps only the exposed run beside the wing). Rest stay lower.
- Warehouses spread city-wide WITHOUT changing the map: reverted the zoning experiment (map layout restored exactly — same 212 lots), warehouses now come from building-level substitution on an independent RNG stream (~7 % of big non-industrial lots), so roads/lots/every other building are untouched. Warehouses land in all four quadrants.

### Bigger map + variety + night pass (owner feedback #9, 2026-08-13)
- **Map 128 → 192** (~2.25× area): 507 lots, ~447 buildings, 105 blocks, 3 parks. One-time regen (unavoidable for a size change); same generator style/density. Generator now uses **per-region / per-block / per-zone RNG streams** so future tweaks stay local instead of reshuffling the city.
- **Bigger buildings mixed in**: double-wide parcels (~14 % of strip lots), residential landmark estates, house size caps raised (mansions on big lots), shops/offices/warehouses scale up with their parcels.
- **Skyscraper massing**: stacked/stepped style fully retired (also de-stacked the mid-rise tower kind → single volume + mechanical penthouse + mast). Skyscrapers roll two silhouettes: full-height **monolith slab** with crown sign, or **slim tower on a 2-floor podium**. Skyscrapers stay downtown (commercial center weighting).
- **Signs** sit in the windowless crown band above the top window row — never overlap windows (band position derived from the facade texture layout).
- **Streetlights removed** per owner preference; night lit by building windows, dimmed (window emissive 1.6 → 1.05, signs 1.2 → 0.9).
- Perf note: ~447 buildings ≈ 2,700 draw calls — fine on Apple Silicon; if it ever chugs, merge static block geometry.

### Skyscraper styles final + zone-free buildings (owner feedback #10, 2026-08-13)
- Skyscraper massing settled: the **original stepped design** (the one allowed stacked style) or the **monolith slab** — the podium-tower variant was removed as too stacked-looking. Also cleaned an accidental duplicated switch block from an earlier patch (was unreachable/harmless, now gone).
- **Zones no longer drive buildings.** `buildingForLot` ignores lot zone entirely: flat weighted mix (house/shop/apartment/office/warehouse/factory) on every lot everywhere — no more warehouse chunks; quadrant spread is now ~even (11/12/9/14). Skyscrapers/towers keep a soft centrality pull so the skyline stays downtown. Lot geometry untouched → the map did NOT regenerate.
- Zones still exist internally for lot sizing and future land pricing only.

### Road markings + placement polish (owner feedback #11, 2026-08-13)
- Roads fixed: secondary streets snap to a map-wide 8-tile grid, so streets on opposite sides of an arterial either align into one clean 4-way crossing or stay ≥8 tiles apart (no more offset twin junctions). Crosswalk zebras render ONLY at true 4-way crossings — T-junctions and corners stay clean, with the through-road's center line running through. One-time regen to apply the snapped streets (466 lots, same style).
- Buildings centered on their plots (removed the house off-center offset).
- Shops with an awning print their sign on the awning face above the door instead of hanging it on the wall; shops without an awning keep the crown sign.

### Lane hierarchy (owner feedback #12, 2026-08-13) — last change before Phase 1
- Road segments carry a width: **arterials are 4 tiles wide** (two lanes each direction: solid double-yellow center line + white dashed lane lines between same-direction lanes), **side streets stay 2 tiles** (one lane each way, single yellow dash). Superblock regions, painting, coverage maps, T/4-way marking logic all width-aware. One-time regen (426 lots, 376 buildings).

### Crosswalk boxes (owner feedback #13, 2026-08-13)
- Crosswalk zebras are now decided per segment PAIR, all-or-nothing: a crossing gets its full zebra box only when both roads continue ≥3 tiles beyond it on all four sides. Fixes half-drawn zebras at map-border arterial crossings and phantom markings at edge stubs (16 real interior crossings keep zebras; 60 edge/partial crossings cleaned). Painter-only change — no world regen.

### Side-street junction markings (owner feedback #14, 2026-08-13)
- Crosswalk boxes now cover every real junction: 4-way through crossings AND Ts where a side street terminates into a cross road (aligned opposite side streets merge into one 4-way box). Stripe edges come from box geometry (bitmask per tile), so boxes always render complete even where a narrow street only overlaps half of a 4-wide arterial. Corners (both roads ending) stay unmarked. Painter-only — no regen.

### 4-way-only markings (owner feedback #15, 2026-08-13)
- Final crosswalk rule, decided from the actual tile grid: a junction box renders ONLY when the road continues beyond the box on ALL FOUR sides (true 4-way, any road size — including aligned side-street pairs crossing an arterial). Ts and corners carry no markings, just through lane lines. Painter-only.

## Phase 1 — Property & Construction (started 2026-08-13)

### Increment 1: land market + construction — DONE
- **DB (002)**: `buildings` (player-built, keyed world+lot, done_at drives construction state), `ledger` (every money movement; from/to null = City).
- **Server**: `LotStore` — authoritative market state mirrored from Postgres; every mutation is one SQL transaction (debit with `cash >= price` guard, credit seller, deed transfer with state guards, ledger row — all-or-nothing). Colyseus messages: `buyLot`, `listLot`, `unlistLot`, `build`; `lot` broadcasts on change, `err` to the requester; online balances patched into room state. `GET /lots` serves market state.
- **Market rules**: City lots always for sale at assessed value; players list/unlist at any price; construction only on vacant owned lots, template must fit the lot (rotation-aware), costs cash (materials arrive in Phase 2), real build minutes.
- **Client**: click a lot → panel (size/zone/assessed value/owner/status + buy/list/unlist/build with affordability + fit checks); ownership ground outlines (gold = for sale, green = yours, slate = other players); scaffolding (poles/planks/slab) while under construction, real building on completion (timer-swapped).
- **Verified end-to-end**: buy (exact cash math), overdraft cleanly rejected, list/unlist, build-on-occupied rejected, build-on-vacant creates DB row + broadcast, ledger correct. 8/8 unit tests, prod build clean. Fixed: building seed overflowed pg `integer` (clamped to 31 bits).
- Note: a few lots (93, 337, 338) are owned by test accounts from verification; lot 337 has a test shop.

### Increment 2: interiors — DONE
- **DB (003)**: `furniture` (per-lot placed items, grid cell + rotation).
- **Shared** `interior.ts`: catalog (shelf/counter/racks S-M-L/workbench/desk/chair/plant/rug with costs, capacity + appeal stats for Phases 2–3), interior grid (1m cells, wall inset, door cell on the street-facing edge), and `validatePlacement` — bounds, solid-overlap (rugs walkable), door kept free, and flood-fill reachability (every solid item must touch a door-connected free cell). Client preview and server run the SAME function.
- **Server**: `InteriorStore` — owner-only, building must exist + construction finished; place debits cash, remove refunds 50%, both single SQL transactions with ledger rows; `furn`/`furnRemove` broadcasts; `GET /interior/:lotId`.
- **Client**: "Enter building" on owned finished buildings → interior edit mode: shell hides, floor grid + wall outline + door marker, catalog bar, ghost preview with green/red validity pad (live shared validation), R rotates, X removes hovered, Esc exits, camera framed on the lot and restored on exit. Dev: `?interior=lotId`.
- **Verified**: 9/9 unit tests (incl. flood-fill seal case); E2E — two placements, overlap/bounds/non-owner rejections, remove with refund, exact cash math, DB rows correct.

### Interior polish (owner feedback, 2026-08-13)
- Enter button now appears on ANY owned finished building (bought city stock included, not just player-built); server editable-check updated to match; derived building meshes indexed by lot so interiors can hide them.
- Storage Rack L footprint changed 2×2 → 3×1 (no placed instances existed).
- Furniture models detailed: gondola shelf (plinth, side cheeks, price strips, mixed goods), counter (paneled front, overhung top, register with glowing screen, keypad, card reader), industrial pallet racks (orange uprights, steel beams, pallet boards, crates + sacks), workbench (pegboard with hanging tools, vise, brace), desk (drawer pedestal with handles, monitor, keyboard, papers), office chair (5-star base, post), plant (terracotta pot with rim, trunk, layered foliage), two-tone bordered rug. Furniture row added to the asset viewer.

- Racks display detailed cardboard boxes only (tape strip, lid seam, shipping label, deterministic size/rotation variety, occasional stacked pair) — crates/sacks removed per owner preference.

### Interiors match exteriors (owner feedback, 2026-08-13)
- New shared `footprint.ts` — `buildingLayout(def, fw, fd)`: deterministic structural layout (main block w/d, street offset, wing dims, skyscraper massing) on its own RNG stream. The client mesh, the interior grid AND server validation all consume it, so they can never disagree.
- `interiorSpec(lot, def)` replaces the lot-sized grid: interior cells now fit strictly inside the building's main block, offset to its actual position on the lot; door cell on the street-facing front wall. `validatePlacement` takes the building def; server resolves it (player-built or derived city building).
- Client interior mode rebuilt in building-local frame (rotates with the building's facing); wing/main structural rolls moved out of `makeBuilding` into the shared layout (visual-only rolls stay client-side — derived buildings may shift proportions slightly, map unchanged).
- 9/9 tests (footprint-containment invariant added); verified visually: grid sits inside the shop's walls instead of filling the lot.

### L-shaped buildings: seamless join + L interiors (owner feedback, 2026-08-13)
- Exterior seam gone: the wing now penetrates 0.3 into the main block (walls join flush, no 2 cm slit); same-height wings sit 2.5 cm lower so overlapping roofs never z-fight while the parapet wraps the union outline.
- Interiors are the full L: `InteriorSpec` carries valid floor rects (main room + wing room); bounds, flood-fill reachability, client floor grids and wall rendering all honor the union (walls trace the L outline with merged runs). Door stays on the main room's street wall.
- Dev: `?yaw=deg` camera param. Verified: rear render of a same-height L (flush walls, wrapped parapets) + in-game L-shaped interior on a bought city building.

### L-building refinements (owner feedback, 2026-08-13)
- Interior grids now use the FULL structural footprint (`floor(dim)` cells instead of conservative wall margins) — the wing room matches the add-on's real size; front inset tightened.
- Same-height joined sections get one continuous borderless roof deck (two exactly-butting slabs, same texture, covering the boxes' framed roof faces) — no joint line, no step; wing runs full height. Lower wings keep their own framed roof (two levels are genuinely separate roofs).

### L-building fit & finish (owner feedback, 2026-08-13)
- Interior walls: exact-length runs + corner posts (convex posts sit diagonally outside; re-entrant posts fill the notch) — the old blanket run-extension poked a wall stub into the room at the L's inner corner.
- Exterior window flicker at the junction fixed: the wing was perfectly flush with the building edge, so its windowed side wall was coplanar with the main block's wall in the overlap zone (z-fighting). Wing now sits 1.2 cm inset — imperceptible, geometrically cured.

### Increment 3: rent, land value, condition, demolish — DONE (Phase 1 complete)
- **DB (004)**: `lots` gains for_rent/rent/tenant_id/missed_payments/cleared.
- **Tenancy**: owners list buildings for rent; renting pays the first game-day up front; tenants get full interior rights; rent collects every game day (one 10-min day/night cycle = one economy day); a missed payment warns (1/2), a second evicts — all atomic transactions with ledger rows and toast notifications to both parties. Selling a lot ends its rent listing; tenants carry over to the new landlord.
- **Land value**: foot traffic sampled from player positions (~5 s cadence, 3×3 tile splat) → per game day, value = generated base × traffic boost (≤ +50 %, log-scaled); city-lot sale prices update live and broadcast.
- **Condition & maintenance**: player-built buildings decay 2 %/game day (after construction completes); panel shows condition + "Repair to 100 %" priced by missing % × template cost / 200.
- **Demolish** ($250): player-built rows deleted; pre-existing city buildings set `cleared` (derived mesh hidden client-side, lot becomes buildable). Furniture wiped either way. Tenanted lots can't be demolished.
- **Infra**: room registry so the economy ticker (runs even with no players... rooms broadcast when present) pushes lot updates + per-player notes; `POST /dev/tick` (non-production) forces a day.
- **Verified E2E**: list→rent (upfront charged)→tenant furnishes→tick collects→drain→miss warning→eviction; demolish derived → cleared → rebuild on cleared lot; decay syncs DB→memory→broadcast (60→58 observed). 9/9 unit tests, prod build clean.

### Lot panel redesign (owner feedback, 2026-08-13)
- Rebuilt the lot panel: header with zone/status chips (FOR SALE / FOR RENT / BUILDING / VACANT), two-column info grid (size, assessed, owner, tenant), building card with name + kind icon and a color-coded condition bar (or a live construction progress bar with mm:ss countdown), gold primary actions (Buy/Rent/Enter), and labeled owner sections — Market, Leasing, Manage (repair + danger-styled demolish), Build (2-column template cards). Dev: `?lot=id` opens a panel.

### Panel clarity + condition system removed (owner feedback, 2026-08-13)
- The generic "City building" card now shows the pre-existing building's real derived identity (icon + generated name, e.g. "🏪 Old Town Cafe").
- **Condition/repair removed entirely** per owner decision: no decay in the day tick, no repair action/UI, no condition on the wire. DB column remains (reset to 100, unused). Manage section is just Demolish now.

### Freeform building designer (owner feedback, 2026-08-13)
- Preset templates replaced by a **designer**: on a vacant owned lot, "📐 Design a building" opens a grid overlay over the whole lot (green edge marks the street). Drag to draw up to 3 connected rectangular sections (min 3×3 m), pick 1–12 floors, watch the live cost, confirm to start construction. Ghost slabs preview the massing; Undo/Esc; invalid drawings explain why (outside lot, disconnected, too small).
- **Cost** = $500 + 12/m²/floor, build time scales with volume (1–10 min). **Materials** (wood/stone/iron from area × floors) are computed and displayed now; Phase 2 wires them into the same build transaction (`NOTE(Phase 2)` marker in `LotStore.build`).
- **Shared** `custom.ts`: PlanRect/CustomPlan, `validatePlan` (bounds, min size, ≤3 sections, connectivity, floors), `buildCost`, union `planArea`. DB 005: `buildings.shape jsonb`.
- **Renderer**: custom buildings render as the drawn union — sections share one style/color, joints buried (0.15 interpenetration), continuous borderless roof deck from cell runs, parapet + corner posts tracing the union outline, door on the street-most section, roof clutter on the largest section.
- **Interiors** ARE the drawn outline (spec rects = plan rects); door on the street-most room. `doorCell` generalized to front-most rect (works for legacy L-buildings too).
- Legacy template buildings still render (old DB rows); build message now takes {rects, floors}. Dev: `?design=lotId`.
- Verified: 10/10 tests (plan validation + cost linearity); E2E L-shaped 2-floor build persisted with shape JSON, occupied-lot rejection, exterior + interior render match the plan; designer drag UI produces ghost + live cost + materials line.

**PHASE 1 COMPLETE** — land market, construction, interiors, rent/eviction, land value, condition/maintenance, demolition. Next: Phase 2 — goods economy (resources, workshops, commodity exchange, retail).

## Phase 2 — Goods Economy (started 2026-08-13)

### Increment 1: items, sources, storage, crafting, production — DONE
- **Shared catalog** (`items.ts`): 6 raws (wood/stone/iron ore/crops/cotton/crude oil), 6 intermediates, 5 finished goods; 11 workbench recipes with inputs + labor minutes; 6 source types (forest/quarry/mine/farm/cotton field/oil well) with per-game-day yields; pocket cap 100 units, lot storage 300 base + furniture rack/shelf capacity.
- **Sources**: ~11 industrial lots deterministically become resource sources (own independent RNG stream → rest of the map untouched; those lots' derived buildings are replaced by source visuals — trees+logs, crop furrows, cotton bolls, stepped quarry pit, timbered mine portal, oil pump jack + barrels). Source lots aren't buildable; owning one yields raws into its storage every game day (workers modulate this in Phase 3).
- **DB (006)**: `inventories` (player pocket / lot storage, qty ≥ 0 in schema), `crafts`, plus `orders`/`trades` scaffolding for the exchange increment.
- **Server** `GoodsStore`: transfers pocket↔lot (ownership/tenancy checks, carry + capacity limits, single SQL transactions), workbench crafting (inputs debited up front, outputs land when labor time elapses; lazy + tick resolution), day-tick production.
- **Client**: pocket panel (I key), lot panel Storage section (lot inventory with capacity, →🎒/→🏠 10-unit transfer buttons), Workshop section (all recipes with live input availability, craft buttons, pending batches with countdown), SOURCE chip + yield card on source lots.
- **Verified E2E**: tick yields 24 wood into a bought forest; haul to pocket → deposit at a workshop; craft 2× planks (4 wood → 4 planks, exact); over-take and no-workbench rejections. 10/10 tests, prod build clean.

### Interactive interiors + sources reverted (owner feedback, 2026-08-13)
- **Resource source lots removed** per owner decision (buildings restored on those industrial lots; `sourceForLot`, production tick, source visuals and panel bits all reverted — `assets/sources.ts` kept unreferenced for a future design; SOURCE_TYPES stays in the catalog). Raw material acquisition will be designed differently.
- **Interiors are interactive now**: entering a building starts in INTERACT mode — hovering usable fixtures highlights them; **clicking the workbench opens its Crafting panel** (recipes with live availability, 1×/5× buttons, in-progress batches), **clicking racks/shelves opens their Storage panel** (building storage + pocket with transfer buttons). Layout editing is an explicit "✏️ Edit layout" toggle (catalog/ghost/X-remove as before; Done or Esc returns to interact). Fixture panels close on leaving the building. Lot panel no longer hosts storage/workshop sections.
- Verified with real browser clicks: rack → "📦 Storage Rack M · 40/700 · Wood 40"; workbench → recipe panel with Planks enabled and un-stocked recipes disabled.

### Procedural icon system (owner feedback, 2026-08-13)
- All emoji removed from the UI. New `ui/icons.ts`: ~30 canvas-drawn icons in the game's palette (17 items, 9 building kinds, construction, bag/box/hammer/design/edit glyphs, transfer arrows), drawn at 2× and cached as data URLs; `ic(id, size)` emits inline `<img>`. Swept: pocket panel, storage/craft fixture panels (headers, rows, recipe inputs, transfer buttons now arrow+destination pills), lot panel building cards + design button, build-designer materials line, interior edit button. Row layouts tightened (icon/label/qty/action grid).

### Increment 2: commodity exchange — DONE
- **MarketStore**: order-book over player pockets. Limit orders; crossing orders match immediately at the RESTING order's price (price-time priority), all inside one Postgres transaction per placement. Sells escrow items at placement (cancel refunds); buys check cash + pocket headroom (incl. open buys) at placement and pay at fill — resting buyers who can no longer pay get voided mid-match. 1 % fee on seller proceeds → city (ledger sink). Self-cross protection, 20-open-order cap. Trades tape + ledger rows per fill.
- **Routes**: `/market` (summary: last/bid/ask/day-volume per item), `/market/:item` (aggregated book + recent trades), `/market/orders` (mine), `/market/history/:item?res=1m|10m` (SQL-bucketed OHLCV candles). Room messages `placeOrder`/`cancelOrder`; `mkt` broadcast + `pocketChanged` per party + fill notes.
- **UI (M key)**: full exchange panel — 17-item list with procedural icons + last prices, canvas-drawn candlestick chart (1m / 1-game-day buckets, volume bars, axis gridlines, our palette), aggregated order book with spread, buy/sell form with live total, open orders with cancel, recent-trades tape. Live-refreshes on market broadcasts.
- **Verified E2E**: sell 20 escrowed → buy 12 @ crossing price fills at resting $5.00 (buyer −$60.00, seller +$59.40, $0.60 fee to city, items delivered), book shows the 8-unit remainder, cancel refunds escrow, summary/history correct, oversell rejected. Prod build clean.

### Market polish + icon redesign (owner feedback, 2026-08-13)
- **Crisp text**: exchange centers via inset+margin (integer pixels — the old translate(-50%) caused subpixel blur); chart canvas renders at devicePixelRatio and exact client size (no CSS stretching); panels use a solid `#11151b` ground (blur/transparency removed), exchange near-opaque `#0f1318`.
- **Icons redesigned**: all 17 item icons redrawn with real art — stacked log ends with growth rings, faceted stone pile, ore with embedded metal crystals, tied wheat sheaf, shaded cotton bolls on a stem, steel oil drum with drop emblem, grained plank stack, 3D bricks, gradient ingots, cloth flour sack with label, fabric bolt with roll, embossed jerry can, armchair, crossed hammer+wrench, scored loaf, shaded shirt, glowing phone. Icon renderer now rasterizes per-size at devicePixelRatio (cache key id@size×dpr) so every icon is pixel-exact at 13/16/18/20px.

### Specific items, not categories (owner feedback, 2026-08-13)
- Finished goods are now SPECIFIC products, not group types. Gone: "Furniture / Tools / Clothing / Gadgets". The tradeable/craftable catalog is 6 raw + 6 intermediate + 13 finished: the ten placeable fixtures themselves (chair, desk, shop shelf, counter, rack S/M/L, workbench, potted plant, rug) plus bread, shirt, phone. Fixture item ids match the interior FURNITURE ids exactly — one catalog.
- **Placing furniture consumes the real item**: building storage first, then pocket, then a city cash purchase as fallback (list price, money sink, ledger row). Removing a fixture returns the item to building storage — no more 50% cash refund. All inside one Postgres transaction.
- Edit-layout bar shows each fixture's icon plus what you own ("x2" in green) or the city price when you have none; counts live-refresh on place/remove/transfer via lotInvChanged/pocketChanged.
- New procedural icons for all nine fixture items; retired category icons. Dev DB purged of the four retired item ids.
- Verified E2E: craft chair (2 planks + 1 fabric), place → storage −1 and $0 spent, remove → storage +1, place-with-none → exactly the list price debited.

### Specific crops + exchange directory (owner feedback, 2026-08-13)
- Generic "Crops" item replaced by specific crops: Wheat, Corn, Carrots (each its own item + icon). Flour now milled from wheat; potted plant recipe is stone + wood. Old crops rows purged from dev DB; SOURCE_TYPES farm points at wheat.
- Exchange opens on an ITEM DIRECTORY, not a market: full-panel grid of cards (icon, name, last price, bid/ask) with a search bar and All/Raw/Intermediate/Finished filters. Clicking a card opens that item's market — full-width chart, order book, order form, trades — with a "‹ All items" back button. Search/filter re-render only the grid, so typing keeps focus.

### Icon art pass 2 (owner feedback, 2026-08-13)
- Redrew the weak item icons so each looks like the thing it is: wood = two side-view logs with sawn end rings (was coin-like circles), iron ore = rust rock with big faceted steel chunks, wheat = full tied sheaf with grain heads, planks = neat lumber stack with end grain, flour = plump cloth sack with cinch rope + grain mark, shop shelf = clean 3-tier gondola, racks S/M/L = orange industrial pallet racking with tan boxes (clearly 1/2/3 bays), workbench = tidy bench with vise + mallet. Also sharpened stone (3-facet boulder), bricks (lit top faces), iron (polished ingot pyramid), fabric (roll + pleated drape), fuel (jerry can with recessed handles), desk (drawer pedestal), crude oil (drum with rounded drop emblem).
- Verified on a 56px contact sheet and an 18px strip — every icon reads at both sizes.

### Icon art pass 3 (owner feedback, 2026-08-13)
- Bolder redraw of wood, stone, iron ore, wheat, planks, bricks, fabric, shop shelf: wood = diagonal log pair with big sawn ends; stone = grounded boulder (flat seat, rounded top, crack, pebble); iron ore = gray rock with rust-orange nugget clusters (the instantly-readable ore palette); wheat = three separated chevron grain heads with tie + loose ends; planks/bricks = 3/4 view with lit top faces; fabric = spiral roll + waved drape with pleats; shelf = two shelves of distinct products (cereal box, milk bottle, jars, cans) instead of colored squares.

### Icon art pass 4 — classics (owner feedback, 2026-08-13)
- wood = classic three-log firewood pyramid, end-on with bark rims, growth rings and receding bodies; stone = hard-edged low-poly rock, three flat facets, zero curves, sharp chip beside it; planks = lumber fan (three long boards leaning at rising angles with grain, knots, pale cut ends); bricks = staggered brick-wall fragment set in mortar (half-brick bond, per-brick shading); fabric = neatly folded cloth stack, three layers with rounded fold edges, fold shadows and stitch dashes.

### Icon art pass 5 (owner feedback, 2026-08-13)
- wood = true 3/4 firewood stack: three parallel log bodies receding upper-left with bark gradient + top-edge highlight, big sawn ends with rings facing the viewer; planks = lumberyard stack with lit top faces, stepped board lengths, and pale end-grain side faces with ring arcs; fabric = folded cloth stack with wavy cut edges, woven stripe pattern on top, and a draped corner hanging over the front of the stack.

### Single-item icons + bag inventory (owner feedback, 2026-08-13)
- wood = ONE big log lying sideways (bark streaks, knot stub, sawn end with rings); planks = ONE milled board in 3/4 at a slight diagonal (lit top face, grain + knot, pale end grain).
- Player inventory (I) is now an actual bag: 5-wide slot grid with recessed empty slots, item icons with count badges, tooltips, and a capacity bar (gold, turns red at full). It is purely the character's bag — no lot-storage coupling; moving items still happens at storage racks.

### Icon bounds pass (owner feedback, 2026-08-13)
- Wood's left bark cap and the plank's ends were clipping the 24-unit canvas; log got a proper elliptical bark cap inside the frame, plank got a pale cut strip on the left end and was recentered. Added an automated bounds check (render each icon at 48px, scan the outer pixel ring for opaque pixels) — caught planks + rack_l touching the right edge; both fixed, all 27 icons now fit with clean margins.

### Next increments (Phase 2 continued)
- Retail pricing on shop shelves (sales activate with Phase 3 NPCs). Wire `buildCost.materials` into construction. Resource acquisition design (owner to spec — sources were removed).

### Known issues
- Per-building draw calls (~5–8 each, ~1,200 total). Fine on Apple Silicon; if low-end perf matters later, merge static block geometry + facade texture atlas.
- SSAO kernel is conservative; tune radius/intensity after visual review.
- `useDefineForClassFields: false` is required in server tsconfig for @colyseus/schema decorators — do not remove.
- Colyseus 0.15 is CJS — server packages stay CJS ("type": "module" removed deliberately).

## Logistics revision — haulers as a fleet, bays loaded by whoever works the site

- **Haulers are no longer posted to a property.** A hauler is hired like any
  other worker but takes no address: their carrying capacity is pooled and
  spent across every delivery bay their employer runs, and haulers you hired
  yourself also drive for the companies you control (`CompaniesStore.principalsOf`
  walks the ownership chain). `db/026_hauler_fleet.sql` releases existing
  haulers from their lots.
- **Assignment applies on change.** The Assign button is gone from the Workforce
  panel — picking a job from the dropdown is the instruction. Picking "hauler"
  disables the property field (it reads "Whole network"); clearing the job
  unassigns.
- **Production sites load their own bays.** `stagingCrew()` counts managers plus,
  on any lot with a source, that source's own workers — so a farm's farmers and
  a mine's extractors move the day's output onto the pallets with no manager
  needed. Verified live: a carrot farm with one farmer and no manager staged 60
  carrots, the fleet hauled them, and the destination's manager racked them.
- **Pallet visuals.** Cartons load round-robin across all four pallets and stack
  no more than two high; an empty bay shows bare pallets. Indoor bays now read
  the real fill from `/dock/:lotId` instead of a hardcoded 0.4, and refresh on
  the day tick (`dockChanged` broadcast after deliveries).
- **Fixes:** stats snapshots were failing every tick on `listing_id`, a column
  from the retired job_listings schema — repointed at `npcs.employer_entity` and
  `hire_offers`. `npm test` only ever ran citygen.test.ts; it now globs every
  test file (38 pass).

## Property names, and shipments that set themselves up at both ends

- **Rename any property you own.** `lots.name` (db/027) holds an owner-given
  name; the ✎ beside the title on the property panel turns it into a field,
  Enter commits, clearing it reverts to the lot number. Owner-only and routed
  through the control resolver, so lots held by a company you control are
  renameable too; 2–30 chars, whitespace collapsed.
- **One naming rule everywhere.** `lotName(id, name)` in shared: `Lot 140`
  unnamed, `Sunrise Carrots (Lot 140)` named — the number always rides along so
  two identically named properties stay distinct. Companies, Workforce, and the
  bay's destination picker all use it, so a lot never shows as "Carrot Farm"
  again.
- **A shipment is set up once.** Creating an out-line from A to B now shows on
  B's bay as an inbound arrangement marked "auto" (`DockView.mirrored`, resolved
  by `partner_lot`), and vice versa. Deliveries already worked one-sided; the
  destination just never showed them, which made it look like you had to mirror
  the line by hand. The row is read-only at the far end so it's obvious where to
  go to change it.

## Signs, and a cleaner property panel

- **Zoning is gone from the panel.** The residential/commercial/mixed chip is
  removed (and its orphaned CSS). Zoning was never something the player acts on
  — buildings already appear on any lot regardless of it.
- **Signs are optional and carry the property's name.** `lots.sign` (db/028,
  default true) toggles from a checkbox on the building card; `BuildingDef.sign`
  gates the renderer. The toggle covers both kinds of building — one you built
  and a pre-existing city one on a lot you bought. The latter live in the static
  city mesh, so `restyleDerived()` rebuilds just that one building when its sign
  changes, and only for lots whose sign differs from what the city generated.
  Farms, quarries and other production sites get no sign control at all — a
  sign belongs to a building. A lot carrying both a field and a building you
  put up still controls that building's sign. The sign prints the owner's name for the property with no
  lot number — so a lot listed as "North Field Depot (Lot 380)" reads just
  "North Field Depot" on the wall. Unnamed buildings keep their generated name,
  which leaves every city building untouched.
- **Awnings stay put.** On shopfronts whose sign is printed on the awning face,
  turning the sign off removes only the printing — the awning itself is part of
  the shopfront and remains.
- **The lot panel's Delivery space button is gone.** A bay is a fixture you
  click, the same as a rack or a shelf, and the panel already opened on click
  from both outside and inside — the button was a second door to the same room.

## Floors you can walk up

- **Every storey is a real, separate space.** `furniture.floor` (db/029) puts each
  fitting on a storey; `interiorSpec(lot, def, floor)` returns that storey's
  plan, and placement validates against it — the same cell on two floors is two
  different places. Collisions, bounds and reachability are all per floor.
- **Upper floors follow the shape of the building.** A player-drawn section two
  storeys tall has a second floor; a single-storey section doesn't. A wing that
  stops below the main block disappears on the floors above it, while keeping
  its band in the grid so cell coordinates stay stable between floors.
- **Getting in.** The ground floor is entered by its door; upper floors arrive at
  a stair landing — the cell above the door where that still exists on the
  storey, otherwise the front of that storey's largest room. Reachability floods
  from there, so you still can't seal a fitting off upstairs.
- **Controls.** A floor selector sits in the interior bar in both interact and
  edit modes (hidden on single-storey buildings), plus PageUp/PageDown and ]/[.
  The property panel's building card now states the storey count.
- **Loading bays stay on the ground**, where a hauler can reach them.
- **Upstairs sits at its real height.** The interior root is lifted `floor *
  2.6` — the same storey height the exterior is built from — and the camera
  climbs with it, so changing floor reads as changing level rather than as the
  same room emptied out. The click plane and hover detection follow the storey,
  or placement upstairs would land in the wrong cells. Above the ground floor a
  large unlit plane sits under the storey: without it you look past the floor
  edge at the terrain the building stands on. Lower storeys are not drawn — to
  see a floor you go to it.

## Storage is only what you build, and it limits production

- **No invisible property storage.** `LOT_STORAGE_BASE` (a free 300 units on
  every lot) is gone. A property holds exactly what its containers hold: storage
  racks fitted inside a building, plus the delivery space itself.
- **The delivery space is storage**, raised from 240 to **500 units**. That is
  what lets a bare field or mine stockpile at all — it has no interior, so the
  bay is its storage.
- **Full storage stops work.** `produceDay` no longer uses a per-source soft cap
  (`sourceStockCap`, now removed); it produces up to the room actually left on
  the property. No storage means no harvest. Verified live: the carrot farm sits
  at 440/500 and produces exactly the 60/day it ships.
- **Arrivals respect the receiving property**, not just its pallets. Moving
  goods between pallets and racks is internal and needs no room of its own.
- **The panels say so.** The production site reports `Storage 440/500 — work
  stops when it fills`, calls out having no storage at all, and warns when full.
  Note for later: NPC- or city-owned production sites would have zero capacity
  under this rule. None exist today, but any future NPC farm needs storage.

## Every container holds its own goods

- **Storage is per container.** `inventories` gained a `furn` holder: each rack
  keeps its own stock (db/030 distributes the old shared pool across each
  property's racks in placement order; db/031 moves what was left on rack-less
  properties onto their pallets). Opening a rack shows that rack, not a pool.
- **"lot" is now shorthand, not a place.** `GoodsStore.propertyInventory` sums
  the property's containers; `takeFromProperty` / `putIntoProperty` spend and
  fill across them. A workbench, shop shelf, mining rack or fixture placement
  draws on any rack in the building and deposits into whichever has room, so
  nothing needs assigning by hand. Crafting, collecting, shelf stocking, company
  ops and NPC shopping all route through those.
- **The bay is not storage.** The delivery space shows only its own pallets —
  which is what makes a manager's bay↔rack round trip real work. A property
  with no racks keeps its pile on the pallets (a field has no barn), and one
  with neither racks nor a bay keeps the old undivided pile so nothing existing
  is stranded out of reach.
- **You can load and unload the pallets yourself** (`bayTransfer`); without it a
  property with racks but no manager had goods stranded on its own bay.
- **Stockers were broken by the split** — they pulled from the emptied shared
  pool. They now draw from the racks, fill each priced line to a full facing,
  and respect the shelving's capacity. Verified live: rack 594→584, shelf 0→8
  and holding stock against demand.
- **Shelves show what they sell.** The gondola renders one facing per unit in a
  colour derived from the item, bottled goods as cylinders; an unstocked shelf
  now stands empty instead of displaying phantom goods.
- **Lot panel:** Manage section removed, Demolish sits under Build, and the
  build hint is gone.

## A shop shelf is its own shop

- **One shelf, one listing, its own stock.** `shelf_listings` (db/032) binds an
  item and price to a specific shelf fixture; shelf inventory is keyed by that
  fixture instead of by the shop. The old per-building price list was migrated
  by assigning each priced item to a shelf in that shop and moving its pooled
  stock onto it. `shelf_prices` is dropped.
- **You choose what a shelf sells.** Clicking a shelf opens that shelf: pick the
  item (search-as-you-type, with the fair price shown), set a price, and the
  stocker fills it from the building's racks whenever that item is in storage.
  Changing or clearing a listing returns what was on it to storage.
- **No building storage in the shelf panel.** It reports only how much of that
  shelf's item is in the racks, so you know whether a stocker has anything to
  bring — the racks themselves are opened from the racks.
- **NPC shops adapt**: `autoRetail` restocks the shelf already selling the
  shopkeeper's product, and only claims an empty shelf in a shop where nothing
  is listed at all — an owner who leaves a shelf free keeps it. NPC purchases,
  the retail offer index and crafters all key on the shelf now.
- **Only a stocker moves goods from the racks to a shelf.** The player can put
  goods out by hand from their own bag, or take stock back off, and nothing
  else: `stockShelf` runs pocket↔shelf. That is the entire point of the job.
- **Every good has a shape.** `assets/goods3d.ts` gives each item a product form
  — loaf, bottle, can, sack, ingot, plank, circuit board, bolt of cloth, slab,
  carton, produce, log, rock, firearm — tinted per item, with a crate as the
  fallback. Shelves display real units of what they sell instead of cubes.
- **The 3D gondola shows its own listing** — one facing per unit of the item it
  sells; an unlisted shelf stands bare.

## Haulage runs on the minute

- **Deliveries left the day tick.** `LogisticsStore.runMinute()` runs on its own
  60-second clock (guarded against overlap), so goods trickle along a route
  continuously instead of teleporting once every game day.
- **Rates are per minute**: `dock_lines.per_day` became `per_min` (db/033
  divides existing rates by ten, a game day being ten minutes, so every route
  moves the same goods over the same stretch of time). A hauler carries 10 units
  a minute, a bay crew member 20. Panels read "6/min" and "Per minute".
- **No panel scrolls sideways.** The two horizontal scrollers — the fixture bar
  and the tab strip — now wrap, and a global rule caps panel content at full
  width with ellipsis on the text that can overflow.

## Workers do their jobs where you can see them

- **Every role walks a round.** `NpcSim.workLoop()` builds a loop of spots from
  the property's actual fixtures (via `fixtureWorld()` in shared, which mirrors
  exactly how the client places them), and workers walk it in a straight line —
  indoors there is nothing to path around. Cashier stands at the till; stocker
  goes rack → shelf → rack; manager works the bay and the racks; crafter stands
  at their machine; farmer and extractor work the drawn field cells then carry
  to the loading bay; haulers drive between the bays of the routes they serve.
- **Restocking is continuous, not batched.** The timed `runStockers()` sweep is
  gone. A stocker fills their arms at the racks (8 units) with whatever a shelf
  is short of, walks it over, and the goods land on the shelf when they arrive.
  Stock now trickles onto shelves as the worker moves instead of teleporting
  every 30 seconds.
- **Haulers have no address**, so their loop is built from their employer's
  shipping routes rather than an employer lot — the fleet change had left them
  standing still, since the work loop needed a lot to work from.
- Verified live end to end: farm bay → hauler → shop bay → manager → rack →
  stocker → shelf → sold, with each worker visible at their station.

## Workers stand in the right places

- **Beside a fixture, not inside it.** `standingSpot()` picks an adjacent cell
  that is still inside the room — front first, then back, then either side —
  using the fixture's real footprint for its rotation.
- **The cashier works the shopkeeper's side** of the counter (`prefer: "back"`),
  leaving the customer side free.
- **Fields and outdoor bays are drawn in the lot's rotated local frame**, not in
  raw lot tiles — `siteCellWorld()` applies the same transform the client uses,
  which is why farmers and delivery pads were landing well off their sites.
  Verified: the farmer for the carrot farm now works around its centre and the
  hauler drives between the farm and the shop.

## Workers are staff, not citizens with jobs

- **A hired worker is on the clock.** Needs no longer pull them off the job:
  `decide()` sends anyone with a role straight to `stepWork`. Unemployed
  citizens still shop, stroll and go home — they are what makes demand.
- **They stand on the tile beside a fixture**, not pushed off it and not inside
  it. The per-worker spread now runs along the fixture's face (perpendicular to
  the direction away from it), so two people at one counter stand side by side
  instead of one of them clipping into the register.
- **Indoors they walk around the furniture.** `interiorRoute()` breadth-firsts
  over the floor plan with fixture cells blocked, and the worker follows it a
  leg at a time; `worldToCell()` locates them on the plan to start from. The
  destination may itself be occupied — you stand at a rack, not in it.

## Coins are whole coins

- Mining paid pro-rata shares rounded to four decimals, so wallets accumulated
  fractions of a Ducat. `allocateEmission()` now splits the day's pool into
  whole coins by largest remainder: the pool is paid out in full and the odd
  coins go to the miners who contributed the most hash.
- db/034 floors every existing balance and takes the same dust off the mined
  total, so circulating supply still matches what wallets hold. Verified:
  wallets 51,237 + 880 escrowed in open sells = 52,117 = mined.

## Quarries and mines work a deposit

- **They dig a pit that runs out.** `lots.source_extracted` (db/035) records what
  has come out of the ground; `sourceReserve()` sets what a site held to begin
  with — 90 days of its own yield, so a bigger claim lasts longer. Production is
  capped by what is left and stops dead when the deposit is worked out. Fields
  and tree farms regrow and are unaffected.
- **The pit deepens as it is worked.** `makePit()` cuts concentric terraces down
  into the ground, deeper and wider-stepped as the deposit is spent, with spoil
  heaping up around the rim. The mine's timbered portal is gone — it is an open
  working now, dug the same way a quarry is. The property panel shows a bar and
  "1,240 of 1,530 left in the ground", and reads "worked out" at the end.
- **"Extractor" is now "miner"** everywhere — job role, hire offers, the worker
  dropdown. Existing workers were migrated. Quarries and mines already staged to
  a delivery space through the same path farms use; that path now names miners.
- **The delivery space is one pallet**, 1×1 instead of a 2×2 pad. Cartons stack
  onto it four to a layer, two layers deep, so a full bay is a proper stack and
  an empty one is bare timber.

## The pit is dug into the ground

The first attempt drew terraces descending from grade, which the terrain — an
opaque plane at y=0 — simply hid; the second stood the benches up above grade,
which read as a pit but sat on the surface. Neither is a hole. The ground is
now genuinely cut: `cutGroundHole()` clears the pit's mouth out of the affected
chunk canvases and the ground material carries `alphaTest`, so the pixels over
an excavation are gone. The working itself is built below grade — benches
stepping down to a floor up to ~3.7 units under the surface at full depletion,
with a haul ramp climbing out — and shows through the gap. The mouth is the
whole claim, so the cut is stable while the pit deepens under it.

## Why the pit was invisible

Three separate things hid it, found by probing the running scene rather than
guessing:
1. The countryside skirt was one plane spanning the whole world just below
   grade, so anything dug in showed the skirt through the hole. It is now a
   frame of four pieces around the city, with nothing under it.
2. `applyCleared` hid a pre-existing city building only when the plot was
   formally cleared. A plot with a quarry dug into it still had its original
   building standing on top — that building was what covered the pit. A plot
   with any player source or building now hides the derived one.
3. `?lot=` only opens a panel; it does not aim the camera. Early checks were
   looking at wherever the test player stood, not at the site.
The haul ramp is gone too — it read as a slab poking out of the working.

## Demolishing part of a plot

`demolishPart(eid, lotId, part)` takes one thing off a plot — the building, the
workings, or the delivery pad — rather than clearing the whole thing. Building
and workings cost the usual $250; a delivery pad is free and takes its shipping
routes with it. Tearing out workings resets the deposit, so a half-dug quarry
does not come back with its hole. In build mode the control sits in the actions
row in place of Undo (it was in the build-type row at first, where the
production-type lock disabled it — you could not click it at all), and toggling
it swaps the drawing controls for the three choices.

Also fixed: an outdoor delivery pad drew half a cell away from where it was
placed. Its position had `+ 1` baked in from when the bay was a 2×2 pad. The
mesh, the click hit-test and the spot workers walk to now all compute the same
cell centre.

## Demolition is a selection, not a menu

`demolishArea(eid, lotId, rect)` clears whatever a selected area touches — one
cell or the whole plot. Workings and building sections the selection overlaps
come out (the rest stays, and the site's area is recomputed); a delivery pad
inside it goes too; a pre-existing city building comes down whole. $250 if
anything structural came down, free for a pad alone. In build mode the Demolish
button arms a drag-selection drawn in red, the same gesture as drawing a
building — the earlier version made you pick from three buttons, which is not
selecting anything.

Build mode also now shows what is already on the plot: the building in grey at
its real height, workings standing proud in stone grey, fields low and green,
and the delivery pad in timber — and nothing can be drawn on top of any of them,
client-side as you drag and server-side on submit.

## The ground grows back

Cutting a hole was one-way, so clearing a quarry left a permanent gap in the
terrain. Chunk painting is now a callable, deterministic routine (`repaintChunk`
— its rng is seeded from the chunk, so a repaint is pixel-identical), and
`restoreGroundHole(key)` repaints the affected chunks and re-cuts every other
hole, so filling one working in never erases another. `constructions.sync()`
calls it for any plot that no longer has workings. Verified in a live page: the
hole fills and the terrain returns.

## Portfolio page

The stock market got a Portfolio page, reached from a button in the market
header. `StocksStore.portfolio(eid)` walks the holder's own trade tape in order
to build an average cost per company — sales realise against that average, so a
partial sale leaves the basis intact — and prices the remaining shares at last
trade. It reports market value, cost basis, open (unrealised) P&L and realised
P&L, including realised gains from positions since closed. Each holding row
shows shares at average cost, last price, market value and open P&L in money and
percent, and clicking one opens that company. Verified against live data: the
owner's book comes out at $41,543 against a $41,663 basis, −$120 open.

## Three coins, not one

The crypto system assumed a single coin everywhere — a currency literally named
'coin'. It is now a registry:

- `COINS` in shared holds each coin's supply schedule. **Ducat** (◈, cap 500k,
  40/day) is unchanged, **Obol** (◎, cap 120k, 12/day) is scarcer and slower,
  **Tiderium** (⬡, cap 2M, 220/day) is abundant and cheap. Halvings work the
  same way for each, scaled to its own cap.
- A coin's code is its currency code and its market key, so a balance, an order
  and a trade all name the same thing. db/036 renames Ducat's balances, orders
  and history from 'coin' to 'duc' — no holder loses anything — and seeds
  genesis circulation for the two new coins.
- Mining is per coin: a rack is pointed at the coin it works (`furniture.coin`),
  hashpower is counted per coin, and each coin's emission is split among the
  racks aimed at it. Component wear follows the racks that actually ran.
- Market makers quote all three, each with its own mood and fair value.
- The crypto panel has a coin switcher; the rack panel picks which coin it mines.

One bug this exposed was already latent: the currency wall was a lookup table
keyed by currency, so any code outside 'clean'/'dirty'/'coin' hit `undefined`
and threw inside the escrow. It is now a function that treats anything which is
not clean or dirty cash as a coin, so the wall covers coins added later.

## A market you can actually buy in

Tiderium's chart was falling while the panel said there were no sellers. The
makers' takers were sized independently of the book, so a single market buy
cleared the entire sell side every tick and left nothing resting for a player to
hit — bids piled up hundreds deep against an empty ask side. Two fixes: a taker
now takes at most 60% of what is actually resting on the side it hits, and when
the sell side falls below a handful of units a holder puts a real offer back on
it just above the anchor. Verified by buying and selling Tiderium as a player
through the room.

Chart rendering also handles young markets: candles keep a maximum width and a
short series right-aligns, and time labels are spaced by pixels rather than by
candle count, so four candles no longer render as four slabs with their labels
printed on top of each other.

## Coins at a real scale, and a clean restart

Supplies were thousands where real coins run to millions. db/037 raises each
coin's total supply and scales everything about it by the same factor —
balances, emission, and the tape's prices — so it is a redenomination, not a
windfall: Ducat 500k → **20,000,000**, Obol 120k → **50,000,000**, Tiderium 2M →
**100,000,000**.

db/038 then closes the old market properly rather than leaving stale positions
against new numbers: every holder is bought out in clean cash at the last traded
price (229 payouts, $1,119,541 total, each recorded in the ledger), balances are
emptied, and the books and tape are cleared. Circulation resets to zero so each
coin re-seeds its genesis at the new scale on boot — 2M Ducat, 5M Obol, 12M
Tiderium across 52 holders each.

Two schema details worth remembering: `ledger.to_account` references
`accounts.id`, not an entity id; and coin accounts cannot be deleted because
ledger history points at them — they are emptied instead.

## Market caps that read like market caps

The arithmetic was already right in both markets — a stock's cap is its price
times shares outstanding, a coin's is its price times circulating supply, and
stock caps sit at 0.8–1.0x the issuing company's book value, so they are
anchored to something real. What was wrong was the reading: `$27,255,000` in a
table column.

`fmtCap()` renders large figures the way a terminal does — $27.3M, $2.4M, $133M,
$950K — and both markets use it for valuations while prices and balances keep
exact dollars. The coin market also states **fully diluted** (price × total
supply) next to market cap (price × circulating), since those differ by ten
times at current circulation and the distinction is the whole point of the two
supply figures.

## Quarries dig stone, iron or gold

Stone and iron were separate site types ("Quarry" and "Iron Mine"). They are now
one kind of site with the resource chosen underneath it, exactly like a farm
picking its crop — and **gold** joins them:

| Resource | Yield (40 cells) | Setup | Reserve |
|---|---|---|---|
| Stone | 17/day | $2,600 | 1,530 |
| Iron ore | 12/day | $4,200 | 1,080 |
| Gold ore | 3/day | $10,400 | 270 |

Gold is deliberately slow and expensive to work — four times the setup of iron
for a quarter of the yield, and a deposit that runs dry in a fraction of the
time. It sells at a base of $95 against iron ore's $8.

`QUARRY_TYPES` mirrors `FARM_TYPES` throughout: the build bar shows one Quarry
button with a resource row beneath it, all three deplete, all three are worked
by miners, and all three dig the same pit. db/040 renames existing sites
('quarry' → 'quarry_stone', 'mine' → 'quarry_iron'), so the site on lot 120 is
unchanged apart from its name.

## Fixtures come from the market, not from the city

Placing a fixture you don't own used to pay the city a list price and conjure
one. It now buys on the player market at whatever people are actually asking:
`MarketStore.buyNow()` fills against resting asks and never rests, so the money
goes to a real seller who is one item lighter. If nobody is selling, the
placement fails — "nobody is selling a Chair right now" — instead of inventing
the goods. Verified end to end: a seller listed chairs at $60, placing one moved
$60 from buyer to seller and took the chair off their listing.

## A deeper electronics chain

Everything used to come from iron in one step. The chain now runs:

- **Silicon Wafer** ← 3 stone + fuel (smelter) — quarried stone finally has a use
- **Wiring** ← 2 iron, 2 per batch
- **Transistor** ← silicon + wiring, 4 per batch
- **Capacitor** ← wiring + iron, 2 per batch
- **Circuit Board** ← silicon + 2 wiring + 2 capacitors
- **Basic CPU** ← board + 4 transistors → **Advanced CPU** ← 2 CPUs + 8
  transistors + **gold ingot** → **GPU** ← CPU + 2 boards + fan → **ASIC** ← 2
  GPUs + 2 boards + 2 gold ingots
- Racks and the electronics bench are built from iron, planks and boards; the
  Server and Industrial racks also need PSUs.

Gold now has a purpose beyond selling: the high end of the chain runs on it.
Every priced recipe was checked to sell above its input cost (two long-standing
loss-makers, cigars and ammo, were repriced), and crafting a rack is cheaper
than buying one — $283 against $320 for a mining rack, $1,702 against $1,850 for
an industrial one.

## Silicon comes from quartz now

Wafers used to be smelted straight out of building stone, three stone to a
single wafer, which is neither how silicon is made nor a satisfying conversion.
There is now a proper route:

- **Quartz** is a fourth quarry resource (14/day on 40 cells, $3,200 setup) —
  the rock silicon actually comes from
- 4 quartz + 2 fuel smelt into one **Silicon Ingot** — a single pure boule
- that ingot slices into **4 Silicon Wafers** at an electronics bench

So one trip to the smelter yields four wafers instead of one, the raw material
is its own thing rather than competing with construction stone, and each step
carries its own margin ($12 on the ingot, $9 a wafer).

## Silicon from stone, and electronics that use electronics

Quartz is gone: 5 stone smelt straight into a **Silicon Ingot**, no fuel, and
the ingot still slices into 4 wafers at an electronics bench — so the two-step
refine stayed, the raw material went back to stone, and the quarry is back to
Stone, Iron and Gold.

The phone and liquid cooling were still built from iron, planks and fuel like
farm equipment. They now take the parts the chain actually makes:

- **Phone** ← circuit board + wiring + capacitor ($205 to build, sells $260)
- **Liquid Cooling** ← cooling fan + 2 wiring + capacitor ($129, sells $175)

No recipe in the game burns fuel any more, and every priced recipe still sells
above its input cost.

Icons were missing for the new parts and are drawn now: a polished wafer with
its flat edge, a coil of insulated cable, a three-legged transistor can, an
electrolytic capacitor with its stripe, and a green circuit board with gold
traces.

## The city is the seller of last resort

Buying a fixture goes: building storage → your bag → the player market at
whatever people are asking → and only if nobody is selling at all, the city at
its list price. A thin market makes fixtures dearer or cheaper depending on who
is offering, but it never blocks you from building. Verified both ways: with a
seller listing chairs at $60 the money went to them and their listing shrank;
with an empty book the same placement cost the $40 list price.

## Two workshops, not one

The carpentry bench had grown to 23 recipes — chairs and smelters and mining
racks all at the same table. A **Metal Shop** (3×2, $520, or 3 planks + 6 iron +
20 nails) now takes the machine work:

- **Carpentry Bench** — chair, desk, shop shelf, counter, plant, delivery space,
  the three storage racks, loom, curing barn, carpentry bench, metal shop
- **Metal Shop** — sawmill, smelter, refinery, bakery, brewery, distillery,
  gunsmith bench, electronics bench, the three mining racks, and metal shops
  (8 iron + 24 nails, no planks — a metal shop needs no carpenter)

The carpentry recipe for a metal shop stays so the first one can still be built
from wood. The two benches feed each other: carpentry builds the metal shop, the
metal shop builds the electronics bench.

Nails came out of the same pass: 1 iron ingot smelts into 24 nails, and every
piece of woodwork now takes them in place of some of the iron it used to
swallow whole — a chair 6, a counter 12, an industrial storage rack 20.

## Memory is the third constraint on a rack

A rack already gated processors on power (no PSU, nothing runs) and cooling
(uncooled processors throttle and wear 3× faster). **RAM** is the third: a
processor with no memory behind it still runs but at 40% speed.

- **DDR4 Module** — circuit board + wafer + wiring, feeds 3 processors
- **DDR5 Module** — circuit board + 2 wafers + 4 transistors, feeds 6
- **ECC Memory** — a DDR5 module + 2 wafers + a gold ingot, feeds 10

Racks have 1 / 2 / 4 memory slots by tier. A small rack of four GPUs goes from
19.2 hash unfed to 40.8 with a single stick, or 48 with server memory.

The rack panel's **installed** parts are now paged by type — Processors, Power,
Memory, Cooling, each tab showing how many are fitted — so a full industrial
rack reads as four short lists instead of sixteen rows in a heap. The install
list stays one flat list of what you actually have, and the slot rules sit as
subtext under the parts they describe.

## Companies scale + market maker hygiene (Aug 17)

**Companies grow when demand proves out.** A producer that keeps selling out
(product gone from shelf AND store) while its craft queue is saturated buys
another of its final-stage machine (cap 4), plus storage racks that grow more
slowly. Everything keys off the machine count — craft batches multiply by it,
the queue deepens with it (`3 × benches`), input bids scale to feed it, retail
restocks keep pace — so the extra furniture is real capacity, not decoration.
Staff follows: every producer hires a stocker, and each extra bench brings a
crafter (`workforce.ensureStaffed` now takes a headcount and posts offers for
the shortfall). Nordvik adds electronics benches when its queue saturates;
HashWorks stands up another mining rack (cap 4) once every rig is fully built
and cash covers it. Six ops days took Vesper to 4 benches, three companies to
3 machines, all crafter offers filled.

**Wide spreads on cheap stocks fixed.** Makers re-quote every 10s but the stale
sweep cleared only 60 orders/tick — the backlog pushed holders into their
20-order cap, so fresh asks were rejected and the ask side starved (Crestfield:
29,776 shares bid vs 38 offered → 6.6% spreads). Three fixes in
`marketMakers.ts`: every maker now cancels its own working quote per asset+side
before placing a new one (`requote()` — cancel, not delete, so escrow comes
home), the stale sweep clears up to 500/tick, and the city desk quotes BOTH
sides — its standing bid as before, plus an ask recycling 25% of whatever
inventory it bought (stocks and coin alike), so the desk self-funds instead of
draining the treasury. Spreads now 0.1–1.2% across all ten stocks, book turns
over inside the 2-minute TTL (~730 orders, oldest 2 min), treasury recovered
$17k → $113k on desk sales.

## Realistic dividends (Aug 17)

Dividends were a daily lottery — 35% of one noisy 10-minute ledger window,
which meant almost nobody ever paid (only Atlas, 15 times ever), and when it
did fire it was an erratic lump. Rebuilt as a declared policy sized like real
markets: `dividend_ratio` now means TARGET ANNUAL YIELD on the share price
(income names run 1-7% — Atlas 4.5%, Bluebird Tobacco 6.5%, Nordvik 1%;
growth names zero). Every 7th game day is pay day: `declaredDps()` (shared,
tested) converts the target to a weekly per-share rate — 52 periods to a game
year — smooths moves to ±25% per period like a sticky board policy, and caps
the period pool at 5% of company cash so a payer can run for years off
retained earnings but can't bleed dry. Stocks table carries `dps`, `last_pay`,
`pay_day_counter`; two migrations (columns + re-rating the NPC names).

UI: stock list and detail show the ANNUALIZED yield from the actual declared
rate (`dps × 52 / price`), the weekly per-share amount, and days until the
next payment; the company panel's dividend policy input is now "% / year"
(0-10, step 0.5). Verified over a full period: all seven income names paid
~80 holders each, measured yields 0.94-6.41% against targets of 1-6.5%.

## Economy panel wiring fixes (Aug 17)

The Goods tab's "made" column was chronically zero: craft resolution DELETES
the craft row, and the day-close snapshot counted rows still in the table —
so any craft resolved before the close (nearly all of them) was invisible.
Production is now recorded by `resolveCrafts` itself into the day's
`stat_commodity` row at the moment goods land in the racks; the snapshot only
ADDS active source-site yields and fills in consumption (increment, not
overwrite). And "avg rent" now averages the housing rents citizens actually
paid this game day from the ledger, instead of reading the commercial
tenancy roll, which is empty.

## Companies run like companies (Aug 17)

**Managers price the shelves** — for players and NPCs alike. Any shop with a
manager on staff gets sell-through repricing each game day: flying off the
shelf = +5%, gathering dust = −4%. No reference tables; the standing price is
wherever the last adjustment left it (restocks explicitly keep it). NPC
companies now hire managers; a new listing opens at market-rate × 1.15 and
belongs to the manager after that.

**Shoppers choose softly** — weighted choice (softmax over offer scores)
replaced winner-take-all. An overpriced shop loses custom gradually instead
of flatlining; mispricing slows a business, it doesn't execute it.

**Every line answers to its own P&L** (`company_lines` table): revenue at the
till minus its exchange input costs minus its payroll share, reviewed every 7
game days. Three straight losing reviews = exit — clearance sale at −25%,
bids pulled, line closed (never the last line standing). Closed lines reopen
when the market margin returns; new launches are gated on the same on-paper
margin check (a day's output at market rates must beat a day's inputs by $60).

**Dividend cuts** — a payer that lost money all period halves its declared
rate (the classic income-stock headline). Rates recover through the normal
±25% smoothing once operations earn.

**Wages are a market rate** — reservation floor + a tightness premium
(open jobs vs idle citizens), used by every NPC hire. Stock terminal
fundamentals fold property+inventory into one Assets row.

Verified over 25 game days: dividend cuts firing on unprofitable names, 8
company managers hired, wages spread 46-52 by tightness, flour already
showing divergent shop prices (5.28 vs 9.75) as managers feel out demand.

## Vertical integration — companies own the whole chain (Aug 17)

Removing the city from the commodity exchange left a hole a sped-up sim
exposed: with no players selling, NOTHING produced raw materials — shelves
went empty citywide, retail flatlined at zero, companies bled wages into an
economy that couldn't pay them back.

The fix honors the original design ("let them own the whole production chain
if they choose"): a company whose input bids keep starving can CHOOSE to
integrate upstream — buy a vacant lot, `setupSource` the right farm/quarry,
put a delivery pad on it, run a haul route to the shop, hire farmers/miners
(2) and a hauler at market wage. Where players fill the bids cheaply, boards
mostly never bother — integration is the market's answer to scarcity, not a
script. Field surpluses beyond the works' needs go onto the exchange at the
going rate, so company farms become the raw supply side other companies (and
players) buy from. Grocer-style retail lines (carrots, corn) integrate the
same way.

Sim proof (cloned world, ~36 game days accelerated): 9 company production
sites chosen (3 wheat farms, 2 cotton fields, tobacco, carrots, iron+stone
quarries), employment 24→66, shelf stock cycling, retail unfrozen and
climbing, citizen wealth up on real wages. `workforce.ensureStaffed` learned
null lots for employer-level hauler hires; companyOps gained `logistics`.
