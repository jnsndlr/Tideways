import { CONFIG } from "../config";
import type { Boat, GameState, Leg, Plan, Sheet } from "../types";
import { routeBetween } from "./demand";
import { fuelPricePerNm } from "./fuel";
import { crossingFor, hasOverlap, legDuration } from "./schedule";
import { crewCostPerSailing } from "./staffing";
import { addLeg, openRoute } from "./state";

// Service plans — the live objects behind generated timetables. A plan is an
// ordered stop list (2 stops = out-and-back, 3+ = loop that wraps), a window,
// a headway, and assigned boats. stampPlan turns it into legs; the plan stays
// editable and re-stampable. Hand-editing a stamped leg detaches it.

/** Consecutive stop pairs of a plan, wrapping at the end (the closing leg of a
 *  loop is just another pair; a 2-stop plan yields A->B, B->A). */
export function planPairs(plan: Plan): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < plan.stops.length; i++) {
    out.push([plan.stops[i], plan.stops[(i + 1) % plan.stops.length]]);
  }
  return out;
}

/** Make sure every leg of the stop list has a route, creating free ones as
 *  needed. Returns false if any stop pair can't be connected (undocked port). */
export function ensurePlanRoutes(state: GameState, stops: string[]): boolean {
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i];
    const b = stops[(i + 1) % stops.length];
    if (a === b) return false;
    if (!routeBetween(state, a, b) && !openRoute(state, a, b)) return false;
  }
  return true;
}

/** Minutes one full circuit takes a vessel class (every leg: dwell + crossing). */
export function planCycleMin(state: GameState, plan: Plan, classId: string): number {
  let total = 0;
  for (const [a, b] of planPairs(plan)) {
    const R = routeBetween(state, a, b);
    if (!R) return Infinity;
    total += legDuration(R, classId);
  }
  return total;
}

/** Slowest assigned vessel's circuit time — the physical floor on headway
 *  given the fleet: headway >= cycle / boats. */
export function planMinHeadway(state: GameState, plan: Plan): number {
  if (!plan.boatIds.length) return Infinity;
  let slowest = 0;
  for (const id of plan.boatIds) {
    const boat = state.boats.find((b) => b.id === id);
    if (!boat) continue;
    slowest = Math.max(slowest, planCycleMin(state, plan, boat.classId));
  }
  if (slowest === 0) return Infinity;
  const snap = CONFIG.scheduleSnapMin;
  return Math.ceil(slowest / plan.boatIds.length / snap) * snap;
}

export interface StampResult {
  stamped: number; // departures (full circuits) written
  skipped: number; // departures that didn't fit around existing commitments
  legs: number; // total legs written
  fuel: number; // projected daily fuel $ of the stamped legs
  crew: number; // projected daily crew $ of the stamped legs
}

/** The legs one circuit departing at `t` would stamp for this boat. */
function circuitLegs(
  state: GameState,
  plan: Plan,
  classId: string,
  t: number,
): { routeId: string; from: string; depart: number }[] | null {
  const out: { routeId: string; from: string; depart: number }[] = [];
  let clock = t;
  for (const [a, b] of planPairs(plan)) {
    const R = routeBetween(state, a, b);
    if (!R) return null;
    out.push({ routeId: R.def.id, from: a, depart: clock });
    clock += CONFIG.loadMinutes + Math.ceil(crossingFor(R, classId));
  }
  return out;
}

/**
 * (Re)generate a plan's legs on a sheet. Existing legs owned by the plan are
 * cleared first; departures leave stop[0] every headway across the window,
 * rotating through the assigned boats. A departure whose circuit would overlap
 * that boat's OTHER commitments (manual legs or other plans) is skipped and
 * counted. With dryRun, nothing is written — used for live projections.
 */
export function stampPlan(
  state: GameState,
  sheet: Sheet,
  plan: Plan,
  dryRun = false,
): StampResult {
  const result: StampResult = { stamped: 0, skipped: 0, legs: 0, fuel: 0, crew: 0 };
  const boats = plan.boatIds
    .map((id) => state.boats.find((b) => b.id === id))
    .filter((b): b is Boat => !!b);
  if (!boats.length || plan.stops.length < 2) return result;

  // work against a copy of each boat's foreign legs (dry runs must not mutate)
  const lanes = new Map<number, Leg[]>();
  for (const b of boats) {
    lanes.set(b.id, (sheet.legs[b.id] ?? []).filter((l) => l.planId !== plan.id));
  }
  if (!dryRun) {
    for (const b of boats) sheet.legs[b.id] = [...lanes.get(b.id)!];
  }

  let i = 0;
  for (let t = plan.winStart; t <= plan.winEnd; t += plan.headwayMin, i++) {
    const boat = boats[i % boats.length];
    const legs = circuitLegs(state, plan, boat.classId, t);
    const lane = lanes.get(boat.id)!;
    let fits = legs !== null;
    if (legs) {
      const lastEnd = legs[legs.length - 1];
      const R = state.routes[lastEnd.routeId];
      fits =
        lastEnd.depart + legDuration(R, boat.classId) <= CONFIG.operatingEnd &&
        legs.every((l) =>
          !hasOverlap(lane, l.depart, legDuration(state.routes[l.routeId], boat.classId), state.routes, boat.classId),
        );
    }
    if (!fits || !legs) {
      result.skipped++;
      continue;
    }
    for (const l of legs) {
      lane.push({ id: -1, routeId: l.routeId, from: l.from, depart: l.depart, planId: plan.id });
      lane.sort((a, b) => a.depart - b.depart);
      if (!dryRun) addLeg(state, sheet, boat.id, l.routeId, l.from, l.depart, plan.id);
      result.legs++;
      result.fuel += state.routes[l.routeId].def.distanceNm * fuelPricePerNm(boat.classId, boat.fuelGrade);
      result.crew += crewCostPerSailing(boat);
    }
    result.stamped++;
  }
  return result;
}

/** Create a plan on a sheet and stamp it. Returns null if stops can't connect. */
export function createPlan(
  state: GameState,
  sheet: Sheet,
  draft: Omit<Plan, "id">,
): { plan: Plan; result: StampResult } | null {
  if (draft.stops.length < 2) return null;
  if (!ensurePlanRoutes(state, draft.stops)) return null;
  state.planCounter++;
  const plan: Plan = { ...draft, id: state.planCounter };
  sheet.plans.push(plan);
  const result = stampPlan(state, sheet, plan);
  return { plan, result };
}

/** Apply edits to a plan and re-stamp its legs. */
export function updatePlan(
  state: GameState,
  sheet: Sheet,
  plan: Plan,
  draft: Omit<Plan, "id">,
): StampResult | null {
  if (draft.stops.length < 2 || !ensurePlanRoutes(state, draft.stops)) return null;
  const removed = plan.boatIds.filter((id) => !draft.boatIds.includes(id));
  Object.assign(plan, draft);
  // boats dropped from the plan lose its legs
  for (const boatId of removed) {
    const legs = sheet.legs[boatId];
    if (legs) sheet.legs[boatId] = legs.filter((l) => l.planId !== plan.id);
  }
  return stampPlan(state, sheet, plan);
}

/** Dissolve a plan into plain manual legs (they stay; the plan object goes). */
export function unpackPlan(sheet: Sheet, planId: number): void {
  for (const boatId in sheet.legs) {
    for (const leg of sheet.legs[boatId]) if (leg.planId === planId) delete leg.planId;
  }
  sheet.plans = sheet.plans.filter((p) => p.id !== planId);
}

/** Remove a plan AND every leg it stamped. */
export function removePlan(sheet: Sheet, planId: number): void {
  for (const boatId in sheet.legs) {
    sheet.legs[boatId] = sheet.legs[boatId].filter((l) => l.planId !== planId);
  }
  sheet.plans = sheet.plans.filter((p) => p.id !== planId);
}
