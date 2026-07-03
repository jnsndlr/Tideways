import { CONFIG, nmBetween, vesselById } from "../config";
import {
  addSlipCost,
  buyBlocker,
  clearSave,
  conditionTier,
  portPopulation,
  repFactor,
  routeCandidates,
  seasonOf,
  segWaiting,
  sellPrice,
  serviceCost,
  slipUpgradeCost,
  todaysLegs,
  townTier,
  weekdayName,
} from "../sim";
import type { Boat } from "../types";
import { repColor } from "../render/canvas";
import type { GameState, PortState, RouteState } from "../types";

const money = (n: number) => "$" + Math.round(n).toLocaleString();
const signed = (n: number) => (n < 0 ? "−$" : "+$") + Math.abs(Math.round(n)).toLocaleString();
const clockStr = (m: number) =>
  String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(Math.floor(m % 60)).padStart(2, "0");
const repLabel = (r: number) =>
  r < 40 ? "Poor" : r < 65 ? "Fair" : r < 80 ? "Good" : "Excellent";

/** Last week's growth as a compact trend badge (▲/▼, one decimal). */
const growthBadge = (g: number): string =>
  g > 0.0005 ? `▲${(g * 100).toFixed(1)}%` : g < -0.0005 ? `▼${(Math.abs(g) * 100).toFixed(1)}%` : "·";
const growthColor = (g: number): string =>
  g > 0.0005 ? "var(--good)" : g < -0.0005 ? "var(--bad)" : "var(--txt-dim)";

export interface PanelCallbacks {
  onSetPrice: (routeId: string, kind: "foot" | "car", price: number) => void;
  onBuy: (classId: string) => void;
  onSell: (boatId: number) => void;
  onService: (boatId: number) => void;
  onCycleGrade: (boatId: number) => void;
  onCycleStaffing: (boatId: number) => void;
  onSpeed: (speed: number) => void;
  onBuildDock: (portId: string) => void;
  onAddSlip: (portId: string) => void;
  onUpgradeSlip: (portId: string, slipIdx: number) => void;
  onBuildFuelDepot: (portId: string) => void;
  onOpenRoute: (fromId: string, toId: string) => void;
  onPreviewRoute: (fromId: string | null, toId: string | null) => void;
  onPlanService: (fromId: string, toId: string) => void;
}

/**
 * All DOM the panel touches per frame is cached: HUD elements once at startup,
 * company-tab elements once at build, and the dock sheet's live values are
 * collected into a map each time the sheet's structure re-renders. updateHud
 * never does a document-wide querySelector.
 */
export class Panel {
  private fleetEl = document.getElementById("fleet")!;
  private buyWrap = document.getElementById("buy-wrap")!;
  private companyEl = document.getElementById("company")!;
  private companyView = document.getElementById("view-company")!;
  private detailEl: HTMLElement;
  private detailKey: string | null = null; // structural signature of what's rendered
  selectedDock: string | null = null;

  // cached HUD refs (static DOM)
  private cashEl = document.querySelector<HTMLElement>("[data-cash]")!;
  private dayLabEl = document.querySelector<HTMLElement>("[data-daylab]")!;
  private clockEl = document.querySelector<HTMLElement>("[data-clock]")!;
  private netEl = document.querySelector<HTMLElement>("[data-net]")!;

  // cached company-tab refs (rebuilt with buildCompany / buildFleet)
  private co: Record<string, HTMLElement> = {};
  private buyBtns: { btn: HTMLButtonElement; classId: string }[] = [];
  private fleetRows: {
    boatId: number;
    cond: HTMLElement;
    fuel: HTMLElement;
    grade: HTMLButtonElement;
    staff: HTMLButtonElement;
    service: HTMLButtonElement;
    sell: HTMLButtonElement;
  }[] = [];

  // dock-sheet live elements, collected after each structural render
  private live = new Map<string, HTMLElement>();
  private costBtns: HTMLButtonElement[] = [];

  constructor(private state: GameState, private cb: PanelCallbacks) {
    this.detailEl = document.createElement("div");
    this.detailEl.id = "dock-detail";
    this.detailEl.hidden = true;
    document.getElementById("map-wrap")!.appendChild(this.detailEl);
    this.buildCompany();
    this.buildFleet();
    this.wireSpeed();
  }

  private get hubSlips(): number[] {
    return this.state.ports[this.state.hubId].slips;
  }

  /** Two-button speed control: pause toggle + a 1×/2×/4× cycle. */
  private wireSpeed(): void {
    const pause = document.getElementById("speed-pause") as HTMLButtonElement;
    const cycle = document.getElementById("speed-cycle") as HTMLButtonElement;
    const speeds = [1, 2, 4];
    let current = 1; // last running speed (restored on unpause)
    const apply = (): void => {
      const paused = this.state.speed === 0;
      pause.classList.toggle("paused", paused);
      pause.textContent = paused ? "▶" : "⏸";
      cycle.textContent = current + "×";
      cycle.classList.toggle("active", !paused);
    };
    pause.onclick = () => {
      this.cb.onSpeed(this.state.speed === 0 ? current : 0);
      apply();
    };
    cycle.onclick = () => {
      current = speeds[(speeds.indexOf(current) + 1) % speeds.length];
      this.cb.onSpeed(current); // choosing a speed also unpauses
      apply();
    };
    apply();
  }

  // ---- company tab -----------------------------------------------------------

  private buildCompany(): void {
    this.companyEl.innerHTML = `
      <div class="panel-title">Company</div>
      <div class="co-stats">
        <div class="co-stat"><span>Value</span><b data-co="value">—</b></div>
        <div class="co-stat"><span>Reputation</span><b data-co="rep">—</b></div>
        <div class="co-stat"><span>Season</span><b data-co="season">—</b></div>
      </div>
      <div class="panel-title">Daily ledger · yesterday</div>
      <div class="co-ledger">
        <div><span>Fare revenue</span><b data-co="rev">—</b></div>
        <div><span>Fuel</span><b data-co="fuel">—</b></div>
        <div><span>Crew sailings</span><b data-co="crew">—</b></div>
        <div><span>Moorage</span><b data-co="moorage">—</b></div>
        <div><span>Yard</span><b data-co="maint">—</b></div>
        <div class="co-net"><span>Net / day</span><b data-co="net">—</b></div>
      </div>`;
    this.co = {};
    this.companyEl.querySelectorAll<HTMLElement>("[data-co]").forEach((el) => {
      this.co[el.dataset.co!] = el;
    });
  }

  private refreshCompany(): void {
    const s = this.state;
    const has = s.day > 1;
    const season = seasonOf(s.day);
    this.co.value.textContent = money(s.companyValue);
    this.co.rep.textContent = `${Math.round(s.rep)} · ${repLabel(s.rep)}`;
    this.co.rep.style.color = repColor(s.rep);
    this.co.season.textContent = `${season.icon} ${season.name}`;
    this.co.rev.textContent = has ? signed(s.revenueYesterday) : "—";
    this.co.fuel.textContent = has ? signed(-s.fuelYesterday) : "—";
    this.co.crew.textContent = has ? signed(-s.crewYesterday) : "—";
    this.co.moorage.textContent = signed(-this.fleetMoorage());
    this.co.maint.textContent = has ? signed(-s.maintYesterday) : "—";
    const net = this.dailyNet();
    this.co.net.textContent = net === null ? "—" : signed(net);
    this.co.net.style.color = net === null ? "" : net >= 0 ? "var(--good)" : "var(--bad)";
    for (const { btn, classId } of this.buyBtns)
      btn.disabled = buyBlocker(s, classId) !== null;
    for (const row of this.fleetRows) {
      const b = s.boats.find((x) => x.id === row.boatId);
      if (b) this.refreshFleetRow(b, row);
    }
  }

  /** Live half of a fleet row: condition, fuel, grade/staffing toggles, yard
   *  status, service + sell buttons. */
  private refreshFleetRow(
    boat: Boat,
    row: {
      cond: HTMLElement;
      fuel: HTMLElement;
      grade: HTMLButtonElement;
      staff: HTMLButtonElement;
      service: HTMLButtonElement;
      sell: HTMLButtonElement;
    },
  ): void {
    const tier = conditionTier(boat.condition);
    row.cond.textContent = `${Math.round(boat.condition)}% · ${tier.name}`;
    row.cond.style.color = tier.color;
    const tank = vesselById(boat.classId).tankNm;
    const frac = tank > 0 ? boat.fuelNm / tank : 0;
    row.fuel.textContent = `⛽ ${Math.round(frac * 100)}%`;
    row.fuel.style.color =
      frac <= 0 ? "var(--bad)" : frac < CONFIG.fuelCfg.refuelBelowFrac * 2 ? "#f3c14b" : "";
    row.grade.textContent = `Fuel: ${CONFIG.fuelCfg.grades[boat.fuelGrade].name}`;
    row.staff.textContent = `Crew: ${CONFIG.staffing[boat.staffing].name}`;
    const inYard = boat.phase === "maint" || boat.phase === "repair";
    if (inYard) {
      const hoursLeft = Math.max(1, Math.ceil((boat.downMin - boat.timer) / 60));
      row.service.textContent =
        (boat.phase === "maint" ? "⚙️ In the yard" : "🔧 Breakdown repair") + ` · ${hoursLeft}h left`;
      row.service.disabled = true;
    } else if (boat.serviceRequested) {
      row.service.textContent = "Service queued · tap to cancel";
      row.service.disabled = false;
    } else {
      row.service.textContent = `Service · ${money(serviceCost(boat.classId))}`;
      row.service.disabled = this.state.cash < serviceCost(boat.classId);
    }
    row.sell.textContent = `Sell ${money(sellPrice(boat))}`;
    row.sell.disabled = boat.phase !== "idle";
  }

  // ---- fleet + buy menu ----------------------------------------------------

  buildFleet(): void {
    this.fleetEl.innerHTML = "";
    this.fleetRows = [];
    for (const boat of this.state.boats) {
      const vc = vesselById(boat.classId);
      const row = document.createElement("div");
      row.className = "fleet-row";
      row.innerHTML = `
        <div class="fleet-top">
          <span class="fleet-name">⛴ ${boat.name}</span>
          <span class="fleet-class">${vc.short}</span>
          <span class="fleet-cap">${vc.peopleCap}p${vc.carCap ? " · " + vc.carCap + "🚗" : ""}</span>
          <span class="fleet-trips">${todaysLegs(this.state, boat).length} legs today</span>
        </div>
        <div class="fleet-bottom">
          <span class="fleet-cond"></span>
          <button class="fleet-service"></button>
          <button class="fleet-sell"></button>
        </div>
        <div class="fleet-ops">
          <span class="fleet-fuel"></span>
          <button class="fleet-grade"></button>
          <button class="fleet-staff"></button>
        </div>`;
      const service = row.querySelector<HTMLButtonElement>(".fleet-service")!;
      service.addEventListener("click", () => this.cb.onService(boat.id));
      const sell = row.querySelector<HTMLButtonElement>(".fleet-sell")!;
      sell.addEventListener("click", () => {
        if (confirm(`Sell ${boat.name} for ${money(sellPrice(boat))}? Its timetable is discarded.`))
          this.cb.onSell(boat.id);
      });
      const grade = row.querySelector<HTMLButtonElement>(".fleet-grade")!;
      grade.addEventListener("click", () => this.cb.onCycleGrade(boat.id));
      const staff = row.querySelector<HTMLButtonElement>(".fleet-staff")!;
      staff.addEventListener("click", () => this.cb.onCycleStaffing(boat.id));
      const entry = {
        boatId: boat.id,
        cond: row.querySelector<HTMLElement>(".fleet-cond")!,
        fuel: row.querySelector<HTMLElement>(".fleet-fuel")!,
        grade,
        staff,
        service,
        sell,
      };
      this.refreshFleetRow(boat, entry);
      this.fleetRows.push(entry);
      this.fleetEl.appendChild(row);
    }
    this.buildBuyMenu();
  }

  private buildBuyMenu(): void {
    this.buyWrap.innerHTML = "";
    this.buyBtns = [];
    const used = this.state.boats.length;
    const cap = this.hubSlips.length;
    const full = used >= cap;
    const head = document.createElement("div");
    head.className = "buy-head";
    head.textContent = full
      ? `All ${cap} home berths full — add a berth at the home port`
      : `Buy a ferry  (${used}/${cap} berths)`;
    this.buyWrap.appendChild(head);
    if (full) return;

    const grid = document.createElement("div");
    grid.className = "buy-grid";
    for (const vc of CONFIG.vesselClasses) {
      const blocker = buyBlocker(this.state, vc.id);
      const btn = document.createElement("button");
      btn.className = "buy-card";
      btn.disabled = blocker !== null;
      const note =
        blocker === "size" ? "<span class='buy-warn'>needs a bigger berth</span>" : "";
      btn.innerHTML = `
        <b>${vc.short}</b>
        <span>${vc.peopleCap}p ${vc.carCap ? vc.carCap + "🚗" : "no cars"}</span>
        <span>${money(vc.crewPerSailing)}/sailing crew · ${money(vc.moorageDaily)}/day</span>
        <em>${money(vc.cost)}</em>${note}`;
      btn.onclick = () => {
        this.cb.onBuy(vc.id);
        this.buildFleet();
      };
      this.buyBtns.push({ btn, classId: vc.id });
      grid.appendChild(btn);
    }
    this.buyWrap.appendChild(grid);
  }

  // ---- dock sheet ------------------------------------------------------------

  selectDock(id: string | null): void {
    this.selectedDock = id ?? null;
    this.cb.onPreviewRoute(null, null);
    this.renderDockDetail();
  }

  private routesForPort(portId: string): RouteState[] {
    return Object.values(this.state.routes).filter(
      (R) =>
        (R.def.from === portId || R.def.to === portId) &&
        this.state.ports[R.def.from].slips.length > 0 &&
        this.state.ports[R.def.to].slips.length > 0,
    );
  }

  private dockKey(id: string): string {
    const P = this.state.ports[id];
    return `${id}|${P.slips.join(",")}|${P.fuelDepot ? "F" : ""}|${this.routesForPort(id).length}|${this.state.boats.length}`;
  }

  /** Rebuild the sheet structure. Called only when its shape changes (selection /
   *  build / slip / route change) — live numbers are patched by refreshDockDetail. */
  private renderDockDetail(): void {
    const id = this.selectedDock;
    if (!id) {
      this.detailEl.hidden = true;
      this.detailKey = null;
      return;
    }
    this.detailEl.hidden = false;
    const P = this.state.ports[id];
    if (id === this.state.hubId) {
      this.detailEl.innerHTML = this.homePortHtml();
    } else {
      this.detailEl.innerHTML = P.slips.length ? this.openDockHtml(P) : this.lockedDockHtml(P);
    }

    // collect live elements + cost buttons once per structural render
    this.live.clear();
    this.detailEl.querySelectorAll<HTMLElement>("[data-live]").forEach((el) => {
      this.live.set(el.dataset.live!, el);
    });
    this.costBtns = [...this.detailEl.querySelectorAll<HTMLButtonElement>("[data-cost]")];

    // wire interactions
    this.detailEl.querySelector(".dd-close")!.addEventListener("click", () => {
      this.selectDock(null);
    });
    this.detailEl
      .querySelector(".dd-build")
      ?.addEventListener("click", () => this.cb.onBuildDock(id));
    this.detailEl
      .querySelector(".slip-add")
      ?.addEventListener("click", () => this.cb.onAddSlip(id));
    this.detailEl
      .querySelector(".dd-fuel")
      ?.addEventListener("click", () => this.cb.onBuildFuelDepot(id));
    this.detailEl.querySelectorAll<HTMLElement>(".slip-up").forEach((b) => {
      const idx = parseInt(b.dataset.slip ?? "0", 10);
      b.addEventListener("click", () => this.cb.onUpgradeSlip(id, idx));
    });
    this.detailEl.querySelectorAll<HTMLElement>(".route-cand").forEach((row) => {
      const to = row.dataset.to!;
      row.addEventListener("mouseenter", () => this.cb.onPreviewRoute(id, to));
      row.addEventListener("mouseleave", () => this.cb.onPreviewRoute(null, null));
      row
        .querySelector(".rc-open")
        ?.addEventListener("click", () => this.cb.onOpenRoute(id, to));
    });
    this.detailEl.querySelectorAll<HTMLButtonElement>(".re-plan").forEach((b) => {
      b.addEventListener("click", () => this.cb.onPlanService(id, b.dataset.to!));
    });
    this.detailEl.querySelectorAll<HTMLButtonElement>("[data-pr]").forEach((b) => {
      const [routeId, kind, dir] = b.dataset.pr!.split(":") as [string, "foot" | "car", string];
      b.addEventListener("click", () => {
        const R = this.state.routes[routeId];
        const bounds = CONFIG.priceBounds;
        const min = kind === "foot" ? bounds.footMin : bounds.carMin;
        const max = kind === "foot" ? bounds.footMax : bounds.carMax;
        const cur = kind === "foot" ? R.footPrice : R.carPrice;
        const next = Math.max(min, Math.min(max, cur + (dir === "up" ? bounds.step : -bounds.step)));
        this.cb.onSetPrice(routeId, kind, next);
        const el = this.live.get(`price:${routeId}:${kind}`);
        if (el) el.textContent = "$" + next;
      });
    });

    this.detailKey = this.dockKey(id);
  }

  /** Per-frame: patch live values + button affordability without touching structure. */
  private refreshDockDetail(): void {
    const id = this.selectedDock;
    if (!id) return;
    for (const el of this.costBtns) el.disabled = this.state.cash < Number(el.dataset.cost);

    const P = this.state.ports[id];
    if (id === this.state.hubId) {
      const fleet = this.live.get("hubfleet");
      if (fleet) fleet.textContent = `${this.state.boats.length} / ${this.hubSlips.length}`;
      return;
    }
    if (!P.slips.length) return; // locked: only the build button needed refreshing

    const sw = segWaiting(P);
    for (const g of CONFIG.segments) {
      const sr = P.segRep[g.id];
      const bar = this.live.get(`bar:${g.id}`);
      if (bar) {
        bar.style.width = sr + "%";
        bar.style.background = repColor(sr);
      }
      const rep = this.live.get(`segrep:${g.id}`);
      if (rep) rep.textContent = String(Math.round(sr));
      const wait = this.live.get(`segwait:${g.id}`);
      if (wait) wait.textContent = Math.round(sw[g.id]) + " waiting";
      const grow = this.live.get(`seggrow:${g.id}`);
      if (grow) {
        grow.textContent = growthBadge(P.segGrowth[g.id]);
        grow.style.color = growthColor(P.segGrowth[g.id]);
      }
    }
    const town = this.live.get("town");
    if (town) {
      const tp = portPopulation(P);
      town.textContent = `${townTier(tp).name} · ${Math.round(tp).toLocaleString()}`;
    }
    const trend = this.live.get("towntrend");
    if (trend) {
      const t = this.portTrend(P);
      trend.textContent = growthBadge(t);
      trend.style.color = growthColor(t);
    }
    const head = this.live.get("rep");
    if (head) {
      head.textContent = `${Math.round(P.rep)} · ${repLabel(P.rep)}`;
      head.style.color = repColor(P.rep);
    }
    const turnout = this.live.get("turnout");
    if (turnout) turnout.textContent = Math.round(repFactor(P.demandRep) * 100) + "% of base";
    const balked = this.live.get("balked");
    if (balked) balked.textContent = Math.round(P.balkedYesterday).toLocaleString();
  }

  /** Port-average growth from the last weekly tick (the sheet's headline trend). */
  private portTrend(P: PortState): number {
    return (
      CONFIG.segments.reduce((a, g) => a + P.segGrowth[g.id], 0) / CONFIG.segments.length
    );
  }

  private fleetMoorage(): number {
    return this.state.boats.reduce((a, b) => a + vesselById(b.classId).moorageDaily, 0);
  }

  /** Yesterday's full-day profit (revenue − fuel − crew − yard − moorage), or
   *  null on day 1 when no day has completed yet. */
  private dailyNet(): number | null {
    if (this.state.day <= 1) return null;
    return (
      this.state.revenueYesterday -
      this.state.fuelYesterday -
      this.state.crewYesterday -
      this.state.maintYesterday -
      this.fleetMoorage()
    );
  }

  private dockHead(name: string, color: string): string {
    return `
      <div class="dd-grab"></div>
      <div class="dd-head">
        <div class="dot" style="background:${color}"></div>
        <div class="dd-name">${name}</div>
        <button class="dd-close">✕</button>
      </div>`;
  }

  /** Slip list for any port: per-slip size + upgrade button, plus an add-berth button. */
  private slipsHtml(slips: number[]): string {
    const rows = slips
      .map((tier, i) => {
        const cost = slipUpgradeCost(tier);
        const name = CONFIG.vesselClasses[tier].short;
        const up =
          cost === null
            ? `<span class="slip-max">max size</span>`
            : `<button class="slip-up" data-slip="${i}" data-cost="${cost}">▲ ${CONFIG.vesselClasses[tier + 1].short} · ${money(cost)}</button>`;
        return `<div class="slip-row"><span class="slip-name">Slip ${i + 1} · <b>${name}</b></span>${up}</div>`;
      })
      .join("");
    const addCost = addSlipCost(slips);
    return `<div class="slips">${rows}
      <button class="slip-add" data-cost="${addCost}">+ Add berth · ${money(addCost)}</button></div>`;
  }

  private homePortHtml(): string {
    const hub = this.state.ports[this.state.hubId];
    return `${this.dockHead(hub.def.name + " · Home Port", "#57b6e0")}
      <div class="dd-rows">
        <div><span>Fleet berths</span><b data-live="hubfleet">${this.state.boats.length} / ${this.hubSlips.length}</b></div>
      </div>
      <div class="dd-slips-title">Berths</div>
      ${this.slipsHtml(this.hubSlips)}
      ${this.routesHtml(hub)}
      <div class="dd-fuel-built">⛽ Fuel dock — every boat can refuel here</div>
      <div class="dd-hint">Berths cap your fleet size; a slip's size sets the largest vessel you can base. The daily ledger lives in the Company tab.</div>`;
  }

  private lockedDockHtml(P: PortState): string {
    const cost = CONFIG.slipCfg.buildSlipCost;
    const est = Math.round(portPopulation(P)).toLocaleString();
    const hub = this.state.ports[this.state.hubId];
    const dist = Math.round(nmBetween(P.def.pos, hub.def.pos) * 10) / 10;
    return `${this.dockHead(P.def.name, P.def.color)}
      <div class="dd-locked">🔒 No dock here yet</div>
      <div class="dd-rows">
        <div><span>To hub</span><b>${dist} nm</b></div>
        <div><span>Population</span><b>${est}</b></div>
      </div>
      <button class="dd-build" data-cost="${cost}">
        Build dock — ${money(cost)} <em>(${CONFIG.vesselClasses[0].short}-class slip)</em>
      </button>
      <div class="dd-hint">A new dock opens with one ${CONFIG.vesselClasses[0].short} slip and connects to the hub. Upgrade it or add berths later.</div>`;
  }

  private openDockHtml(P: PortState): string {
    const sw = segWaiting(P);
    const turnout = Math.round(repFactor(P.demandRep) * 100);
    const totalPop = portPopulation(P);

    const segs = CONFIG.segments
      .map((g) => {
        const sr = P.segRep[g.id];
        const gr = P.segGrowth[g.id];
        return `<div class="dd-seg" style="border-color:${g.color}">
          <span>${g.icon} ${g.name}</span>
          <span class="dd-seg-meter"><i data-live="bar:${g.id}" style="width:${sr}%;background:${repColor(sr)}"></i></span>
          <b data-live="segrep:${g.id}">${Math.round(sr)}</b>
          <em data-live="segwait:${g.id}">${Math.round(sw[g.id])} waiting</em>
          <i class="dd-grow" data-live="seggrow:${g.id}" style="color:${growthColor(gr)}">${growthBadge(gr)}</i></div>`;
      })
      .join("");

    return `${this.dockHead(P.def.name, P.def.color)}
      <div class="dd-rep">
        <div class="dd-rep-top"><span>Reputation by segment</span>
          <b data-live="rep" style="color:${repColor(P.rep)}">${Math.round(P.rep)} · ${repLabel(P.rep)}</b></div>
      </div>
      <div class="dd-segs">${segs}</div>
      <div class="dd-rows">
        <div><span>Town</span><b data-live="town">${townTier(totalPop).name} · ${Math.round(totalPop).toLocaleString()}</b></div>
        <div><span>Last week</span><b data-live="towntrend" style="color:${growthColor(this.portTrend(P))}">${growthBadge(this.portTrend(P))}</b></div>
        <div><span>Turnout today</span><b data-live="turnout">${turnout}% of base</b></div>
        <div><span>Gave up yesterday</span><b data-live="balked">${Math.round(P.balkedYesterday).toLocaleString()}</b></div>
      </div>
      ${this.routesHtml(P)}
      <div class="dd-slips-title">Slips</div>
      ${this.slipsHtml(P.slips)}
      ${this.fuelDepotHtml(P)}
      <div class="dd-hint">Each segment keeps its own reputation. A slip's size limits which vessels can dock here; short a slip, arrivals wait offshore and run late.</div>`;
  }

  /** Fuel depot status/build block for an island dock sheet. */
  private fuelDepotHtml(P: PortState): string {
    if (P.fuelDepot)
      return `<div class="dd-fuel-built">⛽ Refueling depot — boats can fill up here</div>`;
    const cost = CONFIG.fuelCfg.fuelDepotCost;
    return `<button class="dd-fuel" data-cost="${cost}">⛽ Build fuel depot · ${money(cost)}</button>
      <div class="dd-hint">Without a depot, boats can only refuel at ${this.state.ports[this.state.hubId].def.name}. Low tanks refill automatically at any fuel port.</div>`;
  }

  /** Routes touching this port (with fare steppers) + candidates for new direct routes. */
  private routesHtml(P: PortState): string {
    const stepper = (R: RouteState, kind: "foot" | "car"): string => {
      const cur = kind === "foot" ? R.footPrice : R.carPrice;
      return `<div class="price">
        <span>${kind === "foot" ? "Foot" : "Car"}</span>
        <button data-pr="${R.def.id}:${kind}:dn">−</button>
        <b data-live="price:${R.def.id}:${kind}">$${cur}</b>
        <button data-pr="${R.def.id}:${kind}:up">+</button>
      </div>`;
    };
    const existing = this.routesForPort(P.def.id)
      .map((R) => {
        const otherId = R.def.from === P.def.id ? R.def.to : R.def.from;
        const other = this.state.ports[otherId];
        return `<div class="route-exist">
          <div class="re-head">
            <span class="dot" style="background:${R.def.color}"></span>
            <span class="re-name">→ ${other.def.name}</span>
            <em>${R.def.distanceNm} nm · ${R.def.crossingMin} min</em>
            <button class="re-plan" data-to="${otherId}">Plan service</button>
          </div>
          <div class="price-row">${stepper(R, "foot")}${stepper(R, "car")}</div>
        </div>`;
      })
      .join("");

    const candidates = routeCandidates(this.state, P.def.id);
    const candRows = candidates
      .map((other) => {
        const dist = Math.round(nmBetween(P.def.pos, other.def.pos) * 10) / 10;
        const crossing = Math.round(dist * CONFIG.routeCfg.minPerNm);
        return `<div class="route-cand" data-to="${other.def.id}">
          <span class="dot" style="background:${other.def.color}"></span>
          <span class="rc-name">${other.def.name}</span>
          <span class="rc-meta">${dist} nm · ${crossing} min</span>
          <button class="rc-open">Connect</button></div>`;
      })
      .join("");

    return `<div class="dd-routes-title">Routes &amp; fares${existing ? "" : " — none yet"}</div>
      ${existing ? `<div class="dd-routes">${existing}</div>` : ""}
      ${
        candidates.length
          ? `<div class="dd-routes-title">Connect another port — free</div>
             <div class="dd-route-candidates">${candRows}</div>`
          : ""
      }`;
  }

  // ---- per-frame -----------------------------------------------------------

  updateHud(): void {
    const s = this.state;
    this.cashEl.textContent = money(s.cash);
    this.cashEl.style.color = s.cash < 0 ? "var(--bad)" : "var(--gold)";
    this.dayLabEl.textContent = `Day ${s.day} · ${weekdayName(s.day)} ${seasonOf(s.day).icon}`;
    this.clockEl.textContent = clockStr(s.clock);
    const net = this.dailyNet();
    this.netEl.textContent = net === null ? "—" : signed(net);
    this.netEl.style.color = net === null ? "" : net >= 0 ? "var(--good)" : "var(--bad)";

    if (s.gameOver) {
      this.showGameOver();
      return;
    }

    if (!this.companyView.hidden) this.refreshCompany();

    if (this.selectedDock) {
      // only rebuild the sheet DOM when its shape changes (so buttons stay
      // clickable); otherwise just patch the live numbers in place.
      if (this.dockKey(this.selectedDock) !== this.detailKey) this.renderDockDetail();
      else this.refreshDockDetail();
    }
  }

  private showGameOver(): void {
    if (document.getElementById("game-over")) return;
    const s = this.state;
    const el = document.createElement("div");
    el.id = "game-over";
    el.innerHTML = `
      <div class="go-card">
        <div class="go-title">⚓ Insolvent</div>
        <div class="go-sub">The company ran out of money and folded on day ${s.day}.</div>
        <div class="go-stat">Final company value <b>${money(s.companyValue)}</b></div>
        <button class="go-btn">New game</button>
      </div>`;
    el.querySelector(".go-btn")!.addEventListener("click", () => {
      clearSave(); // otherwise the reload would restore the dead company
      location.reload();
    });
    document.getElementById("app")!.appendChild(el);
  }
}
