import { CONFIG } from "../config";
import type { GameState, PortState } from "../types";

// Community growth loop — the weekly tick that turns service quality into
// living pop/draw. Well-served communities grow, neglected ones shrink, and
// growth stalls when the boats leaving a port are already full (no headroom
// for newcomers). Per-segment growth doubles as the identity mechanism:
// serving tourists well grows a town's tourist appeal, not its freight base.

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Total living population of a port across all segments. */
export function portPopulation(P: PortState): number {
  return CONFIG.segments.reduce((a, seg) => a + (P.pop[seg.id] ?? 0), 0);
}

export interface TownTier {
  rank: number; // index into CONFIG.townTiers (0 = smallest)
  name: string;
}

/** The town-size tier a total population falls into. */
export function townTier(totalPop: number): TownTier {
  const tiers = CONFIG.townTiers;
  let rank = 0;
  for (let i = 0; i < tiers.length; i++) if (totalPop >= tiers[i].minPop) rank = i;
  return { rank, name: tiers[rank].name };
}

/**
 * Apply one weekly growth tick from the week's accumulated counters, then
 * reset them. Docked ports adjust pop/draw per segment; locked ports stagnate
 * (they hold their seeded values until the player connects them).
 */
export function weeklyGrowthTick(state: GameState): void {
  const gw = CONFIG.growth;
  for (const id in state.ports) {
    const P = state.ports[id];
    if (P.slips.length) {
      // headroom: the share of offered seats that left empty this week —
      // positive growth needs room to move in; shrinkage doesn't
      let carriedTotal = 0;
      for (const seg of CONFIG.segments) carriedTotal += P.segServedWeek[seg.id];
      const room = P.seatsWeek > 0 ? clamp(1 - carriedTotal / P.seatsWeek, 0, 1) : 0;

      for (const seg of CONFIG.segments) {
        const served = P.segServedWeek[seg.id];
        const balked = P.segBalkedWeek[seg.id];
        const seen = served + balked;
        let g = 0;
        if (seen > 1) {
          const carried = served / seen;
          const carriedScore = clamp(
            (carried - gw.carriedTarget) / (1 - gw.carriedTarget), -1, 1);
          const repScore = clamp(
            (P.segRep[seg.id] - CONFIG.repNeutral) / (100 - CONFIG.repNeutral), -1, 1);
          const quality = (1 - gw.repWeight) * carriedScore + gw.repWeight * repScore;
          g = quality >= 0 ? quality * gw.maxWeeklyGrowth * room : quality * gw.maxWeeklyShrink;
        }
        P.segGrowth[seg.id] = g;
        const seedPop = P.def.pop[seg.id] ?? 0;
        const seedDraw = P.def.draw[seg.id] ?? 0;
        P.pop[seg.id] = clamp(P.pop[seg.id] * (1 + g), seedPop * gw.minFactor, seedPop * gw.maxFactor);
        P.draw[seg.id] = clamp(P.draw[seg.id] * (1 + g), seedDraw * gw.minFactor, seedDraw * gw.maxFactor);
      }
    }
    for (const seg of CONFIG.segments) {
      P.segServedWeek[seg.id] = 0;
      P.segBalkedWeek[seg.id] = 0;
    }
    P.seatsWeek = 0;
  }
}
