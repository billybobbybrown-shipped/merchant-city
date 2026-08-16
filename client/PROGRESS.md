
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
  at 440/500 and produces exactly the 60/day it ships — shipping is what keeps it
  working.
- **Arrivals respect the receiving property**, not just its pallets — a haul is
  limited by the destination's total remaining storage. Moving goods between the
  pallets and the racks is internal to one property and needs no room of its own.
- **The panels say so.** The production site reports `Storage 440/500 — work
  stops when it fills`, calls out having no storage at all, and warns when full.
  Note for later: NPC- or city-owned production sites would have zero capacity
  under this rule. None exist today (the only two source lots are player-owned,
  both with bays), but any future NPC farm needs storage placed with it.
