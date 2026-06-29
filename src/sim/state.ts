import { CONFIG } from "../config";
import type { Boat, DirQueue, GameState, RouteState } from "../types";

function newDirQueue(): DirQueue {
  const q: DirQueue = {};
  for (const seg of CONFIG.segments) q[seg.id] = { foot: 0, car: 0, wait: 0 };
  return q;
}

export function createState(): GameState {
  const routes: Record<string, RouteState> = {};
  for (const def of CONFIG.routes) {
    routes[def.id] = {
      def,
      out: newDirQueue(),
      in: newDirQueue(),
      servedToday: 0,
      balkedToday: 0,
      balkedYesterday: 0,
      sailingsToday: 0,
      rep: CONFIG.repStart,
      demandRep: CONFIG.repStart,
      footPrice: CONFIG.fare.foot,
      carPrice: CONFIG.fare.car,
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
