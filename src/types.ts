// Data shapes for the ferry simulation (v0.2: vessels, segments, interlining).
// The sim runs headless (no DOM / no canvas) so it stays testable.

export interface Vec2 {
  x: number;
  y: number;
}

// ---- Static definitions (from CONFIG) -------------------------------------

export interface VesselClass {
  id: string;
  name: string;
  short: string;
  peopleCap: number; // total people incl. those in cars
  carCap: number; // car-deck slots (0 = passenger-only)
  speedFactor: number; // >1 faster: crossing = route.crossingMin / speedFactor
  fuelPerNm: number; // $ per nautical mile per crossing
  cost: number;
}

export interface SegmentDef {
  id: string;
  name: string;
  color: string;
  icon: string;
  patienceMin: number; // how long this segment tolerates waiting
  elastFoot: number; // price elasticity (foot)
  elastCar: number; // price elasticity (car)
  peaks: [number, number, number][]; // [centerMin, widthMin, height] daily curve
}

export interface RouteDef {
  id: string;
  name: string;
  color: string;
  distanceNm: number;
  crossingMin: number; // base one-way crossing at speedFactor 1.0
  pos: Vec2;
  demand: Record<string, { foot: number; car: number }>; // by segment id
}

// ---- Runtime state --------------------------------------------------------

export interface SegQueue {
  foot: number;
  car: number;
  wait: number; // minutes the oldest in this seg/dir has waited
}

export type DirQueue = Record<string, SegQueue>; // segment id -> queue

export interface RouteState {
  def: RouteDef;
  out: DirQueue; // hub -> destination
  in: DirQueue; // destination -> hub
  servedToday: number;
  balkedToday: number;
  balkedYesterday: number;
  sailingsToday: number;
  rep: number; // per-community reputation 0..100
  demandRep: number; // reputation snapshot driving today's turnout
  footPrice: number;
  carPrice: number;
}

export interface Trip {
  id: number;
  routeId: string;
  depart: number; // in-game minute of scheduled hub departure
}

export type BoatPhase = "idle" | "hub" | "out" | "dest" | "back";

export interface Boat {
  id: number;
  name: string;
  classId: string;
  itinerary: Trip[]; // ordered daily timetable (repeats each day)
  nextTripIdx: number; // pointer into itinerary for today
  phase: BoatPhase;
  routeId: string | null; // route of the active trip
  p: number; // 0..1 along the current crossing
  timer: number; // minutes elapsed during a load
  pax: { foot: number; car: number }; // aggregate cargo (for display)
}

export interface GameState {
  cash: number;
  day: number;
  clock: number;
  rep: number; // fleet-wide average (HUD)
  speed: number;
  routes: Record<string, RouteState>;
  boats: Boat[];
  boatCounter: number;
  tripCounter: number;
}
