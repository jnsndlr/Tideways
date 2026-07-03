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
  fuelPerNm: number; // $ per nautical mile at STANDARD grade (paid when refueling)
  tankNm: number; // fuel tank size, in nautical miles of range
  cost: number;
  moorageDaily: number; // small fixed daily cost to own the hull (moorage/insurance)
  crewPerSailing: number; // crew wages charged per departure, at STANDARD staffing
}

// Fuel grades: what's in the tank changes price AND how fast the engine wears.
export type FuelGrade = "low" | "standard" | "high";

export interface FuelGradeDef {
  name: string;
  priceMult: number; // × fuelPerNm when buying this grade
  wearMult: number; // × condition wear per nm while burning this grade
}

// Staffing levels: how many crew each boat sails with.
export type Staffing = "minimal" | "standard" | "full";

export interface StaffingDef {
  name: string;
  crewCostMult: number; // × crewPerSailing wages each departure
  loadTimeMult: number; // × dwell (loading) time at each terminal
  wearMult: number; // × condition wear per nm (skeleton crews skip upkeep)
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
  weekendMult: number; // volume multiplier on weekend days (weekday = 1.0)
  seasonMult: Record<string, number>; // volume multiplier by season id (missing = 1.0)
}

export interface SeasonDef {
  id: string;
  name: string;
  icon: string;
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
  missed: boolean; // a sailing they could use departed without them (starts the patience clock)
}

// Riders waiting at a port, bucketed by final destination then segment.
export type PortQueues = Record<string, Record<string, SegQueue>>; // destPortId -> segId -> queue

export interface PortState {
  def: PortDef;
  queues: PortQueues;
  // Living community: pop/draw start at def.pop/def.draw and move with the
  // weekly growth tick — service quality is what makes a town grow or shrink.
  pop: Record<string, number>; // living origin weight by segment
  draw: Record<string, number>; // living destination appeal by segment
  segServedWeek: Record<string, number>; // riders boarded here this week, per segment
  segBalkedWeek: Record<string, number>; // riders who gave up here this week, per segment
  seatsWeek: number; // people-capacity of every departure from here this week
  segGrowth: Record<string, number>; // last weekly growth rate per segment (for UI trends)
  servedToday: number;
  servedYesterday: number;
  balkedToday: number;
  balkedYesterday: number;
  segRep: Record<string, number>; // per-segment reputation 0..100
  segDemandRep: Record<string, number>; // per-segment snapshot driving today's turnout
  rep: number; // port-average reputation (derived; for HUD + map marker)
  demandRep: number; // port-average snapshot (derived; for summaries)
  slips: number[]; // size tier of each slip; empty = locked port (no dock)
  fuelDepot: boolean; // boats can refuel here (the hub always can; islands buy it)
}

export interface RouteState {
  def: RouteDef;
  sailingsToday: number;
  sailingsYesterday: number;
  footPrice: number;
  carPrice: number;
}

// A leg is ONE scheduled one-way sailing: dwell at `from` starting at `depart`,
// then cross to the route's other end. Round trips are two legs; multi-stop
// loops are chains of legs. Legs stamped by a service plan carry its planId —
// hand-editing such a leg detaches it (planId cleared).
export interface Leg {
  id: number;
  routeId: string;
  from: string; // departure port (one end of the route)
  depart: number; // in-game minute the dwell/loading starts
  planId?: number; // owning service plan, if generator-stamped
}

// A service plan is the live object behind generated timetables: an ordered
// stop list (2 stops = out-and-back, 3+ = loop that wraps), a service window,
// a headway, and the boats that run it. Re-stamping regenerates its legs.
export interface Plan {
  id: number;
  name: string;
  stops: string[]; // ordered docked port ids
  headwayMin: number;
  winStart: number; // first departure (minute)
  winEnd: number; // no departures after this minute
  boatIds: number[];
}

export type SheetDayType = "any" | "weekday" | "weekend";

// A schedule sheet is a complete named timetable (WSF-style: "Base",
// "Winter weekends"). Exactly one sheet runs on any given day — the most
// specific match on (dayType, season); ties go to the newest sheet. The first
// sheet is the base (any/any) and can't be deleted.
export interface Sheet {
  id: number;
  name: string;
  dayType: SheetDayType;
  season: string; // "any" or a season id
  legs: Record<number, Leg[]>; // per boat id, sorted by depart
  plans: Plan[];
}

// "maint": scheduled overhaul at the home port; "repair": emergency yard stay
// after a breakdown, wherever the boat limped in — both occupy a berth.
export type BoatPhase = "idle" | "atPort" | "sailing" | "maint" | "repair";

export interface Boat {
  id: number;
  name: string;
  classId: string;
  legIdx: number; // pointer into today's legs (from the active sheet)
  phase: BoatPhase;
  routeId: string | null; // route of the active leg
  sailFrom: string | null; // departure end of the active leg (direction)
  atPort: string | null; // port whose berth this boat occupies while loading (else null)
  lastPort: string; // where an idle boat physically sits (rendering + realism)
  p: number; // 0..1 along the current crossing (sailFrom -> other end)
  timer: number; // minutes elapsed during a load (or in the yard)
  cargo: PortQueues; // riders aboard, bucketed by final destination then segment
  pax: { foot: number; car: number }; // aggregate of cargo (for display)
  tripLate: boolean; // the active leg departed past its scheduled slot — no goodwill earned
  condition: number; // 0..100 hull/machinery state; wears per nm sailed
  limping: boolean; // broke down this crossing — half speed, yard stay on arrival
  serviceRequested: boolean; // player queued a scheduled overhaul for the next idle moment
  downMin: number; // total minutes of the current yard stay (maint/repair)
  fuelNm: number; // fuel left in the tank, in nm of range (empty = 10% crawl)
  fuelGrade: FuelGrade; // what gets pumped at the next fill-up
  staffing: Staffing; // crew level this boat sails with
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
  sheets: Sheet[]; // sheets[0] is the base timetable (any/any, undeletable)
  boatCounter: number;
  legCounter: number;
  sheetCounter: number;
  planCounter: number;
  hubId: string; // id of the hub port (home berths live there)
  fuelToday: number; // fuel $ spent so far today (accumulates; reset at rollover)
  crewToday: number; // crew wages $ paid so far today (per departed sailing)
  maintToday: number; // yard $ spent so far today (overhauls + emergency repairs)
  revenueToday: number; // fare $ taken so far today
  fuelYesterday: number; // previous full day's fuel spend (stable readout)
  crewYesterday: number; // previous full day's crew wages
  maintYesterday: number; // previous full day's yard spend
  revenueYesterday: number; // previous full day's fare revenue
  daysInDebt: number; // consecutive day rollovers ending with cash < 0
  gameOver: boolean;
  companyValue: number; // cash + resale value of the fleet (HUD score)
}
