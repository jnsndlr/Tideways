# Tideways — Working Design Notes

Companion to [Ferry-Game-GDD.md](Ferry-Game-GDD.md) (the canonical vision). This file
tracks how the prototype maps to the GDD and records design decisions as we make them.
Check implementation against the GDD; check *sequencing* against this file.

_Last updated: 2026-06-29_

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
