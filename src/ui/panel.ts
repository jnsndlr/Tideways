import { CONFIG, vesselById } from "../config";
import {
  addSlipCost,
  buyBlocker,
  estDailyPeople,
  repFactor,
  segWaiting,
  slipUpgradeCost,
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
  onAddSlip: (portId: string) => void;
  onUpgradeSlip: (portId: string, slipIdx: number) => void;
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
      if (!R.slips.length) continue; // locked islands aren't in the route list yet
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
    const used = this.state.boats.length;
    const cap = this.state.hubSlips.length;
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
    this.selectedDock = id ?? null; // "hub" opens the home-port panel
    this.renderDockDetail();
  }

  private dockKey(id: string): string {
    if (id === "hub") return `hub|${this.state.hubSlips.join(",")}|${this.state.boats.length}`;
    return `${id}|${this.state.routes[id].slips.join(",")}`;
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
    if (id === "hub") {
      this.detailEl.innerHTML = this.homePortHtml();
    } else {
      const R = this.state.routes[id];
      this.detailEl.innerHTML = R.slips.length ? this.openDockHtml(R) : this.lockedDockHtml(R);
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

    if (id === "hub") {
      this.setIn("[data-hub-fleet]", `${this.state.boats.length} / ${this.state.hubSlips.length}`);
      this.setIn("[data-hub-upkeep]", money(this.fleetUpkeep()) + "/day");
      return;
    }
    const R = this.state.routes[id];
    if (!R.slips.length) return; // locked: only the build button needed refreshing

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
  }

  private setIn(sel: string, text: string): void {
    const el = this.detailEl.querySelector(sel);
    if (el) el.textContent = text;
  }

  private fleetUpkeep(): number {
    return this.state.boats.reduce((a, b) => a + vesselById(b.classId).dailyCost, 0);
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
    return `${this.dockHead(CONFIG.hub.name + " · Home Port", "#57b6e0")}
      <div class="dd-rows">
        <div><span>Fleet berths</span><b data-hub-fleet>${this.state.boats.length} / ${this.state.hubSlips.length}</b></div>
        <div><span>Daily upkeep</span><b data-hub-upkeep>${money(this.fleetUpkeep())}/day</b></div>
      </div>
      ${this.slipsHtml(this.state.hubSlips)}
      <div class="dd-hint">Berths cap your fleet size; a slip's size sets the largest vessel you can base. Add a berth to own more ferries; upgrade a slip to run bigger ones.</div>`;
  }

  private lockedDockHtml(R: RouteState): string {
    const cost = CONFIG.ports.buildSlipCost;
    const est = Math.round(estDailyPeople(R)).toLocaleString();
    return `${this.dockHead(R.def.name, R.def.color)}
      <div class="dd-locked">🔒 No dock here yet</div>
      <div class="dd-rows">
        <div><span>Crossing</span><b>${R.def.distanceNm} nm · ${R.def.crossingMin} min</b></div>
        <div><span>Potential daily</span><b>${est}</b></div>
      </div>
      <button class="dd-build" data-cost="${cost}">
        Build dock — ${money(cost)} <em>(${CONFIG.vesselClasses[0].short}-class slip)</em>
      </button>
      <div class="dd-hint">A new dock opens with one ${CONFIG.vesselClasses[0].short} slip. Upgrade it or add berths later.</div>`;
  }

  private openDockHtml(R: RouteState): string {
    const sw = segWaiting(R);
    const turnout = Math.round(repFactor(R.demandRep) * 100);

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

    return `${this.dockHead(R.def.name, R.def.color)}
      <div class="dd-rep">
        <div class="dd-rep-top"><span>Reputation by segment</span>
          <b data-dd-rep style="color:${repColor(R.rep)}">${Math.round(R.rep)} · ${repLabel(R.rep)}</b></div>
      </div>
      <div class="dd-segs">${segs}</div>
      <div class="dd-rows">
        <div><span>Turnout today</span><b data-dd-turnout>${turnout}% of base</b></div>
        <div><span>Gave up yesterday</span><b data-dd-balked>${Math.round(R.balkedYesterday).toLocaleString()}</b></div>
      </div>
      <div class="dd-slips-title">Slips</div>
      ${this.slipsHtml(R.slips)}
      <div class="dd-hint">Each segment keeps its own reputation. A slip's size limits which vessels can dock here.</div>`;
  }

  // ---- per-frame -----------------------------------------------------------

  updateHud(): void {
    const s = this.state;
    this.setText("[data-cash]", money(s.cash));
    this.setText("[data-day]", String(s.day));
    this.setText("[data-clock]", clockStr(s.clock));
    this.setText("[data-rep]", String(Math.round(s.rep)));
    this.setText("[data-value]", money(s.companyValue));

    // cash warning: turn red and count down to insolvency while in the red
    const cashEl = document.querySelector<HTMLElement>("[data-cash]");
    if (cashEl) cashEl.style.color = s.cash < 0 ? "var(--bad)" : "";
    if (s.gameOver) {
      this.showGameOver();
      return;
    }

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
        <button class="go-btn" onclick="location.reload()">New game</button>
      </div>`;
    document.getElementById("app")!.appendChild(el);
  }

  private setText(sel: string, text: string): void {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }
}
