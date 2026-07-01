// Headless smoke test for the interconnected-routing sim. Bundled with esbuild
// and run on Node (`npm test`) — the sim is DOM-free by design, so it runs
// without a browser. Covers routing, hub transfers, per-leg fares, and the
// gravity demand generator.
import { CONFIG } from "../src/config";
import { createState, advance, getRouting, addTrip, waitingFor } from "../src/sim";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  -> " + JSON.stringify(detail) : ""}`);
  if (!cond) failures++;
}

// ---- 1. routing over the starting (hub-and-spoke) topology -----------------
{
  const s = createState();
  const r = getRouting(s);
  check("lopez->friday routes via hub", r.nextHop("lopez", "friday") === "hub", r.nextHop("lopez", "friday"));
  check("lopez->friday reachable", r.reachable("lopez", "friday"));
  check("lopez->friday path", JSON.stringify(r.path("lopez", "friday")) === '["lopez","hub","friday"]', r.path("lopez", "friday"));
  // a locked island has no dock -> unreachable
  check("dovetail (locked) unreachable", !r.reachable("hub", "dovetail"));
}

// ---- 2. end-to-end transfer: Lopez -> (hub) -> Friday ----------------------
{
  // disable organic demand so we can track a single seeded cohort
  const saved = { ...CONFIG.od.tripsPerResident };
  CONFIG.od.tripsPerResident.commuter = 0;
  CONFIG.od.tripsPerResident.tourist = 0;
  CONFIG.od.tripsPerResident.freight = 0;

  const s = createState();
  const boat = s.boats[0];
  // run the Lopez leg first (collect the cohort), then a tight Friday connection
  // (the cohort reaches the hub ~7:10; commuter patience is 55 min, so the
  // transfer sailing must leave before they balk)
  addTrip(s, boat, "r-lopez", 6 * 60);
  addTrip(s, boat, "r-friday", 7 * 60 + 30);

  // seed 100 foot commuters at Lopez bound for Friday Harbor
  s.ports.lopez.queues.friday = { commuter: { foot: 100, car: 0, wait: 0 } };

  for (let t = 6 * 60; t < 22 * 60; t += 2) advance(s, 2);

  const stuckAtLopez = waitingFor(s.ports.lopez, "friday");
  const stuckAtHub = waitingFor(s.ports.hub, "friday");
  const stuckAtFriday = waitingFor(s.ports.friday, "friday"); // should be 0 (delivered, not re-queued)

  check("cohort left Lopez", stuckAtLopez < 1, stuckAtLopez);
  check("cohort cleared hub (transferred + delivered)", stuckAtHub < 1, stuckAtHub);
  check("nobody re-queued at destination", stuckAtFriday < 1, stuckAtFriday);
  // per-leg fares: 100 foot riders x 2 boarded legs x $14 = $2,800 gross revenue
  check("per-leg fares charged (two legs)", s.revenueToday > 2700 && s.revenueToday < 2900, Math.round(s.revenueToday));

  Object.assign(CONFIG.od.tripsPerResident, saved);
}

// ---- 3. organic multi-day run does not crash & moves people ----------------
{
  const s = createState();
  const boat = s.boats[0];
  addTrip(s, boat, "r-lopez", 7 * 60);
  addTrip(s, boat, "r-friday", 13 * 60);
  let peakServed = 0;
  for (let d = 0; d < 3; d++)
    for (let t = 0; t < 1440; t += 5) {
      advance(s, 5);
      let served = 0;
      for (const id in s.ports) served += s.ports[id].servedToday;
      peakServed = Math.max(peakServed, served);
    }
  check("organic run served riders", peakServed > 0, Math.round(peakServed));
  check("no NaN cash", Number.isFinite(s.cash), s.cash);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
