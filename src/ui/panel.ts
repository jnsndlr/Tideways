import { CONFIG, nmBetween, vesselById } from "../config";
import {
  addSlipCost,
  buyBlocker,
  clearSave,
  openRouteCost,
  repFactor,
  routeCandidates,
  segWaiting,
  slipUpgradeCost,
  waitingPeople,
} from "../sim";
import { repColor } from "../render/canvas";
import type { GameState, PortState, RouteState } from "../types";

const money = (n: number) => "$" + Math.round(n).toLocaleString();
const signed = (n: number) => (n < 0 ? "−$" : "+$") + Math.abs(Math.round(n)).toLocaleString();
const clockStr = (m: number) =>
  String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(Math.floor(m % 60)).padStart(2, "0");
const repLabel = (r: number) =>
  r < 40 ? "Poor" : r < 65 ? "Fair" : r < 80 ? "Good" : "Excellent";

/** Sum of a port's per-segment origin weight — a stable "size" figure. */
const portPopulation = (P: PortState): number =>
  CONFIG.segments.reduce((a, g) => a + (P.def.pop[g.id] ?? 0), 0);

export interface PanelCallbacks {
  onSetPrice: (routeId: string, kind: "foot" | "car", price: number) => void;
  onBuy: (classId: string) => void;
  onSpeed: (speed: number) => void;
  onBuildDock: (portId: string) => void;
  onAddSlip: (portId: string) => void;
  onUpgradeSlip: (portId: string, slipIdx: number) => void;
  onOpenRoute: (fromId: string, toId: string) => void;
  onPreviewRoute: (fromId: string | null, toId: string | null) => void;
}

export class Panel {
  private routesEl = document.getElementById("routes")!;
  private fleetEl = document.getElementById("fleet")!;
  private buyWrap = document.getElementById("buy-wrap")!;
  private detailEl: HTMLElement;
  private detailKey: string | null = null; // structural signature of what's rendered
  selectedDock: string | null = null;

  constructor(private state: GameState, private cb: PanelCallbacks) {
    this.detailEl = document.createElement("div");
    this.detailEl.id = "dock-detail";
    this.detailEl.hidden = true;
    document.getElementById("map-wrap")!.appendChild(this.detailEl);
    this.buildRoutes();
    this.buildFleet();
    this.wireSpeed();
  }

  private get hubSlips(): number[] {
    return this.state.ports[this.state.hubId].slips;
  }

  /** The non-hub end of a route — the island whose rep/queues the card shows. */
  private islandEnd(R: RouteState): PortState {
    const def = R.def;
    return this.state.ports[def.from === this.state.hubId ? def.to : def.from];
  }

  /** The (hub) route serving a given island port, if any. */
  private routeForPort(portId: string): RouteState | null {
    for (const id in this.state.routes) {
      const def = this.state.routes[id].def;
      if (def.to === portId || def.from === portId) return this.state.routes[id];
    }
    return null;
  }

  private wireSpeed(): void {
    document.querySelectorAll<HTMLButtonElement>("#speed button").forEach((b) => {
      b.onclick = () => {
        this.cb.onSpeed(parseInt(b.dataset.speed ?? "1", 10));
        document.querySelectorAll("#speed button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      };
    });
  }

  // ---- routes (one card per usable leg) ------------------------------------

  buildRoutes(): void {
    this.routesEl.innerHTML = "";
    for (const id in this.state.routes) {
      const R = this.state.routes[id];
      const a = this.state.ports[R.def.from];
      const b = this.state.ports[R.def.to];
      if (!a.slips.length || !b.slips.length) continue; // leg not yet usable
      const P = this.islandEnd(R);
      const card = document.createElement("div");
      card.className = "route-card";
      card.innerHTML = `
        <div class="route-head">
          <div class="dot" style="background:${R.def.color}"></div>
          <div class="route-name">${R.def.name}</div>
          <div class="route-sub">${R.def.distanceNm} nm · ${R.def.crossingMin} min</div>
        </div>
        <div class="route-stats">
          <div><span>Population</span> <b>${Math.round(portPopulation(P)).toLocaleString()}</b></div>
          <div><span>Waiting</span> <b data-wait="${id}">0</b></div>
          <div class="rep-cell"><span>Rep</span>
            <span class="mini-meter"><i data-routerepbar="${id}"></i></span>
            <b data-routerep="${id}">—</b></div>
        </div>
        <div class="seg-row">${CONFIG.segments
          .map(
            (g) =>
              `<span class="seg-pill" style="border-color:${g.color}">
                 <i style="background:${g.color}"></i>${g.icon}
                 <b data-segwait="${id}:${g.id}">0</b></span>`,
          )
          .join("")}</div>`;

      const priceRow = document.createElement("div");
      priceRow.className = "price-row";
      priceRow.appendChild(this.makeStepper(id, "foot", R));
      priceRow.appendChild(this.makeStepper(id, "car", R));
      card.appendChild(priceRow);

      this.routesEl.appendChild(card);
    }
  }

  private makeStepper(routeId: string, kind: "foot" | "car", R: RouteState): HTMLElement {
    const b = CONFIG.priceBounds;
    const min = kind === "foot" ? b.footMin : b.carMin;
    const max = kind === "foot" ? b.footMax : b.carMax;
    const wrap = document.createElement("div");
    wrap.className = "price";
    const cur = () => (kind === "foot" ? R.footPrice : R.carPrice);
    const val = document.createElement("b");
    val.textContent = "$" + cur();
    const set = (v: number) => {
      const c = Math.max(min, Math.min(max, v));
      this.cb.onSetPrice(routeId, kind, c);
      val.textContent = "$" + c;
    };
    const label = document.createElement("span");
    label.textContent = kind === "foot" ? "Foot" : "Car";
    const dn = document.createElement("button");
    dn.textContent = "−";
    dn.onclick = () => set(cur() - b.step);
    const up = document.createElement("button");
    up.textContent = "+";
    up.onclick = () => set(cur() + b.step);
    wrap.append(label, dn, val, up);
    return wrap;
  }

  // ---- fleet + buy menu ----------------------------------------------------

  buildFleet(): void {
    this.fleetEl.innerHTML = "";
    for (const boat of this.state.boats) {
      const vc = vesselById(boat.classId);
      const row = document.createElement("div");
      row.className = "fleet-row";
      row.innerHTML = `
        <span class="fleet-name">⛴ ${boat.name}</span>
        <span class="fleet-class">${vc.short}</span>
        <span class="fleet-cap">${vc.peopleCap}p${vc.carCap ? " · " + vc.carCap + "🚗" : " · no cars"}</span>
        <span class="fleet-trips">${boat.itinerary.length} sailings</span>`;
      this.fleetEl.appendChild(row);
    }
    this.buildBuyMenu();
  }

  private buildBuyMenu(): void {
    this.buyWrap.innerHTML = "";
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
        <span>${money(vc.dailyCost)}/day upkeep</span>
        <em>${money(vc.cost)}</em>${note}`;
      btn.onclick = () => {
        this.cb.onBuy(vc.id);
        this.buildFleet();
      };
      grid.appendChild(btn);
    }
    this.buyWrap.appendChild(grid);
  }

  // ---- dock detail ---------------------------------------------------------

  selectDock(id: string | null): void {
    this.selectedDock = id ?? null; // a port id; the hub opens the home-port panel
    this.cb.onPreviewRoute(null, null);
    this.renderDockDetail();
  }

  private routesForPort(portId: string): RouteState[] {
    return Object.values(this.state.routes).filter(
      (R) => R.def.from === portId || R.def.to === portId,
    );
  }

  private dockKey(id: string): string {
    if (id === this.state.hubId) return `hub|${this.hubSlips.join(",")}|${this.state.boats.length}`;
    return `${id}|${this.state.ports[id].slips.join(",")}|${this.routesForPort(id).length}`;
  }

  /** Rebuild the detail structure. Called only when the panel changes shape
   *  (selection / build / slip change) — NOT every frame, so the buttons survive
   *  long enough to be clicked. Live numbers are patched by refreshDockDetail. */
  private renderDockDetail(): void {
    const id = this.selectedDock;
    if (!id) {
      this.detailEl.hidden = true;
      this.detailKey = null;
      return;
    }
    this.detailEl.hidden = false;
    if (id === this.state.hubId) {
      this.detailEl.innerHTML = this.homePortHtml();
    } else {
      const P = this.state.ports[id];
      const route = this.routeForPort(id);
      this.detailEl.innerHTML = P.slips.length ? this.openDockHtml(P, route) : this.lockedDockHtml(P, route);
    }
    this.detailEl.querySelector(".dd-close")!.addEventListener("click", () => this.selectDock(null));
    this.detailEl
      .querySelector(".dd-build")
      ?.addEventListener("click", () => this.cb.onBuildDock(id));
    this.detailEl
      .querySelector(".slip-add")
      ?.addEventListener("click", () => this.cb.onAddSlip(id));
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
    this.detailKey = this.dockKey(id);
  }

  /** Per-frame: patch live values + button affordability without rebuilding DOM. */
  private refreshDockDetail(): void {
    const id = this.selectedDock;
    if (!id) return;

    // every cost button carries data-cost; grey it out when unaffordable
    this.detailEl.querySelectorAll<HTMLButtonElement>("[data-cost]").forEach((el) => {
      el.disabled = this.state.cash < Number(el.dataset.cost);
    });

    if (id === this.state.hubId) {
      this.setIn("[data-hub-fleet]", `${this.state.boats.length} / ${this.hubSlips.length}`);
      const has = this.state.day > 1;
      const rev = this.state.revenueYesterday;
      const fuel = this.state.fuelYesterday;
      const net = this.dailyNet();
      const fpct = has && rev > 0 ? Math.round((fuel / rev) * 100) + "%" : "—";
      this.setIn("[data-hub-rev]", has ? signed(rev) : "—");
      this.setIn("[data-hub-fuel]", has ? signed(-fuel) + " · " + fpct : "—");
      this.setIn("[data-hub-upkeep]", signed(-this.fleetUpkeep()));
      const netEl = this.detailEl.querySelector<HTMLElement>("[data-hub-net]");
      if (netEl) {
        netEl.textContent = net === null ? "—" : signed(net);
        netEl.style.color = net === null ? "" : net >= 0 ? "var(--good)" : "var(--bad)";
      }
      return;
    }
    const P = this.state.ports[id];
    if (!P.slips.length) return; // locked: only the build button needed refreshing

    const sw = segWaiting(P);
    for (const g of CONFIG.segments) {
      const sr = P.segRep[g.id];
      const bar = this.detailEl.querySelector<HTMLElement>(`[data-segrepbar="${g.id}"]`);
      if (bar) {
        bar.style.width = sr + "%";
        bar.style.background = repColor(sr);
      }
      this.setIn(`[data-segrep="${g.id}"]`, String(Math.round(sr)));
      this.setIn(`[data-segwait="${g.id}"]`, Math.round(sw[g.id]) + " waiting");
    }
    const head = this.detailEl.querySelector<HTMLElement>("[data-dd-rep]");
    if (head) {
      head.textContent = `${Math.round(P.rep)} · ${repLabel(P.rep)}`;
      head.style.color = repColor(P.rep);
    }
    this.setIn("[data-dd-turnout]", Math.round(repFactor(P.demandRep) * 100) + "% of base");
    this.setIn("[data-dd-balked]", Math.round(P.balkedYesterday).toLocaleString());
  }

  private setIn(sel: string, text: string): void {
    const el = this.detailEl.querySelector(sel);
    if (el) el.textContent = text;
  }

  private fleetUpkeep(): number {
    return this.state.boats.reduce((a, b) => a + vesselById(b.classId).dailyCost, 0);
  }

  /** Yesterday's full-day profit (revenue − fuel − upkeep), or null on day 1
   *  when no day has completed yet. */
  private dailyNet(): number | null {
    if (this.state.day <= 1) return null;
    return this.state.revenueYesterday - this.state.fuelYesterday - this.fleetUpkeep();
  }

  private dockHead(name: string, color: string): string {
    return `
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
    const has = this.state.day > 1;
    const rev = this.state.revenueYesterday;
    const fuel = this.state.fuelYesterday;
    const net = this.dailyNet();
    const fpct = has && rev > 0 ? Math.round((fuel / rev) * 100) + "%" : "—";
    const netColor = net === null ? "" : net >= 0 ? "var(--good)" : "var(--bad)";
    return `${this.dockHead(hub.def.name + " · Home Port", "#57b6e0")}
      <div class="dd-rows">
        <div><span>Fleet berths</span><b data-hub-fleet>${this.state.boats.length} / ${this.hubSlips.length}</b></div>
      </div>
      <div class="dd-slips-title">Daily ledger · yesterday</div>
      <div class="dd-rows">
        <div><span>Fare revenue</span><b data-hub-rev>${has ? signed(rev) : "—"}</b></div>
        <div><span>Fuel</span><b data-hub-fuel>${has ? signed(-fuel) + " · " + fpct : "—"}</b></div>
        <div><span>Fleet upkeep</span><b data-hub-upkeep>${signed(-this.fleetUpkeep())}</b></div>
        <div style="border-top:1px solid rgba(255,255,255,.12);margin-top:2px;padding-top:4px">
          <span>Net / day</span><b data-hub-net style="color:${netColor}">${net === null ? "—" : signed(net)}</b></div>
      </div>
      ${this.slipsHtml(this.hubSlips)}
      <div class="dd-hint">Berths cap your fleet size; a slip's size sets the largest vessel you can base. Fuel is charged every crossing — running near-empty sailings quietly eats the ledger.</div>`;
  }

  private lockedDockHtml(P: PortState, route: RouteState | null): string {
    const cost = CONFIG.slipCfg.buildSlipCost;
    const est = Math.round(portPopulation(P)).toLocaleString();
    const crossing = route ? `${route.def.distanceNm} nm · ${route.def.crossingMin} min` : "—";
    return `${this.dockHead(P.def.name, P.def.color)}
      <div class="dd-locked">🔒 No dock here yet</div>
      <div class="dd-rows">
        <div><span>Crossing</span><b>${crossing}</b></div>
        <div><span>Population</span><b>${est}</b></div>
      </div>
      <button class="dd-build" data-cost="${cost}">
        Build dock — ${money(cost)} <em>(${CONFIG.vesselClasses[0].short}-class slip)</em>
      </button>
      <div class="dd-hint">A new dock opens with one ${CONFIG.vesselClasses[0].short} slip and connects to the hub. Upgrade it or add berths later.</div>`;
  }

  private openDockHtml(P: PortState, _route: RouteState | null): string {
    const sw = segWaiting(P);
    const turnout = Math.round(repFactor(P.demandRep) * 100);

    const segs = CONFIG.segments
      .map((g) => {
        const sr = P.segRep[g.id];
        return `<div class="dd-seg" style="border-color:${g.color}">
          <span>${g.icon} ${g.name}</span>
          <span class="dd-seg-meter"><i data-segrepbar="${g.id}" style="width:${sr}%;background:${repColor(sr)}"></i></span>
          <b data-segrep="${g.id}">${Math.round(sr)}</b>
          <em data-segwait="${g.id}">${Math.round(sw[g.id])} waiting</em></div>`;
      })
      .join("");

    return `${this.dockHead(P.def.name, P.def.color)}
      <div class="dd-rep">
        <div class="dd-rep-top"><span>Reputation by segment</span>
          <b data-dd-rep style="color:${repColor(P.rep)}">${Math.round(P.rep)} · ${repLabel(P.rep)}</b></div>
      </div>
      <div class="dd-segs">${segs}</div>
      <div class="dd-rows">
        <div><span>Turnout today</span><b data-dd-turnout>${turnout}% of base</b></div>
        <div><span>Gave up yesterday</span><b data-dd-balked>${Math.round(P.balkedYesterday).toLocaleString()}</b></div>
      </div>
      <div class="dd-slips-title">Slips</div>
      ${this.slipsHtml(P.slips)}
      <div class="dd-hint">Each segment keeps its own reputation. A slip's size limits which vessels can dock here; the number of slips is how many ferries can berth at once — short a slip, arrivals wait offshore and run late.</div>
      ${this.routesHtml(P)}`;
  }

  /** Existing connections from this port, plus candidate ports to open a new direct route to. */
  private routesHtml(P: PortState): string {
    const existing = this.routesForPort(P.def.id)
      .map((R) => {
        const otherId = R.def.from === P.def.id ? R.def.to : R.def.from;
        const other = this.state.ports[otherId];
        return `<div class="route-exist">
          <span class="dot" style="background:${R.def.color}"></span>
          <span>${other.def.name}</span><em>${R.def.distanceNm} nm</em></div>`;
      })
      .join("");

    const candidates = routeCandidates(this.state, P.def.id);
    const candRows = candidates
      .map((other) => {
        const dist = Math.round(nmBetween(P.def.pos, other.def.pos) * 10) / 10;
        const crossing = Math.round(dist * CONFIG.routeCfg.minPerNm);
        const cost = openRouteCost(dist);
        return `<div class="route-cand" data-to="${other.def.id}">
          <span class="dot" style="background:${other.def.color}"></span>
          <span class="rc-name">${other.def.name}</span>
          <span class="rc-meta">${dist} nm · ${crossing} min</span>
          <button class="rc-open" data-cost="${cost}">Open · ${money(cost)}</button></div>`;
      })
      .join("");

    return `<div class="dd-routes-title">Routes${existing ? "" : " — none yet"}</div>
      ${existing ? `<div class="dd-routes">${existing}</div>` : ""}
      ${
        candidates.length
          ? `<div class="dd-routes-title">Open a new route</div>
             <div class="dd-route-candidates">${candRows}</div>`
          : `<div class="dd-hint">All docked ports are already connected directly.</div>`
      }`;
  }

  // ---- per-frame -----------------------------------------------------------

  updateHud(): void {
    const s = this.state;
    this.setText("[data-cash]", money(s.cash));
    this.setText("[data-day]", String(s.day));
    this.setText("[data-clock]", clockStr(s.clock));
    this.setText("[data-rep]", String(Math.round(s.rep)));
    this.setText("[data-value]", money(s.companyValue));

    const net = this.dailyNet();
    this.setText("[data-net]", net === null ? "—" : signed(net));
    const netEl = document.querySelector<HTMLElement>("[data-net]");
    if (netEl) netEl.style.color = net === null ? "" : net >= 0 ? "var(--good)" : "var(--bad)";

    // cash warning: turn red and count down to insolvency while in the red
    const cashEl = document.querySelector<HTMLElement>("[data-cash]");
    if (cashEl) cashEl.style.color = s.cash < 0 ? "var(--bad)" : "";
    if (s.gameOver) {
      this.showGameOver();
      return;
    }

    for (const id in s.routes) {
      const R = s.routes[id];
      const a = s.ports[R.def.from];
      const b = s.ports[R.def.to];
      if (!a.slips.length || !b.slips.length) continue;
      const P = this.islandEnd(R);
      this.setText(`[data-wait="${id}"]`, Math.round(waitingPeople(P)).toLocaleString());
      this.setText(`[data-routerep="${id}"]`, String(Math.round(P.rep)));
      const bar = document.querySelector<HTMLElement>(`[data-routerepbar="${id}"]`);
      if (bar) {
        bar.style.width = P.rep + "%";
        bar.style.background = repColor(P.rep);
      }
      const sw = segWaiting(P);
      for (const g of CONFIG.segments) {
        this.setText(`[data-segwait="${id}:${g.id}"]`, String(Math.round(sw[g.id])));
      }
    }

    if (this.selectedDock) {
      // only rebuild the DOM when the panel's shape changes (so buttons stay
      // clickable); otherwise just patch the live numbers in place.
      if (this.dockKey(this.selectedDock) !== this.detailKey) this.renderDockDetail();
      else this.refreshDockDetail();
    }
    // keep buy affordability fresh (berth / size / cash gating)
    this.buyWrap
      .querySelectorAll<HTMLButtonElement>(".buy-card")
      .forEach((btn, i) => (btn.disabled = buyBlocker(s, CONFIG.vesselClasses[i].id) !== null));
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

  private setText(sel: string, text: string): void {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }
}
