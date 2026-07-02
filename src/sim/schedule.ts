import { CONFIG, vesselById } from "../config";
import type { Boat, RouteState, Trip } from "../types";

/** Effective one-way crossing time for a vessel on a route. */
export function crossingFor(R: RouteState, classId: string): number {
  return R.def.crossingMin / vesselById(classId).speedFactor;
}

/** Round-trip duration (hub -> dest -> hub incl. both dwells) for a boat. */
export function tripDuration(R: RouteState, classId: string): number {
  return crossingFor(R, classId) * 2 + CONFIG.loadMinutes * 2;
}

/** Duration of a specific itinerary trip for a given boat. */
export function tripDurationFor(
  boat: Boat,
  trip: Trip,
  routes: Record<string, RouteState>,
): number {
  return tripDuration(routes[trip.routeId], boat.classId);
}

/** Does placing [start, start+dur) on this boat overlap an existing trip? */
export function hasOverlap(
  boat: Boat,
  start: number,
  dur: number,
  routes: Record<string, RouteState>,
  ignoreTripId?: number,
): boolean {
  const end = start + dur;
  for (const t of boat.itinerary) {
    if (t.id === ignoreTripId) continue;
    const tStart = t.depart;
    const tEnd = t.depart + tripDurationFor(boat, t, routes);
    if (start < tEnd && tStart < end) return true;
  }
  return false;
}

/** Earliest free departure slot for a route on this boat, or null if none fits. */
export function earliestFreeSlot(
  boat: Boat,
  routeId: string,
  routes: Record<string, RouteState>,
): number | null {
  const dur = tripDuration(routes[routeId], boat.classId);
  const snap = CONFIG.scheduleSnapMin;
  for (let t = CONFIG.operatingStart; t + dur <= CONFIG.operatingEnd; t += snap) {
    if (!hasOverlap(boat, t, dur, routes)) return t;
  }
  return null;
}

/** Projected fuel + crew cost of a boat's itinerary AS SCHEDULED (not yet run) —
 *  the live readout on the Schedule tab. Each itinerary entry is a round trip,
 *  i.e. two sailings on the route (out + back), matching chargeSailing in
 *  ferry.ts. Pure projection: independent of the clock, demand, or whether the
 *  boat actually departs on time — it answers "what will today cost if this
 *  timetable runs as drawn." */
export function projectedDailyCost(
  boat: Boat,
  routes: Record<string, RouteState>,
): { fuel: number; crew: number } {
  const vc = vesselById(boat.classId);
  let fuel = 0;
  let crew = 0;
  for (const trip of boat.itinerary) {
    const R = routes[trip.routeId];
    if (!R) continue; // route removed since the trip was scheduled
    fuel += 2 * R.def.distanceNm * vc.fuelPerNm;
    crew += 2 * vc.crewPerSailing;
  }
  return { fuel, crew };
}
