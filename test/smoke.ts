// Headless smoke test for the interconnected-routing sim. Bundled with esbuild
// and run on Node (`npm test`) — the sim is DOM-free by design, so it runs
// without a browser. Covers routing, hub transfers, per-leg fares, and the
// gravity demand generator.
import { CONFIG, vesselById } from "../src/config";
import {
  createState,
  advance,
  getRouting,
  addTrip,
  waitingFor,
  waitingPeople,
  openRoute,
  serialize,
  deserialize,
  demandDayFactor,
  isWeekend,
  seasonOf,
  weekdayName,
  sellBoat,
  sellPrice,
  buyBlocker,
  projectedDailyCost,
} from "../src/sim";

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

// ---- 4. save round-trip: serialize -> deserialize preserves the game -------
{
  const s = createState();
  const boat = s.boats[0];
  addTrip(s, boat, "r-lopez", 7 * 60);
  addTrip(s, boat, "r-friday", 13 * 60);
  const direct = openRoute(s, "lopez", "friday"); // player-created route must survive
  s.routes["r-lopez"].footPrice = 20;
  for (let t = 0; t < 2000; t += 5) advance(s, 5); // run past a day rollover, boat mid-day

  const raw = serialize(s);
  const r = deserialize(raw);
  check("save deserializes", r !== null);
  if (r) {
    check("cash survives", Math.abs(r.cash - s.cash) < 0.01, [Math.round(r.cash), Math.round(s.cash)]);
    check("day/clock survive", r.day === s.day && Math.abs(r.clock - s.clock) < 0.01, [r.day, Math.round(r.clock)]);
    check("fleet survives", r.boats.length === s.boats.length && r.boats[0].itinerary.length === 2);
    check("price survives", r.routes["r-lopez"].footPrice === 20, r.routes["r-lopez"].footPrice);
    check("player route survives", direct !== null && !!r.routes[direct.def.id], direct?.def.id);
    check(
      "queues survive",
      Math.abs(waitingPeople(r.ports.lopez) - waitingPeople(s.ports.lopez)) < 0.01,
      Math.round(waitingPeople(r.ports.lopez)),
    );
    check(
      "rep survives",
      Math.abs(r.ports.friday.segRep.commuter - s.ports.friday.segRep.commuter) < 0.01,
    );
    // the restored game keeps running without blowing up
    for (let t = 0; t < 720; t += 5) advance(r, 5);
    check("restored game advances", Number.isFinite(r.cash) && !Number.isNaN(r.rep));
  }
  check("corrupt save rejected", deserialize("{ nope") === null);
  check("wrong version rejected", deserialize('{"v":999}') === null);
}

// ---- 5. calendar rhythm: weekday/weekend + seasons --------------------------
{
  check("day 1 is a Monday in spring", weekdayName(1) === "Mon" && seasonOf(1).id === "spring");
  check("day 6 is a weekend", isWeekend(6) && weekdayName(6) === "Sat");
  check("day 8 wraps to Monday", weekdayName(8) === "Mon" && !isWeekend(8));

  const commuter = CONFIG.segments.find((s) => s.id === "commuter")!;
  const tourist = CONFIG.segments.find((s) => s.id === "tourist")!;
  check("weekday commuter factor is 1", demandDayFactor(commuter, 1) === 1);
  check("weekend guts commuters", demandDayFactor(commuter, 6) < 0.5, demandDayFactor(commuter, 6));
  check("weekend boosts tourists", demandDayFactor(tourist, 6) > 1.2, demandDayFactor(tourist, 6));
  const summerDay = CONFIG.calendar.daysPerSeason + 1; // first Monday of summer
  const winterDay = CONFIG.calendar.daysPerSeason * 3 + 1;
  check("summer tourist >> winter tourist",
    demandDayFactor(tourist, summerDay) / demandDayFactor(tourist, winterDay) > 2,
    [demandDayFactor(tourist, summerDay), demandDayFactor(tourist, winterDay)]);

  // integration: same clock slice, weekday vs weekend, commuter arrivals differ
  const grow = (day: number): number => {
    const s = createState();
    s.day = day;
    s.clock = 8 * 60; // AM commuter peak
    advance(s, 30);
    let p = 0;
    for (const id in s.ports) p += waitingPeople(s.ports[id], "commuter");
    return p;
  };
  const wk = grow(1);
  const we = grow(6);
  check("weekend commuter queue ~35% of weekday", we / wk > 0.3 && we / wk < 0.4, [Math.round(wk), Math.round(we)]);
}

// ---- 6. vessel resale --------------------------------------------------------
{
  const s = createState();
  const before = s.cash;
  const boat = s.boats[0];
  check("cannot sell unknown boat", !sellBoat(s, 999));
  check("sell idle boat succeeds", sellBoat(s, boat.id));
  check("resale credited", s.cash === before + vesselById(boat.classId).cost * CONFIG.economy.resaleFactor, s.cash - before);
  check("fleet empty after sale", s.boats.length === 0);
  check("berth freed after sale", buyBlocker(s, "hiyu") === null); // cash + berth both fine
}

// ---- 7. activity-based costs: idle hulls are cheap, sailings pay crew -------
{
  const s = createState(); // one Hiyu, no trips scheduled
  const vc = vesselById(s.boats[0].classId);
  const cashStart = s.cash;
  while (s.day === 1) advance(s, 5); // a full day sitting at the dock
  const idleCost = cashStart - s.cash;
  check("idle boat pays only moorage", Math.abs(idleCost - vc.moorageDaily) < 0.01, idleCost);

  const s2 = createState();
  addTrip(s2, s2.boats[0], "r-lopez", 7 * 60);
  while (s2.day === 1) advance(s2, 5);
  check(
    "one round trip pays crew for two sailings",
    Math.abs(s2.crewYesterday - 2 * vc.crewPerSailing) < 0.01,
    s2.crewYesterday,
  );
  check("sailing burned fuel", s2.fuelYesterday > 0, Math.round(s2.fuelYesterday));
}

// ---- 8. scheduler's live cost projection matches what actually gets charged --
{
  const s = createState();
  const boat = s.boats[0];
  const vc = vesselById(boat.classId);

  check("empty itinerary projects zero", (() => {
    const p = projectedDailyCost(boat, s.routes);
    return p.fuel === 0 && p.crew === 0;
  })());

  addTrip(s, boat, "r-lopez", 7 * 60);
  addTrip(s, boat, "r-friday", 13 * 60);
  const proj = projectedDailyCost(boat, s.routes);
  const expectFuel = 2 * (CONFIG.routes.find((r) => r.id === "r-lopez")!.distanceNm + CONFIG.routes.find((r) => r.id === "r-friday")!.distanceNm) * vc.fuelPerNm;
  const expectCrew = 4 * vc.crewPerSailing; // 2 trips x 2 sailings each
  check("projected fuel matches route distances", proj.fuel === expectFuel, [proj.fuel, expectFuel]);
  check("projected crew matches sailing count", proj.crew === expectCrew, [proj.crew, expectCrew]);

  // run the day and confirm the projection matches what the sim actually charged
  while (s.day === 1) advance(s, 5);
  check(
    "projection matches actual fuel spend",
    Math.abs(proj.fuel - s.fuelYesterday) < 0.01,
    [proj.fuel, s.fuelYesterday],
  );
  check(
    "projection matches actual crew spend",
    Math.abs(proj.crew - s.crewYesterday) < 0.01,
    [proj.crew, s.crewYesterday],
  );

  // a trip on a since-removed route doesn't blow up the projection
  const s2 = createState();
  const boat2 = s2.boats[0];
  addTrip(s2, boat2, "r-lopez", 7 * 60);
  delete s2.routes["r-lopez"];
  const proj2 = projectedDailyCost(boat2, s2.routes);
  check("projection tolerates a removed route", proj2.fuel === 0 && proj2.crew === 0);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
