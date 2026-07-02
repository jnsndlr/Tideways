import { CONFIG } from "../config";
import type { SeasonDef, SegmentDef } from "../types";

// Calendar rhythm: which weekday / season a game day falls on, and the demand
// multiplier that day applies to each segment. Day 1 = Monday, spring.

/** 0-based weekday index for a game day (0 = first name in weekdayNames). */
export function weekdayIndex(day: number): number {
  return (day - 1) % CONFIG.calendar.weekdayNames.length;
}

export function weekdayName(day: number): string {
  return CONFIG.calendar.weekdayNames[weekdayIndex(day)];
}

export function isWeekend(day: number): boolean {
  return CONFIG.calendar.weekendDays.includes(weekdayIndex(day));
}

export function seasonOf(day: number): SeasonDef {
  const { seasons, daysPerSeason } = CONFIG.calendar;
  return seasons[Math.floor((day - 1) / daysPerSeason) % seasons.length];
}

/** Combined weekly × seasonal volume multiplier for a segment on a day. */
export function demandDayFactor(seg: SegmentDef, day: number): number {
  const week = isWeekend(day) ? seg.weekendMult : 1;
  const season = seg.seasonMult[seasonOf(day).id] ?? 1;
  return week * season;
}
