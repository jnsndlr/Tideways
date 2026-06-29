import { CONFIG } from "../config";
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
        R.rep -= lost * CONFIG.repBalkLoss;
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
      R.rep += (CONFIG.repNeutral - R.rep) * CONFIG.repDriftToNeutral;
      R.rep = Math.max(0, Math.min(100, R.rep));
      R.demandRep = R.rep;
      R.balkedYesterday = R.balkedToday;
      R.servedToday = 0;
      R.balkedToday = 0;
      R.sailingsToday = 0;
    }
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
    R.rep = Math.max(0, Math.min(100, R.rep));
    sum += R.rep;
    n++;
  }
  state.rep = n ? sum / n : CONFIG.repNeutral;
}

/** Advance by a real-time delta with sub-stepping for stability. */
export function advance(state: GameState, dtMin: number): void {
  if (dtMin <= 0) return;
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
