import { CONFIG, nmBetween } from "../config";
import type { GameState, RouteState, SegmentDef } from "../types";
import { demandDayFactor } from "./calendar";
import { carPriceFactor, footPriceFactor, repFactor } from "./demandResponse";
import { getRouting } from "./routing";

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

/** The route connecting two adjacent ports (either direction), or null. */
export function routeBetween(state: GameState, a: string, b: string): RouteState | null {
  for (const id in state.routes) {
    const r = state.routes[id].def;
    if ((r.from === a && r.to === b) || (r.from === b && r.to === a)) return state.routes[id];
  }
  return null;
}

interface PairWeight {
  from: string;
  to: string;
  w: number;
}

/** Daily trip total for a segment = per-resident rate × docked island population.
 *  Excludes the hub so opening an island grows the pie instead of splitting it. */
export function segDailyVolume(state: GameState, segId: string): number {
  let islandPop = 0;
  for (const id in state.ports) {
    const P = state.ports[id];
    if (P.def.isHub || !P.slips.length) continue;
    islandPop += P.pop[segId] ?? 0;
  }
  return (CONFIG.od.tripsPerResident[segId] ?? 0) * islandPop;
}

/** Static gravity weights for every reachable docked O/D pair, per segment. */
function pairWeights(state: GameState, seg: SegmentDef): { pairs: PairWeight[]; sum: number } {
  const routing = getRouting(state);
  const docked = Object.keys(state.ports).filter((id) => state.ports[id].slips.length);
  const pairs: PairWeight[] = [];
  let sum = 0;
  for (const a of docked) {
    const popA = state.ports[a].pop[seg.id] ?? 0;
    if (popA <= 0) continue;
    for (const b of docked) {
      if (a === b) continue;
      const drawB = state.ports[b].draw[seg.id] ?? 0;
      if (drawB <= 0) continue;
      if (!routing.reachable(a, b)) continue; // no path -> no latent demand surfaced in v1
      const nm = nmBetween(state.ports[a].def.pos, state.ports[b].def.pos);
      const w = popA * drawB * Math.exp(-nm / CONFIG.od.decayScaleNm);
      if (w <= 0) continue;
      pairs.push({ from: a, to: b, w });
      sum += w;
    }
  }
  return { pairs, sum };
}

/** Add newly-arrived demand to every origin port's per-destination queues. */
export function accrueDemand(state: GameState, dtMin: number): void {
  const routing = getRouting(state);
  for (const seg of CONFIG.segments) {
    const { pairs, sum } = pairWeights(state, seg);
    if (sum <= 0) continue;
    const curve = segCurve(seg, state.clock) / SEG_AREA[seg.id];
    if (curve <= 0) continue;
    // calendar rhythm: weekday/weekend and season scale today's volume
    const volume = segDailyVolume(state, seg.id) * demandDayFactor(seg, state.day);
    for (const { from, to, w } of pairs) {
      const O = state.ports[from];
      // people wanting this trip in this slice, before mode split / response
      let people = volume * (w / sum) * curve * dtMin * repFactor(O.segDemandRep[seg.id]);
      if (people <= 0) continue;
      // price elasticity applies to the first leg they'd board
      const hop = routing.nextHop(from, to);
      const leg = hop ? routeBetween(state, from, hop) : null;
      const footP = leg ? footPriceFactor(leg, seg) : 1;
      const carP = leg ? carPriceFactor(leg, seg) : 1;
      const car = people * seg.carShare * carP;
      const foot = people * (1 - seg.carShare) * footP;
      const q = (O.queues[to] ??= {});
      const sq = (q[seg.id] ??= { foot: 0, car: 0, wait: 0 });
      sq.foot += foot;
      sq.car += car / CONFIG.avgOccupancy; // store car COUNT, not people
    }
  }
}

export interface ODEntry {
  from: string;
  to: string;
  seg: string;
  people: number; // full-day potential (response-neutral: no rep / price modifier)
}

/** Structural daily O/D matrix — the demand the network would generate at
 *  neutral turnout. Used by the balance report; the day-curve integrates to 1,
 *  so a pair's full-day people is just volume × (weight / Σweight). */
export function dailyODByPair(state: GameState): ODEntry[] {
  const out: ODEntry[] = [];
  for (const seg of CONFIG.segments) {
    const { pairs, sum } = pairWeights(state, seg);
    if (sum <= 0) continue;
    const volume = segDailyVolume(state, seg.id);
    for (const { from, to, w } of pairs) {
      out.push({ from, to, seg: seg.id, people: (volume * w) / sum });
    }
  }
  return out;
}
