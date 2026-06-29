import { CONFIG } from "../config";
import type { RouteState, SegmentDef } from "../types";

/** Price elasticity: turnout multiplier vs the reference fare. */
export function priceFactor(price: number, reference: number, elasticity: number): number {
  if (price <= 0) return 1.6;
  return Math.max(0, Math.min(1.6, Math.pow(price / reference, -elasticity)));
}

export function footPriceFactor(R: RouteState, seg: SegmentDef): number {
  return priceFactor(R.footPrice, CONFIG.fare.foot, seg.elastFoot);
}

export function carPriceFactor(R: RouteState, seg: SegmentDef): number {
  return priceFactor(R.carPrice, CONFIG.fare.car, seg.elastCar);
}

/** Reputation -> turnout multiplier (the closed loop). */
export function repFactor(rep: number): number {
  const { atZero, atNeutral, atFull } = CONFIG.repDemand;
  const n = CONFIG.repNeutral;
  if (rep <= n) return atZero + (rep / n) * (atNeutral - atZero);
  return atNeutral + ((rep - n) / (100 - n)) * (atFull - atNeutral);
}
