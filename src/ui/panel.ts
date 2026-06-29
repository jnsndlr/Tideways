import { CONFIG } from "../config";
import type { GameState } from "../types";

const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString();
const clockStr = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
};

export interface PanelCallbacks {
  onAssign: (boatId: number, routeId: string | null) => void;
  onBuy: () => void;
  onSpeed: (speed: number) => void;
}

// Builds and updates the DOM control panel + HUD. Owns no game logic — it reads
// state and calls back into the controller for mutations.
export class Panel {
  private routesEl = document.getElementById("routes")!;
  private fleetEl = document.getElementById("fleet")!;
  private buyEl = document.getElementById("buy") as HTMLButtonElement;

  constructor(private state: GameState, private cb: PanelCallbacks) {
    this.buildRoutes();
    this.buildFleet();
    this.wireStatic();
  }

  private wireStatic(): void {
    this.buyEl.onclick = () => this.cb.onBuy();
    document.querySelectorAll<HTMLButtonElement>("#speed button").forEach((b) => {
      b.onclick = () => {
        const s = parseInt(b.dataset.speed ?? "1", 10);
        this.cb.onSpeed(s);
        document.querySelectorAll("#speed button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      };
    });
  }

  /** Static route cards (live numbers are updated in updateHud). */
  buildRoutes(): void {
    this.routesEl.innerHTML = "";
    for (const id in this.state.routes) {
      const R = this.state.routes[id];
      const carPax = Math.round(R.def.dailyCars * CONFIG.ferry.avgOccupancy);
      const estDaily = R.def.dailyFoot + carPax;
      const card = document.createElement("div");
      card.className = "route-card";
      card.innerHTML = `
        <div class="route-head">
          <div class="dot" style="background:${R.def.color}"></div>
          <div class="route-name">${R.def.name}</div>
          <div class="route-sub">${R.def.distanceNm} nm · ${R.def.crossingMin} min</div>
        </div>
        <div class="route-stats">
          <div><span>Est. daily</span> <b>${estDaily.toLocaleString()}</b></div>
          <div><span>Waiting</span> <b data-wait="${id}">0</b></div>
          <div><span>Served</span> <b data-served="${id}">0</b></div>
          <div><span>Balked</span> <b data-balk="${id}">0</b></div>
        </div>`;
      this.routesEl.appendChild(card);
    }
  }

  /** Fleet rows with route-assignment segmented controls. */
  buildFleet(): void {
    this.fleetEl.innerHTML = "";
    for (const boat of this.state.boats) {
      const row = document.createElement("div");
      row.className = "boat-row";

      const tag = document.createElement("div");
      tag.className = "boat-tag";
      tag.textContent = "⛴ " + boat.name;

      const seg = document.createElement("div");
      seg.className = "seg";
      for (const id in this.state.routes) {
        const def = this.state.routes[id].def;
        const b = document.createElement("button");
        b.textContent = def.name;
        if (boat.pendingRoute === id) {
          b.classList.add("on");
          b.style.background = def.color;
        }
        b.onclick = () => {
          this.cb.onAssign(boat.id, id);
          this.buildFleet();
        };
        seg.appendChild(b);
      }
      const idle = document.createElement("button");
      idle.textContent = "Idle";
      if (!boat.pendingRoute) {
        idle.classList.add("on");
        idle.style.background = "#7d93a0";
      }
      idle.onclick = () => {
        this.cb.onAssign(boat.id, null);
        this.buildFleet();
      };
      seg.appendChild(idle);

      row.appendChild(tag);
      row.appendChild(seg);
      this.fleetEl.appendChild(row);
    }
    this.buyEl.textContent = "+ Buy ferry — " + fmtMoney(CONFIG.boatCost);
    this.buyEl.disabled = this.state.cash < CONFIG.boatCost;
  }

  /** Per-frame numeric refresh (cheap; no DOM rebuild). */
  updateHud(): void {
    const s = this.state;
    this.setText("[data-cash]", fmtMoney(s.cash));
    this.setText("[data-day]", String(s.day));
    this.setText("[data-clock]", clockStr(s.clock));
    this.setText("[data-rep]", String(Math.round(s.rep)));

    for (const id in s.routes) {
      const R = s.routes[id];
      const occ = CONFIG.ferry.avgOccupancy;
      const waiting = Math.round(
        R.out.foot + R.out.car * occ + R.in.foot + R.in.car * occ,
      );
      this.setText(`[data-wait="${id}"]`, waiting.toLocaleString());
      this.setText(`[data-served="${id}"]`, Math.round(R.servedToday).toLocaleString());
      this.setText(`[data-balk="${id}"]`, Math.round(R.balkedToday).toLocaleString());
    }

    // keep buy button affordability in sync
    this.buyEl.disabled = s.cash < CONFIG.boatCost;
  }

  private setText(sel: string, text: string): void {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }
}
