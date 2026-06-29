import { CONFIG } from "../config";
import type { Boat, GameState, Queue, RouteState } from "../types";

/**
 * Load a boat from a queue, enforcing the deck rule:
 *   - at most carCap cars
 *   - total people (foot + people-in-cars) <= peopleCap
 * Mutates the queue and the boat's cargo, and books fare revenue + reputation.
 */
export function loadBoat(state: GameState, boat: Boat, q: Queue, R: RouteState): void {
  const F = CONFIG.ferry;

  const carsAvail = Math.floor(q.car);
  const carsLoaded = Math.min(carsAvail, F.carCap);
  const peopleFromCars = carsLoaded * F.avgOccupancy;

  const footRoom = Math.max(0, F.peopleCap - peopleFromCars);
  const footLoaded = Math.min(Math.floor(q.foot), footRoom);

  q.car -= carsLoaded;
  q.foot -= footLoaded;
  if (q.car < 0.5) q.carWait = 0;
  if (q.foot < 0.5) q.footWait = 0;

  boat.pax.foot = footLoaded;
  boat.pax.car = carsLoaded;

  const revenue = carsLoaded * CONFIG.fare.car + footLoaded * CONFIG.fare.foot;
  state.cash += revenue;

  const served = footLoaded + peopleFromCars;
  R.servedToday += served;
  state.rep += served * CONFIG.repServedGain;
}

/** Charge fuel for one crossing of a route. */
export function chargeFuel(state: GameState, R: RouteState): void {
  state.cash -= R.def.distanceNm * CONFIG.fuelCostPerNm;
}

/** Advance a single boat through its hub -> out -> dest -> back cycle. */
export function stepBoat(state: GameState, boat: Boat, dtMin: number): void {
  const open =
    state.clock >= CONFIG.operatingStart && state.clock < CONFIG.operatingEnd;

  switch (boat.phase) {
    case "hub": {
      // adopt any pending reassignment while docked at the shared hub
      boat.routeId = boat.pendingRoute;
      if (!boat.routeId || !open) {
        boat.timer = 0;
        return;
      }
      const R = state.routes[boat.routeId];
      boat.timer += dtMin;
      if (boat.timer >= CONFIG.ferry.loadMinutes) {
        loadBoat(state, boat, R.out, R); // load hub -> dest passengers
        chargeFuel(state, R);
        boat.phase = "out";
        boat.p = 0;
        boat.timer = 0;
        boat.pax.dir = "out";
      }
      break;
    }
    case "out": {
      const R = state.routes[boat.routeId!];
      boat.p += dtMin / R.def.crossingMin;
      if (boat.p >= 1) {
        boat.p = 1;
        boat.phase = "dest";
        boat.timer = 0;
        boat.pax = { foot: 0, car: 0, dir: "in" };
      }
      break;
    }
    case "dest": {
      const R = state.routes[boat.routeId!];
      boat.timer += dtMin;
      if (boat.timer >= CONFIG.ferry.loadMinutes) {
        loadBoat(state, boat, R.in, R); // load dest -> hub passengers
        chargeFuel(state, R);
        boat.phase = "back";
        boat.p = 1;
        boat.timer = 0;
        boat.pax.dir = "in";
      }
      break;
    }
    case "back": {
      const R = state.routes[boat.routeId!];
      boat.p -= dtMin / R.def.crossingMin;
      if (boat.p <= 0) {
        boat.p = 0;
        boat.phase = "hub";
        boat.timer = 0;
        boat.pax = { foot: 0, car: 0, dir: "out" };
      }
      break;
    }
  }
}
