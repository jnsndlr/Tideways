// Balance report (not a pass/fail test) — prints the gravity model's demand mix
// and an operational run so we can tune CONFIG.od against real numbers.
//   npm run balance
import { CONFIG, vesselById } from "../src/config";
import {
  createState,
  advance,
  addBoat,
  addTrip,
  dailyODByPair,
  earliestFreeSlot,
} from "../src/sim";
import type { GameState } from "../src/types";

const n = (x: number) => Math.round(x).toLocaleString();
const pct = (x: number) => (x * 100).toFixed(1) + "%";
const pad = (s: string | number, w: number) => String(s).padStart(w);
const padr = (s: string | number, w: number) => String(s).padEnd(w);

// ---- Report A: structural demand mix (response-neutral) --------------------
function reportDemandMix(state: GameState): void {
  const od = dailyODByPair(state);
  const hubId = state.hubId;

  let hubTouching = 0;
  let interisland = 0;
  const bySeg: Record<string, { hub: number; inter: number }> = {};
  const originated: Record<string, number> = {};
  for (const seg of CONFIG.segments) bySeg[seg.id] = { hub: 0, inter: 0 };

  for (const e of od) {
    const touchesHub = e.from === hubId || e.to === hubId;
    if (touchesHub) {
      hubTouching += e.people;
      bySeg[e.seg].hub += e.people;
    } else {
      interisland += e.people;
      bySeg[e.seg].inter += e.people;
    }
    originated[e.from] = (originated[e.from] ?? 0) + e.people;
  }
  const total = hubTouching + interisland;

  console.log("\n=== A. DEMAND MIX (structural, response-neutral) ===");
  console.log(`total trips/day: ${n(total)}`);
  console.log(`  hub-touching : ${n(hubTouching)}  (${pct(hubTouching / total)})`);
  console.log(`  interisland  : ${n(interisland)}  (${pct(interisland / total)})   <- target 10-15% max`);
  console.log("\n  interisland share by segment:");
  for (const seg of CONFIG.segments) {
    const t = bySeg[seg.id].hub + bySeg[seg.id].inter;
    console.log(`    ${padr(seg.id, 9)} ${pct(bySeg[seg.id].inter / t)}   (of ${n(t)}/day)`);
  }
  console.log("\n  originated per port (trips/day out):");
  for (const id in state.ports) {
    if (!state.ports[id].slips.length) continue;
    console.log(`    ${padr(state.ports[id].def.name, 16)} ${pad(n(originated[id] ?? 0), 8)}`);
  }
}

// ---- Report B: operational run + economy -----------------------------------
function reportOperations(days: number): void {
  const state = createState();
  // one dedicated Hiyu per starting island, each packed with round trips
  const routes = ["r-lopez", "r-orcas", "r-friday"];
  const boats = [state.boats[0], addBoat(state, "hiyu"), addBoat(state, "hiyu")];
  boats.forEach((boat, i) => {
    while (true) {
      const slot = earliestFreeSlot(boat, routes[i], state.routes);
      if (slot === null) break;
      addTrip(state, boat, routes[i], slot);
    }
  });

  const startCash = state.cash;
  while (state.day <= days) advance(state, 5);

  const upkeep = state.boats.reduce((a, b) => a + vesselById(b.classId).dailyCost, 0);
  const rev = state.revenueYesterday;
  const fuel = state.fuelYesterday;
  const net = rev - fuel - upkeep;

  console.log(`\n=== B. OPERATIONS (${boats.length} Hiyus, dedicated, day ${days}) ===`);
  console.log(`  ${padr("port", 16)} ${pad("sailings", 9)} ${pad("served", 9)} ${pad("balked", 9)} ${pad("balk%", 7)}`);
  for (const rid of routes) {
    const R = state.routes[rid];
    const P = state.ports[R.def.to];
    const served = P.servedYesterday;
    const balked = P.balkedYesterday;
    const bp = served + balked > 0 ? balked / (served + balked) : 0;
    console.log(
      `  ${padr(P.def.name, 16)} ${pad(R.sailingsYesterday, 9)} ${pad(n(served), 9)} ${pad(n(balked), 9)} ${pad(pct(bp), 7)}`,
    );
  }
  const hub = state.ports[state.hubId];
  console.log(
    `  ${padr(hub.def.name + " (hub)", 16)} ${pad("-", 9)} ${pad(n(hub.servedYesterday), 9)} ${pad(n(hub.balkedYesterday), 9)} ${pad("-", 7)}`,
  );

  console.log("\n  economy (per day):");
  console.log(`    fare revenue : ${pad("$" + n(rev), 10)}`);
  console.log(`    fuel         : ${pad("-$" + n(fuel), 10)}   (${pct(fuel / Math.max(1, rev))} of revenue)`);
  console.log(`    fleet upkeep : ${pad("-$" + n(upkeep), 10)}`);
  console.log(`    ---`);
  console.log(`    net/day      : ${pad(("$" + n(net)).replace("$-", "-$"), 10)}`);
  console.log(`    cash now     : $${n(state.cash)}  (started $${n(startCash)}, day ${state.day})`);
}

const state = createState();
console.log(`decayScaleNm=${CONFIG.od.decayScaleNm}  nmPerUnit=${CONFIG.od.nmPerUnit}  tripsPerResident=${JSON.stringify(CONFIG.od.tripsPerResident)}`);
reportDemandMix(state);
reportOperations(8);
console.log("");
