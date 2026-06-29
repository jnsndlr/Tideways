import type { RouteDef, Vec2 } from "./types";

// =============================================================================
// CONFIG — all tunable model numbers live here (model-first balancing).
// Change values here to rebalance the economy; nothing else should hardcode
// these.
// =============================================================================

export const CONFIG = {
  startCash: 100_000,
  boatCost: 80_000,

  // Time: in-game minutes that pass per real second at 1x speed.
  gameMinPerSec: 6, // full 24h day ~= 4 real min; operating window ~= 3 min
  operatingStart: 6 * 60, // 06:00
  operatingEnd: 22 * 60, // 22:00

  // Vessel (single class for now)
  ferry: {
    peopleCap: 500, // total people incl. those riding in cars
    carCap: 64, // car-deck slots
    avgOccupancy: 2.0, // avg people per car (1-4 in reality)
    loadMinutes: 10, // dwell at each terminal
  },

  // Fares
  fare: { foot: 14, car: 30 }, // car fare flat for now (driver incl.)

  // Fuel — charged per crossing
  fuelCostPerNm: 22, // $ per nautical mile

  // Demand / behaviour
  patienceMin: 120, // forgiving: people wait up to 2h before balking
  balkRatePerMin: 0.004, // slow trickle once over patience

  // Reputation (slow + forgiving)
  repStart: 80,
  repServedGain: 0.000_1, // per person served well
  repBalkLoss: 0.002, // per person balked
  repDriftToNeutral: 0.02, // fraction toward 70 per in-game day
  repNeutral: 70,

  hub: { name: "Anacortes", pos: { x: 0.5, y: 0.86 } as Vec2 },

  // Routes: hub is shared. distance in nm, crossing in game-min.
  routes: [
    {
      id: "lopez",
      name: "Lopez Island",
      color: "#5bd49a",
      distanceNm: 8,
      crossingMin: 25,
      dailyFoot: 1200,
      dailyCars: 280,
      pos: { x: 0.2, y: 0.2 },
    },
    {
      id: "friday",
      name: "Friday Harbor",
      color: "#f3c14b",
      distanceNm: 16,
      crossingMin: 48,
      dailyFoot: 2200,
      dailyCars: 520,
      pos: { x: 0.82, y: 0.24 },
    },
  ] as RouteDef[],
};

export type Config = typeof CONFIG;
