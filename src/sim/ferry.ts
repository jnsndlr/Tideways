import { CONFIG, vesselById } from "../config";
import type { Boat, GameState, PortQueues, RouteState } from "../types";
import { crossingFor } from "./schedule";
import { getRouting } from "./routing";

/** Total people currently aboard (foot + people-in-cars). */
function manifestPeople(cargo: PortQueues): { foot: number; car: number } {
  let foot = 0;
  let car = 0;
  for (const dest in cargo)
    for (const seg in cargo[dest]) {
      foot += cargo[dest][seg].foot;
      car += cargo[dest][seg].car;
    }
  return { foot, car };
}

function refreshPax(boat: Boat): void {
  boat.pax = manifestPeople(boat.cargo);
}

/**
 * Board riders at `port` heading toward `next` (the other end of the leg this
 * boat is about to sail). A rider boards only if the shortest path to their
 * final destination goes through `next`. Deck rule enforced across all buckets:
 *   cars <= carCap  and  total people (foot + in-car) <= peopleCap.
 * Fare is charged per boarded leg; goodwill credits the boarding port.
 */
export function boardAt(state: GameState, boat: Boat, port: string, next: string, R: RouteState): void {
  const vc = vesselById(boat.classId);
  const occ = CONFIG.avgOccupancy;
  const P = state.ports[port];
  const routing = getRouting(state);

  // Eligible buckets: those at this port whose next hop toward dest is `next`.
  const eligible: { dest: string; seg: string }[] = [];
  let totalCar = 0;
  let totalFoot = 0;
  for (const dest in P.queues) {
    if (routing.nextHop(port, dest) !== next) continue;
    for (const seg in P.queues[dest]) {
      const q = P.queues[dest][seg];
      if (q.foot < 0.0001 && q.car < 0.0001) continue;
      eligible.push({ dest, seg });
      totalCar += q.car;
      totalFoot += q.foot;
    }
  }
  if (!eligible.length) return;

  const carsByPeople = occ > 0 ? vc.peopleCap / occ : Infinity;
  const carsLoaded = Math.max(0, Math.min(totalCar, vc.carCap, carsByPeople));
  const peopleFromCars = carsLoaded * occ;
  const footRoom = Math.max(0, vc.peopleCap - peopleFromCars);
  const footLoaded = Math.min(totalFoot, footRoom);

  const carFrac = totalCar > 0 ? carsLoaded / totalCar : 0;
  const footFrac = totalFoot > 0 ? footLoaded / totalFoot : 0;

  let boardedPeople = 0;
  let revenue = 0;
  for (const { dest, seg } of eligible) {
    const q = P.queues[dest][seg];
    const takeCar = q.car * carFrac;
    const takeFoot = q.foot * footFrac;
    q.car -= takeCar;
    q.foot -= takeFoot;
    if (q.foot < 0.5 && q.car < 0.5) q.wait = 0;

    const c = (boat.cargo[dest] ??= {});
    const cb = (c[seg] ??= { foot: 0, car: 0, wait: 0 });
    cb.foot += takeFoot;
    cb.car += takeCar;

    const served = takeFoot + takeCar * occ;
    boardedPeople += served;
    revenue += takeFoot * R.footPrice + takeCar * R.carPrice;
    // serving a segment well credits its goodwill at this port — but a late
    // sailing carries riders without earning any
    if (!boat.tripLate) P.segRep[seg] += served * CONFIG.repServedGain;
  }

  state.cash += revenue;
  state.revenueToday += revenue;
  P.servedToday += boardedPeople;
  refreshPax(boat);
}

/** Unload at arrival: deliver riders whose destination is here, transfer the rest. */
export function arriveAt(state: GameState, boat: Boat, port: string): void {
  const P = state.ports[port];
  for (const dest in boat.cargo) {
    for (const seg in boat.cargo[dest]) {
      const cb = boat.cargo[dest][seg];
      if (cb.foot < 0.0001 && cb.car < 0.0001) continue;
      if (dest === port) {
        // arrived at final destination — they leave the system (fare paid per leg
        // on boarding; "served" is counted at boarding, like the old model)
      } else {
        // transfer: rejoin this port's queue toward the final destination (wait resets)
        const q = (P.queues[dest] ??= {});
        const sq = (q[seg] ??= { foot: 0, car: 0, wait: 0 });
        sq.foot += cb.foot;
        sq.car += cb.car;
      }
    }
  }
  boat.cargo = {};
  refreshPax(boat);
}

export function chargeFuel(state: GameState, boat: Boat, R: RouteState): void {
  const cost = R.def.distanceNm * vesselById(boat.classId).fuelPerNm;
  state.cash -= cost;
  state.fuelToday += cost;
}

/** Boats currently occupying a berth at a port (loading). */
function portBerthsBusy(state: GameState, portId: string): number {
  let n = 0;
  for (const b of state.boats)
    if (b.atPort === portId && (b.phase === "atHome" || b.phase === "atFar")) n++;
  return n;
}

/** Advance one boat along its daily itinerary. A trip is a round trip on a leg:
 *  from -> to -> from, boarding by next-hop and unloading (deliver/transfer) at
 *  each end. */
export function stepBoat(state: GameState, boat: Boat, dtMin: number): void {
  const open =
    state.clock >= CONFIG.operatingStart && state.clock < CONFIG.operatingEnd;

  switch (boat.phase) {
    case "idle": {
      const trip = boat.itinerary[boat.nextTripIdx];
      if (!trip || !open) return; // done for the day, or closed
      const R = state.routes[trip.routeId];
      if (state.clock >= trip.depart) {
        // hold at the dock until a home berth frees up
        if (portBerthsBusy(state, R.def.from) >= state.ports[R.def.from].slips.length) return;
        boat.routeId = trip.routeId;
        boat.atPort = R.def.from;
        boat.phase = "atHome";
        boat.timer = 0;
        boat.tripLate = state.clock - trip.depart > CONFIG.lateGraceMin;
      }
      break;
    }
    case "atHome": {
      const R = state.routes[boat.routeId!];
      boat.timer += dtMin;
      if (boat.timer >= CONFIG.loadMinutes) {
        boardAt(state, boat, R.def.from, R.def.to, R);
        chargeFuel(state, boat, R);
        R.sailingsToday++;
        boat.phase = "out";
        boat.atPort = null;
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
        arriveAt(state, boat, R.def.to);
        const free = portBerthsBusy(state, R.def.to) < state.ports[R.def.to].slips.length;
        boat.phase = free ? "atFar" : "hold";
        boat.atPort = free ? R.def.to : null;
        boat.timer = 0;
      }
      break;
    }
    case "hold": {
      const R = state.routes[boat.routeId!];
      boat.timer += dtMin;
      if (portBerthsBusy(state, R.def.to) < state.ports[R.def.to].slips.length) {
        boat.phase = "atFar";
        boat.atPort = R.def.to;
        boat.timer = 0;
      }
      break;
    }
    case "atFar": {
      const R = state.routes[boat.routeId!];
      boat.timer += dtMin;
      if (boat.timer >= CONFIG.loadMinutes) {
        boardAt(state, boat, R.def.to, R.def.from, R);
        chargeFuel(state, boat, R);
        boat.phase = "back";
        boat.atPort = null;
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
        arriveAt(state, boat, R.def.from);
        boat.phase = "idle";
        boat.routeId = null;
        boat.atPort = null;
        boat.nextTripIdx++;
      }
      break;
    }
  }
}
