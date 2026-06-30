import { CONFIG, maxDockTier } from "../config";
import type { Boat, DirQueue, GameState, RouteState } from "../types";

function newDirQueue(): DirQueue {
  const q: DirQueue = {};
  for (const seg of CONFIG.segments) q[seg.id] = { foot: 0, car: 0, wait: 0 };
  return q;
}

function newSegReps(value: number): Record<string, number> {
  const r: Record<string, number> = {};
  for (const seg of CONFIG.segments) r[seg.id] = value;
  return r;
}

export function createState(): GameState {
  const routes: Record<string, RouteState> = {};
  for (const def of CONFIG.routes) {
    const docked = def.startDocked === true;
    routes[def.id] = {
      def,
      out: newDirQueue(),
      in: newDirQueue(),
      servedToday: 0,
      balkedToday: 0,
      balkedYesterday: 0,
      sailingsToday: 0,
      segRep: newSegReps(CONFIG.repStart),
      segDemandRep: newSegReps(CONFIG.repStart),
      rep: CONFIG.repStart,
      demandRep: CONFIG.repStart,
      footPrice: CONFIG.fare.foot,
      carPrice: CONFIG.fare.car,
      hasDock: docked,
      dockTier: docked ? CONFIG.docks.startTier : -1,
    };
  }

  const state: GameState = {
    cash: CONFIG.startCash,
    day: 1,
    clock: CONFIG.operatingStart,
    rep: CONFIG.repStart,
    speed: 1,
    routes,
    boats: [],
    boatCounter: 0,
    tripCounter: 0,
  };

  addBoat(state, CONFIG.startVessel);
  return state;
}

export function addBoat(state: GameState, classId: string): Boat {
  state.boatCounter++;
  const boat: Boat = {
    id: state.boatCounter,
    name: "Ferry " + state.boatCounter,
    classId,
    itinerary: [],
    nextTripIdx: 0,
    phase: "idle",
    routeId: null,
    p: 0,
    timer: 0,
    pax: { foot: 0, car: 0 },
  };
  state.boats.push(boat);
  return boat;
}

/** Purchase a vessel of the given class if affordable and under the fleet cap. */
export function buyBoat(state: GameState, classId: string): Boat | null {
  if (state.boats.length >= CONFIG.maxFleet) return null;
  const vc = CONFIG.vesselClasses.find((v) => v.id === classId);
  if (!vc || state.cash < vc.cost) return null;
  state.cash -= vc.cost;
  return addBoat(state, classId);
}

/** Add a trip (round trip to a route) to a boat's daily itinerary, sorted. */
export function addTrip(state: GameState, boat: Boat, routeId: string, depart: number): void {
  state.tripCounter++;
  boat.itinerary.push({ id: state.tripCounter, routeId, depart });
  boat.itinerary.sort((a, b) => a.depart - b.depart);
}

export function removeTrip(boat: Boat, tripId: number): void {
  boat.itinerary = boat.itinerary.filter((t) => t.id !== tripId);
}

// ---- Docks ----------------------------------------------------------------

/** Cost to take a route from its current dock state to the next tier up.
 *  Returns null when the dock is already at the top tier. */
export function nextDockCost(R: RouteState): number | null {
  const target = R.dockTier + 1; // build (-1 -> 0) or upgrade (t -> t+1)
  if (target > maxDockTier) return null;
  return CONFIG.docks.upgradeCost[target];
}

/** Build a dock on a locked island (tier 0). Returns true on success. */
export function buildDock(state: GameState, routeId: string): boolean {
  const R = state.routes[routeId];
  if (!R || R.hasDock) return false;
  const cost = CONFIG.docks.upgradeCost[0];
  if (state.cash < cost) return false;
  state.cash -= cost;
  R.hasDock = true;
  R.dockTier = 0;
  return true;
}

/** Upgrade a dock by one tier (Express -> Hiyu -> Issaquah -> Jumbo). */
export function upgradeDock(state: GameState, routeId: string): boolean {
  const R = state.routes[routeId];
  if (!R || !R.hasDock || R.dockTier >= maxDockTier) return false;
  const cost = nextDockCost(R);
  if (cost === null || state.cash < cost) return false;
  state.cash -= cost;
  R.dockTier += 1;
  return true;
}
