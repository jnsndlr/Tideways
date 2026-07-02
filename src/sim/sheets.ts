import type { Boat, GameState, Leg, Sheet, SheetDayType } from "../types";
import { isWeekend, seasonOf } from "./calendar";

// Schedule sheets — named, complete timetables with applicability selectors
// (WSF-style seasonal schedules). Exactly one sheet runs per day: the most
// specific match on (dayType, season); ties go to the newest sheet. The base
// sheet (index 0) is any/any and always matches, so every day has a timetable.

/** Does this sheet apply on this game day? */
export function sheetMatchesDay(sheet: Sheet, day: number): boolean {
  if (sheet.dayType === "weekday" && isWeekend(day)) return false;
  if (sheet.dayType === "weekend" && !isWeekend(day)) return false;
  if (sheet.season !== "any" && sheet.season !== seasonOf(day).id) return false;
  return true;
}

const specificity = (s: Sheet): number =>
  (s.dayType !== "any" ? 1 : 0) + (s.season !== "any" ? 1 : 0);

/** The sheet that runs on `day` — most specific match, ties to the newest. */
export function activeSheet(state: GameState, day: number): Sheet {
  let best = state.sheets[0];
  let bestScore = -1;
  for (const s of state.sheets) {
    if (!sheetMatchesDay(s, day)) continue;
    const score = specificity(s) * 1000 + s.id; // newest wins inside a tier
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

export function sheetById(state: GameState, sheetId: number): Sheet | null {
  return state.sheets.find((s) => s.id === sheetId) ?? null;
}

/** A boat's legs on a given sheet (the array itself — callers may mutate + sort). */
export function sheetLegs(sheet: Sheet, boatId: number): Leg[] {
  return (sheet.legs[boatId] ??= []);
}

/** Today's legs for a boat — what the ferry loop actually runs. */
export function todaysLegs(state: GameState, boat: Boat): Leg[] {
  return activeSheet(state, state.day).legs[boat.id] ?? [];
}

/** Create an alternate sheet. The base sheet's selectors stay locked to any/any. */
export function addSheet(
  state: GameState,
  name: string,
  dayType: SheetDayType,
  season: string,
): Sheet {
  state.sheetCounter++;
  const sheet: Sheet = {
    id: state.sheetCounter,
    name: name.trim() || `Schedule ${state.sheetCounter}`,
    dayType,
    season,
    legs: {},
    plans: [],
  };
  state.sheets.push(sheet);
  return sheet;
}

/** Delete an alternate sheet (the base sheet can't be removed). */
export function removeSheet(state: GameState, sheetId: number): boolean {
  const i = state.sheets.findIndex((s) => s.id === sheetId);
  if (i <= 0) return false; // not found, or the base sheet
  state.sheets.splice(i, 1);
  return true;
}
