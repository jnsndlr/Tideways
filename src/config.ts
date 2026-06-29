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
  repServedGain: 0.000_15,
  repBalkLoss: 0.003,
  repDriftToNeutral: 0.03,
  repNeutral: 65,
  repDemand: { atZero: 0.55, atNeutral: 1.0, atFull: 1.2 },

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
    {
      id: "lopez", name: "Lopez Island", color: "#5bd49a",
      distanceNm: 8, crossingMin: 25, pos: { x: 0.16, y: 0.32 },
      demand: {
        commuter: { foot: 900, car: 240 },
        tourist: { foot: 400, car: 120 },
        freight: { foot: 0, car: 90 },
      },
    },
    {
      id: "orcas", name: "Orcas Island", color: "#b98cdb",
      distanceNm: 13, crossingMin: 40, pos: { x: 0.5, y: 0.14 },
      demand: {
        commuter: { foot: 500, car: 160 },
        tourist: { foot: 1100, car: 300 },
        freight: { foot: 0, car: 80 },
      },
    },
    {
      id: "friday", name: "Friday Harbor", color: "#f6a96b",
      distanceNm: 16, crossingMin: 48, pos: { x: 0.85, y: 0.32 },
      demand: {
        commuter: { foot: 600, car: 180 },
        tourist: { foot: 1600, car: 380 },
        freight: { foot: 0, car: 110 },
      },
    },
  ] as RouteDef[],
};

export type Config = typeof CONFIG;

export const vesselById = (id: string): VesselClass =>
  CONFIG.vesselClasses.find((v) => v.id === id)!;
