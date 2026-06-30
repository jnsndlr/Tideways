import { CONFIG, vesselById } from "../config";
import type { GameState, RouteState, SegmentDef } from "../types";
import { accrueDemand } from "./demand";
import { stepBoat } from "./ferry";

/** Per-segment balking: once a queue waits past that segment's patience,
 *  a trickle gives up and the dock's reputation sours. */
function updateRouteQueues(state: GameState, R: RouteState, dtMin: number): void {
  for (const dir of [R.out, R.in]) {
    for (const seg of CONFIG.segments) {
      const q = dir[seg.id];
      const people = q.foot + q.car * CONFIG.avgOccupancy;
      if (people > 0.5) q.wait += dtMin;
      else {
        q.wait = 0;
        continue;
      }
      if (q.wait > seg.patienceMin) {
        const r = CONFIG.balkRatePerMin * dtMin;
        const bFoot = q.foot * r;
        const bCar = q.car * r;
        q.foot -= bFoot;
        q.car -= bCar;
        const lost = bFoot + bCar * CONFIG.avgOccupancy;
        R.balkedToday += lost;
        // stranding this segment sours *its* reputation specifically
        R.segRep[seg.id] -= lost * CONFIG.repBalkLoss;
      }
    }
  }
}

/** Advance the whole simulation by dtMin in-game minutes (headless-safe). */
export function step(state: GameState, dtMin: number): void {
  state.clock += dtMin;
  if (state.clock >= 1440) {
    state.clock -= 1440;
    state.day++;
    for (const id in state.routes) {
      const R = state.routes[id];
      for (const seg of CONFIG.segments) {
        const sr = R.segRep[seg.id];
        const drift = sr > CONFIG.repNeutral ? CONFIG.repDriftDown : CONFIG.repDriftUp;
        const next = sr + (CONFIG.repNeutral - sr) * drift;
        R.segRep[seg.id] = Math.max(0, Math.min(100, next));
        R.segDemandRep[seg.id] = R.segRep[seg.id]; // yesterday's service shapes today
      }
      R.balkedYesterday = R.balkedToday;
      R.servedToday = 0;
      R.balkedToday = 0;
      R.sailingsToday = 0;
    }

    // fleet upkeep: every hull costs its daily overhead, sailing or idle
    let upkeep = 0;
    for (const b of state.boats) upkeep += vesselById(b.classId).dailyCost;
    state.cash -= upkeep;

    // solvency: run in the red too long and the company folds
    state.daysInDebt = state.cash < 0 ? state.daysInDebt + 1 : 0;
    if (state.daysInDebt > CONFIG.economy.bankruptcyGraceDays) state.gameOver = true;

    // new day: every boat restarts its daily itinerary
    for (const b of state.boats) {
      b.nextTripIdx = 0;
      if (b.phase !== "out" && b.phase !== "back" && b.phase !== "dest") {
        b.phase = "idle";
        b.routeId = null;
      }
    }
  }

  accrueDemand(state, dtMin);
  for (const id in state.routes) updateRouteQueues(state, state.routes[id], dtMin);
  for (const boat of state.boats) stepBoat(state, boat, dtMin);

  let sum = 0;
  let n = 0;
  for (const id in state.routes) {
    const R = state.routes[id];
    // clamp each segment and derive the route-average rep for display
    let rSum = 0;
    for (const seg of CONFIG.segments) {
      R.segRep[seg.id] = Math.max(0, Math.min(100, R.segRep[seg.id]));
      rSum += R.segRep[seg.id];
    }
    R.rep = rSum / CONFIG.segments.length;
    R.demandRep =
      CONFIG.segments.reduce((a, seg) => a + R.segDemandRep[seg.id], 0) /
      CONFIG.segments.length;
    if (!R.slips.length) continue; // locked islands don't count toward fleet rep
    sum += R.rep;
    n++;
  }
  state.rep = n ? sum / n : CONFIG.repNeutral;

  // company value (HUD score): cash + resale value of the fleet
  let resale = 0;
  for (const b of state.boats) resale += vesselById(b.classId).cost * CONFIG.economy.resaleFactor;
  state.companyValue = state.cash + resale;
}

/** Advance by a real-time delta with sub-stepping for stability. */
export function advance(state: GameState, dtMin: number): void {
  if (dtMin <= 0 || state.gameOver) return;
  const steps = Math.max(1, Math.ceil(dtMin / 5));
  for (let i = 0; i < steps; i++) step(state, dtMin / steps);
}

// queue helpers used by the UI
export function waitingPeople(R: RouteState, segId?: string): number {
  let p = 0;
  for (const dir of [R.out, R.in]) {
    for (const seg of CONFIG.segments) {
      if (segId && seg.id !== segId) continue;
      p += dir[seg.id].foot + dir[seg.id].car * CONFIG.avgOccupancy;
    }
  }
  return p;
}

export function estDailyPeople(R: RouteState, segId?: string): number {
  let p = 0;
  for (const seg of CONFIG.segments) {
    if (segId && seg.id !== segId) continue;
    const d = R.def.demand[seg.id];
    if (d) p += d.foot + d.car * CONFIG.avgOccupancy;
  }
  return p;
}

export function segWaiting(R: RouteState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seg of CONFIG.segments) out[seg.id] = waitingPeople(R, seg.id);
  return out;
}

export type { SegmentDef };
