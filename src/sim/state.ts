import { CONFIG, maxDockTier, vesselById, vesselRank } from "../config";
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
      slips: docked ? [CONFIG.ports.islandStartTier] : [],
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
    hubSlips: [...CONFIG.ports.hubStartSlips],
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
    p: 0,
    timer: 0,
    pax: { foot: 0, car: 0 },
  };
  state.boats.push(boat);
  return boat;
}

/** Why a vessel class can't currently be bought, or null if it can. */
export function buyBlocker(state: GameState, classId: string): "berth" | "size" | "cash" | null {
  const vc = vesselById(classId);
  if (state.boats.length >= state.hubSlips.length) return "berth"; // no free home slip
  if (vesselRank(classId) > portMaxTier(state.hubSlips)) return "size"; // slips too small
  if (state.cash < vc.cost) return "cash";
  return null;
}

/** Purchase a vessel: needs a free home berth, a big-enough home slip, and cash. */
export function buyBoat(state: GameState, classId: string): Boat | null {
  if (buyBlocker(state, classId) !== null) return null;
  state.cash -= vesselById(classId).cost;
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

// ---- Ports & slips --------------------------------------------------------

/** The slip-tier array for a port. portId === "hub" is the home port. */
export function portSlips(state: GameState, portId: string): number[] {
  return portId === "hub" ? state.hubSlips : state.routes[portId].slips;
}

/** Largest vessel rank a port can berth (-1 if it has no slips). */
export function portMaxTier(slips: number[]): number {
  return slips.length ? Math.max(...slips) : -1;
}

/** Cost to add another slip to a port (rises with each slip already built). */
export function addSlipCost(slips: number[]): number {
  return CONFIG.ports.addSlipCost * Math.max(1, slips.length);
}

/** Cost to upgrade a slip one size tier, or null if already at the top. */
export function slipUpgradeCost(tier: number): number | null {
  const target = tier + 1;
  if (target > maxDockTier) return null;
  return CONFIG.ports.sizeUpgradeCost[target];
}

/** Build the first slip on a locked island (tier 0). */
export function buildDock(state: GameState, routeId: string): boolean {
  const R = state.routes[routeId];
  if (!R || R.slips.length) return false;
  const cost = CONFIG.ports.buildSlipCost;
  if (state.cash < cost) return false;
  state.cash -= cost;
  R.slips.push(0);
  return true;
}

/** Add another berth to a port (more simultaneous capacity / fleet cap at hub). */
export function addSlip(state: GameState, portId: string): boolean {
  const slips = portSlips(state, portId);
  if (portId !== "hub" && !slips.length) return false; // build a dock first
  const cost = addSlipCost(slips);
  if (state.cash < cost) return false;
  state.cash -= cost;
  slips.push(0);
  return true;
}

/** Upgrade one slip at a port to the next size tier. */
export function upgradeSlip(state: GameState, portId: string, idx: number): boolean {
  const slips = portSlips(state, portId);
  const tier = slips[idx];
  if (tier === undefined) return false;
  const cost = slipUpgradeCost(tier);
  if (cost === null || state.cash < cost) return false;
  state.cash -= cost;
  slips[idx] += 1;
  return true;
}
