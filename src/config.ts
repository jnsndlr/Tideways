import type { FuelGradeDef, PortDef, RouteDef, SeasonDef, SegmentDef, StaffingDef, Vec2, VesselClass } from "./types";

// ═════════════════════════════════════════════════════════════════════════════
//  TIDEWAYS — GAME BALANCE SETTINGS
//
//  Every tunable number in the game lives in this one file. Each setting has a
//  comment saying what it does, what unit it's in, and (where it matters) what
//  happens if you raise or lower it. Change a number, save, and the dev server
//  reloads with the new balance — no other file needs touching.
//
//  Quick map of this file:
//    1. Money & time basics        (starting cash, clock speed, operating hours)
//    2. The ferries                (capacity, speed, FUEL USE, crew wages, tanks)
//    3. Fuel                       (grades, prices, refueling rules)  ← fuel costs
//    4. Crew staffing levels       (bare bones / standard / well staffed)
//    5. Solvency & fares
//    6. Calendar & community growth
//    7. Wear, maintenance & breakdowns
//    8. Passengers                 (patience, balking, reputation, demand)
//    9. The map                    (ports, islands, routes, slips)
// ═════════════════════════════════════════════════════════════════════════════

export const CONFIG = {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. MONEY & TIME BASICS
  // ───────────────────────────────────────────────────────────────────────────

  startCash: 5_000_000, // dollars in the bank on day 1

  gameMinPerSec: 6, // in-game minutes that pass per real second at 1× speed
  operatingStart: 6 * 60, // ferries may depart from 06:00...
  operatingEnd: 22 * 60, // ...until 22:00 (minutes past midnight)
  loadMinutes: 10, // minutes a boat spends loading at each terminal, at
  //                  STANDARD staffing. Staffing levels below stretch or
  //                  shrink this — it's the game's base "loading speed".
  lateGraceMin: 10, // a sailing departing more than this many minutes late
  //                  earns no reputation for the riders it carries
  avgOccupancy: 2.0, // people per car (used to convert cars ↔ people)

  // ───────────────────────────────────────────────────────────────────────────
  // 2. THE FERRIES
  //
  // What each column means:
  //   peopleCap      max people aboard (including people sitting in cars)
  //   carCap         car-deck spaces (0 = passenger-only boat)
  //   speedFactor    higher = faster crossings (1.5 = 50% faster than base)
  //   fuelPerNm      DOLLARS of fuel burned per nautical mile, at Standard
  //                  grade. Paid when the tank is refilled, not per sailing.
  //   tankNm         tank size, in nautical miles of range. Boats refill when
  //                  the tank drops below the threshold in fuelCfg below.
  //   cost           purchase price
  //   moorageDaily   small fixed daily cost of owning the hull (idle boats
  //                  are cheap to keep)
  //   crewPerSailing crew wages paid at EVERY departure, at Standard staffing
  //                  (a round trip = 2 sailings). This plus fuel is the big
  //                  ongoing cost — a packed timetable is what costs money.
  // ───────────────────────────────────────────────────────────────────────────
  vesselClasses: [
    { id: "po", name: "Passenger Express", short: "Express", peopleCap: 300, carCap: 0, speedFactor: 1.5, fuelPerNm: 12, tankNm: 500, cost: 200_000, moorageDaily: 700, crewPerSailing: 70 },
    { id: "hiyu", name: "M/V Hiyu", short: "Hiyu", peopleCap: 200, carCap: 34, speedFactor: 1.0, fuelPerNm: 24, tankNm: 450, cost: 320_000, moorageDaily: 1_500, crewPerSailing: 230 },
    { id: "medium", name: "M/V Issaquah", short: "Issaquah", peopleCap: 500, carCap: 80, speedFactor: 1.0, fuelPerNm: 36, tankNm: 420, cost: 650_000, moorageDaily: 2_800, crewPerSailing: 420 },
    { id: "large", name: "M/V Jumbo", short: "Jumbo", peopleCap: 900, carCap: 150, speedFactor: 0.9, fuelPerNm: 52, tankNm: 400, cost: 1_050_000, moorageDaily: 4_500, crewPerSailing: 700 },
  ] as VesselClass[],
  startVessel: "hiyu", // the boat you begin the game with

  // ───────────────────────────────────────────────────────────────────────────
  // 3. FUEL — grades, prices, and refueling rules
  //
  // Boats carry a real tank now. Sailing drains it; when it drops below the
  // refill threshold, the boat fills back up (and pays) the next time it
  // touches a port that sells fuel. The mainland hub always sells fuel;
  // islands need a fuel depot built first (cost below).
  //
  // A boat that runs completely dry mid-crossing limps at emptySpeedFactor
  // until it reaches somewhere it can refuel — schedule around your tanks!
  // ───────────────────────────────────────────────────────────────────────────
  fuelCfg: {
    refuelBelowFrac: 0.05, // refill when the tank is below this share (5%)
    emptySpeedFactor: 0.1, // speed when the tank is empty (10% = a crawl)
    fuelDepotCost: 220_000, // one-time cost to add refueling to an island port

    // Grade tradeoff: cheap fuel wears the engine faster (more breakdowns,
    // earlier overhauls); premium fuel costs more but keeps condition longer.
    //   priceMult  × fuelPerNm when buying     wearMult  × engine wear per nm
    grades: {
      low: { name: "Low grade", priceMult: 0.75, wearMult: 1.4 },
      standard: { name: "Standard", priceMult: 1.0, wearMult: 1.0 },
      high: { name: "Premium", priceMult: 1.3, wearMult: 0.7 },
    } as Record<string, FuelGradeDef>,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CREW STAFFING LEVELS — set per boat, changes the whole cost/speed shape
  //
  //   crewCostMult  × crew wages each departure
  //   loadTimeMult  × terminal loading time (1.25 = 25% slower loading)
  //   wearMult      × engine/hull wear (skeleton crews skip routine upkeep)
  //
  // Bare bones is cheap but loads slowly and wears the boat; Well staffed
  // costs more and turns the boat around faster (helps tight timetables
  // recover from delays).
  // ───────────────────────────────────────────────────────────────────────────
  staffing: {
    minimal: { name: "Bare bones", crewCostMult: 0.65, loadTimeMult: 1.25, wearMult: 1.2 },
    standard: { name: "Standard", crewCostMult: 1.0, loadTimeMult: 1.0, wearMult: 1.0 },
    full: { name: "Well staffed", crewCostMult: 1.4, loadTimeMult: 0.8, wearMult: 1.0 },
  } as Record<string, StaffingDef>,

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SOLVENCY & FARES
  // ───────────────────────────────────────────────────────────────────────────
  economy: {
    bankruptcyGraceDays: 3, // days you may run cash below $0 before the company folds
    resaleFactor: 0.5, // share of a hull's purchase price you get back selling it
  },

  // Reference fares = starting ticket prices (dollars). Riders pay PER BOARDED
  // LEG — a journey with a transfer pays each leg it rides. Price sensitivity
  // is measured against these reference values.
  fare: { foot: 14, car: 30 },
  priceBounds: { footMin: 4, footMax: 40, carMin: 10, carMax: 90, step: 2 }, // slider limits + step

  // ───────────────────────────────────────────────────────────────────────────
  // 6. CALENDAR & COMMUNITY GROWTH
  // ───────────────────────────────────────────────────────────────────────────

  // Weekly + seasonal demand rhythm. Day 1 is a Monday in spring. A compressed
  // year (daysPerSeason × 4 days) keeps seasonal re-planning on a prototype-
  // friendly cadence; raise daysPerSeason for a slower year.
  calendar: {
    weekdayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    weekendDays: [5, 6], // indices into weekdayNames (Sat, Sun)
    daysPerSeason: 7, // days each season lasts
    seasons: [
      { id: "spring", name: "Spring", icon: "\u{1F338}" },
      { id: "summer", name: "Summer", icon: "\u{2600}\u{FE0F}" },
      { id: "fall", name: "Fall", icon: "\u{1F342}" },
      { id: "winter", name: "Winter", icon: "\u{2744}\u{FE0F}" },
    ] as SeasonDef[],
  },

  // Community growth — the weekly tick (every Monday) that makes island
  // populations living state. Good service grows towns; neglect shrinks them.
  // Spare seat capacity gates the upside: a network sailing 100% full stops
  // attracting newcomers until you add capacity.
  growth: {
    maxWeeklyGrowth: 0.06, // best-case weekly population/appeal gain (6%)
    maxWeeklyShrink: 0.03, // worst-case weekly decline when neglected (3%)
    carriedTarget: 0.8, // carry this share of demand to be "serving well"
    repWeight: 0.4, // how much reputation (vs. seats delivered) drives growth
    minFactor: 0.5, // towns never shrink below half their starting size...
    maxFactor: 3.0, // ...or grow past 3× it
  },

  // Town size labels on the map — total living population → a visible tier.
  townTiers: [
    { name: "Outpost", minPop: 0 },
    { name: "Hamlet", minPop: 1_500 },
    { name: "Village", minPop: 2_100 },
    { name: "Town", minPop: 2_800 },
    { name: "Harbor Town", minPop: 4_200 },
    { name: "Port City", minPop: 6_500 },
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // 7. WEAR, MAINTENANCE & BREAKDOWNS
  //
  // Condition (0–100) wears down per nautical mile sailed — slowly. It's a
  // thing to keep an eye on over weeks, not a constant emergency. Fuel grade
  // and staffing (above) nudge the wear rate. Low condition raises breakdown
  // risk on a steep curve: a well-kept boat almost never breaks; a neglected
  // one becomes a coin flip. A scheduled overhaul is a planning decision (the
  // boat sits out its timetable in the yard); a breakdown is the expensive
  // version at the worst possible time.
  // ───────────────────────────────────────────────────────────────────────────
  maint: {
    wearPerNm: 0.005, // condition points lost per nm (≈0.5–1 point per busy day)
    serviceCostFrac: 0.015, // scheduled overhaul price, as a share of the hull's cost
    serviceMin: 960, // overhaul length: 16 hours in the yard, restores to 100
    repairCostFrac: 0.03, // emergency repair price, as a share of the hull's cost
    repairMin: 720, // breakdown repair: 12 hours dead at the dock
    repairRestoreTo: 70, // a breakdown patch job only restores condition to 70
    breakdownMaxPerSailing: 0.08, // breakdown chance per sailing at condition 0 (8%)
    limpSpeedFactor: 0.5, // crossing speed while broken down (half speed)
    resaleConditionFloor: 0.4, // a fully worn-out hull still fetches 40% of resale
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 8. PASSENGERS — patience, reputation, demand
  // ───────────────────────────────────────────────────────────────────────────

  // Patience & balking. Riders are patient until the system actually fails
  // them: nobody gives up while a sailing they can use is still scheduled
  // today. Only after a boat comes and leaves them behind (too full, or the
  // wrong deck) does their patience clock start; once it runs past their
  // segment's patienceMin (see segments below), a trickle gives up each
  // minute at this rate.
  balkRatePerMin: 0.004, // share of a fed-up queue that walks away per minute

  // Reputation (kept per port, per segment) — slow and forgiving.
  repStart: 80, // reputation every port starts with
  repServedGain: 0.000_6, // rep gained per rider carried (on-time sailings only)
  repBalkLoss: 0.002, // rep lost per rider who gives up waiting
  repDriftDown: 0.03, // above neutral: gently sags toward neutral each day
  repDriftUp: 0.01, // below neutral: barely floors you — you must earn it back
  repNeutral: 60, // the value reputation drifts toward
  repDemand: { atZero: 0.55, atNeutral: 1.0, atFull: 1.2 }, // turnout at rep 0 / 60 / 100

  // Origin/destination demand — a gravity model over ports: big towns generate
  // trips, attractive towns draw them, distance dampens the pull.
  od: {
    nmPerUnit: 18, // map is normalized 0..1; this scales positions into nautical miles
    decayScaleNm: 16, // distance decay: bigger = more long-haul/interisland demand
    tripsPerResident: { commuter: 0.6, tourist: 0.85, freight: 1.0 } as Record<string, number>, // daily trips per island resident
  },

  // Demand segments — three rider types with different rhythms and needs, so
  // one timetable can't be optimal all week (or all year).
  //   patienceMin   minutes they'll wait AFTER a boat leaves them behind
  //   carShare      share who bring a car (freight is all vehicles)
  //   elastFoot/Car price sensitivity (higher = raising fares scares them off)
  //   peaks         [minute-of-day, width, height] bumps in the daily curve
  //   weekendMult   volume multiplier on weekends
  //   seasonMult    volume multiplier by season (missing season = 1.0)
  segments: [
    {
      id: "commuter", name: "Commuters", color: "#57b6e0", icon: "\u{1F4BC}",
      patienceMin: 55, carShare: 0.35, elastFoot: 0.4, elastCar: 0.3,
      peaks: [[8 * 60, 55, 2.6], [17 * 60, 70, 2.3]], // sharp AM + PM rush
      weekendMult: 0.35, // weekends: barely anyone commutes
      seasonMult: { winter: 0.95 },
    },
    {
      id: "tourist", name: "Tourists", color: "#f3c14b", icon: "\u{1F392}",
      patienceMin: 160, carShare: 0.38, elastFoot: 1.3, elastCar: 0.9,
      peaks: [[12 * 60, 150, 1.6]], // broad midday bulge
      weekendMult: 1.6, // weekend getaways surge
      seasonMult: { spring: 0.9, summer: 1.5, fall: 0.8, winter: 0.45 },
    },
    {
      id: "freight", name: "Freight", color: "#e06f4f", icon: "\u{1F4E6}",
      patienceMin: 90, carShare: 1.0, elastFoot: 0.2, elastCar: 0.2,
      peaks: [[10 * 60, 240, 0.7], [15 * 60, 240, 0.7]], // steady daytime flow
      weekendMult: 0.5, // light weekend deliveries
      seasonMult: { summer: 1.1, winter: 0.9 },
    },
  ] as SegmentDef[],

  // Timetable editor: departures snap to this many minutes.
  scheduleSnapMin: 5,

  // ───────────────────────────────────────────────────────────────────────────
  // 9. THE MAP — ports, slips, routes
  // ───────────────────────────────────────────────────────────────────────────

  // Ports & slips — a port has one or more slips (berths); each slip has a
  // size tier = the largest vessel class it can berth (0 = Express, 1 = +Hiyu,
  // 2 = +Issaquah, 3 = +Jumbo). At the home port the slip COUNT is your fleet
  // cap and the biggest slip is the largest vessel you may own.
  slipCfg: {
    buildSlipCost: 180_000, // build the first dock on a locked island (Express-size)
    addSlipCost: 200_000, // × (current slip count) to add another berth to a port
    sizeUpgradeCost: [180_000, 130_000, 320_000, 550_000], // cost to raise a slip TO tier 0/1/2/3
    islandStartTier: 1, // islands you start with have one Hiyu-capable slip
    hubStartSlips: [1, 1, 1], // home berths: count = fleet cap, tiers = ownable sizes
  },

  // Direct routes (player-created, any port ↔ any port). Connecting two docked
  // ports is FREE — the money gate is the docks themselves.
  routeCfg: {
    minPerNm: 3.0, // crossing minutes per nautical mile for new routes
  },

  // Ports — the mainland hub plus the islands. pop = how many trips a place
  // generates; draw = how attractive it is as a destination (per rider
  // segment). Hub weights are large, so most trips touch the mainland.
  ports: [
    {
      id: "hub", name: "Anacortes", color: "#cfd8e0", pos: { x: 0.5, y: 0.9 },
      isHub: true, startDocked: true,
      pop: { commuter: 10_700, tourist: 20_800, freight: 2_740 },
      draw: { commuter: 10_700, tourist: 20_800, freight: 2_740 },
    },
    // --- islands you start with (docks already built, Hiyu-capable) ---
    {
      id: "lopez", name: "Lopez Island", color: "#5bd49a", startDocked: true, pos: { x: 0.16, y: 0.32 },
      pop: { commuter: 1380, tourist: 640, freight: 180 },
      draw: { commuter: 1380, tourist: 640, freight: 180 },
    },
    {
      id: "orcas", name: "Orcas Island", color: "#b98cdb", startDocked: true, pos: { x: 0.5, y: 0.14 },
      pop: { commuter: 820, tourist: 1700, freight: 160 },
      draw: { commuter: 820, tourist: 1700, freight: 160 },
    },
    {
      id: "friday", name: "Friday Harbor", color: "#f6a96b", startDocked: true, pos: { x: 0.85, y: 0.32 },
      pop: { commuter: 960, tourist: 2360, freight: 220 },
      draw: { commuter: 960, tourist: 2360, freight: 220 },
    },
    // --- fictional islands (locked: build a dock to open them) ---
    {
      id: "dovetail", name: "Dovetail", color: "#7fd1c8", pos: { x: 0.38, y: 0.30 },
      pop: { commuter: 1100, tourist: 480, freight: 140 },
      draw: { commuter: 1100, tourist: 480, freight: 140 },
    },
    {
      id: "cinderholm", name: "Cinder Holm", color: "#d98fb0", pos: { x: 0.62, y: 0.30 },
      pop: { commuter: 750, tourist: 1380, freight: 240 },
      draw: { commuter: 750, tourist: 1380, freight: 240 },
    },
    {
      id: "marrowcay", name: "Marrow Cay", color: "#a8c66c", pos: { x: 0.30, y: 0.54 },
      pop: { commuter: 1240, tourist: 550, freight: 160 },
      draw: { commuter: 1240, tourist: 550, freight: 160 },
    },
    {
      id: "thorngate", name: "Thorngate", color: "#e0a35e", pos: { x: 0.70, y: 0.54 },
      pop: { commuter: 860, tourist: 1080, freight: 280 },
      draw: { commuter: 860, tourist: 1080, freight: 280 },
    },
    {
      id: "saltcross", name: "Saltcross", color: "#6fb6e0", pos: { x: 0.10, y: 0.60 },
      pop: { commuter: 620, tourist: 1960, freight: 120 },
      draw: { commuter: 620, tourist: 1960, freight: 120 },
    },
    {
      id: "willowreach", name: "Willow Reach", color: "#c9a0e8", pos: { x: 0.90, y: 0.58 },
      pop: { commuter: 680, tourist: 2220, freight: 180 },
      draw: { commuter: 680, tourist: 2220, freight: 180 },
    },
    {
      id: "gullspit", name: "Gull Spit", color: "#e8d36f", pos: { x: 0.24, y: 0.07 },
      pop: { commuter: 480, tourist: 2640, freight: 140 },
      draw: { commuter: 480, tourist: 2640, freight: 140 },
    },
    {
      id: "halerock", name: "Hale Rock", color: "#e07f7f", pos: { x: 0.76, y: 0.06 },
      pop: { commuter: 420, tourist: 2040, freight: 400 },
      draw: { commuter: 420, tourist: 2040, freight: 400 },
    },
    {
      id: "fenharbor", name: "Fen Harbor", color: "#8ad6a0", pos: { x: 0.05, y: 0.42 },
      pop: { commuter: 1030, tourist: 780, freight: 220 },
      draw: { commuter: 1030, tourist: 780, freight: 220 },
    },
    {
      id: "blacktern", name: "Black Tern", color: "#9fb0c4", pos: { x: 0.95, y: 0.40 },
      pop: { commuter: 360, tourist: 2960, freight: 300 },
      draw: { commuter: 360, tourist: 2960, freight: 300 },
    },
  ] as PortDef[],

  // Routes — the seeded hub↔island legs (one per island). A leg is usable only
  // when BOTH endpoints are docked; building a dock on a locked island unlocks
  // its hub leg. Players can open more routes between any two docked ports.
  routes: [
    { id: "r-lopez", name: "Lopez Island", color: "#5bd49a", from: "hub", to: "lopez", distanceNm: 8, crossingMin: 25 },
    { id: "r-orcas", name: "Orcas Island", color: "#b98cdb", from: "hub", to: "orcas", distanceNm: 13, crossingMin: 40 },
    { id: "r-friday", name: "Friday Harbor", color: "#f6a96b", from: "hub", to: "friday", distanceNm: 16, crossingMin: 48 },
    { id: "r-dovetail", name: "Dovetail", color: "#7fd1c8", from: "hub", to: "dovetail", distanceNm: 6, crossingMin: 20 },
    { id: "r-cinderholm", name: "Cinder Holm", color: "#d98fb0", from: "hub", to: "cinderholm", distanceNm: 11, crossingMin: 34 },
    { id: "r-marrowcay", name: "Marrow Cay", color: "#a8c66c", from: "hub", to: "marrowcay", distanceNm: 9, crossingMin: 28 },
    { id: "r-thorngate", name: "Thorngate", color: "#e0a35e", from: "hub", to: "thorngate", distanceNm: 12, crossingMin: 36 },
    { id: "r-saltcross", name: "Saltcross", color: "#6fb6e0", from: "hub", to: "saltcross", distanceNm: 14, crossingMin: 42 },
    { id: "r-willowreach", name: "Willow Reach", color: "#c9a0e8", from: "hub", to: "willowreach", distanceNm: 15, crossingMin: 46 },
    { id: "r-gullspit", name: "Gull Spit", color: "#e8d36f", from: "hub", to: "gullspit", distanceNm: 18, crossingMin: 52 },
    { id: "r-halerock", name: "Hale Rock", color: "#e07f7f", from: "hub", to: "halerock", distanceNm: 20, crossingMin: 58 },
    { id: "r-fenharbor", name: "Fen Harbor", color: "#8ad6a0", from: "hub", to: "fenharbor", distanceNm: 10, crossingMin: 30 },
    { id: "r-blacktern", name: "Black Tern", color: "#9fb0c4", from: "hub", to: "blacktern", distanceNm: 22, crossingMin: 64 },
  ] as RouteDef[],
};

export type Config = typeof CONFIG;

export const vesselById = (id: string): VesselClass =>
  CONFIG.vesselClasses.find((v) => v.id === id)!;

export const portDefById = (id: string): PortDef =>
  CONFIG.ports.find((p) => p.id === id)!;

export const HUB_ID = CONFIG.ports.find((p) => p.isHub)!.id;

// A vessel's berth rank = its index in vesselClasses (0 = Express … 3 = Jumbo).
// A dock of tier T can berth any vessel whose rank <= T.
export const vesselRank = (id: string): number =>
  CONFIG.vesselClasses.findIndex((v) => v.id === id);

export const maxDockTier = CONFIG.vesselClasses.length - 1;

/** Straight-line distance between two ports in nautical miles (from map positions). */
export function nmBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y) * CONFIG.od.nmPerUnit;
}
