import { CONFIG } from "../config";
import type { GameState } from "../types";

// Daily demand curve: morning + evening commute peaks plus a midday tourist
// bump. Returns an unnormalized weight for a given in-game minute.
export function dayCurve(min: number): number {
  if (min < CONFIG.operatingStart || min > CONFIG.operatingEnd) return 0;
  const peak = (c: number, w: number, h: number) =>
    h * Math.exp(-((min - c) ** 2) / (2 * w * w));
  const base = 0.2;
  return (
    base +
    peak(8 * 60, 60, 2.4) + // morning commute
    peak(17 * 60, 80, 2.0) + // evening commute
    peak(13 * 60, 120, 0.7) // midday tourist bump
  );
}

// Area under the curve across the operating window, so dailyFoot/dailyCars are
// actually delivered over the day. Computed once.
const CURVE_AREA = (() => {
  let area = 0;
  for (let m = CONFIG.operatingStart; m <= CONFIG.operatingEnd; m++) {
    area += dayCurve(m);
  }
  return area;
})();

/** Add newly-arrived demand to every route's queues for a time slice. */
export function accrueDemand(state: GameState, dtMin: number): void {
  const w = dayCurve(state.clock) / CURVE_AREA; // fraction of daily total / min
  if (w <= 0) return;
  for (const id in state.routes) {
    const R = state.routes[id];
    const foot = R.def.dailyFoot * w * dtMin;
    const car = R.def.dailyCars * w * dtMin;
    // split evenly between the two directions
    R.out.foot += foot / 2;
    R.in.foot += foot / 2;
    R.out.car += car / 2;
    R.in.car += car / 2;
  }
}
