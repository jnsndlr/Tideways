import { CONFIG, HUB_ID, maxDockTier, vesselById, vesselRank } from "../config";
import type { Boat, GameState, PortState, RouteState } from "../types";

function newSegReps(value: number): Record<string, number> {
  const r: Record<string, number> = {};
  for (const seg of CONFIG.segments) r[seg.id] = value;
  return r;
}

export function createState(): GameState {
  const ports: Record<string, PortState> = {};
  for (const def of CONFIG.ports) {
    const docked = def.startDocked === true;
    const slips = docked
      ? def.isHub
        ? [...CONFIG.slipCfg.hubStartSlips]
        : [CONFIG.slipCfg.islandStartTier]
      : [];
    ports[def.id] = {
      def,
      queues: {},
      servedToday: 0,
      servedYesterday: 0,
      balkedToday: 0,
      balkedYesterday: 0,
      segRep: newSegReps(CONFIG.repStart),
      segDemandRep: newSegReps(CONFIG.repStart),
      rep: CONFIG.repStart,
      demandRep: CONFIG.repStart,
      slips,
    };
  }

  const routes: Record<string, RouteState> = {};
  for (const def of CONFIG.routes) {
    routes[def.id] = {
      def,
      sailingsToday: 0,
      sailingsYesterday: 0,
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
    ports,
    routes,
    boats: [],
    boatCounter: 0,
    tripCounter: 0,
    hubId: HUB_ID,
    fuelToday: 0,
    revenueToday: 0,
    fuelYesterday: 0,
    revenueYesterday: 0,
    daysInDebt: 0,
    gameOver: false,
    companyValue: CONFIG.startCash,
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
    atPort: null,
    p: 0,
    timer: 0,
    cargo: {},
    pax: { foot: 0, car: 0 },
    tripLate: false,
  };
  state.boats.push(boat);
  return boat;
}

/** Why a vessel class can't currently be bought, or null if it can. */
export function buyBlocker(state: GameState, classId: string): "berth" | "size" | "cash" | null {
  const vc = vesselById(classId);
  const hubSlips = state.ports[state.hubId].slips;
  if (state.boats.length >= hubSlips.length) return "berth"; // no free home slip
  if (vesselRank(classId) > portMaxTier(hubSlips)) return "size"; // slips too small
  if (state.cash < vc.cost) return "cash";
  return null;
}

/** Purchase a vessel: needs a free home berth, a big-enough home slip, and cash. */
export function buyBoat(state: GameState, classId: string): Boat | null {
  if (buyBlocker(state, classId) !== null) return null;
  state.cash -= vesselById(classId).cost;
  return addBoat(state, classId);
}

/** Add a trip (round trip on a route) to a boat's daily itinerary, sorted. */
export function addTrip(state: GameState, boat: Boat, routeId: string, depart: number): void {
  state.tripCounter++;
  boat.itinerary.push({ id: state.tripCounter, routeId, depart });
  boat.itinerary.sort((a, b) => a.depart - b.depart);
}

export function removeTrip(boat: Boat, tripId: number): void {
  boat.itinerary = boat.itinerary.filter((t) => t.id !== tripId);
}

// ---- Ports & slips --------------------------------------------------------

/** The slip-tier array for a port (the hub is just a port). */
export function portSlips(state: GameState, portId: string): number[] {
  return state.ports[portId].slips;
}

/** Largest vessel rank a port can berth (-1 if it has no slips). */
export function portMaxTier(slips: number[]): number {
  return slips.length ? Math.max(...slips) : -1;
}

/** Cost to add another slip to a port (rises with each slip already built). */
export function addSlipCost(slips: number[]): number {
  return CONFIG.slipCfg.addSlipCost * Math.max(1, slips.length);
}

/** Cost to upgrade a slip one size tier, or null if already at the top. */
export function slipUpgradeCost(tier: number): number | null {
  const target = tier + 1;
  if (target > maxDockTier) return null;
  return CONFIG.slipCfg.sizeUpgradeCost[target];
}

/** Build the first slip on a locked port (tier 0). */
export function buildDock(state: GameState, portId: string): boolean {
  const P = state.ports[portId];
  if (!P || P.slips.length) return false;
  const cost = CONFIG.slipCfg.buildSlipCost;
  if (state.cash < cost) return false;
  state.cash -= cost;
  P.slips.push(0);
  return true;
}

/** Add another berth to a port (more simultaneous capacity / fleet cap at hub). */
export function addSlip(state: GameState, portId: string): boolean {
  const P = state.ports[portId];
  if (!P) return false;
  if (!P.def.isHub && !P.slips.length) return false; // build a dock first
  const cost = addSlipCost(P.slips);
  if (state.cash < cost) return false;
  state.cash -= cost;
  P.slips.push(0);
  return true;
}

/** Upgrade one slip at a port to the next size tier. */
export function upgradeSlip(state: GameState, portId: string, idx: number): boolean {
  const P = state.ports[portId];
  if (!P) return false;
  const tier = P.slips[idx];
  if (tier === undefined) return false;
  const cost = slipUpgradeCost(tier);
  if (cost === null || state.cash < cost) return false;
  state.cash -= cost;
  P.slips[idx] += 1;
  return true;
}
