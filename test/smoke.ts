// Headless smoke test for the interconnected-routing sim. Bundled with esbuild
// and run on Node (`npm test`) — the sim is DOM-free by design, so it runs
// without a browser. Covers routing, hub transfers, per-leg fares, and the
// gravity demand generator.
import { CONFIG, vesselById } from "../src/config";
import type { Boat, GameState } from "../src/types";
import {
  createState,
  advance,
  getRouting,
  addRoundTrip,
  addSheet,
  activeSheet,
  createPlan,
  updatePlan,
  unpackPlan,
  removePlan,
  moveLeg,
  stampPlan,
  planMinHeadway,
  routeBetween,
  waitingFor,
  waitingPeople,
  openRoute,
  serialize,
  deserialize,
  saveGame,
  loadGame,
  clearSave,
  demandDayFactor,
  isWeekend,
  seasonOf,
  weekdayName,
  sellBoat,
  sellPrice,
  buyBlocker,
  buyBoat,
  projectedDailyCost,
  weeklyGrowthTick,
  townTier,
  portPopulation,
  breakdownChance,
  requestService,
  serviceCost,
  repairCost,
} from "../src/sim";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  -> " + JSON.stringify(detail) : ""}`);
  if (!cond) failures++;
}

// convenience: the old round-trip scheduling call, now two legs on the base sheet
const addTrip = (s: GameState, boat: Boat, routeId: string, depart: number) =>
  addRoundTrip(s, s.sheets[0], boat, routeId, depart);
const baseLegs = (s: GameState, boat: Boat) => s.sheets[0].legs[boat.id] ?? [];

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
    check("fleet survives", r.boats.length === s.boats.length && baseLegs(r, r.boats[0]).length === 4);
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
    const p = projectedDailyCost(baseLegs(s, boat), boat.classId, s.routes);
    return p.fuel === 0 && p.crew === 0;
  })());

  addTrip(s, boat, "r-lopez", 7 * 60);
  addTrip(s, boat, "r-friday", 13 * 60);
  const proj = projectedDailyCost(baseLegs(s, boat), boat.classId, s.routes);
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

  // a leg on a since-removed route doesn't blow up the projection
  const s2 = createState();
  const boat2 = s2.boats[0];
  addTrip(s2, boat2, "r-lopez", 7 * 60);
  delete s2.routes["r-lopez"];
  const proj2 = projectedDailyCost(baseLegs(s2, boat2), boat2.classId, s2.routes);
  check("projection tolerates a removed route", proj2.fuel === 0 && proj2.crew === 0);
}

// ---- 9. community growth: service quality moves living pop/draw -------------
{
  // a great week (nearly everyone carried, spare seats) grows the community
  const s = createState();
  const lopez = s.ports.lopez;
  lopez.segServedWeek.commuter = 900;
  lopez.segBalkedWeek.commuter = 20;
  lopez.seatsWeek = 3000;
  weeklyGrowthTick(s);
  check("well-served community grows", lopez.pop.commuter > lopez.def.pop.commuter, Math.round(lopez.pop.commuter));
  check("draw grows with pop", lopez.draw.commuter > lopez.def.draw.commuter);
  check("growth rate recorded for UI", lopez.segGrowth.commuter > 0, lopez.segGrowth.commuter);
  check("weekly counters reset", lopez.seatsWeek === 0 && lopez.segServedWeek.commuter === 0);
  check("untouched segment stagnates", lopez.pop.freight === lopez.def.pop.freight);

  // a terrible week (mass balking) shrinks it; locked islands never move
  const s2 = createState();
  const orcas = s2.ports.orcas;
  orcas.segServedWeek.tourist = 10;
  orcas.segBalkedWeek.tourist = 500;
  orcas.seatsWeek = 400;
  weeklyGrowthTick(s2);
  check("neglected community shrinks", orcas.pop.tourist < orcas.def.pop.tourist, Math.round(orcas.pop.tourist));
  check("locked island stagnates", s2.ports.dovetail.pop.commuter === s2.ports.dovetail.def.pop.commuter);

  // boats sailing 100% full leave no headroom — growth stalls until capacity is added
  const s3 = createState();
  const friday = s3.ports.friday;
  friday.segServedWeek.commuter = 1000;
  friday.seatsWeek = 1000;
  weeklyGrowthTick(s3);
  check("no headroom, no growth", Math.abs(friday.pop.commuter - friday.def.pop.commuter) < 0.01);

  // repeated boom weeks cap at maxFactor × seed (and busts floor at minFactor)
  const s4 = createState();
  const P = s4.ports.lopez;
  for (let i = 0; i < 200; i++) {
    P.segServedWeek.commuter = 5000;
    P.seatsWeek = 50_000;
    weeklyGrowthTick(s4);
  }
  check("growth capped at maxFactor", P.pop.commuter <= P.def.pop.commuter * CONFIG.growth.maxFactor + 0.01, Math.round(P.pop.commuter));

  // town tiers
  check("tiny pop is the lowest tier", townTier(100).name === CONFIG.townTiers[0].name);
  check("hub is the top tier", townTier(portPopulation(s.ports.hub)).name === CONFIG.townTiers[CONFIG.townTiers.length - 1].name);

  // integration: the tick fires at the Monday rollover inside the sim, and a
  // docked-but-unserved port shrinks (its riders all balked for a week)
  const s5 = createState();
  addTrip(s5, s5.boats[0], "r-lopez", 7 * 60);
  while (s5.day <= 8) advance(s5, 5);
  check("weekly tick fired in sim", s5.ports.orcas.pop.tourist < s5.ports.orcas.def.pop.tourist, Math.round(s5.ports.orcas.pop.tourist));

  // living pop survives a save round-trip
  const r = deserialize(serialize(s5));
  check("living pop survives save", r !== null && Math.abs(r.ports.orcas.pop.tourist - s5.ports.orcas.pop.tourist) < 0.01);
}

// ---- 10. maintenance: wear, scheduled service, breakdowns --------------------
{
  // wear: a day of sailings grinds condition down by nm sailed × wearPerNm
  const s = createState();
  const boat = s.boats[0];
  addTrip(s, boat, "r-lopez", 7 * 60);
  addTrip(s, boat, "r-friday", 13 * 60);
  while (s.day === 1) advance(s, 5);
  const nmSailed = 2 * (8 + 16); // both round trips
  const expected = 100 - nmSailed * CONFIG.maint.wearPerNm;
  check("wear follows nm sailed", Math.abs(boat.condition - expected) < 0.01, boat.condition);

  // risk curve: pristine boats never break; wrecks hit the configured max
  check("pristine boat cannot break", breakdownChance(100) === 0);
  check("wreck risk = configured max", breakdownChance(0) === CONFIG.maint.breakdownMaxPerSailing);
  check("risk curve stays flat while Worn", breakdownChance(50) < CONFIG.maint.breakdownMaxPerSailing * 0.2);

  // scheduled service: queued overhaul takes the boat off the timetable
  const s2 = createState();
  const b2 = s2.boats[0];
  addTrip(s2, b2, "r-lopez", 7 * 60);
  b2.condition = 60;
  requestService(b2);
  const cashBefore = s2.cash;
  advance(s2, 5); // idle -> into the yard
  check("service starts from idle", b2.phase === "maint", b2.phase);
  check("service billed", Math.abs(cashBefore - s2.cash - serviceCost(b2.classId)) < 0.01);
  check("yard stay occupies a home berth", b2.atPort === s2.hubId);
  while (s2.day === 1) advance(s2, 5); // 16h stay swallows the whole operating day
  check("overhaul restores condition", b2.condition === 100, b2.condition);
  check("yard time collided with the timetable", s2.routes["r-lopez"].sailingsYesterday === 0);

  // breakdown: a wreck limps across, then sits dead in the destination's berth
  const savedMax = CONFIG.maint.breakdownMaxPerSailing;
  CONFIG.maint.breakdownMaxPerSailing = 1; // deterministic: wrecks always fail
  const s3 = createState();
  const b3 = s3.boats[0];
  addTrip(s3, b3, "r-lopez", 7 * 60);
  b3.condition = 0;
  const cash3 = s3.cash;
  while (s3.clock < 9 * 60) advance(s3, 5); // depart 7:10, limp 50min, dead ~8:00
  check("breakdown puts the boat in repair", b3.phase === "repair", b3.phase);
  check("dead boat hogs the arrival berth", b3.atPort === "lopez");
  check("emergency repair billed", s3.cash < cash3 - repairCost(b3.classId) * 0.5);
  check("yard spend in the ledger", s3.maintToday >= repairCost(b3.classId));

  // a boat mid-repair survives a save round-trip
  const r3 = deserialize(serialize(s3));
  check(
    "repair state survives save",
    r3 !== null &&
      r3.boats[0].phase === "repair" &&
      r3.boats[0].atPort === "lopez" &&
      r3.boats[0].downMin === CONFIG.maint.repairMin,
  );

  // the repaired boat comes back patched, not overhauled (checked the moment
  // the yard releases it — it then resumes its pending return leg, late)
  while (b3.phase === "repair" && s3.clock < 21 * 60) advance(s3, 5);
  check("repair restores to patch level", b3.condition === CONFIG.maint.repairRestoreTo, b3.condition);
  check("berth freed on release", b3.atPort === null && b3.phase === "idle");

  // a dead boat blocks the island's only slip: the next boat can't take the
  // berth to load its return leg — it waits at anchor, running late
  const s4 = createState();
  const bA = s4.boats[0];
  const bB = buyBoat(s4, "hiyu")!;
  addTrip(s4, bA, "r-lopez", 7 * 60);
  addTrip(s4, bB, "r-lopez", 8 * 60);
  bA.condition = 0; // A breaks and dies at Lopez ~8:00
  while (s4.clock < 9 * 60) advance(s4, 5); // B arrived ~8:35; its return can't board
  check(
    "berth blocked by a dead boat stalls the next departure",
    bA.phase === "repair" && bB.phase === "idle" && bB.lastPort === "lopez" && bB.legIdx === 1,
    [bA.phase, bB.phase, bB.lastPort, bB.legIdx],
  );
  CONFIG.maint.breakdownMaxPerSailing = savedMax;

  // resale scales with condition: a run-down hull fetches less
  const s5 = createState();
  const b5 = s5.boats[0];
  const vc5 = vesselById(b5.classId);
  const full = sellPrice(b5);
  b5.condition = 50;
  const floor = CONFIG.maint.resaleConditionFloor;
  const expect50 = vc5.cost * CONFIG.economy.resaleFactor * (floor + (1 - floor) * 0.5);
  check("full-condition resale unchanged", full === vc5.cost * CONFIG.economy.resaleFactor);
  check("worn hull sells for less", Math.abs(sellPrice(b5) - expect50) < 0.01, sellPrice(b5));
}

// ---- 11. schedule sheets: named timetables by day-type + season --------------
{
  const s = createState();
  const base = s.sheets[0];
  const winterWknd = addSheet(s, "Winter weekends", "weekend", "winter");
  const anyWknd = addSheet(s, "Weekends", "weekend", "any");

  // day math: day 1 = Mon spring; winter = days 22-28; day 27 = winter Sat
  check("weekday spring runs the base sheet", activeSheet(s, 1).id === base.id);
  check("spring Saturday runs the weekend sheet", activeSheet(s, 6).id === anyWknd.id);
  check("winter Saturday prefers the most specific sheet", activeSheet(s, 27).id === winterWknd.id);
  check("winter Monday falls back to base", activeSheet(s, 22).id === base.id);

  // an empty matching sheet means NO service that day — schedule on base only,
  // run through Friday and Saturday, and watch the weekend go quiet
  const s2 = createState();
  addSheet(s2, "Weekends (empty)", "weekend", "any");
  addTrip(s2, s2.boats[0], "r-lopez", 7 * 60);
  while (s2.day < 6) advance(s2, 60); // Fri ends -> Sat begins
  const friSailings = s2.routes["r-lopez"].sailingsYesterday;
  while (s2.day < 7) advance(s2, 60); // Sat ends
  check("weekday sheet sailed", friSailings === 2, friSailings);
  check("empty weekend sheet = no sailings", s2.routes["r-lopez"].sailingsYesterday === 0);
}

// ---- 12. service plans: generator, loops, live editing -----------------------
{
  // 2-stop plan: departures across the window, skipping ones the boat can't make
  const s = createState();
  const sheet = s.sheets[0];
  const boat = s.boats[0];
  const made = createPlan(s, sheet, {
    name: "Lopez shuttle",
    stops: ["hub", "lopez"],
    headwayMin: 120,
    winStart: 6 * 60,
    winEnd: 10 * 60,
    boatIds: [boat.id],
  });
  check("plan created", made !== null);
  const legs = sheet.legs[boat.id] ?? [];
  check("plan stamped 3 departures x 2 legs", made!.result.stamped === 3 && legs.length === 6, [made!.result.stamped, legs.length]);
  check("legs carry the plan id", legs.every((l) => l.planId === made!.plan.id));

  // headway floor: one Hiyu on Lopez cycles in 2x(10+25)=70 min
  check("min headway = cycle / boats", planMinHeadway(s, made!.plan) === 70, planMinHeadway(s, made!.plan));

  // too-tight headway skips unmakeable departures instead of double-booking
  const dry = stampPlan(s, sheet, { ...made!.plan, headwayMin: 60, id: made!.plan.id }, true);
  check("conflicting departures are skipped", dry.skipped > 0, dry);

  // live edit: widen the headway -> fewer legs after re-stamp
  const res2 = updatePlan(s, sheet, made!.plan, { ...made!.plan, headwayMin: 240 });
  check("re-stamp replaced the legs", res2 !== null && (sheet.legs[boat.id] ?? []).length === 4, (sheet.legs[boat.id] ?? []).length);

  // hand-editing a stamped leg detaches it from the plan
  const target = sheet.legs[boat.id][0];
  moveLeg(sheet, boat.id, target.id, target.depart + 15);
  check("moved leg detaches from plan", target.planId === undefined);

  // unpack keeps the legs as plain trips; remove deletes them
  unpackPlan(sheet, made!.plan.id);
  check("unpack keeps legs, drops plan", (sheet.legs[boat.id] ?? []).length === 4 && sheet.plans.length === 0);

  // multi-stop loop: hub -> lopez -> friday -> hub, auto-connecting lopez-friday
  const s3 = createState();
  const cashBefore = s3.cash;
  check("no lopez-friday route initially", routeBetween(s3, "lopez", "friday") === null);
  const loop = createPlan(s3, s3.sheets[0], {
    name: "Island loop",
    stops: ["hub", "lopez", "friday"],
    headwayMin: 180,
    winStart: 6 * 60,
    winEnd: 12 * 60,
    boatIds: [s3.boats[0].id],
  });
  check("loop plan created", loop !== null && loop.result.stamped >= 2);
  check("missing leg auto-connected, free", routeBetween(s3, "lopez", "friday") !== null && s3.cash === cashBefore);

  // the loop actually carries island-to-island riders without a hub transfer
  // (organic demand off so the seeded cohort is the only thing in the queue)
  const savedTpr = { ...CONFIG.od.tripsPerResident };
  for (const k in CONFIG.od.tripsPerResident) CONFIG.od.tripsPerResident[k] = 0;
  s3.ports.lopez.queues.friday = { commuter: { foot: 50, car: 0, wait: 0 } };
  const revBefore = s3.revenueToday;
  while (s3.clock < 12 * 60) advance(s3, 5);
  Object.assign(CONFIG.od.tripsPerResident, savedTpr);
  check("loop delivered lopez->friday direct", waitingFor(s3.ports.lopez, "friday") < 1, waitingFor(s3.ports.lopez, "friday"));
  check("loop fares collected", s3.revenueToday > revBefore);
  const lfRoute = routeBetween(s3, "lopez", "friday")!;
  check("interisland leg sailed", lfRoute.sailingsToday > 0, lfRoute.sailingsToday);

  // remove: plan AND its legs disappear
  removePlan(s3.sheets[0], loop!.plan.id);
  check("remove clears stamped legs", (s3.sheets[0].legs[s3.boats[0].id] ?? []).filter((l) => l.planId !== undefined).length === 0);

  // plans + sheets survive a save round-trip
  const s4 = createState();
  const wk = addSheet(s4, "Weekends", "weekend", "any");
  const p4 = createPlan(s4, wk, {
    name: "Weekend shuttle",
    stops: ["hub", "orcas"],
    headwayMin: 120,
    winStart: 8 * 60,
    winEnd: 16 * 60,
    boatIds: [s4.boats[0].id],
  });
  const r4 = deserialize(serialize(s4));
  check(
    "sheets + plans survive save",
    r4 !== null &&
      r4.sheets.length === 2 &&
      r4.sheets[1].dayType === "weekend" &&
      r4.sheets[1].plans.length === 1 &&
      r4.sheets[1].plans[0].name === "Weekend shuttle" &&
      (r4.sheets[1].legs[s4.boats[0].id] ?? []).length === (wk.legs[s4.boats[0].id] ?? []).length,
    p4?.result,
  );

  // v1 saves migrate: round trips become leg pairs on the base sheet
  const v1 = JSON.stringify({
    v: 1,
    cash: 1_000_000,
    day: 3,
    clock: 6 * 60,
    boatCounter: 1,
    tripCounter: 2,
    ports: {},
    routes: {},
    boats: [
      {
        id: 1, name: "Old Ferry", classId: "hiyu", phase: "out", routeId: "r-lopez",
        itinerary: [
          { id: 1, routeId: "r-lopez", depart: 7 * 60 },
          { id: 2, routeId: "r-friday", depart: 13 * 60 },
        ],
      },
    ],
  });
  const m = deserialize(v1);
  check(
    "v1 save migrates to legs",
    m !== null &&
      m.boats.length === 1 &&
      m.boats[0].phase === "idle" &&
      (m.sheets[0].legs[1] ?? []).length === 4,
    m ? (m.sheets[0].legs[1] ?? []).length : null,
  );
  if (m) {
    for (let t = 0; t < 1440; t += 5) advance(m, 5);
    check("migrated game runs a full day", Number.isFinite(m.cash) && m.routes["r-lopez"].sailingsYesterday === 2);
  }

  // connecting two docked ports is free
  const s5 = createState();
  const c0 = s5.cash;
  const opened = openRoute(s5, "lopez", "orcas");
  check("connect between docked ports is free", opened !== null && s5.cash === c0);
}

// ---- 13. clearSave blocks the pagehide re-save (new-company fix) --------------
// Reloading fires pagehide -> saveGame; without the block that autosave would
// re-persist the abandoned company and "Start a new company" would do nothing.
{
  const store: Record<string, string> = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  const s = createState();
  s.day = 7;
  saveGame(s);
  check("autosave writes before clear", loadGame() !== null);
  clearSave();
  check("clearSave removes the save", loadGame() === null);
  saveGame(s); // simulate pagehide firing during the reload
  check("autosave blocked after clearSave", loadGame() === null);
  delete (globalThis as { localStorage?: unknown }).localStorage;
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
