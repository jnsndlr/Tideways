import { CONFIG, vesselById } from "../config";
import type { Boat, GameState, PortQueues, RouteState } from "../types";
import { gradeDef, maybeRefuel } from "./fuel";
import { beginRepair, beginService, breakdownChance } from "./maintenance";
import { crossingFor } from "./schedule";
import { getRouting } from "./routing";
import { todaysLegs } from "./sheets";
import { crewCostPerSailing, dwellMinutes, staffingDef } from "./staffing";

/** The opposite end of a route from `port`. */
export function otherEnd(R: RouteState, port: string): string {
  return R.def.from === port ? R.def.to : R.def.from;
}

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
  // capacity offered from this port this week (growth headroom) — counted even
  // when nobody boards: an empty departure is still service on offer
  P.seatsWeek += vc.peopleCap;

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
    if (q.foot < 0.5 && q.car < 0.5) {
      q.wait = 0;
      q.missed = false;
    }

    // left behind by a boat they could have used — their patience clock starts
    // now (nobody balks before a sailing has actually come and gone without them)
    if (q.foot + q.car > 0.5 && !q.missed) {
      q.missed = true;
      q.wait = 0;
    }

    const c = (boat.cargo[dest] ??= {});
    const cb = (c[seg] ??= { foot: 0, car: 0, wait: 0, missed: false });
    cb.foot += takeFoot;
    cb.car += takeCar;

    const served = takeFoot + takeCar * occ;
    boardedPeople += served;
    P.segServedWeek[seg] += served;
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
        const sq = (q[seg] ??= { foot: 0, car: 0, wait: 0, missed: false });
        sq.foot += cb.foot;
        sq.car += cb.car;
      }
    }
  }
  boat.cargo = {};
  refreshPax(boat);
}

/** Costs of one departure: the sailing's crew wages (staffing-scaled). Fuel is
 *  paid at the pump instead (fuel.ts) — sailing just drains the tank. Also
 *  wears the hull down (fuel grade and staffing modulate the rate) and rolls
 *  the sailing's breakdown die — a boat that fails limps across at half speed
 *  and goes straight into the yard. */
export function chargeSailing(state: GameState, boat: Boat, R: RouteState): void {
  const crew = crewCostPerSailing(boat);
  state.cash -= crew;
  state.crewToday += crew;
  const wearMult = staffingDef(boat.staffing).wearMult * gradeDef(boat.fuelGrade).wearMult;
  boat.condition = Math.max(
    0,
    boat.condition - R.def.distanceNm * CONFIG.maint.wearPerNm * wearMult,
  );
  boat.limping = Math.random() < breakdownChance(boat.condition);
}

/** Boats currently occupying a berth at a port (loading or in the yard —
 *  a dead boat under repair hogs the dock, which is part of the pain). */
export function portBerthsBusy(state: GameState, portId: string): number {
  let n = 0;
  for (const b of state.boats)
    if (
      b.atPort === portId &&
      (b.phase === "atPort" || b.phase === "maint" || b.phase === "repair")
    )
      n++;
  return n;
}

/** Advance one boat through today's legs (from the active sheet). Each leg:
 *  wait for its slot and a berth at `from`, dwell/board, sail to the other
 *  end, deliver/transfer, move to the next leg. Multi-stop loops are just
 *  consecutive legs whose `from` is the previous arrival. */
export function stepBoat(state: GameState, boat: Boat, dtMin: number): void {
  const open =
    state.clock >= CONFIG.operatingStart && state.clock < CONFIG.operatingEnd;

  switch (boat.phase) {
    case "idle": {
      // low tank + a port that sells fuel = fill up while sitting here
      maybeRefuel(state, boat, boat.lastPort);
      // a queued overhaul takes priority over the timetable — that's the
      // planning decision: the boat is out of service while the yard has it
      if (boat.serviceRequested) {
        const hub = state.ports[state.hubId];
        if (portBerthsBusy(state, state.hubId) < hub.slips.length) beginService(state, boat);
        return;
      }
      const legs = todaysLegs(state, boat);
      const leg = legs[boat.legIdx];
      if (!leg || !open) return; // done for the day, or closed
      const R = state.routes[leg.routeId];
      if (!R || (leg.from !== R.def.from && leg.from !== R.def.to)) {
        boat.legIdx++; // stale leg (route or port gone) — skip it
        return;
      }
      if (state.clock >= leg.depart) {
        // hold offshore until a berth frees up at the departure port
        if (portBerthsBusy(state, leg.from) >= state.ports[leg.from].slips.length) return;
        boat.routeId = leg.routeId;
        boat.sailFrom = leg.from;
        boat.atPort = leg.from;
        boat.phase = "atPort";
        boat.timer = 0;
        boat.tripLate = state.clock - leg.depart > CONFIG.lateGraceMin;
        maybeRefuel(state, boat, leg.from); // top up (if low) before the crossing
      }
      break;
    }
    case "atPort": {
      const R = state.routes[boat.routeId!];
      boat.timer += dtMin;
      // loading speed is a staffing lever: skeleton crews load slower, full
      // crews turn the boat around faster
      if (boat.timer >= dwellMinutes(boat)) {
        boardAt(state, boat, boat.sailFrom!, otherEnd(R, boat.sailFrom!), R);
        chargeSailing(state, boat, R);
        R.sailingsToday++;
        boat.phase = "sailing";
        boat.atPort = null;
        boat.p = 0;
        boat.timer = 0;
      }
      break;
    }
    case "sailing": {
      const R = state.routes[boat.routeId!];
      // an empty tank is worse than a breakdown: crawl until the boat reaches
      // a port that sells fuel (the crossing still drains nothing — it's dry)
      const speedMult =
        (boat.limping ? CONFIG.maint.limpSpeedFactor : 1) *
        (boat.fuelNm <= 0 ? CONFIG.fuelCfg.emptySpeedFactor : 1);
      const dp = (dtMin * speedMult) / crossingFor(R, boat.classId);
      boat.p += dp;
      boat.fuelNm = Math.max(0, boat.fuelNm - R.def.distanceNm * dp);
      if (boat.p >= 1) {
        boat.p = 1;
        const dest = otherEnd(R, boat.sailFrom!);
        arriveAt(state, boat, dest);
        boat.legIdx++;
        boat.lastPort = dest;
        if (boat.limping) {
          beginRepair(state, boat, dest);
          return;
        }
        boat.phase = "idle";
        boat.routeId = null;
        boat.sailFrom = null;
      }
      break;
    }
    case "maint":
    case "repair": {
      boat.timer += dtMin;
      if (boat.timer >= boat.downMin) {
        boat.condition = boat.phase === "maint" ? 100 : CONFIG.maint.repairRestoreTo;
        boat.phase = "idle";
        if (boat.atPort) boat.lastPort = boat.atPort;
        boat.atPort = null;
        boat.timer = 0;
        boat.downMin = 0;
      }
      break;
    }
  }
}
