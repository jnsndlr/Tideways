import { CONFIG, vesselById, vesselRank } from "../config";
import {
  addTrip,
  hasOverlap,
  projectedDailyCost,
  removeTrip,
  tripDuration,
} from "../sim";
import type { Boat, GameState } from "../types";

const START = CONFIG.operatingStart;
const END = CONFIG.operatingEnd;
const SPAN = END - START;
const SNAP = CONFIG.scheduleSnapMin;

const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const hhmm = (m: number) =>
  `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;
const money = (n: number) => "$" + Math.round(n).toLocaleString();

interface Drag {
  kind: "new" | "move";
  routeId: string;
  tripId?: number;
  fromBoat?: Boat;
  ghost: HTMLElement;
  grabDx: number; // pointer offset into the block (px), for move
}

/**
 * Per-boat daily timetable. Drag a route chip onto a boat's lane to add a
 * sailing; drag existing blocks to retime or move them to another boat
 * (interlining). Blocks can't overlap — a boat can only be one place at once.
 */
export class Timeline {
  private root = document.getElementById("timeline")!;
  private drag: Drag | null = null;

  constructor(private state: GameState, private onChange: () => void) {
    this.rebuild();
    // commit/cancel drags at the document level
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
  }

  rebuild(): void {
    this.root.innerHTML = "";

    // --- palette: a draggable chip per route ---
    const pal = document.createElement("div");
    pal.className = "tl-palette";
    const hint = document.createElement("span");
    hint.className = "tl-hint";
    hint.textContent = "Drag a route onto a ferry's lane →";
    pal.appendChild(hint);
    for (const id in this.state.routes) {
      const R = this.state.routes[id];
      const a = this.state.ports[R.def.from];
      const b = this.state.ports[R.def.to];
      if (!a.slips.length || !b.slips.length) continue; // both ends must be docked
      const chip = document.createElement("button");
      chip.className = "tl-chip";
      chip.style.background = R.def.color;
      chip.textContent = R.def.name;
      chip.addEventListener("pointerdown", (e) =>
        this.startDrag(e, { kind: "new", routeId: R.def.id }),
      );
      pal.appendChild(chip);
    }
    this.root.appendChild(pal);

    // --- time axis ---
    const axis = document.createElement("div");
    axis.className = "tl-axis";
    for (let h = 6; h <= 22; h += 2) {
      const tick = document.createElement("span");
      tick.style.left = ((h * 60 - START) / SPAN) * 100 + "%";
      tick.textContent = h + "";
      axis.appendChild(tick);
    }
    this.root.appendChild(axis);

    // --- one lane per boat ---
    for (const boat of this.state.boats) {
      const row = document.createElement("div");
      row.className = "tl-row";

      const label = document.createElement("div");
      label.className = "tl-label";
      const vc = vesselById(boat.classId);
      label.innerHTML = `<b>${boat.name}</b><span>${vc.short}</span>`;
      row.appendChild(label);

      const lane = document.createElement("div");
      lane.className = "tl-lane";
      lane.dataset.boat = String(boat.id);

      for (const trip of boat.itinerary) {
        const dur = tripDuration(this.state.routes[trip.routeId], boat.classId);
        const def = this.state.routes[trip.routeId].def;
        const block = document.createElement("div");
        block.className = "tl-block";
        block.style.left = ((trip.depart - START) / SPAN) * 100 + "%";
        block.style.width = (dur / SPAN) * 100 + "%";
        block.style.background = def.color;
        block.innerHTML =
          `<span class="tl-bt">${def.name} · ${hhmm(trip.depart)}</span>` +
          `<button class="tl-del">✕</button>`;
        block.addEventListener("pointerdown", (e) => {
          if ((e.target as HTMLElement).classList.contains("tl-del")) return;
          this.startDrag(e, {
            kind: "move",
            routeId: trip.routeId,
            tripId: trip.id,
            fromBoat: boat,
          });
        });
        block.querySelector(".tl-del")!.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          removeTrip(boat, trip.id);
          this.rebuild();
          this.onChange();
        });
        lane.appendChild(block);
      }
      row.appendChild(lane);

      // live projected cost of this boat's itinerary AS SCHEDULED — updates
      // instantly on every add/move/remove since rebuild() re-derives it.
      const { fuel, crew } = projectedDailyCost(boat, this.state.routes);
      const n = boat.itinerary.length;
      const cost = document.createElement("div");
      cost.className = "tl-cost";
      cost.innerHTML =
        `<span>${n} trip${n === 1 ? "" : "s"} today</span>` +
        `<b>${money(fuel)} fuel</b>` +
        `<b>${money(crew)} crew</b>` +
        `<b class="tl-cost-total">${money(fuel + crew)} today</b>`;

      const wrap = document.createElement("div");
      wrap.className = "tl-boat";
      wrap.append(row, cost);
      this.root.appendChild(wrap);
    }
  }

  // ---- drag machinery ------------------------------------------------------

  private startDrag(e: PointerEvent, base: Omit<Drag, "ghost" | "grabDx">): void {
    e.preventDefault();
    const def = this.state.routes[base.routeId].def;
    const ghost = document.createElement("div");
    ghost.className = "tl-ghost";
    ghost.style.background = def.color;
    ghost.textContent = def.name;
    document.body.appendChild(ghost);
    let grabDx = 0;
    if (base.kind === "move") {
      const block = (e.currentTarget as HTMLElement);
      grabDx = e.clientX - block.getBoundingClientRect().left;
    }
    this.drag = { ...base, ghost, grabDx };
    this.moveGhost(e);
  }

  private moveGhost(e: PointerEvent): void {
    if (!this.drag) return;
    this.drag.ghost.style.left = e.clientX - this.drag.grabDx + "px";
    this.drag.ghost.style.top = e.clientY - 14 + "px";
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.drag) this.moveGhost(e);
  }

  private laneAt(clientX: number, clientY: number): { boat: Boat; rect: DOMRect } | null {
    const lanes = this.root.querySelectorAll<HTMLElement>(".tl-lane");
    for (const lane of lanes) {
      const rect = lane.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const boat = this.state.boats.find((b) => String(b.id) === lane.dataset.boat);
        if (boat) return { boat, rect };
      }
    }
    return null;
  }

  /** Nearest free departure to `desired` for a route on a boat, or null. */
  private findFree(
    boat: Boat, routeId: string, desired: number, ignoreId?: number,
  ): number | null {
    const dur = tripDuration(this.state.routes[routeId], boat.classId);
    const max = END - dur;
    const d = Math.max(START, Math.min(max, snap(desired)));
    if (!hasOverlap(boat, d, dur, this.state.routes, ignoreId)) return d;
    for (let step = SNAP; step <= SPAN; step += SNAP) {
      for (const cand of [d + step, d - step]) {
        if (cand < START || cand > max) continue;
        if (!hasOverlap(boat, cand, dur, this.state.routes, ignoreId)) return cand;
      }
    }
    return null;
  }

  private onPointerUp(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    drag.ghost.remove();
    this.drag = null;

    const hit = this.laneAt(e.clientX, e.clientY - 0);
    // a boat can only run a leg if BOTH ends have a slip big enough to berth it
    const rdef = this.state.routes[drag.routeId].def;
    const fromSlips = this.state.ports[rdef.from].slips;
    const toSlips = this.state.ports[rdef.to].slips;
    const fitsDock =
      hit !== null &&
      fromSlips.length > 0 &&
      toSlips.length > 0 &&
      vesselRank(hit.boat.classId) <= Math.min(Math.max(...fromSlips), Math.max(...toSlips));
    if (hit && fitsDock) {
      const dur = tripDuration(this.state.routes[drag.routeId], hit.boat.classId);
      const desired = START + ((e.clientX - drag.grabDx - hit.rect.left) / hit.rect.width) * SPAN;
      const slot = this.findFree(
        hit.boat, drag.routeId, desired,
        drag.kind === "move" && drag.fromBoat === hit.boat ? drag.tripId : undefined,
      );
      if (slot !== null && dur <= SPAN) {
        if (drag.kind === "move" && drag.fromBoat && drag.tripId !== undefined) {
          removeTrip(drag.fromBoat, drag.tripId);
        }
        addTrip(this.state, hit.boat, drag.routeId, slot);
        this.onChange();
      }
    }
    this.rebuild();
  }
}
