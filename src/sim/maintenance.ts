import { CONFIG, vesselById } from "../config";
import type { Boat, GameState } from "../types";

// Maintenance & wear — the fleet-side half of the milestone. Condition is
// worn down per nm in chargeSailing (ferry.ts); this module owns the risk
// curve, condition tiers, yard costs, and starting/queueing a yard stay.
// The phase machine (ferry.ts stepBoat) drives the actual time out of service.

export interface ConditionTier {
  name: string;
  color: string;
}

/** Human-readable condition band (mirrors repColor's traffic-light palette). */
export function conditionTier(condition: number): ConditionTier {
  if (condition >= 75) return { name: "Good", color: "#5bd49a" };
  if (condition >= 50) return { name: "Worn", color: "#f3c14b" };
  if (condition >= 25) return { name: "Poor", color: "#f0a05f" };
  return { name: "Critical", color: "#f0795f" };
}

/** Per-sailing breakdown probability — cubic in missing condition, so a
 *  well-kept boat almost never breaks and a neglected one becomes a gamble. */
export function breakdownChance(condition: number): number {
  const missing = Math.max(0, Math.min(100, 100 - condition)) / 100;
  return CONFIG.maint.breakdownMaxPerSailing * missing ** 3;
}

/** Cost of a scheduled overhaul for a vessel class. */
export function serviceCost(classId: string): number {
  return vesselById(classId).cost * CONFIG.maint.serviceCostFrac;
}

/** Cost of an emergency repair after a breakdown. */
export function repairCost(classId: string): number {
  return vesselById(classId).cost * CONFIG.maint.repairCostFrac;
}

/** Queue (or cancel) a scheduled overhaul — the boat heads into the yard at
 *  its next idle moment and sits out `serviceMin` of timetable. */
export function requestService(boat: Boat): void {
  if (boat.phase === "maint" || boat.phase === "repair") return; // already down
  boat.serviceRequested = !boat.serviceRequested;
}

/** Put an idle boat into the yard at the home port (called by stepBoat). */
export function beginService(state: GameState, boat: Boat): void {
  const cost = serviceCost(boat.classId);
  state.cash -= cost;
  state.maintToday += cost;
  boat.serviceRequested = false;
  boat.phase = "maint";
  boat.atPort = state.hubId;
  boat.routeId = null;
  boat.timer = 0;
  boat.downMin = CONFIG.maint.serviceMin;
}

/** Put a broken-down boat into the yard where it arrived (called by stepBoat). */
export function beginRepair(state: GameState, boat: Boat, portId: string): void {
  const cost = repairCost(boat.classId);
  state.cash -= cost;
  state.maintToday += cost;
  boat.limping = false;
  boat.phase = "repair";
  boat.atPort = portId;
  boat.routeId = null;
  boat.timer = 0;
  boat.downMin = CONFIG.maint.repairMin;
}
