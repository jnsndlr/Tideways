# Tideways — Working Design Notes

Companion to [Ferry-Game-GDD.md](Ferry-Game-GDD.md) (the canonical vision). This file
tracks how the prototype maps to the GDD and records design decisions as we make them.
Check implementation against the GDD; check *sequencing* against this file.

_Last updated: 2026-06-30_

---

## Implementation status vs. GDD

| GDD system | State in prototype |
| --- | --- |
| Demand simulation (segments, patience, elasticity) | ✅ commuter / tourist / freight, per-segment patience + price elasticity |
| Service-induced demand (rep → turnout) | ⚠️ partial — per-segment reputation drives next-day turnout; no community growth yet |
| Reputation | ✅ per-segment, per-dock; asymmetric drift; served-gain / balk-loss |
| Routes & scheduling | ✅ drag-drop timetable, interlining, overlap rules |
| Pricing | ✅ manual foot/car steppers |
| Fleet purchasing | ✅ buy by class, hard `maxFleet = 5` cap |
| Fuel | ✅ per-crossing (distance × fuelPerNm) |
| Docks / terminals | ✅ build + tier-upgrade (Express→Hiyu→Issaquah→Jumbo) |
| **Win / loss conditions** | ❌ none — no goal, no fail |
| **Ongoing operating costs** | ❌ only fuel; idle ferries are free to own |
| **Maintenance / breakdowns / vessel age** | ❌ |
| **Crew / captains** | ❌ |
| **Community growth loop** ("heart of the sim") | ❌ demand is static per island |
| Research, advertising, terminal amenities, events, weather/seasons | ❌ |

**Biggest gaps right now:** (1) no economic downside to owning ferries, (2) no
win/loss, (3) the community feedback loop — the GDD's stated heart — isn't running.

---

## Fleet progression design

### Problem with the current model
Fleet size is a flat `maxFleet = 5` cap plus a one-time cash cost. That contradicts the
GDD vision ("success isn't measured by the number of ferries owned") and isn't strategic —
once you can afford a hull, you just buy it.

### Design: gate fleet growth on four coupled things
Owning more ferries should require capital **and a reason** **and operational support.**

1. **Home-port moorage (the unlock).** Anacortes has a finite number of berths. Buying a
   vessel consumes a free berth; you raise the ceiling by building moorage. Start at ~2
   berths. This replaces the arbitrary `maxFleet` with a *visible, purchasable* constraint
   and reuses the exact UI pattern we just built for island dock tiers → consistent feel.

2. **Per-vessel daily operating cost (the governor).** Every ferry you own bleeds a fixed
   daily overhead (moorage/insurance/idle-crew), independent of fuel. Hoarding hulls now
   *loses* money, so you only expand when demand justifies it. This is what literally makes
   "success ≠ ferry count" true in the economy, and it's the lever that turns fleet sizing
   into a real decision.

3. **Vessel refit (upgrading the ferries themselves).** Rather than only buying new hulls,
   an owned vessel can be refit: +capacity, +fuel efficiency, +speed, or a repower. Hooks
   into age/maintenance later. MVP: 1–2 refit options per class.

4. **Crew availability (later, Phase 3).** Eventually a vessel can't sail without a captain;
   hiring becomes the deepest gate. Out of scope for the next slice but the moorage/op-cost
   model is designed to slot crew in on top.

### How "buy a ferry" should read after this
- Capital — buy cost (have it)
- A free **berth** at the home port — build moorage to expand (NEW)
- Ongoing **viability** — daily op cost punishes over-buying (NEW)
- Demand to fill it — supplied by the community-growth loop (NEXT)

---

## Recommended build order (dependency-driven)

1. **Economy spine — daily operating costs + solvency win/loss.**
   Smallest change, but it's the prerequisite for everything: gives ferries a downside,
   creates the Phase-1 fail condition the GDD calls for, and makes the moorage gate matter.
   *Lose if cash < 0 for N days; soft goal = grow company value / net worth.*

2. **Fleet expansion — moorage + buy-from-berth + per-vessel daily cost + basic refit.**
   The literal ask. Builds directly on #1; reuses the dock-tier UI.

3. **Community growth loop ("the heart").**
   Promote each island from a static `demand` table to a living `population/economy` that
   grows when served well (high rep, short waits, enough capacity) and stagnates/shrinks when
   not. Reputation is already ~80% of the needed input. This is the biggest *fun* unlock and
   gives long-horizon goals.

4. Then: maintenance/breakdowns (vessel age) → crew/captains → research + advertising →
   terminal amenities + community identity → events/weather/seasons.

**Suggested next session:** do #1 and #2 together (they're small and interlocking), then make
#3 the following milestone.

---

## Interconnected routing (decided 2026-06-30)

The next milestone after the economy spine + slip work. Moves beyond hub-and-spoke (every
island ↔ Anacortes only) to a connected interisland network where passengers travel
island→island.

### Core insight
**Point-to-point legs + transfers** make the hub (Anacortes) an interchange, so the
*existing* hub↔island routes already connect island→island via a hub transfer. The
interconnected payoff comes from a **routing layer**, not from forcing players to build an
O(n²) mesh of direct routes. Direct interisland routes become an *optimization* (shorter
trip, less hub congestion), not a prerequisite.

### Agreed decisions
| Topic | Decision |
| --- | --- |
| Carrying model | Point-to-point first: generalize a route from hub↔island to **any-port↔any-port**. Multi-stop "lines" deferred. |
| Demand | **Gravity model**: per-port population + tourist-draw weights; `demand(A→B) ∝ pop(A)·draw(B)·distanceDecay`, hub-dominant, shaped by the existing time-of-day segment curves. Foundation for the later living-economy phase. |
| Transfers | **Yes** — passengers ride across multiple sailings (A→hub→B). |
| Routing | **Shortest path** over the route graph; `nextHop(from, finalDest)` recomputed only when routes change. Congestion-blind in v1 (riders pick shortest path, not emptiest boat). |
| Fares | **Per boarded leg.** |
| Transfer wait clock | **Reset per leg** for now (each leg's patience starts fresh at the transfer port). |

### Future research hook (not v1)
A per-rider **spend limit**: multi-leg journeys that cost too much go unserved. Surface as an
opportunity prompt — e.g. "~500 daily riders aren't traveling because the legs are too
expensive; a direct route would capture them" — that justifies (and is unlocked by
researching) a new direct route.

### Phased build order
1. **Network spine (model + engine, no new UI).** The big phase.
   - Ports become first-class; hub and every island are ports.
   - O/D queues live at ports, keyed by **(final destination, segment)** — replaces route
     `out`/`in`.
   - A route becomes a **physical leg** between two ports; generalize the boat phase machine
     so the origin is any port, not hardcoded Anacortes.
   - Routing table: `nextHop(from, finalDest)` via shortest path (metric: fewest transfers,
     then total crossing time).
   - Loading: a boat sailing P→Q boards passengers at P whose next hop toward their final
     destination is Q (same proportional/cap logic as today's `loadBoat`).
   - Arrival at Q: deliver finalDest==Q (fare + reputation); re-enqueue the rest into Q's
     queue toward their destination.
   - Gravity demand generator fills origin queues.
   - *End state:* the current hub↔island network already carries island→island traffic via
     hub transfers; hub slip contention starts to bite.
2. **Direct interisland routes (player tool + UI).** Open a route between any two ports; dock
   requirements at both ends; route-opening cost. Sim already supports it from Phase 1.
3. **Network legibility UI.** Per-port unmet demand by destination, hub transfer volume,
   underserved-pair hints. Makes transfers visible/playable.
4. **(future) Multi-stop lines.** Chain stops into one sailing, resting on the O/D + transfer
   foundation.

### Ties to existing systems
Multiple routes calling at the same port makes per-port **slip count** mechanically
meaningful (berth contention) — the slip rework laid this groundwork. Hub contention bites as
soon as Phase 1 lands.
