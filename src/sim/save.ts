import { CONFIG } from "../config";
import type { Boat, BoatPhase, GameState, PortQueues, RouteDef, Trip } from "../types";
import { createState } from "./state";

// Save/load: the sim state is (almost) plain data, so a save is a JSON
// projection of GameState with the CONFIG-owned `def` objects stripped out and
// re-attached on load. serialize/deserialize are pure (node-safe for tests);
// the localStorage wrappers below are what the app uses.

const SAVE_VERSION = 1;
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
}

interface RouteSave {
  def: RouteDef; // used only for player-opened routes absent from CONFIG
  footPrice: number;
  carPrice: number;
  sailingsToday: number;
  sailingsYesterday: number;
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
  revenueToday: number;
  fuelYesterday: number;
  crewYesterday: number;
  revenueYesterday: number;
  daysInDebt: number;
  gameOver: boolean;
  boatCounter: number;
  tripCounter: number;
  ports: Record<string, PortSave>;
  routes: Record<string, RouteSave>;
  boats: Boat[];
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
    revenueToday: state.revenueToday,
    fuelYesterday: state.fuelYesterday,
    crewYesterday: state.crewYesterday,
    revenueYesterday: state.revenueYesterday,
    daysInDebt: state.daysInDebt,
    gameOver: state.gameOver,
    boatCounter: state.boatCounter,
    tripCounter: state.tripCounter,
    ports,
    routes,
    boats: state.boats,
  };
  return JSON.stringify(data);
}

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const isSeg = (id: string): boolean => CONFIG.segments.some((s) => s.id === id);

const PHASES: BoatPhase[] = ["idle", "atHome", "out", "hold", "atFar", "back"];

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

/** Restore a GameState from a save string, or null if it can't be trusted.
 *  Starts from a fresh createState() so CONFIG-owned defs and any newly added
 *  ports/routes/segments come in at defaults, then overlays the saved data. */
export function deserialize(raw: string): GameState | null {
  try {
    const d = JSON.parse(raw) as SaveData;
    if (!d || d.v !== SAVE_VERSION) return null;

    const state = createState();
    state.boats = []; // drop the starter boat; the save has the real fleet

    state.cash = num(d.cash, state.cash);
    state.day = Math.max(1, Math.round(num(d.day, 1)));
    state.clock = Math.max(0, Math.min(1439, num(d.clock, CONFIG.operatingStart)));
    state.rep = num(d.rep, state.rep);
    state.companyValue = num(d.companyValue, state.cash);
    state.fuelToday = num(d.fuelToday, 0);
    state.crewToday = num(d.crewToday, 0); // absent in pre-crew saves -> 0
    state.revenueToday = num(d.revenueToday, 0);
    state.fuelYesterday = num(d.fuelYesterday, 0);
    state.crewYesterday = num(d.crewYesterday, 0);
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

    let maxBoatId = 0;
    let maxTripId = 0;
    for (const sb of d.boats ?? []) {
      if (!sb || !CONFIG.vesselClasses.some((v) => v.id === sb.classId)) continue;
      const itinerary: Trip[] = (Array.isArray(sb.itinerary) ? sb.itinerary : [])
        .filter((t) => t && state.routes[t.routeId])
        .map((t) => ({ id: Math.round(num(t.id, 0)), routeId: t.routeId, depart: num(t.depart, CONFIG.operatingStart) }))
        .sort((a, b) => a.depart - b.depart);
      for (const t of itinerary) maxTripId = Math.max(maxTripId, t.id);

      const phase: BoatPhase = PHASES.includes(sb.phase) ? sb.phase : "idle";
      const routeOk = typeof sb.routeId === "string" && !!state.routes[sb.routeId];
      const active = phase !== "idle" && routeOk;
      const cargo = active ? cleanQueues(sb.cargo, state) : {};
      let foot = 0;
      let car = 0;
      for (const dest in cargo)
        for (const seg in cargo[dest]) {
          foot += cargo[dest][seg].foot;
          car += cargo[dest][seg].car;
        }

      const id = Math.max(1, Math.round(num(sb.id, 0)));
      maxBoatId = Math.max(maxBoatId, id);
      state.boats.push({
        id,
        name: typeof sb.name === "string" && sb.name ? sb.name : "Ferry " + id,
        classId: sb.classId,
        itinerary,
        nextTripIdx: Math.max(0, Math.min(itinerary.length, Math.round(num(sb.nextTripIdx, 0)))),
        phase: active ? phase : "idle",
        routeId: active ? sb.routeId : null,
        atPort: active && typeof sb.atPort === "string" && state.ports[sb.atPort] ? sb.atPort : null,
        p: Math.max(0, Math.min(1, num(sb.p, 0))),
        timer: Math.max(0, num(sb.timer, 0)),
        cargo,
        pax: { foot, car },
        tripLate: sb.tripLate === true,
      });
    }
    state.boatCounter = Math.max(Math.round(num(d.boatCounter, 0)), maxBoatId);
    state.tripCounter = Math.max(Math.round(num(d.tripCounter, 0)), maxTripId);

    return state;
  } catch {
    return null;
  }
}

// ---- localStorage wrappers (no-ops when storage is unavailable) -------------

export function saveGame(state: GameState): void {
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
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
