# Tideways — Working Design Notes

Companion to [Ferry-Game-GDD.md](Ferry-Game-GDD.md) (the canonical vision). This file
tracks how the prototype maps to the GDD and records design decisions as we make them.
Check implementation against the GDD; check *sequencing* against this file.

_Last updated: 2026-07-01_

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

## Agreed build order (2026-07-01 — supersedes the earlier dependency-driven list)

The economy spine (#1) and fleet expansion (#2) from the old list are DONE. The new order
interleaves mobile-viability work with sim depth, so the deep sim gets tested on the platform
it's meant for. Stop and review after each milestone.

1. **Save/load + PWA shell.** Serialize `GameState` to localStorage (autosave + restore on
   load); manifest + service worker for installability. Mobile table stakes — without it the
   prototype can't be play-tested on a phone. Smallest milestone; do first.
2. **Weekday/weekend + seasons.** Day-of-week and season multipliers on per-segment demand
   volume. Cheapest depth in the game: one timetable stops being optimal forever, and fleet
   sizing becomes a repeating seasonal decision (needs vessel resale, see notes below).
3. **Mobile UI restructure.** Bottom tab bar (Map · Schedule · Company), dock detail as a
   bottom sheet, 44px touch targets, safe-area insets, HUD slimmed to Cash / Net / Day+Time /
   speed. Route cards dissolve into the map + port sheet.
4. **Community growth loop ("the heart").** Promote per-port `pop`/`draw` from static config
   to living state; weekly growth tick driven by rep, served-ratio, and capacity headroom;
   visible town tiers on the map. Per-segment growth doubles as the community-identity
   mechanism later.
5. **Maintenance / wear / breakdowns.** Wear per nm sailed → condition tiers → breakdown
   risk. Scheduled maintenance takes the boat out of service for a block of hours at the home
   port, colliding with the timetable — a planning decision, not a repair button.
6. **Schedule generator.** ⚠️ Interaction design NOT locked yet — needs a dedicated
   brainstorm before building (form-based? tap-a-pattern? something else). The 3a/3b split in
   the routing plan below still describes the mechanical shape, but treat the UX as open.
7. **Contracts + events.** Service-level contracts (mail run, school run: stipend +
   penalties) and announced-ahead demand events (festivals, closures) — direction and
   reactivity.
8. **Graphics art pass (2D).** Seeded-noise island shapes, time-of-day tint, wake trails,
   docked bob, zoom-dependent labels/detail. Long-term the game goes low-poly 3D; this pass
   is about making the 2D proof of concept carry the mood and proving readability rules.

**Explicitly deferred:** onboarding/tutorial (not until mechanics stabilize — no one to
onboard yet and it would need constant rework); individual crew/captains (a coarse per-boat
staffing tier comes first, likely alongside #5 or after #7); full 3D.

**Locked-in engineering item (do during #3):** `Panel.updateHud` runs dozens of
`document.querySelector` calls per frame (`src/ui/panel.ts`) — cache element references once
at build time. Free battery on mobile.

## Model-level notes (observed 2026-07-01, not yet scheduled)

- **Transfer fare/rep asymmetry:** fares and rep are both credited at *boarding*, so a rider
  stranded at the hub mid-journey already paid for leg 1, and their balk penalizes the hub's
  rep rather than the route that sold the false promise. Acceptable for v1; when the
  network-legibility UI lands, consider crediting rep on *delivery*.
- **Freight realism:** `avgOccupancy` (2.0) applies to freight too — trucks count 2 people
  and pay car fare. Decided direction (now in GDD): trucks occupy several car slots and pay
  their own fare. Fold in with #4 or #7.
- **Balked demand evaporates.** Consider having a fraction retry the next day with reduced
  patience, so chronic underservice compounds visibly once unmet demand is surfaced.

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

### Phased build order (reordered 2026-07-01: route builder promoted to #3, network legibility UI bumped to #4)
1. **Network spine (model + engine, no new UI).** — DONE (merged, see Phase 1 status above).
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
2. **Direct interisland routes (player tool + UI).** — DONE (implemented 2026-07-01). Open a
   route between any two docked ports; route-opening cost scaling with distance.
   - **Route picker UI (decided 2026-06-30):** panel list + live map preview. Extend the
     existing docked-port detail panel (`openDockHtml` in `src/ui/panel.ts`) with a "Routes"
     section: existing routes from this port, plus a "+ Open a new route" list of other
     docked ports not yet connected directly. Each candidate row shows distance/crossing time
     (`nmBetween` in `src/config.ts`) and an opening cost (new formula, same shape as
     `addSlipCost`). Hovering a row sets a `previewTo` on the canvas renderer, which draws a
     dashed preview line; confirming calls a new `openRoute(state, fromId, toId)` in
     `src/sim/state.ts` (mirrors `buildDock`/`addSlip`) that pushes a new `RouteDef`/
     `RouteState`. Nothing else needs wiring: `getRouting()`'s cache key already includes
     `Object.keys(state.routes)` (`src/sim/routing.ts`), so routing auto-invalidates, and
     `canvas.ts` already iterates `state.routes` generically, so the new line just renders.
     Scheduling a boat onto the new route stays the existing timeline drag-drop.
3. **Route builder: multi-stop "Lines" + a saved-schedule generator (promoted from #4,
   2026-07-01).** Directly targets the current biggest UX pain — repetitive manual
   drag-and-drop scheduling; the underlying leg/fare/demand mechanics are fine, doing them
   over and over is not. Two decoupled slices:
   - **3a. Schedule templates/generator (no data-model risk, works with today's model).** A
     form like "Route: Lopez · headway: every 60 min · 6am–9pm · 3 boats" that auto-stamps a
     boat's `Trip[]` itinerary instead of manual per-trip dragging. Named, saved, editable,
     re-generatable. Kills most of the tedium on its own, even for today's plain
     out-and-back routes.
   - **3b. True multi-stop loops (A→B→C→D→A as one continuous circuit).** Blocked today by
     the boat phase machine (`src/sim/ferry.ts`): `Boat.itinerary` is a list of independent
     *round trips* (`atHome → out → atFar → back → idle`), and `back` is hardcoded to return
     to that leg's own `from` before the next itinerary entry starts — a boat can never be
     sitting at B ready to sail B→C next. The fix is a **simplification, not a rewrite**:
     generalize itinerary to "an ordered list of legs to walk forward, wrapping at the end."
     `atHome`/`atFar` merge into one `atPort` (load/unload); `out`/`back` merge into one
     `sailing`. The closing leg (D→A) stops being special-cased — it's just the last leg in
     the loop, an ordinary route like any other. **No new demand/fare logic needed** — per-leg
     fares and per-leg patience-reset were already decided for transfers, and a multi-stop
     line is just the case where the "transfer" happens to be onto the same hull.
   - Once 3b lands, the "Line" becomes the same saved-template concept as 3a but with an
     ordered stop list instead of a single route; the line-builder UI reuses the port-picker
     pattern from #2 (pick stops in order, map draws the loop, legs auto-open if missing).
     "Assign boat to Line, headway H" replaces per-trip dragging entirely.
4. **Network legibility UI (bumped from #3).** Per-port unmet demand by destination, hub
   transfer volume, underserved-pair hints. Makes transfers visible/playable.

(A separate, orthogonal general UI/usability pass — broader than routing legibility — is
agreed to happen after #2 and before circling back to #3/#4.)

### Ties to existing systems
Multiple routes calling at the same port makes per-port **slip count** mechanically
meaningful (berth contention) — the slip rework laid this groundwork. Hub contention bites as
soon as Phase 1 lands.

### Balance pass (2026-06-30)

Tuned the gravity model + economy against a headless report (`npm run balance`,
`test/balance.ts`) that prints the structural demand mix and an operational 3-Hiyu run.
Targets: interisland ≤10-15% (hub dominant), serviceable starting islands, and an economy
that closes with fuel as a real tradeoff.

Model changes:
- **Population-scaled demand.** Total per-segment volume is now
  `tripsPerResident × Σ docked-island pop`, not a fixed constant — opening an island *adds*
  demand instead of diluting the pie (fixed-pie normalization shrank every island each time
  you docked a new one).
- **Fuel & revenue are tracked state** (`fuelToday`/`revenueToday` + yesterday snapshots) so
  the fuel tradeoff is measurable and HUD-surfaceable.

Landing numbers (3 starting islands, 3 dedicated Hiyus):
- Demand: ~6,450 trips/day, **8.9% interisland** (per-segment 8-11%), hub 91%.
  `tripsPerResident` = 0.6 / 0.85 / 1.0; `decayScaleNm` 16 (raise for more interisland).
- Balk: Lopez 4% · Orcas 12% · Friday 28% (Friday runs hot → pressure to add capacity).
- Economy ("raise costs, keep fares" decision): fares unchanged ($14/$30); vessel prices
  ~3.5×, daily upkeep ~4-7×, fuelPerNm ~3×, startCash 150k→500k, slip costs ~3×. Result:
  revenue ~$89k/day, **fuel ~54% of revenue**, upkeep $21k, **net ~$20k/day** for 3 boats —
  earned, not printed. (The report over-schedules Lopez, so optimized play does better.)
