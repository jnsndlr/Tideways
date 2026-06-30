// Data shapes for the ferry simulation (v0.3: ports, O/D queues, transfers).
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
  dailyCost: number; // fixed daily overhead to own the hull (idle or not)
}

export interface SegmentDef {
  id: string;
  name: string;
  color: string;
  icon: string;
  patienceMin: number; // how long this segment tolerates waiting (per leg)
  carShare: number; // fraction of this segment's people that travel with a car (0 = foot only)
  elastFoot: number; // price elasticity (foot)
  elastCar: number; // price elasticity (car)
  peaks: [number, number, number][]; // [centerMin, widthMin, height] daily curve
}

// A port is a place: the mainland hub or an island. Gravity weights drive O/D
// demand — pop = propensity to originate trips, draw = attractiveness as a
// destination, both per segment so each port keeps its character.
export interface PortDef {
  id: string;
  name: string;
  color: string;
  pos: Vec2;
  isHub?: boolean; // the mainland gateway (only one); its slip count = fleet cap
  startDocked?: boolean; // begins the game with a dock (hub always does)
  pop: Record<string, number>; // origin weight by segment id
  draw: Record<string, number>; // destination weight by segment id
}

// A route is a physical leg/service between two ports (a boat sails it both ways).
export interface RouteDef {
  id: string;
  name: string;
  color: string;
  from: string; // port id (home end — boats start a trip here)
  to: string; // port id (far end)
  distanceNm: number;
  crossingMin: number; // base one-way crossing at speedFactor 1.0
}

// ---- Runtime state --------------------------------------------------------

export interface SegQueue {
  foot: number;
  car: number;
  wait: number; // minutes the oldest in this dest/seg has waited (resets per leg)
}

// Riders waiting at a port, bucketed by final destination then segment.
export type PortQueues = Record<string, Record<string, SegQueue>>; // destPortId -> segId -> queue

export interface PortState {
  def: PortDef;
  queues: PortQueues;
  servedToday: number;
  balkedToday: number;
  balkedYesterday: number;
  segRep: Record<string, number>; // per-segment reputation 0..100
  segDemandRep: Record<string, number>; // per-segment snapshot driving today's turnout
  rep: number; // port-average reputation (derived; for HUD + map marker)
  demandRep: number; // port-average snapshot (derived; for summaries)
  slips: number[]; // size tier of each slip; empty = locked port (no dock)
}

export interface RouteState {
  def: RouteDef;
  sailingsToday: number;
  footPrice: number;
  carPrice: number;
}

export interface Trip {
  id: number;
  routeId: string;
  depart: number; // in-game minute of scheduled departure from the route's home end
}

// "hold": arrived at a port but every slip is occupied — waiting offshore.
export type BoatPhase = "idle" | "atHome" | "out" | "hold" | "atFar" | "back";

export interface Boat {
  id: number;
  name: string;
  classId: string;
  itinerary: Trip[]; // ordered daily timetable (repeats each day)
  nextTripIdx: number; // pointer into itinerary for today
  phase: BoatPhase;
  routeId: string | null; // route of the active trip
  atPort: string | null; // port whose berth this boat occupies while loading (else null)
  p: number; // 0..1 along the current crossing
  timer: number; // minutes elapsed during a load (or held offshore)
  cargo: PortQueues; // riders aboard, bucketed by final destination then segment
  pax: { foot: number; car: number }; // aggregate of cargo (for display)
  tripLate: boolean; // the active trip departed past its scheduled slot — no goodwill earned
}

export interface GameState {
  cash: number;
  day: number;
  clock: number;
  rep: number; // fleet-wide average (HUD)
  speed: number;
  ports: Record<string, PortState>;
  routes: Record<string, RouteState>;
  boats: Boat[];
  boatCounter: number;
  tripCounter: number;
  hubId: string; // id of the hub port (home berths live there)
  daysInDebt: number; // consecutive day rollovers ending with cash < 0
  gameOver: boolean;
  companyValue: number; // cash + resale value of the fleet (HUD score)
}
