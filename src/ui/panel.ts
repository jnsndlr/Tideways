import { CONFIG, maxDockTier, vesselById } from "../config";
import {
  estDailyPeople,
  nextDockCost,
  repFactor,
  segWaiting,
  waitingPeople,
} from "../sim";
import { repColor } from "../render/canvas";
import type { GameState, RouteState } from "../types";

const money = (n: number) => "$" + Math.round(n).toLocaleString();
const clockStr = (m: number) =>
  String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(Math.floor(m % 60)).padStart(2, "0");
const repLabel = (r: number) =>
  r < 40 ? "Poor" : r < 65 ? "Fair" : r < 80 ? "Good" : "Excellent";

export interface PanelCallbacks {
  onSetPrice: (routeId: string, kind: "foot" | "car", price: number) => void;
  onBuy: (classId: string) => void;
  onSpeed: (speed: number) => void;
  onBuildDock: (routeId: string) => void;
  onUpgradeDock: (routeId: string) => void;
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

  private wireSpeed(): void {
    document.querySelectorAll<HTMLButtonElement>("#speed button").forEach((b) => {
      b.onclick = () => {
        this.cb.onSpeed(parseInt(b.dataset.speed ?? "1", 10));
        document.querySelectorAll("#speed button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      };
    });
  }

  // ---- routes --------------------------------------------------------------

  buildRoutes(): void {
    this.routesEl.innerHTML = "";
    for (const id in this.state.routes) {
      const R = this.state.routes[id];
      if (!R.hasDock) continue; // locked islands aren't in the route list yet
      const card = document.createElement("div");
      card.className = "route-card";
      card.innerHTML = `
        <div class="route-head">
          <div class="dot" style="background:${R.def.color}"></div>
          <div class="route-name">${R.def.name}</div>
          <div class="route-sub">${R.def.distanceNm} nm · ${R.def.crossingMin} min</div>
        </div>
        <div class="route-stats">
          <div><span>Est. daily</span> <b>${Math.round(estDailyPeople(R)).toLocaleString()}</b></div>
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
    const full = this.state.boats.length >= CONFIG.maxFleet;
    const head = document.createElement("div");
    head.className = "buy-head";
    head.textContent = full
      ? `Fleet full (${CONFIG.maxFleet}/${CONFIG.maxFleet})`
      : `Buy a ferry  (${this.state.boats.length}/${CONFIG.maxFleet})`;
    this.buyWrap.appendChild(head);
    if (full) return;

    const grid = document.createElement("div");
    grid.className = "buy-grid";
    for (const vc of CONFIG.vesselClasses) {
      const btn = document.createElement("button");
      btn.className = "buy-card";
      btn.disabled = this.state.cash < vc.cost;
      btn.innerHTML = `
        <b>${vc.short}</b>
        <span>${vc.peopleCap}p ${vc.carCap ? vc.carCap + "🚗" : "no cars"}</span>
        <span>${vc.speedFactor}× speed</span>
        <em>${money(vc.cost)}</em>`;
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
    this.selectedDock = id && id !== "hub" ? id : null;
    this.renderDockDetail();
  }

  private dockKey(id: string): string {
    const R = this.state.routes[id];
    return `${id}|${R.hasDock}|${R.dockTier}`;
  }

  /** Rebuild the detail structure. Called only when the panel changes shape
   *  (selection / build / upgrade) — NOT every frame, so the buttons survive
   *  long enough to be clicked. Live numbers are patched by refreshDockDetail. */
  private renderDockDetail(): void {
    const id = this.selectedDock;
    if (!id) {
      this.detailEl.hidden = true;
      this.detailKey = null;
      return;
    }
    const R = this.state.routes[id];
    this.detailEl.hidden = false;
    this.detailEl.innerHTML = R.hasDock ? this.openDockHtml(R) : this.lockedDockHtml(R);
    this.detailEl.querySelector(".dd-close")!.addEventListener("click", () => this.selectDock(null));
    this.detailEl
      .querySelector(".dd-build")
      ?.addEventListener("click", () => this.cb.onBuildDock(id));
    this.detailEl
      .querySelector(".dd-upgrade")
      ?.addEventListener("click", () => this.cb.onUpgradeDock(id));
    this.detailKey = this.dockKey(id);
  }

  /** Per-frame: patch the live values in place without touching the buttons. */
  private refreshDockDetail(): void {
    const id = this.selectedDock;
    if (!id) return;
    const R = this.state.routes[id];

    if (!R.hasDock) {
      const cost = nextDockCost(R) ?? 0;
      const b = this.detailEl.querySelector<HTMLButtonElement>(".dd-build");
      if (b) b.disabled = this.state.cash < cost;
      return;
    }

    const sw = segWaiting(R);
    for (const g of CONFIG.segments) {
      const sr = R.segRep[g.id];
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
      head.textContent = `${Math.round(R.rep)} · ${repLabel(R.rep)}`;
      head.style.color = repColor(R.rep);
    }
    this.setIn("[data-dd-turnout]", Math.round(repFactor(R.demandRep) * 100) + "% of base");
    this.setIn("[data-dd-balked]", Math.round(R.balkedYesterday).toLocaleString());
    const up = this.detailEl.querySelector<HTMLButtonElement>(".dd-upgrade");
    const cost = nextDockCost(R);
    if (up && cost !== null) up.disabled = this.state.cash < cost;
  }

  private setIn(sel: string, text: string): void {
    const el = this.detailEl.querySelector(sel);
    if (el) el.textContent = text;
  }

  private dockHead(R: RouteState): string {
    return `
      <div class="dd-head">
        <div class="dot" style="background:${R.def.color}"></div>
        <div class="dd-name">${R.def.name}</div>
        <button class="dd-close">✕</button>
      </div>`;
  }

  private lockedDockHtml(R: RouteState): string {
    const cost = nextDockCost(R) ?? 0;
    const afford = this.state.cash >= cost;
    const est = Math.round(estDailyPeople(R)).toLocaleString();
    return `${this.dockHead(R)}
      <div class="dd-locked">🔒 No dock here yet</div>
      <div class="dd-rows">
        <div><span>Crossing</span><b>${R.def.distanceNm} nm · ${R.def.crossingMin} min</b></div>
        <div><span>Potential daily</span><b>${est}</b></div>
      </div>
      <button class="dd-build" ${afford ? "" : "disabled"}>
        Build dock — ${money(cost)} <em>(${CONFIG.vesselClasses[0].short}-class)</em>
      </button>
      <div class="dd-hint">A new dock opens at ${CONFIG.vesselClasses[0].short} capacity. Upgrade it later for bigger vessels.</div>`;
  }

  private openDockHtml(R: RouteState): string {
    const sw = segWaiting(R);
    const turnout = Math.round(repFactor(R.demandRep) * 100);
    const tierName = CONFIG.vesselClasses[R.dockTier].short;
    const upCost = nextDockCost(R);
    const upName = upCost !== null ? CONFIG.vesselClasses[R.dockTier + 1].short : null;
    const afford = upCost !== null && this.state.cash >= upCost;
    const upgrade =
      upCost === null
        ? `<div class="dd-tier-max">Top tier — berths every vessel</div>`
        : `<button class="dd-upgrade" ${afford ? "" : "disabled"}>
             Upgrade to ${upName} — ${money(upCost)}</button>`;

    const segs = CONFIG.segments
      .map((g) => {
        const sr = R.segRep[g.id];
        return `<div class="dd-seg" style="border-color:${g.color}">
          <span>${g.icon} ${g.name}</span>
          <span class="dd-seg-meter"><i data-segrepbar="${g.id}" style="width:${sr}%;background:${repColor(sr)}"></i></span>
          <b data-segrep="${g.id}">${Math.round(sr)}</b>
          <em data-segwait="${g.id}">${Math.round(sw[g.id])} waiting</em></div>`;
      })
      .join("");

    return `${this.dockHead(R)}
      <div class="dd-rep">
        <div class="dd-rep-top"><span>Reputation by segment</span>
          <b data-dd-rep style="color:${repColor(R.rep)}">${Math.round(R.rep)} · ${repLabel(R.rep)}</b></div>
      </div>
      <div class="dd-segs">${segs}</div>
      <div class="dd-rows">
        <div><span>Turnout today</span><b data-dd-turnout>${turnout}% of base</b></div>
        <div><span>Gave up yesterday</span><b data-dd-balked>${Math.round(R.balkedYesterday).toLocaleString()}</b></div>
      </div>
      <div class="dd-tier">
        <div class="dd-tier-now"><span>Dock</span><b>${tierName}-class</b></div>
        ${upgrade}
      </div>
      <div class="dd-hint">Each segment now keeps its own reputation — strand commuters and only commuters thin out.</div>`;
  }

  // ---- per-frame -----------------------------------------------------------

  updateHud(): void {
    const s = this.state;
    this.setText("[data-cash]", money(s.cash));
    this.setText("[data-day]", String(s.day));
    this.setText("[data-clock]", clockStr(s.clock));
    this.setText("[data-rep]", String(Math.round(s.rep)));

    for (const id in s.routes) {
      const R = s.routes[id];
      this.setText(`[data-wait="${id}"]`, Math.round(waitingPeople(R)).toLocaleString());
      const rep = Math.round(R.rep);
      this.setText(`[data-routerep="${id}"]`, String(rep));
      const bar = document.querySelector<HTMLElement>(`[data-routerepbar="${id}"]`);
      if (bar) {
        bar.style.width = R.rep + "%";
        bar.style.background = repColor(R.rep);
      }
      const sw = segWaiting(R);
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
    // keep buy affordability fresh
    this.buyWrap
      .querySelectorAll<HTMLButtonElement>(".buy-card")
      .forEach((btn, i) => (btn.disabled = s.cash < CONFIG.vesselClasses[i].cost));
  }

  private setText(sel: string, text: string): void {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }
}
