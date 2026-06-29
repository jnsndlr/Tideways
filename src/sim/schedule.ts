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
