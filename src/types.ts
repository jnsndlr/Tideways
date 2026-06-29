// Shared data shapes for the ferry simulation.
// Keeping these explicit makes the model self-documenting and lets the sim run
// headless (no DOM / no canvas) so it can be tested and parameter-swept.

export interface Vec2 {
  x: number;
  y: number;
}

export interface RouteDef {
  id: string;
  name: string;
  color: string;
  distanceNm: number; // one-way distance, nautical miles
  crossingMin: number; // one-way crossing time, in-game minutes
  dailyFoot: number; // potential foot trips/day (both directions)
  dailyCars: number; // potential car trips/day (both directions)
  pos: Vec2; // normalized 0..1 map position of the destination terminal
}

export interface Queue {
  foot: number; // foot passengers waiting
  car: number; // cars waiting
  footWait: number; // minutes the foot queue has been waiting
  carWait: number; // minutes the car queue has been waiting
}

export interface RouteState {
  def: RouteDef;
  out: Queue; // hub -> destination
  in: Queue; // destination -> hub
  servedToday: number; // people served today (foot + in-car)
  balkedToday: number; // people who gave up today
}

export type BoatPhase = "hub" | "out" | "dest" | "back";
export type Direction = "out" | "in";

export interface BoatCargo {
  foot: number;
  car: number;
  dir: Direction;
}

export interface Boat {
  id: number;
  name: string;
  routeId: string | null; // currently serving (adopted at hub)
  pendingRoute: string | null; // queued assignment, takes effect at hub
  phase: BoatPhase;
  p: number; // 0..1 progress along the crossing
  timer: number; // minutes elapsed during a load
  pax: BoatCargo; // cargo currently aboard
}

export interface GameState {
  cash: number;
  day: number;
  clock: number; // in-game minutes 0..1440
  rep: number; // reputation 0..100
  speed: number; // 0 | 1 | 2 | 4
  routes: Record<string, RouteState>;
  boats: Boat[];
  boatCounter: number;
}
