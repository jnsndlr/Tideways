import { CONFIG, vesselById } from "../config";
import type { Boat, DirQueue, GameState, RouteState } from "../types";
import { crossingFor } from "./schedule";

/**
 * Load a boat from a direction's per-segment queues, enforcing the deck rule:
 *   cars <= carCap  and  total people (foot + in-car) <= peopleCap.
 * Cars and foot are drawn proportionally across segments. Passenger-only
 * vessels (carCap 0) leave all cars behind to balk — that's the point.
 */
export function loadBoat(state: GameState, boat: Boat, dir: DirQueue, R: RouteState): void {
  const vc = vesselById(boat.classId);
  const occ = CONFIG.avgOccupancy;

  let totalCar = 0;
  let totalFoot = 0;
  for (const seg of CONFIG.segments) {
    totalCar += dir[seg.id].car;
    totalFoot += dir[seg.id].foot;
  }

  const carsByPeople = occ > 0 ? vc.peopleCap / occ : Infinity;
  const carsLoaded = Math.max(
    0,
    Math.min(Math.floor(totalCar), vc.carCap, Math.floor(carsByPeople)),
  );
  const peopleFromCars = carsLoaded * occ;
  const footRoom = Math.max(0, vc.peopleCap - peopleFromCars);
  const footLoaded = Math.min(Math.floor(totalFoot), footRoom);

  const carFrac = totalCar > 0 ? carsLoaded / totalCar : 0;
  const footFrac = totalFoot > 0 ? footLoaded / totalFoot : 0;
  for (const seg of CONFIG.segments) {
    const q = dir[seg.id];
    // people of this segment carried this sailing -> credit its own reputation
    const segServed = q.foot * footFrac + q.car * carFrac * occ;
    R.segRep[seg.id] += segServed * CONFIG.repServedGain;
    q.car -= q.car * carFrac;
    q.foot -= q.foot * footFrac;
    if (q.foot < 0.5 && q.car < 0.5) q.wait = 0;
  }

  boat.pax.foot = footLoaded;
  boat.pax.car = carsLoaded;

  state.cash += carsLoaded * R.carPrice + footLoaded * R.footPrice;
  R.servedToday += footLoaded + peopleFromCars;
}

export function chargeFuel(state: GameState, boat: Boat, R: RouteState): void {
  state.cash -= R.def.distanceNm * vesselById(boat.classId).fuelPerNm;
}

/** Advance one boat along its daily itinerary (interlining-aware). */
export function stepBoat(state: GameState, boat: Boat, dtMin: number): void {
  const open =
    state.clock >= CONFIG.operatingStart && state.clock < CONFIG.operatingEnd;

  switch (boat.phase) {
    case "idle": {
      const trip = boat.itinerary[boat.nextTripIdx];
      if (!trip || !open) return; // done for the day, or closed
      if (state.clock >= trip.depart) {
        boat.routeId = trip.routeId;
        boat.phase = "hub";
        boat.timer = 0;
      }
      break;
    }
    case "hub": {
      const R = state.routes[boat.routeId!];
      boat.timer += dtMin;
      if (boat.timer >= CONFIG.loadMinutes) {
        loadBoat(state, boat, R.out, R);
        chargeFuel(state, boat, R);
        R.sailingsToday++;
        boat.phase = "out";
        boat.p = 0;
        boat.timer = 0;
      }
      break;
    }
    case "out": {
      const R = state.routes[boat.routeId!];
      boat.p += dtMin / crossingFor(R, boat.classId);
      if (boat.p >= 1) {
        boat.p = 1;
        boat.phase = "dest";
        boat.timer = 0;
        boat.pax = { foot: 0, car: 0 };
      }
      break;
    }
    case "dest": {
      const R = state.routes[boat.routeId!];
      boat.timer += dtMin;
      if (boat.timer >= CONFIG.loadMinutes) {
        loadBoat(state, boat, R.in, R);
        chargeFuel(state, boat, R);
        boat.phase = "back";
        boat.p = 1;
        boat.timer = 0;
      }
      break;
    }
    case "back": {
      const R = state.routes[boat.routeId!];
      boat.p -= dtMin / crossingFor(R, boat.classId);
      if (boat.p <= 0) {
        boat.p = 0;
        boat.phase = "idle";
        boat.routeId = null;
        boat.nextTripIdx++;
        boat.pax = { foot: 0, car: 0 };
      }
      break;
    }
  }
}
