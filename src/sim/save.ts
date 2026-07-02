import { CONFIG, vesselById } from "../config";
import type {
  Boat,
  BoatPhase,
  GameState,
  Leg,
  Plan,
  PortQueues,
  RouteDef,
  Sheet,
  SheetDayType,
} from "../types";
import { createState } from "./state";

// Save/load: the sim state is (almost) plain data, so a save is a JSON
// projection of GameState with the CONFIG-owned `def` objects stripped out and
// re-attached on load. serialize/deserialize are pure (node-safe for tests);
// the localStorage wrappers below are what the app uses.
//
// v2 (sheets + legs) still loads v1 saves: old round-trip itineraries are
// migrated into the base sheet as leg pairs; mid-crossing boats reset to idle.

const SAVE_VERSION = 2;
const SAVE_KEY = "tideways.save";

interface PortSave {
  slips: number[];
  queues: PortQueues;
  servedToday: number;
  servedYesterday: number;
  balkedToday: number;
  balkedYesterday: number;
  segRep: Record<string, number>;
  segDemandRep: Record<string, number>;
  // living community (absent in pre-growth saves -> seeded defaults)
  pop?: Record<string, number>;
  draw?: Record<string, number>;
  segServedWeek?: Record<string, number>;
  segBalkedWeek?: Record<string, number>;
  seatsWeek?: number;
  segGrowth?: Record<string, number>;
}

interface RouteSave {
  def: RouteDef; // used only for player-opened routes absent from CONFIG
  footPrice: number;
  carPrice: number;
  sailingsToday: number;
  sailingsYesterday: number;
}

interface SheetSave {
  id: number;
  name: string;
  dayType: SheetDayType;
  season: string;
  legs: Record<string, Leg[]>;
  plans: Plan[];
}

// v1 boats carried their timetable as round trips
interface TripV1 {
  id: number;
  routeId: string;
  depart: number;
}

interface SaveData {
  v: number;
  cash: number;
  day: number;
  clock: number;
  rep: number;
  companyValue: number;
  fuelToday: number;
  crewToday: number;
  maintToday?: number;
  revenueToday: number;
  fuelYesterday: number;
  crewYesterday: number;
  maintYesterday?: number;
  revenueYesterday: number;
  daysInDebt: number;
  gameOver: boolean;
  boatCounter: number;
  tripCounter?: number; // v1
  legCounter?: number;
  sheetCounter?: number;
  planCounter?: number;
  ports: Record<string, PortSave>;
  routes: Record<string, RouteSave>;
  boats: (Boat & { itinerary?: TripV1[]; nextTripIdx?: number })[];
  sheets?: SheetSave[];
}

export function serialize(state: GameState): string {
  const ports: Record<string, PortSave> = {};
  for (const id in state.ports) {
    const P = state.ports[id];
    ports[id] = {
      slips: P.slips,
      queues: P.queues,
      servedToday: P.servedToday,
      servedYesterday: P.servedYesterday,
      balkedToday: P.balkedToday,
      balkedYesterday: P.balkedYesterday,
      segRep: P.segRep,
      segDemandRep: P.segDemandRep,
      pop: P.pop,
      draw: P.draw,
      segServedWeek: P.segServedWeek,
      segBalkedWeek: P.segBalkedWeek,
      seatsWeek: P.seatsWeek,
      segGrowth: P.segGrowth,
    };
  }
  const routes: Record<string, RouteSave> = {};
  for (const id in state.routes) {
    const R = state.routes[id];
    routes[id] = {
      def: R.def,
      footPrice: R.footPrice,
      carPrice: R.carPrice,
      sailingsToday: R.sailingsToday,
      sailingsYesterday: R.sailingsYesterday,
    };
  }
  const data: SaveData = {
    v: SAVE_VERSION,
    cash: state.cash,
    day: state.day,
    clock: state.clock,
    rep: state.rep,
    companyValue: state.companyValue,
    fuelToday: state.fuelToday,
    crewToday: state.crewToday,
    maintToday: state.maintToday,
    revenueToday: state.revenueToday,
    fuelYesterday: state.fuelYesterday,
    crewYesterday: state.crewYesterday,
    maintYesterday: state.maintYesterday,
    revenueYesterday: state.revenueYesterday,
    daysInDebt: state.daysInDebt,
    gameOver: state.gameOver,
    boatCounter: state.boatCounter,
    legCounter: state.legCounter,
    sheetCounter: state.sheetCounter,
    planCounter: state.planCounter,
    ports,
    routes,
    boats: state.boats,
    sheets: state.sheets.map((s) => ({
      id: s.id,
      name: s.name,
      dayType: s.dayType,
      season: s.season,
      legs: s.legs,
      plans: s.plans,
    })),
  };
  return JSON.stringify(data);
}

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const isSeg = (id: string): boolean => CONFIG.segments.some((s) => s.id === id);

const PHASES: BoatPhase[] = ["idle", "atPort", "sailing", "maint", "repair"];

const DAY_TYPES: SheetDayType[] = ["any", "weekday", "weekend"];

const isSeasonOrAny = (s: unknown): s is string =>
  s === "any" || CONFIG.calendar.seasons.some((x) => x.id === s);

/** Rebuild one leg from untrusted data (route must exist, `from` one of its ends). */
function cleanLeg(state: GameState, raw: unknown): Leg | null {
  const l = raw as Partial<Leg> | null;
  if (!l || typeof l.routeId !== "string") return null;
  const R = state.routes[l.routeId];
  if (!R) return null;
  const from = typeof l.from === "string" ? l.from : "";
  if (from !== R.def.from && from !== R.def.to) return null;
  const leg: Leg = {
    id: Math.max(1, Math.round(num(l.id, 0))),
    routeId: l.routeId,
    from,
    depart: Math.max(0, Math.min(1439, num(l.depart, CONFIG.operatingStart))),
  };
  if (typeof l.planId === "number" && Number.isFinite(l.planId)) leg.planId = l.planId;
  return leg;
}

/** Rebuild a PortQueues from untrusted data, dropping unknown ports/segments. */
function cleanQueues(src: unknown, state: GameState): PortQueues {
  const out: PortQueues = {};
  if (!src || typeof src !== "object") return out;
  const byDest = src as Record<string, Record<string, { foot?: unknown; car?: unknown; wait?: unknown }>>;
  for (const dest in byDest) {
    if (!state.ports[dest]) continue;
    const segs = byDest[dest];
    if (!segs || typeof segs !== "object") continue;
    for (const segId in segs) {
      if (!isSeg(segId)) continue;
      const q = segs[segId];
      const foot = Math.max(0, num(q?.foot, 0));
      const car = Math.max(0, num(q?.car, 0));
      if (foot <= 0 && car <= 0) continue;
      (out[dest] ??= {})[segId] = { foot, car, wait: Math.max(0, num(q?.wait, 0)) };
    }
  }
  return out;
}

/** Merge saved per-segment values over fresh defaults (tolerates added segments). */
function mergeSegMap(fresh: Record<string, number>, saved: unknown): void {
  if (!saved || typeof saved !== "object") return;
  for (const segId in saved as Record<string, unknown>) {
    if (!isSeg(segId)) continue;
    fresh[segId] = Math.max(0, Math.min(100, num((saved as Record<string, unknown>)[segId], fresh[segId])));
  }
}

/** Merge saved per-segment values with an explicit clamp range. */
function mergeSegRange(fresh: Record<string, number>, saved: unknown, lo: number, hi: number): void {
  if (!saved || typeof saved !== "object") return;
  for (const segId in saved as Record<string, unknown>) {
    if (!isSeg(segId)) continue;
    fresh[segId] = Math.max(lo, Math.min(hi, num((saved as Record<string, unknown>)[segId], fresh[segId])));
  }
}

/** Same, but clamped per segment against a reference map (for living pop/draw,
 *  which must stay within the growth band around the seeded values). */
function mergeSegScaled(
  fresh: Record<string, number>,
  saved: unknown,
  seed: Record<string, number>,
  loFactor: number,
  hiFactor: number,
): void {
  if (!saved || typeof saved !== "object") return;
  for (const segId in saved as Record<string, unknown>) {
    if (!isSeg(segId)) continue;
    const s = seed[segId] ?? 0;
    const v = num((saved as Record<string, unknown>)[segId], fresh[segId]);
    fresh[segId] = Math.max(s * loFactor, Math.min(s * hiFactor, v));
  }
}

/** Restore a GameState from a save string, or null if it can't be trusted.
 *  Starts from a fresh createState() so CONFIG-owned defs and any newly added
 *  ports/routes/segments come in at defaults, then overlays the saved data. */
export function deserialize(raw: string): GameState | null {
  try {
    const d = JSON.parse(raw) as SaveData;
    if (!d || (d.v !== 1 && d.v !== SAVE_VERSION)) return null;
    const v1 = d.v === 1;

    const state = createState();
    state.boats = []; // drop the starter boat; the save has the real fleet

    state.cash = num(d.cash, state.cash);
    state.day = Math.max(1, Math.round(num(d.day, 1)));
    state.clock = Math.max(0, Math.min(1439, num(d.clock, CONFIG.operatingStart)));
    state.rep = num(d.rep, state.rep);
    state.companyValue = num(d.companyValue, state.cash);
    state.fuelToday = num(d.fuelToday, 0);
    state.crewToday = num(d.crewToday, 0); // absent in pre-crew saves -> 0
    state.maintToday = num(d.maintToday, 0); // absent in pre-maint saves -> 0
    state.revenueToday = num(d.revenueToday, 0);
    state.fuelYesterday = num(d.fuelYesterday, 0);
    state.crewYesterday = num(d.crewYesterday, 0);
    state.maintYesterday = num(d.maintYesterday, 0);
    state.revenueYesterday = num(d.revenueYesterday, 0);
    state.daysInDebt = Math.max(0, Math.round(num(d.daysInDebt, 0)));
    state.gameOver = d.gameOver === true;

    for (const id in d.ports ?? {}) {
      const P = state.ports[id];
      const sp = d.ports[id];
      if (!P || !sp) continue;
      if (Array.isArray(sp.slips)) {
        P.slips = sp.slips
          .map((t) => Math.round(num(t, 0)))
          .filter((t) => t >= 0 && t < CONFIG.vesselClasses.length);
      }
      P.queues = cleanQueues(sp.queues, state);
      P.servedToday = Math.max(0, num(sp.servedToday, 0));
      P.servedYesterday = Math.max(0, num(sp.servedYesterday, 0));
      P.balkedToday = Math.max(0, num(sp.balkedToday, 0));
      P.balkedYesterday = Math.max(0, num(sp.balkedYesterday, 0));
      mergeSegMap(P.segRep, sp.segRep);
      mergeSegMap(P.segDemandRep, sp.segDemandRep);
      const gw = CONFIG.growth;
      mergeSegScaled(P.pop, sp.pop, P.def.pop, gw.minFactor, gw.maxFactor);
      mergeSegScaled(P.draw, sp.draw, P.def.draw, gw.minFactor, gw.maxFactor);
      mergeSegRange(P.segServedWeek, sp.segServedWeek, 0, Infinity);
      mergeSegRange(P.segBalkedWeek, sp.segBalkedWeek, 0, Infinity);
      mergeSegRange(P.segGrowth, sp.segGrowth, -1, 1);
      P.seatsWeek = Math.max(0, num(sp.seatsWeek, 0));
    }

    for (const id in d.routes ?? {}) {
      const sr = d.routes[id];
      if (!sr) continue;
      let R = state.routes[id];
      if (!R) {
        // player-opened route: recreate from the saved def if both ports exist
        const def = sr.def;
        if (!def || !state.ports[def.from] || !state.ports[def.to]) continue;
        R = state.routes[id] = {
          def: {
            id,
            name: String(def.name ?? id),
            color: String(def.color ?? "#9fb0c4"),
            from: def.from,
            to: def.to,
            distanceNm: Math.max(0.1, num(def.distanceNm, 1)),
            crossingMin: Math.max(1, num(def.crossingMin, 10)),
          },
          sailingsToday: 0,
          sailingsYesterday: 0,
          footPrice: CONFIG.fare.foot,
          carPrice: CONFIG.fare.car,
        };
      }
      const b = CONFIG.priceBounds;
      R.footPrice = Math.max(b.footMin, Math.min(b.footMax, num(sr.footPrice, R.footPrice)));
      R.carPrice = Math.max(b.carMin, Math.min(b.carMax, num(sr.carPrice, R.carPrice)));
      R.sailingsToday = Math.max(0, num(sr.sailingsToday, 0));
      R.sailingsYesterday = Math.max(0, num(sr.sailingsYesterday, 0));
    }

    // ---- sheets (v2) --------------------------------------------------------
    if (!v1 && Array.isArray(d.sheets)) {
      const sheets: Sheet[] = [];
      for (const ss of d.sheets) {
        if (!ss || typeof ss !== "object") continue;
        const legs: Record<number, Leg[]> = {};
        if (ss.legs && typeof ss.legs === "object") {
          for (const key in ss.legs) {
            const boatId = Math.round(Number(key));
            if (!Number.isFinite(boatId) || boatId <= 0) continue;
            const out: Leg[] = [];
            for (const rl of Array.isArray(ss.legs[key]) ? ss.legs[key] : []) {
              const leg = cleanLeg(state, rl);
              if (leg) out.push(leg);
            }
            out.sort((a, b) => a.depart - b.depart);
            if (out.length) legs[boatId] = out;
          }
        }
        const plans: Plan[] = [];
        for (const rp of Array.isArray(ss.plans) ? ss.plans : []) {
          if (!rp || typeof rp !== "object") continue;
          const stops = (Array.isArray(rp.stops) ? rp.stops : []).filter(
            (p): p is string => typeof p === "string" && !!state.ports[p],
          );
          if (stops.length < 2) continue;
          plans.push({
            id: Math.max(1, Math.round(num(rp.id, 0))),
            name: typeof rp.name === "string" && rp.name ? rp.name : "Plan",
            stops,
            headwayMin: Math.max(CONFIG.scheduleSnapMin, Math.round(num(rp.headwayMin, 60))),
            winStart: Math.max(0, Math.min(1439, num(rp.winStart, CONFIG.operatingStart))),
            winEnd: Math.max(0, Math.min(1439, num(rp.winEnd, CONFIG.operatingEnd))),
            boatIds: (Array.isArray(rp.boatIds) ? rp.boatIds : [])
              .map((x: unknown) => Math.round(num(x, 0)))
              .filter((x: number) => x > 0),
          });
        }
        sheets.push({
          id: Math.max(1, Math.round(num(ss.id, 0))),
          name: typeof ss.name === "string" && ss.name ? ss.name : "Schedule",
          dayType: DAY_TYPES.includes(ss.dayType) ? ss.dayType : "any",
          season: isSeasonOrAny(ss.season) ? ss.season : "any",
          legs,
          plans,
        });
      }
      if (sheets.length) {
        sheets[0].dayType = "any"; // the base sheet must cover every day
        sheets[0].season = "any";
        state.sheets = sheets;
      }
    }

    // ---- boats ----------------------------------------------------------------
    let maxBoatId = 0;
    for (const sb of d.boats ?? []) {
      if (!sb || !CONFIG.vesselClasses.some((v) => v.id === sb.classId)) continue;
      const id = Math.max(1, Math.round(num(sb.id, 0)));
      maxBoatId = Math.max(maxBoatId, id);

      // v1 migration: round-trip itineraries become leg pairs on the base sheet;
      // mid-crossing state is dropped (the boat restarts idle, riders vanish once)
      if (v1) {
        const base = state.sheets[0];
        for (const t of Array.isArray(sb.itinerary) ? sb.itinerary : []) {
          if (!t || !state.routes[t.routeId]) continue;
          const R = state.routes[t.routeId];
          const dep = Math.max(0, Math.min(1439, num(t.depart, CONFIG.operatingStart)));
          state.legCounter++;
          (base.legs[id] ??= []).push({ id: state.legCounter, routeId: t.routeId, from: R.def.from, depart: dep });
          state.legCounter++;
          base.legs[id].push({
            id: state.legCounter,
            routeId: t.routeId,
            from: R.def.to,
            depart: dep + CONFIG.loadMinutes + Math.ceil(R.def.crossingMin / vesselById(sb.classId).speedFactor),
          });
        }
        base.legs[id]?.sort((a, b) => a.depart - b.depart);
        const migrated = base.legs[id] ?? [];
        state.boats.push({
          id,
          name: typeof sb.name === "string" && sb.name ? sb.name : "Ferry " + id,
          classId: sb.classId,
          legIdx: migrated.filter((l) => l.depart < state.clock).length,
          phase: "idle",
          routeId: null,
          sailFrom: null,
          atPort: null,
          lastPort: state.hubId,
          p: 0,
          timer: 0,
          cargo: {},
          pax: { foot: 0, car: 0 },
          tripLate: false,
          condition: Math.max(0, Math.min(100, num(sb.condition, 100))),
          limping: false,
          serviceRequested: sb.serviceRequested === true,
          downMin: 0,
        });
        continue;
      }

      const phase: BoatPhase = PHASES.includes(sb.phase) ? sb.phase : "idle";
      const atPortOk = typeof sb.atPort === "string" && !!state.ports[sb.atPort];
      const inYard = (phase === "maint" || phase === "repair") && atPortOk;
      const R = typeof sb.routeId === "string" ? state.routes[sb.routeId] : undefined;
      const sailFromOk =
        !!R && typeof sb.sailFrom === "string" &&
        (sb.sailFrom === R.def.from || sb.sailFrom === R.def.to);
      const active = !inYard && (phase === "sailing" || phase === "atPort") && sailFromOk;
      const cargo = active ? cleanQueues(sb.cargo, state) : {};
      let foot = 0;
      let car = 0;
      for (const dest in cargo)
        for (const seg in cargo[dest]) {
          foot += cargo[dest][seg].foot;
          car += cargo[dest][seg].car;
        }

      state.boats.push({
        id,
        name: typeof sb.name === "string" && sb.name ? sb.name : "Ferry " + id,
        classId: sb.classId,
        legIdx: Math.max(0, Math.min(999, Math.round(num(sb.legIdx, 0)))),
        phase: active || inYard ? phase : "idle",
        routeId: active ? sb.routeId : null,
        sailFrom: active ? (sb.sailFrom as string) : null,
        atPort: (phase === "atPort" && active) || inYard ? (atPortOk ? sb.atPort : null) : null,
        lastPort:
          typeof sb.lastPort === "string" && state.ports[sb.lastPort] ? sb.lastPort : state.hubId,
        p: Math.max(0, Math.min(1, num(sb.p, 0))),
        timer: Math.max(0, num(sb.timer, 0)),
        cargo,
        pax: { foot, car },
        tripLate: sb.tripLate === true,
        condition: Math.max(0, Math.min(100, num(sb.condition, 100))),
        limping: active && sb.limping === true,
        serviceRequested: sb.serviceRequested === true,
        downMin: inYard ? Math.max(0, num(sb.downMin, 0)) : 0,
      });
    }

    // prune sheet data for boats that no longer exist
    for (const sheet of state.sheets) {
      for (const key in sheet.legs) {
        if (!state.boats.some((b) => b.id === Number(key))) delete sheet.legs[key];
      }
      for (const plan of sheet.plans)
        plan.boatIds = plan.boatIds.filter((x) => state.boats.some((b) => b.id === x));
    }

    // counters can never trail the ids in play
    let maxLegId = 0;
    let maxPlanId = 0;
    let maxSheetId = 1;
    for (const sheet of state.sheets) {
      maxSheetId = Math.max(maxSheetId, sheet.id);
      for (const plan of sheet.plans) maxPlanId = Math.max(maxPlanId, plan.id);
      for (const key in sheet.legs)
        for (const leg of sheet.legs[key]) maxLegId = Math.max(maxLegId, leg.id);
    }
    state.boatCounter = Math.max(Math.round(num(d.boatCounter, 0)), maxBoatId);
    state.legCounter = Math.max(
      Math.round(num(d.legCounter, num(d.tripCounter, 0))),
      maxLegId,
      state.legCounter,
    );
    state.sheetCounter = Math.max(Math.round(num(d.sheetCounter, 1)), maxSheetId);
    state.planCounter = Math.max(Math.round(num(d.planCounter, 0)), maxPlanId);

    return state;
  } catch {
    return null;
  }
}

// ---- localStorage wrappers (no-ops when storage is unavailable) -------------

// Once a save is cleared for a fresh start, block further autosaves: reloading
// fires pagehide/visibilitychange, whose autosave would otherwise immediately
// re-persist the abandoned company and defeat "Start a new company".
let autosaveBlocked = false;

export function saveGame(state: GameState): void {
  if (autosaveBlocked) return;
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
  } catch {
    /* storage full / unavailable — skip this autosave */
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  autosaveBlocked = true; // callers reload right after; don't let pagehide re-save
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
