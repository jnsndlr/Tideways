import { CONFIG } from "../config";
import type { GameState, Queue, RouteState } from "../types";
import { accrueDemand } from "./demand";
import { stepBoat } from "./ferry";

/** Balking: once a queue waits past patience, a slow trickle gives up. */
function updateQueue(state: GameState, q: Queue, R: RouteState, dtMin: number): void {
  if (q.foot > 0.5) q.footWait += dtMin;
  else q.footWait = 0;
  if (q.car > 0.5) q.carWait += dtMin;
  else q.carWait = 0;

  if (q.footWait > CONFIG.patienceMin && q.foot > 0) {
    const b = Math.min(q.foot, q.foot * CONFIG.balkRatePerMin * dtMin);
    q.foot -= b;
    R.balkedToday += b;
    state.rep -= b * CONFIG.repBalkLoss;
  }
  if (q.carWait > CONFIG.patienceMin && q.car > 0) {
    const b = Math.min(q.car, q.car * CONFIG.balkRatePerMin * dtMin);
    q.car -= b;
    const people = b * CONFIG.ferry.avgOccupancy;
    R.balkedToday += people;
    state.rep -= people * CONFIG.repBalkLoss;
  }
}

/**
 * Advance the whole simulation by dtMin in-game minutes.
 * Pure with respect to I/O: mutates only the passed GameState, no DOM/canvas.
 */
export function step(state: GameState, dtMin: number): void {
  // advance clock / handle day rollover
  state.clock += dtMin;
  if (state.clock >= 1440) {
    state.clock -= 1440;
    state.day++;
    for (const id in state.routes) {
      state.routes[id].servedToday = 0;
      state.routes[id].balkedToday = 0;
    }
    // gentle drift toward neutral reputation
    state.rep += (CONFIG.repNeutral - state.rep) * CONFIG.repDriftToNeutral;
  }

  accrueDemand(state, dtMin);
  for (const id in state.routes) {
    const R = state.routes[id];
    updateQueue(state, R.out, R, dtMin);
    updateQueue(state, R.in, R, dtMin);
  }

  for (const boat of state.boats) stepBoat(state, boat, dtMin);

  state.rep = Math.max(0, Math.min(100, state.rep));
}

/**
 * Advance by a real-time delta, sub-stepping for numerical stability at high
 * speed. Returns nothing; mutates state.
 */
export function advance(state: GameState, dtMin: number): void {
  if (dtMin <= 0) return;
  const steps = Math.max(1, Math.ceil(dtMin / 5));
  for (let i = 0; i < steps; i++) step(state, dtMin / steps);
}
