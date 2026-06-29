import { CONFIG } from "../config";
import type { Boat, GameState, Queue, RouteState } from "../types";

export function newQueue(): Queue {
  return { foot: 0, car: 0, footWait: 0, carWait: 0 };
}

export function createState(): GameState {
  const routes: Record<string, RouteState> = {};
  for (const def of CONFIG.routes) {
    routes[def.id] = {
      def,
      out: newQueue(),
      in: newQueue(),
      servedToday: 0,
      balkedToday: 0,
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
  };

  addBoat(state, CONFIG.routes[0].id);
  return state;
}

export function addBoat(state: GameState, routeId: string | null): Boat {
  state.boatCounter++;
  const boat: Boat = {
    id: state.boatCounter,
    name: "Ferry " + state.boatCounter,
    routeId,
    pendingRoute: routeId,
    phase: "hub",
    p: 0,
    timer: 0,
    pax: { foot: 0, car: 0, dir: "out" },
  };
  state.boats.push(boat);
  return boat;
}

/** Purchase a ferry if affordable. Returns the new boat or null. */
export function buyBoat(state: GameState): Boat | null {
  if (state.cash < CONFIG.boatCost) return null;
  state.cash -= CONFIG.boatCost;
  return addBoat(state, CONFIG.routes[0].id);
}
