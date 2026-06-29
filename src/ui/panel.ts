import { CONFIG, vesselById } from "../config";
import {
  estDailyPeople,
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
}

export class Panel {
  private routesEl = document.getElementById("routes")!;
  private fleetEl = document.getElementById("fleet")!;
  private buyWrap = document.getElementById("buy-wrap")!;
  private detailEl: HTMLElement;
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

  private renderDockDetail(): void {
    const id = this.selectedDock;
    if (!id) {
      this.detailEl.hidden = true;
      return;
    }
    const R = this.state.routes[id];
    const sw = segWaiting(R);
    const turnout = Math.round(repFactor(R.demandRep) * 100);
    this.detailEl.hidden = false;
    this.detailEl.innerHTML = `
      <div class="dd-head">
        <div class="dot" style="background:${R.def.color}"></div>
        <div class="dd-name">${R.def.name}</div>
        <button class="dd-close">✕</button>
      </div>
      <div class="dd-rep">
        <div class="dd-rep-top"><span>Reputation</span>
          <b style="color:${repColor(R.rep)}">${Math.round(R.rep)} · ${repLabel(R.rep)}</b></div>
        <div class="meter"><i style="width:${R.rep}%;background:${repColor(R.rep)}"></i></div>
      </div>
      <div class="dd-segs">${CONFIG.segments
        .map(
          (g) => `<div class="dd-seg" style="border-color:${g.color}">
            <span>${g.icon} ${g.name}</span><b>${Math.round(sw[g.id])} waiting</b></div>`,
        )
        .join("")}</div>
      <div class="dd-rows">
        <div><span>Turnout today</span><b>${turnout}% of base</b></div>
        <div><span>Gave up yesterday</span><b>${Math.round(R.balkedYesterday).toLocaleString()}</b></div>
      </div>
      <div class="dd-hint">Leave a segment waiting past its patience → reputation falls → fewer come tomorrow.</div>`;
    this.detailEl.querySelector(".dd-close")!.addEventListener("click", () => this.selectDock(null));
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

    if (this.selectedDock) this.renderDockDetail();
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
