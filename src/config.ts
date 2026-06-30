import type { RouteDef, SegmentDef, VesselClass } from "./types";

// =============================================================================
// CONFIG — all tunable model numbers (model-first balancing). v0.2.
// =============================================================================

export const CONFIG = {
  startCash: 150_000,
  maxFleet: 5,

  // Time
  gameMinPerSec: 6,
  operatingStart: 6 * 60, // 06:00
  operatingEnd: 22 * 60, // 22:00
  loadMinutes: 10, // dwell at each terminal
  avgOccupancy: 2.0, // people per car

  // Vessel classes (toy-scaled, PNW-flavoured)
  vesselClasses: [
    { id: "po", name: "Passenger Express", short: "Express", peopleCap: 300, carCap: 0, speedFactor: 1.5, fuelPerNm: 12, cost: 55_000 },
    { id: "hiyu", name: "M/V Hiyu", short: "Hiyu", peopleCap: 200, carCap: 34, speedFactor: 1.0, fuelPerNm: 20, cost: 90_000 },
    { id: "medium", name: "M/V Issaquah", short: "Issaquah", peopleCap: 500, carCap: 80, speedFactor: 1.0, fuelPerNm: 30, cost: 175_000 },
    { id: "large", name: "M/V Jumbo", short: "Jumbo", peopleCap: 900, carCap: 150, speedFactor: 0.9, fuelPerNm: 42, cost: 290_000 },
  ] as VesselClass[],
  startVessel: "hiyu",

  // Pricing (reference fares = starting prices; elasticity measured vs these)
  fare: { foot: 14, car: 30 },
  priceBounds: { footMin: 4, footMax: 40, carMin: 10, carMax: 90, step: 2 },

  // Balking
  balkRatePerMin: 0.004,

  // Reputation (per dock) — slow + forgiving
  repStart: 80,
  repServedGain: 0.000_6, // serving well is now a real lever to climb back up
  repBalkLoss: 0.002, // balking still hurts, but recovery is possible
  repDriftDown: 0.03, // above neutral: gently sag toward neutral
  repDriftUp: 0.01, // below neutral: barely floor you — you must earn it back
  repNeutral: 60,
  repDemand: { atZero: 0.55, atNeutral: 1.0, atFull: 1.2 },

  // Docks — a dock's tier = the largest vessel class (index into vesselClasses)
  // it can berth. 0 = Express only, 1 = +Hiyu, 2 = +Issaquah, 3 = +Jumbo.
  docks: {
    buildCost: 60_000, // build a brand-new dock on a locked island (reaches tier 0)
    startTier: 1, // islands you start with already berth up to Hiyu
    // cost to REACH each tier; index = target tier (index 0 is the build cost)
    upgradeCost: [60_000, 45_000, 110_000, 190_000],
  },

  // Demand segments — distinct behaviour so levers conflict
  segments: [
    {
      id: "commuter", name: "Commuters", color: "#57b6e0", icon: "\u{1F4BC}",
      patienceMin: 55, elastFoot: 0.4, elastCar: 0.3,
      peaks: [[8 * 60, 55, 2.6], [17 * 60, 70, 2.3]], // sharp AM + PM peaks
    },
    {
      id: "tourist", name: "Tourists", color: "#f3c14b", icon: "\u{1F392}",
      patienceMin: 160, elastFoot: 1.3, elastCar: 0.9,
      peaks: [[12 * 60, 150, 1.6]], // broad midday
    },
    {
      id: "freight", name: "Freight", color: "#e06f4f", icon: "\u{1F4E6}",
      patienceMin: 90, elastFoot: 0.2, elastCar: 0.2,
      peaks: [[10 * 60, 240, 0.7], [15 * 60, 240, 0.7]], // steady daytime
    },
  ] as SegmentDef[],

  // Timeline
  scheduleSnapMin: 5,

  hub: { name: "Anacortes", pos: { x: 0.5, y: 0.9 } },

  routes: [
    // --- islands you start with (docks already built, Hiyu-capable) ---
    {
      id: "lopez", name: "Lopez Island", color: "#5bd49a", startDocked: true,
      distanceNm: 8, crossingMin: 25, pos: { x: 0.16, y: 0.32 },
      demand: {
        commuter: { foot: 900, car: 240 },
        tourist: { foot: 400, car: 120 },
        freight: { foot: 0, car: 90 },
      },
    },
    {
      id: "orcas", name: "Orcas Island", color: "#b98cdb", startDocked: true,
      distanceNm: 13, crossingMin: 40, pos: { x: 0.5, y: 0.14 },
      demand: {
        commuter: { foot: 500, car: 160 },
        tourist: { foot: 1100, car: 300 },
        freight: { foot: 0, car: 80 },
      },
    },
    {
      id: "friday", name: "Friday Harbor", color: "#f6a96b", startDocked: true,
      distanceNm: 16, crossingMin: 48, pos: { x: 0.85, y: 0.32 },
      demand: {
        commuter: { foot: 600, car: 180 },
        tourist: { foot: 1600, car: 380 },
        freight: { foot: 0, car: 110 },
      },
    },

    // --- fictional islands (locked: build a dock to open them) ---
    {
      id: "dovetail", name: "Dovetail", color: "#7fd1c8",
      distanceNm: 6, crossingMin: 20, pos: { x: 0.38, y: 0.30 },
      demand: {
        commuter: { foot: 700, car: 200 },
        tourist: { foot: 300, car: 90 },
        freight: { foot: 0, car: 70 },
      },
    },
    {
      id: "cinderholm", name: "Cinder Holm", color: "#d98fb0",
      distanceNm: 11, crossingMin: 34, pos: { x: 0.62, y: 0.30 },
      demand: {
        commuter: { foot: 450, car: 150 },
        tourist: { foot: 900, car: 240 },
        freight: { foot: 0, car: 120 },
      },
    },
    {
      id: "marrowcay", name: "Marrow Cay", color: "#a8c66c",
      distanceNm: 9, crossingMin: 28, pos: { x: 0.30, y: 0.54 },
      demand: {
        commuter: { foot: 800, car: 220 },
        tourist: { foot: 350, car: 100 },
        freight: { foot: 0, car: 80 },
      },
    },
    {
      id: "thorngate", name: "Thorngate", color: "#e0a35e",
      distanceNm: 12, crossingMin: 36, pos: { x: 0.70, y: 0.54 },
      demand: {
        commuter: { foot: 520, car: 170 },
        tourist: { foot: 700, car: 190 },
        freight: { foot: 0, car: 140 },
      },
    },
    {
      id: "saltcross", name: "Saltcross", color: "#6fb6e0",
      distanceNm: 14, crossingMin: 42, pos: { x: 0.10, y: 0.60 },
      demand: {
        commuter: { foot: 380, car: 120 },
        tourist: { foot: 1300, car: 330 },
        freight: { foot: 0, car: 60 },
      },
    },
    {
      id: "willowreach", name: "Willow Reach", color: "#c9a0e8",
      distanceNm: 15, crossingMin: 46, pos: { x: 0.90, y: 0.58 },
      demand: {
        commuter: { foot: 420, car: 130 },
        tourist: { foot: 1500, car: 360 },
        freight: { foot: 0, car: 90 },
      },
    },
    {
      id: "gullspit", name: "Gull Spit", color: "#e8d36f",
      distanceNm: 18, crossingMin: 52, pos: { x: 0.24, y: 0.07 },
      demand: {
        commuter: { foot: 300, car: 90 },
        tourist: { foot: 1800, car: 420 },
        freight: { foot: 0, car: 70 },
      },
    },
    {
      id: "halerock", name: "Hale Rock", color: "#e07f7f",
      distanceNm: 20, crossingMin: 58, pos: { x: 0.76, y: 0.06 },
      demand: {
        commuter: { foot: 260, car: 80 },
        tourist: { foot: 1400, car: 320 },
        freight: { foot: 0, car: 200 },
      },
    },
    {
      id: "fenharbor", name: "Fen Harbor", color: "#8ad6a0",
      distanceNm: 10, crossingMin: 30, pos: { x: 0.05, y: 0.42 },
      demand: {
        commuter: { foot: 650, car: 190 },
        tourist: { foot: 500, car: 140 },
        freight: { foot: 0, car: 110 },
      },
    },
    {
      id: "blacktern", name: "Black Tern", color: "#9fb0c4",
      distanceNm: 22, crossingMin: 64, pos: { x: 0.95, y: 0.40 },
      demand: {
        commuter: { foot: 220, car: 70 },
        tourist: { foot: 2000, car: 480 },
        freight: { foot: 0, car: 150 },
      },
    },
  ] as RouteDef[],
};

export type Config = typeof CONFIG;

export const vesselById = (id: string): VesselClass =>
  CONFIG.vesselClasses.find((v) => v.id === id)!;

// A vessel's berth rank = its index in vesselClasses (0 = Express … 3 = Jumbo).
// A dock of tier T can berth any vessel whose rank <= T.
export const vesselRank = (id: string): number =>
  CONFIG.vesselClasses.findIndex((v) => v.id === id);

export const maxDockTier = CONFIG.vesselClasses.length - 1;
