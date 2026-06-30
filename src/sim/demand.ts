import { CONFIG } from "../config";
import type { GameState, SegmentDef } from "../types";
import { carPriceFactor, footPriceFactor, repFactor } from "./demandResponse";

// Each segment has its own daily curve shape (from its peaks).
export function segCurve(seg: SegmentDef, min: number): number {
  if (min < CONFIG.operatingStart || min > CONFIG.operatingEnd) return 0;
  let v = 0.12; // small baseline
  for (const [c, w, h] of seg.peaks) v += h * Math.exp(-((min - c) ** 2) / (2 * w * w));
  return v;
}

// Normalize each segment's curve so its daily totals are actually delivered.
const SEG_AREA: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const seg of CONFIG.segments) {
    let a = 0;
    for (let m = CONFIG.operatingStart; m <= CONFIG.operatingEnd; m++) a += segCurve(seg, m);
    out[seg.id] = a;
  }
  return out;
})();

/** Add newly-arrived demand to every route's per-segment queues. */
export function accrueDemand(state: GameState, dtMin: number): void {
  for (const id in state.routes) {
    const R = state.routes[id];
    if (!R.slips.length) continue; // locked islands generate no demand until built
    for (const seg of CONFIG.segments) {
      const rf = repFactor(R.segDemandRep[seg.id]); // this segment's own standing
      const w = segCurve(seg, state.clock) / SEG_AREA[seg.id];
      if (w <= 0) continue;
      const base = R.def.demand[seg.id];
      if (!base) continue;
      const foot = base.foot * w * dtMin * rf * footPriceFactor(R, seg);
      const car = base.car * w * dtMin * rf * carPriceFactor(R, seg);
      R.out[seg.id].foot += foot / 2;
      R.in[seg.id].foot += foot / 2;
      R.out[seg.id].car += car / 2;
      R.in[seg.id].car += car / 2;
    }
  }
}
