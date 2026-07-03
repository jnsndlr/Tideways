import { CONFIG, vesselById } from "../config";
import type { Boat, Staffing, StaffingDef } from "../types";

// Staffing — a per-boat crew level with real tradeoffs (CONFIG.staffing):
// bare-bones crews are cheap but load slowly and skip upkeep (extra wear);
// well-staffed boats cost more per sailing and turn around faster. The live
// dwell time in ferry.ts comes from dwellMinutes below, so anything that
// wants to modify loading speed has one place to hook into.

export const STAFFING_LEVELS: Staffing[] = ["minimal", "standard", "full"];

export function staffingDef(level: Staffing): StaffingDef {
  return CONFIG.staffing[level];
}

/** Crew wages one departure costs, at this boat's staffing level. */
export function crewCostPerSailing(boat: Pick<Boat, "classId" | "staffing">): number {
  return vesselById(boat.classId).crewPerSailing * staffingDef(boat.staffing).crewCostMult;
}

/** Minutes this boat actually spends loading at a terminal — the game's
 *  configurable loading speed (base loadMinutes × staffing multiplier). */
export function dwellMinutes(boat: Pick<Boat, "staffing">): number {
  return CONFIG.loadMinutes * staffingDef(boat.staffing).loadTimeMult;
}

/** Step the boat's staffing minimal → standard → full → minimal (UI toggle). */
export function cycleStaffing(boat: Boat): void {
  const i = STAFFING_LEVELS.indexOf(boat.staffing);
  boat.staffing = STAFFING_LEVELS[(i + 1) % STAFFING_LEVELS.length];
}
