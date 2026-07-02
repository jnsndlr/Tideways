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

1. **Save/load + PWA shell.** — DONE 2026-07-01. localStorage autosave (5s + tab-hide +
   pagehide), versioned defensive deserialize, manifest/icon/service worker, new-game paths
   clear the save.
2. **Weekday/weekend + seasons.** — DONE 2026-07-01. `weekendMult`/`seasonMult` per segment
   (`src/sim/calendar.ts`); vessel resale added; cost model reworked the same day (see
   "Activity-based vessel costs" below).
3. **Mobile UI restructure.** — DONE 2026-07-01. Bottom tab bar (Map · Schedule · Company);
   dock detail is a bottom sheet; route cards dissolved into the port sheet (fares live
   there now); HUD slimmed to Cash / Day+Time+Season / Net + a two-button speed control
   (pause toggle + 1×/2×/4× cycle — four buttons didn't fit 375px); 44px touch targets;
   safe-area insets; company tab holds ledger/stats/fleet/buy. Perf item done: `updateHud`
   uses cached element refs only — no per-frame document-wide `querySelector`.
4. **Community growth loop ("the heart").** — DONE 2026-07-02. Per-port `pop`/`draw` are
   living state (`PortState.pop/draw`, seeded from the static defs); a weekly tick
   (`src/sim/growth.ts`, fired at each Monday rollover) adjusts them per segment from
   quality = carried-ratio blended with reputation (`CONFIG.growth.repWeight`), with spare
   seat capacity gating the upside — full boats stall growth until capacity is added.
   Clamped to 0.5×–3× of seed. Locked islands stagnate. Town tiers (`CONFIG.townTiers`,
   Outpost→Port City by total pop) scale the map marker; the port sheet shows
   tier · population, a headline weekly trend, and per-segment ▲/▼ badges — per-segment
   growth is the community-identity mechanism (tourist service grows tourist appeal).
   Weekly counters (`segServedWeek`/`segBalkedWeek`/`seatsWeek`) + living pop persist in
   saves (additive fields, old saves still load). A `window.__tideways` debug handle
   (state/panel/advance) was added for devtools-driven verification.
5. **Maintenance / wear / breakdowns.** — DONE 2026-07-02. `Boat.condition` (100→0) wears
   per nm sailed (`CONFIG.maint.wearPerNm`, ~5 pts/day in heavy service); breakdown risk per
   sailing is cubic in missing condition (`src/sim/maintenance.ts`) — Good boats almost never
   fail, neglected ones become a gamble. A scheduled overhaul (`Service` button on the fleet
   row) queues the boat into the yard at its next idle moment: 16h at the home port occupying
   a berth, restores to 100 — the timetable collision IS the mechanic. A breakdown limps the
   boat across at half speed, then 12h dead **in the arrival port's berth** (blocking other
   arrivals — offshore holds), billed at 2× the overhaul rate and patched only to 70.
   Resale + company value now scale with condition (floor 0.4), so running a hull into the
   ground shows up in its price. Yard spend is a new ledger row (`maintToday/Yesterday`).
   New boat phases `maint`/`repair` persist through saves and day rollovers.
   `test/balance.ts` pins `breakdownMaxPerSailing = 0` so the calibration report stays
   deterministic. Deferred to later milestones: vessel age, refits, coarse crew staffing tier.
6. **Schedule generator / service plans + sheets + multi-stop lines.** — DONE 2026-07-02
   (UX brainstormed with the user first; "service plan composer" concept chosen). Shipped as
   one arc because the user pulled 3b (multi-stop) into the plan concept:
   - **Legs, not trips** (the 3b simplification): `Leg {routeId, from, depart, planId?}` is
     one one-way sailing; phases collapsed to idle | atPort | sailing (+ maint/repair).
     Multi-stop loops are just consecutive legs. Manual timeline drags still stamp classic
     round trips (two legs).
   - **Schedule sheets** (`src/sim/sheets.ts`): named complete timetables with dayType
     (any/weekday/weekend) + season selectors — WSF-style. Exactly one sheet runs per day:
     most specific match, ties to newest; sheet 0 = Base (any/any, locked, undeletable).
     An empty matching sheet = deliberate no-service day.
   - **Live service plans** (`src/sim/plans.ts`): `Plan {stops[], headwayMin, window,
     boatIds}`; 2 stops = out-and-back, 3+ = loop (wraps). stampPlan rotates departures
     across boats, skips circuits that collide with other commitments, and reports
     stamped/skipped + projected cost (dry-run mode powers the composer's live summary).
     Edit → re-stamp; unpack → legs stay as plain trips; hand-editing a stamped leg detaches
     it. `planMinHeadway` = slowest boat's circuit / boat count (the composer's physics floor).
   - **Free connections**: routes between two already-docked ports cost nothing now (the
     money gate is docks); the composer auto-connects missing legs as stops are picked, so
     the map draws the loop live. `openRouteCost` removed.
   - **UI**: Schedule tab gained a sheet bar (+ "alt schedule" mini-form: name + two
     dropdowns) and the plan composer bottom card (ordered stop chips, window, headway
     stepper with clamp warning, boat chips, coverage strip of departure ticks vs demand
     curve, live cost/skip summary, Stamp / Unpack / Remove). Plan legs collapse into one
     ⟳ band per lane; tap to edit. Port-sheet route cards gained "Plan service" (opens the
     composer prefilled) and candidates became free "Connect".
   - **Saves**: SAVE_VERSION 2 (sheets/plans/legs); v1 saves migrate (trips → leg pairs on
     Base, mid-crossing boats reset idle once).
   - **Bug-fix pass 2026-07-02** (reopened after playtest): (1) "Start a new company" (and the
     game-over "New game") did nothing — `location.reload()` fires pagehide → autosave, which
     re-persisted the just-cleared company. Fix: `clearSave()` sets a module `autosaveBlocked`
     flag that `saveGame` honours, so no re-save happens during the reload. (2) The composer's
     live summary diverged from what stamping produced: it previewed at the raw headway
     (showing phantom "skipped") while commit silently raised headway to the physical floor —
     so a plan could stamp a totally different count, or (boat already booked) stamp nothing
     and close blank, reading as "my route didn't show up." Fix: the headway floor
     (`planMinHeadway`) is now applied live in the composer (WYSIWYG), the − button clamps to
     it, and a zero-fit stamp keeps the composer open with a clear "no departures fit" message
     instead of closing and leaving a ghost plan.
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

## Live scheduler cost projection (built 2026-07-01, ahead of milestone #4)

User: "I need to be able to realtime see the cost of my routing, not the previous day's
ledger." `projectedDailyCost(boat, routes)` in `src/sim/schedule.ts` walks a boat's
itinerary and sums fuel (`distanceNm × fuelPerNm`) + crew (`crewPerSailing`) × 2 per trip
(out + back), mirroring exactly what `chargeSailing` (`src/sim/ferry.ts`) charges when those
sailings actually run — smoke-tested 1:1 against a live day's `fuelYesterday`/`crewYesterday`.
Rendered as a line under each boat's lane in the Schedule tab (`src/ui/timeline.ts`):
"N trips today · $X fuel · $Y crew · $Z today", recomputed on every `rebuild()` so it updates
instantly as trips are dragged, moved, or deleted. Pure projection — independent of the
clock/demand, doesn't model delays or breakdowns. Confirmed fuel is already leg-distance-based
(not flat) while answering this.

## Activity-based vessel costs (decided 2026-07-01, built with milestone #2)

The flat `dailyCost` per hull made selling the only sane off-season move. Replaced with:
- **`moorageDaily`** — small fixed cost of owning the hull (~20% of the old flat cost)
- **`crewPerSailing`** — charged at every departure (a round trip = 2 sailings), on top of
  per-crossing fuel; wear joins later with the maintenance milestone

At a packed ~24-sailing day the two roughly match the old flat overhead, so full-utilization
balance is preserved. Winter-week check (3 Hiyus): full schedules −$3.1k/day, **half
schedules +$9.1k/day**, sell-one +$0.6k/day — thinning the timetable now beats selling, and
an idle hull costs only moorage. `crewPerSailing` is still a placeholder the real crew
system will replace (min-crew wage floor + staffing tiers).

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
