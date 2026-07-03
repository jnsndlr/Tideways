import { CONFIG, vesselById } from "../config";
import type { Boat, FuelGrade, FuelGradeDef, GameState } from "../types";

// Fuel — boats carry a real tank (measured in nm of range). Sailing drains it
// (ferry.ts); this module owns grades, prices, and refueling. The tank refills
// only when it drops below fuelCfg.refuelBelowFrac AND the boat touches a port
// that sells fuel (the hub, or an island with a purchased depot). A dry tank
// means crawling at fuelCfg.emptySpeedFactor until the boat reaches fuel.

export const FUEL_GRADES: FuelGrade[] = ["low", "standard", "high"];

export function gradeDef(grade: FuelGrade): FuelGradeDef {
  return CONFIG.fuelCfg.grades[grade];
}

/** Dollars per nautical mile this boat pays at the pump (class burn × grade). */
export function fuelPricePerNm(classId: string, grade: FuelGrade): number {
  return vesselById(classId).fuelPerNm * gradeDef(grade).priceMult;
}

export function portHasFuel(state: GameState, portId: string): boolean {
  return state.ports[portId]?.fuelDepot === true;
}

/** Refill the tank if this port sells fuel and the boat is below the refill
 *  threshold. Charged per nm of range restored, at the boat's selected grade. */
export function maybeRefuel(state: GameState, boat: Boat, portId: string): void {
  const tank = vesselById(boat.classId).tankNm;
  if (boat.fuelNm > tank * CONFIG.fuelCfg.refuelBelowFrac) return;
  if (!portHasFuel(state, portId)) return;
  const cost = (tank - boat.fuelNm) * fuelPricePerNm(boat.classId, boat.fuelGrade);
  state.cash -= cost;
  state.fuelToday += cost;
  boat.fuelNm = tank;
}

/** Step the boat's selected grade low → standard → high → low (UI toggle). */
export function cycleGrade(boat: Boat): void {
  const i = FUEL_GRADES.indexOf(boat.fuelGrade);
  boat.fuelGrade = FUEL_GRADES[(i + 1) % FUEL_GRADES.length];
}

/** Build a refueling depot on a docked island (the hub is born with one). */
export function buildFuelDepot(state: GameState, portId: string): boolean {
  const P = state.ports[portId];
  if (!P || !P.slips.length || P.fuelDepot) return false;
  const cost = CONFIG.fuelCfg.fuelDepotCost;
  if (state.cash < cost) return false;
  state.cash -= cost;
  P.fuelDepot = true;
  return true;
}
