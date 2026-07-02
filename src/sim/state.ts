import { CONFIG, HUB_ID, maxDockTier, nmBetween, vesselById, vesselRank } from "../config";
import type { Boat, GameState, Leg, PortState, RouteDef, RouteState, Sheet } from "../types";
import { crossingFor } from "./schedule";

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
      pop: { ...def.pop },
      draw: { ...def.draw },
      segServedWeek: newSegReps(0),
      segBalkedWeek: newSegReps(0),
      seatsWeek: 0,
      segGrowth: newSegReps(0),
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
    sheets: [{ id: 1, name: "Base", dayType: "any", season: "any", legs: {}, plans: [] }],
    boatCounter: 0,
    legCounter: 0,
    sheetCounter: 1,
    planCounter: 0,
    hubId: HUB_ID,
    fuelToday: 0,
    crewToday: 0,
    maintToday: 0,
    revenueToday: 0,
    fuelYesterday: 0,
    crewYesterday: 0,
    maintYesterday: 0,
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
    legIdx: 0,
    phase: "idle",
    routeId: null,
    sailFrom: null,
    atPort: null,
    lastPort: state.hubId,
    p: 0,
    timer: 0,
    cargo: {},
    pax: { foot: 0, car: 0 },
    tripLate: false,
    condition: 100,
    limping: false,
    serviceRequested: false,
    downMin: 0,
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

/** What selling a hull returns: the resale share of its purchase price, scaled
 *  by condition — running a boat into the ground shows up in its price tag. */
export function sellPrice(boat: Boat): number {
  const floor = CONFIG.maint.resaleConditionFloor;
  const conditionShare = floor + (1 - floor) * (boat.condition / 100);
  return vesselById(boat.classId).cost * CONFIG.economy.resaleFactor * conditionShare;
}

/** Sell an owned vessel (must not be mid-operation). Frees its home berth and
 *  discards its timetables (on every sheet) — this is the lever that makes
 *  seasonal fleet-sizing a real decision instead of a ratchet. */
export function sellBoat(state: GameState, boatId: number): boolean {
  const i = state.boats.findIndex((b) => b.id === boatId);
  if (i < 0) return false;
  if (state.boats[i].phase !== "idle") return false; // finish the crossing first
  state.cash += sellPrice(state.boats[i]);
  state.boats.splice(i, 1);
  for (const sheet of state.sheets) {
    delete sheet.legs[boatId];
    for (const plan of sheet.plans) plan.boatIds = plan.boatIds.filter((b) => b !== boatId);
  }
  return true;
}

// ---- Legs (scheduling) ------------------------------------------------------

/** Add one leg (a single one-way sailing) to a boat's timetable on a sheet. */
export function addLeg(
  state: GameState,
  sheet: Sheet,
  boatId: number,
  routeId: string,
  from: string,
  depart: number,
  planId?: number,
): Leg {
  state.legCounter++;
  const leg: Leg = { id: state.legCounter, routeId, from, depart };
  if (planId !== undefined) leg.planId = planId;
  const legs = (sheet.legs[boatId] ??= []);
  legs.push(leg);
  legs.sort((a, b) => a.depart - b.depart);
  return leg;
}

/** Add a classic round trip: an out leg from the route's home end, and the
 *  back leg departing on arrival. What a manual timeline drag creates. */
export function addRoundTrip(
  state: GameState,
  sheet: Sheet,
  boat: Boat,
  routeId: string,
  depart: number,
): [Leg, Leg] {
  const R = state.routes[routeId];
  const backDepart = depart + CONFIG.loadMinutes + Math.ceil(crossingFor(R, boat.classId));
  return [
    addLeg(state, sheet, boat.id, routeId, R.def.from, depart),
    addLeg(state, sheet, boat.id, routeId, R.def.to, backDepart),
  ];
}

/** Remove one leg. Hand-removing a plan-stamped leg detaches it from the plan
 *  implicitly (the leg is simply gone; the plan re-stamps it on regenerate). */
export function removeLeg(sheet: Sheet, boatId: number, legId: number): void {
  const legs = sheet.legs[boatId];
  if (legs) sheet.legs[boatId] = legs.filter((l) => l.id !== legId);
}

/** Retime a leg (timeline drag). A plan-stamped leg detaches: it becomes a
 *  plain manual leg the plan no longer owns. */
export function moveLeg(sheet: Sheet, boatId: number, legId: number, depart: number): void {
  const legs = sheet.legs[boatId];
  if (!legs) return;
  const leg = legs.find((l) => l.id === legId);
  if (!leg) return;
  leg.depart = depart;
  delete leg.planId;
  legs.sort((a, b) => a.depart - b.depart);
}

/** Move a leg to another boat's lane (interlining drag). Detaches from plans. */
export function transferLeg(
  sheet: Sheet,
  fromBoatId: number,
  toBoatId: number,
  legId: number,
  depart: number,
): void {
  const src = sheet.legs[fromBoatId];
  if (!src) return;
  const leg = src.find((l) => l.id === legId);
  if (!leg) return;
  sheet.legs[fromBoatId] = src.filter((l) => l.id !== legId);
  leg.depart = depart;
  delete leg.planId;
  const dst = (sheet.legs[toBoatId] ??= []);
  dst.push(leg);
  dst.sort((a, b) => a.depart - b.depart);
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

// ---- Direct routes ----------------------------------------------------------
// Connecting two already-docked ports is free: the money gate is the docks
// themselves. A route is just the drawn line that fares and legs hang off.

/** Whether a direct route already exists between these two ports (either direction). */
export function routeExistsBetween(state: GameState, a: string, b: string): boolean {
  for (const id in state.routes) {
    const def = state.routes[id].def;
    if ((def.from === a && def.to === b) || (def.from === b && def.to === a)) return true;
  }
  return false;
}

/** Docked ports eligible to be connected directly to `portId` (excludes itself and already-linked ports). */
export function routeCandidates(state: GameState, portId: string): PortState[] {
  return Object.values(state.ports).filter(
    (P) => P.def.id !== portId && P.slips.length > 0 && !routeExistsBetween(state, portId, P.def.id),
  );
}

/** Open (connect) a direct route between two already-docked ports — free. */
export function openRoute(state: GameState, fromId: string, toId: string): RouteState | null {
  const a = state.ports[fromId];
  const b = state.ports[toId];
  if (!a?.slips.length || !b?.slips.length) return null;
  if (fromId === toId || routeExistsBetween(state, fromId, toId)) return null;
  const distanceNm = Math.round(nmBetween(a.def.pos, b.def.pos) * 10) / 10;

  const id = `r-${fromId}-${toId}`;
  const def: RouteDef = {
    id,
    name: `${a.def.name} ↔ ${b.def.name}`,
    color: b.def.color,
    from: fromId,
    to: toId,
    distanceNm,
    crossingMin: Math.round(distanceNm * CONFIG.routeCfg.minPerNm),
  };
  const R: RouteState = {
    def,
    sailingsToday: 0,
    sailingsYesterday: 0,
    footPrice: CONFIG.fare.foot,
    carPrice: CONFIG.fare.car,
  };
  state.routes[id] = R;
  return R;
}
