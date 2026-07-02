import type { PortDef, RouteDef, SeasonDef, SegmentDef, Vec2, VesselClass } from "./types";

// =============================================================================
// CONFIG — all tunable model numbers (model-first balancing). v0.3.
// =============================================================================

export const CONFIG = {
  startCash: 500_000,

  // Time
  gameMinPerSec: 6,
  operatingStart: 6 * 60, // 06:00
  operatingEnd: 22 * 60, // 22:00
  loadMinutes: 10, // dwell at each terminal
  lateGraceMin: 10, // a sailing that departs later than this past schedule earns no goodwill
  avgOccupancy: 2.0, // people per car

  // Vessel classes (toy-scaled, PNW-flavoured). Owning a hull costs a small
  // fixed moorageDaily; the dominant costs follow ACTIVITY — crewPerSailing is
  // charged at every departure (a round trip = 2 sailings) on top of fuel. A
  // boat sitting at the dock, or thinned to a few runs a day, is cheap to keep;
  // a packed timetable is what costs money. (At a full ~24-sailing day these
  // roughly match the old flat daily overhead.)
  vesselClasses: [
    { id: "po", name: "Passenger Express", short: "Express", peopleCap: 300, carCap: 0, speedFactor: 1.5, fuelPerNm: 35, cost: 200_000, moorageDaily: 700, crewPerSailing: 70 },
    { id: "hiyu", name: "M/V Hiyu", short: "Hiyu", peopleCap: 200, carCap: 34, speedFactor: 1.0, fuelPerNm: 70, cost: 320_000, moorageDaily: 1_500, crewPerSailing: 230 },
    { id: "medium", name: "M/V Issaquah", short: "Issaquah", peopleCap: 500, carCap: 80, speedFactor: 1.0, fuelPerNm: 105, cost: 650_000, moorageDaily: 2_800, crewPerSailing: 420 },
    { id: "large", name: "M/V Jumbo", short: "Jumbo", peopleCap: 900, carCap: 150, speedFactor: 0.9, fuelPerNm: 150, cost: 1_050_000, moorageDaily: 4_500, crewPerSailing: 700 },
  ] as VesselClass[],
  startVessel: "hiyu",

  // Economy / solvency
  economy: {
    bankruptcyGraceDays: 3, // days you may run cash < 0 before the company folds
    resaleFactor: 0.5, // share of a hull's cost counted toward company value
  },

  // Pricing (reference fares = starting prices; elasticity measured vs these).
  // Charged PER BOARDED LEG — a multi-leg journey pays each leg it rides.
  fare: { foot: 14, car: 30 },
  priceBounds: { footMin: 4, footMax: 40, carMin: 10, carMax: 90, step: 2 },

  // Calendar — weekly + seasonal demand rhythm. Day 1 is a Monday in spring.
  // A compressed year (daysPerSeason × 4 days) keeps seasonal re-planning on a
  // prototype-friendly cadence; raise daysPerSeason for a slower year.
  calendar: {
    weekdayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    weekendDays: [5, 6], // indices into weekdayNames (Sat, Sun)
    daysPerSeason: 7,
    seasons: [
      { id: "spring", name: "Spring", icon: "\u{1F338}" },
      { id: "summer", name: "Summer", icon: "\u{2600}\u{FE0F}" },
      { id: "fall", name: "Fall", icon: "\u{1F342}" },
      { id: "winter", name: "Winter", icon: "\u{2744}\u{FE0F}" },
    ] as SeasonDef[],
  },

  // Balking
  balkRatePerMin: 0.004,

  // Reputation (per port) — slow + forgiving
  repStart: 80,
  repServedGain: 0.000_6, // serving well is now a real lever to climb back up
  repBalkLoss: 0.002, // balking still hurts, but recovery is possible
  repDriftDown: 0.03, // above neutral: gently sag toward neutral
  repDriftUp: 0.01, // below neutral: barely floor you — you must earn it back
  repNeutral: 60,
  repDemand: { atZero: 0.55, atNeutral: 1.0, atFull: 1.2 },

  // Ports & slips — a port has one or more slips; each slip has a size tier =
  // the largest vessel class (index into vesselClasses) it can berth.
  // 0 = Express, 1 = +Hiyu, 2 = +Issaquah, 3 = +Jumbo. A vessel can call at a
  // port only if some slip there is big enough. At the home port the slip COUNT
  // is the fleet cap and the biggest slip is the largest vessel you may own.
  slipCfg: {
    buildSlipCost: 180_000, // build the first slip on a locked island (tier 0)
    addSlipCost: 200_000, // ×(current slip count) to add another slip to a port
    // cost to raise a slip TO tier i (index = target tier; index 0 = build)
    sizeUpgradeCost: [180_000, 130_000, 320_000, 550_000],
    islandStartTier: 1, // islands you start with have one Hiyu-capable slip
    hubStartSlips: [1, 1, 1], // home berths: count = fleet cap, tiers = ownable sizes
  },

  // Direct route opening (Phase 2: player-created any-port↔any-port routes).
  // crossingMin ≈ distanceNm × minPerNm, matching the seeded hub routes' ratio.
  routeCfg: {
    minPerNm: 3.0,
    openBaseCost: 60_000,
    openCostPerNm: 6_000,
  },

  // Origin/destination demand — a gravity model over ports.
  // vol(A->B, seg) ∝ pop[seg](A) · draw[seg](B) · decay(distance), normalized so
  // each segment delivers a daily total across all docked O/D pairs. That total
  // scales with the docked ISLAND population (tripsPerResident × Σ island pop),
  // so opening a new island ADDS demand rather than diluting the existing pie.
  // Hub pop/draw are large, so most trips touch the mainland (hub-dominant), with
  // island↔island a minority (~10-15%). carShare splits people into foot vs car.
  od: {
    nmPerUnit: 18, // map is normalized 0..1; this scales position distance into nm
    decayScaleNm: 16, // gravity distance decay e^(-nm/scale); bigger = flatter (more interisland)
    tripsPerResident: { commuter: 0.6, tourist: 0.85, freight: 1.0 } as Record<string, number>,
  },

  // Demand segments — distinct behaviour so levers conflict. weekendMult and
  // seasonMult scale each segment's daily volume by calendar day, so one
  // timetable can't be optimal all week (or all year).
  segments: [
    {
      id: "commuter", name: "Commuters", color: "#57b6e0", icon: "\u{1F4BC}",
      patienceMin: 55, carShare: 0.35, elastFoot: 0.4, elastCar: 0.3,
      peaks: [[8 * 60, 55, 2.6], [17 * 60, 70, 2.3]], // sharp AM + PM peaks
      weekendMult: 0.35, // weekends: barely anyone commutes
      seasonMult: { winter: 0.95 },
    },
    {
      id: "tourist", name: "Tourists", color: "#f3c14b", icon: "\u{1F392}",
      patienceMin: 160, carShare: 0.38, elastFoot: 1.3, elastCar: 0.9,
      peaks: [[12 * 60, 150, 1.6]], // broad midday
      weekendMult: 1.6, // weekend getaways surge
      seasonMult: { spring: 0.9, summer: 1.5, fall: 0.8, winter: 0.45 },
    },
    {
      id: "freight", name: "Freight", color: "#e06f4f", icon: "\u{1F4E6}",
      patienceMin: 90, carShare: 1.0, elastFoot: 0.2, elastCar: 0.2,
      peaks: [[10 * 60, 240, 0.7], [15 * 60, 240, 0.7]], // steady daytime
      weekendMult: 0.5, // light weekend deliveries
      seasonMult: { summer: 1.1, winter: 0.9 },
    },
  ] as SegmentDef[],

  // Timeline
  scheduleSnapMin: 5,

  // Ports — the mainland hub plus the islands. pop/draw weights (per segment)
  // are seeded from each island's former hub demand so the starting balance is
  // preserved; hub weights ≈ the island totals, keeping mainland trips dominant.
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

  // Routes — physical legs. The game seeds one hub↔island leg per island (the
  // former hub-and-spoke). A leg is usable only when BOTH endpoints are docked;
  // building a dock on a locked island unlocks its hub leg. (Player-created
  // any-port↔any-port routes arrive in Phase 2.)
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
