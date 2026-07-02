import { CONFIG, vesselById } from "../config";
import type { Leg, RouteState } from "../types";

/** Effective one-way crossing time for a vessel on a route. */
export function crossingFor(R: RouteState, classId: string): number {
  return R.def.crossingMin / vesselById(classId).speedFactor;
}

/** Duration one leg occupies the boat: dwell/loading + the crossing. */
export function legDuration(R: RouteState, classId: string): number {
  return CONFIG.loadMinutes + crossingFor(R, classId);
}

/** Does placing a leg [start, start+dur) overlap any of these legs? */
export function hasOverlap(
  legs: Leg[],
  start: number,
  dur: number,
  routes: Record<string, RouteState>,
  classId: string,
  ignoreLegId?: number,
): boolean {
  const end = start + dur;
  for (const l of legs) {
    if (l.id === ignoreLegId) continue;
    const R = routes[l.routeId];
    if (!R) continue;
    const lEnd = l.depart + legDuration(R, classId);
    if (start < lEnd && l.depart < end) return true;
  }
  return false;
}

/** Earliest slot where a ROUND TRIP (out + back legs) fits, or null. */
export function earliestFreeSlot(
  legs: Leg[],
  routeId: string,
  classId: string,
  routes: Record<string, RouteState>,
): number | null {
  const dur = 2 * legDuration(routes[routeId], classId);
  const snap = CONFIG.scheduleSnapMin;
  for (let t = CONFIG.operatingStart; t + dur <= CONFIG.operatingEnd; t += snap) {
    if (!hasOverlap(legs, t, dur, routes, classId)) return t;
  }
  return null;
}

/** Projected fuel + crew cost of a timetable AS SCHEDULED (not yet run) — the
 *  live readout on the Schedule tab. One sailing per leg, matching
 *  chargeSailing in ferry.ts. Pure projection: independent of the clock,
 *  demand, or whether the boat actually departs on time. */
export function projectedDailyCost(
  legs: Leg[],
  classId: string,
  routes: Record<string, RouteState>,
): { fuel: number; crew: number } {
  const vc = vesselById(classId);
  let fuel = 0;
  let crew = 0;
  for (const l of legs) {
    const R = routes[l.routeId];
    if (!R) continue; // route removed since the leg was scheduled
    fuel += R.def.distanceNm * vc.fuelPerNm;
    crew += vc.crewPerSailing;
  }
  return { fuel, crew };
}
