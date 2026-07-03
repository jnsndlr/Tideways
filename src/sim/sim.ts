import { CONFIG, vesselById } from "../config";
import type { GameState, PortState, SegmentDef } from "../types";
import { weekdayIndex } from "./calendar";
import { accrueDemand } from "./demand";
import { otherEnd, stepBoat } from "./ferry";
import { weeklyGrowthTick } from "./growth";
import { getRouting, type Routing } from "./routing";
import { todaysLegs } from "./sheets";
import { sellPrice } from "./state";

/** Ports a scheduled sailing will still depart FROM today, mapped to the ports
 *  those sailings head TO. Riders whose next hop still has a departure coming
 *  hold out patiently; only queues the timetable has abandoned may balk before
 *  a boat has come. Empty map once the operating day is over. */
function remainingDepartures(state: GameState): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (state.clock >= CONFIG.operatingEnd) return map;
  for (const boat of state.boats) {
    const legs = todaysLegs(state, boat);
    // a sailing boat's current leg has already departed; anything else at
    // legIdx (loading, or idle waiting on its slot) is still to come
    const start = boat.legIdx + (boat.phase === "sailing" ? 1 : 0);
    for (let i = start; i < legs.length; i++) {
      const R = state.routes[legs[i].routeId];
      if (!R) continue;
      let set = map.get(legs[i].from);
      if (!set) map.set(legs[i].from, (set = new Set()));
      set.add(otherEnd(R, legs[i].from));
    }
  }
  return map;
}

/** Per-segment balking. Riders never give up while a departure they can use is
 *  still scheduled today AND no boat has left them behind yet. Once a sailing
 *  comes and goes without them (q.missed, set in boardAt) — or the timetable
 *  simply has nothing left for them today — their patience clock counts, and
 *  past the segment's patienceMin a trickle walks away and reputation sours. */
function updatePortQueues(
  state: GameState,
  P: PortState,
  dtMin: number,
  departs: Map<string, Set<string>>,
  routing: Routing,
): void {
  for (const dest in P.queues) {
    for (const seg of CONFIG.segments) {
      const q = P.queues[dest][seg.id];
      if (!q) continue;
      const people = q.foot + q.car * CONFIG.avgOccupancy;
      if (people > 0.5) q.wait += dtMin;
      else {
        q.wait = 0;
        q.missed = false;
        continue;
      }
      if (q.wait <= seg.patienceMin) continue;
      if (!q.missed) {
        // no boat has failed them yet — they hold as long as a departure
        // toward their next hop is still on today's timetable
        const hop = routing.nextHop(P.def.id, dest);
        if (hop && departs.get(P.def.id)?.has(hop)) continue;
      }
      const r = CONFIG.balkRatePerMin * dtMin;
      const bFoot = q.foot * r;
      const bCar = q.car * r;
      q.foot -= bFoot;
      q.car -= bCar;
      const lost = bFoot + bCar * CONFIG.avgOccupancy;
      P.balkedToday += lost;
      P.segBalkedWeek[seg.id] += lost;
      P.segRep[seg.id] -= lost * CONFIG.repBalkLoss;
    }
  }
}

/** Advance the whole simulation by dtMin in-game minutes (headless-safe). */
export function step(state: GameState, dtMin: number): void {
  state.clock += dtMin;
  if (state.clock >= 1440) {
    state.clock -= 1440;
    state.day++;
    // rolling into a Monday closes the week: communities grow or shrink on
    // how well the past week served them
    if (weekdayIndex(state.day) === 0) weeklyGrowthTick(state);
    for (const id in state.ports) {
      const P = state.ports[id];
      for (const seg of CONFIG.segments) {
        const sr = P.segRep[seg.id];
        const drift = sr > CONFIG.repNeutral ? CONFIG.repDriftDown : CONFIG.repDriftUp;
        const next = sr + (CONFIG.repNeutral - sr) * drift;
        P.segRep[seg.id] = Math.max(0, Math.min(100, next));
        P.segDemandRep[seg.id] = P.segRep[seg.id]; // yesterday's service shapes today
      }
      P.balkedYesterday = P.balkedToday;
      P.servedYesterday = P.servedToday;
      P.servedToday = 0;
      P.balkedToday = 0;
    }
    for (const id in state.routes) {
      state.routes[id].sailingsYesterday = state.routes[id].sailingsToday;
      state.routes[id].sailingsToday = 0;
    }
    state.fuelYesterday = state.fuelToday;
    state.crewYesterday = state.crewToday;
    state.maintYesterday = state.maintToday;
    state.revenueYesterday = state.revenueToday;
    state.fuelToday = 0;
    state.crewToday = 0;
    state.maintToday = 0;
    state.revenueToday = 0;

    // moorage: the small fixed cost of owning each hull (idle boats are cheap
    // to keep — the real money goes out per sailing: crew + fuel)
    let moorage = 0;
    for (const b of state.boats) moorage += vesselById(b.classId).moorageDaily;
    state.cash -= moorage;

    // solvency: run in the red too long and the company folds
    state.daysInDebt = state.cash < 0 ? state.daysInDebt + 1 : 0;
    if (state.daysInDebt > CONFIG.economy.bankruptcyGraceDays) state.gameOver = true;

    // new day: every boat restarts the day's legs — possibly from a different
    // sheet now (weekend/season change). Yard stays and live crossings carry over.
    for (const b of state.boats) {
      b.legIdx = 0;
      if (b.phase !== "sailing" && b.phase !== "maint" && b.phase !== "repair") {
        b.phase = "idle";
        b.routeId = null;
        b.sailFrom = null;
        b.atPort = null;
      }
    }
  }

  accrueDemand(state, dtMin);
  const departs = remainingDepartures(state);
  const routing = getRouting(state);
  for (const id in state.ports) updatePortQueues(state, state.ports[id], dtMin, departs, routing);
  for (const boat of state.boats) stepBoat(state, boat, dtMin);

  let sum = 0;
  let n = 0;
  for (const id in state.ports) {
    const P = state.ports[id];
    // clamp each segment and derive the port-average rep for display
    let rSum = 0;
    for (const seg of CONFIG.segments) {
      P.segRep[seg.id] = Math.max(0, Math.min(100, P.segRep[seg.id]));
      rSum += P.segRep[seg.id];
    }
    P.rep = rSum / CONFIG.segments.length;
    P.demandRep =
      CONFIG.segments.reduce((a, seg) => a + P.segDemandRep[seg.id], 0) /
      CONFIG.segments.length;
    if (!P.slips.length) continue; // locked ports don't count toward fleet rep
    sum += P.rep;
    n++;
  }
  state.rep = n ? sum / n : CONFIG.repNeutral;

  // company value (HUD score): cash + condition-scaled resale value of the fleet
  let resale = 0;
  for (const b of state.boats) resale += sellPrice(b);
  state.companyValue = state.cash + resale;
}

/** Advance by a real-time delta with sub-stepping for stability. */
export function advance(state: GameState, dtMin: number): void {
  if (dtMin <= 0 || state.gameOver) return;
  const steps = Math.max(1, Math.ceil(dtMin / 5));
  for (let i = 0; i < steps; i++) step(state, dtMin / steps);
}

// ---- queue helpers used by the UI -----------------------------------------

/** People waiting at a port (optionally filtered to one segment), across all
 *  destinations. */
export function waitingPeople(P: PortState, segId?: string): number {
  let p = 0;
  for (const dest in P.queues)
    for (const seg of CONFIG.segments) {
      if (segId && seg.id !== segId) continue;
      const q = P.queues[dest][seg.id];
      if (q) p += q.foot + q.car * CONFIG.avgOccupancy;
    }
  return p;
}

/** People waiting at a port bound for a specific destination. */
export function waitingFor(P: PortState, destId: string, segId?: string): number {
  const dq = P.queues[destId];
  if (!dq) return 0;
  let p = 0;
  for (const seg of CONFIG.segments) {
    if (segId && seg.id !== segId) continue;
    const q = dq[seg.id];
    if (q) p += q.foot + q.car * CONFIG.avgOccupancy;
  }
  return p;
}

export function segWaiting(P: PortState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seg of CONFIG.segments) out[seg.id] = waitingPeople(P, seg.id);
  return out;
}

export type { SegmentDef };
