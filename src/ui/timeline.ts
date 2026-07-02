import { CONFIG, vesselById, vesselRank } from "../config";
import {
  activeSheet,
  addRoundTrip,
  addSheet,
  createPlan,
  ensurePlanRoutes,
  hasOverlap,
  legDuration,
  moveLeg,
  planMinHeadway,
  projectedDailyCost,
  removeLeg,
  removePlan,
  removeSheet,
  segCurve,
  sheetById,
  stampPlan,
  transferLeg,
  unpackPlan,
  updatePlan,
} from "../sim";
import type { Boat, GameState, Leg, Plan, Sheet } from "../types";

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
  legId?: number;
  fromBoat?: Boat;
  ghost: HTMLElement;
  grabDx: number; // pointer offset into the block (px), for move
}

interface PlanDraft {
  planId: number | null; // null = composing a new plan
  name: string;
  stops: string[];
  headwayMin: number;
  winStart: number;
  winEnd: number;
  boatIds: number[];
}

/**
 * The Schedule tab. A sheet bar picks which named timetable is being edited
 * (the sim runs whichever sheet matches today). Lanes show one block per LEG;
 * legs stamped by a service plan collapse into a single plan band. The plan
 * composer (bottom sheet) creates/edits live plans.
 */
export class Timeline {
  private root = document.getElementById("timeline")!;
  private drag: Drag | null = null;
  private selectedSheetId: number;
  private draft: PlanDraft | null = null;
  private newSheetOpen = false;

  constructor(private state: GameState, private onChange: () => void) {
    this.selectedSheetId = state.sheets[0].id;
    this.rebuild();
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
  }

  private get sheet(): Sheet {
    return sheetById(this.state, this.selectedSheetId) ?? this.state.sheets[0];
  }

  private legsOf(boat: Boat): Leg[] {
    return this.sheet.legs[boat.id] ?? [];
  }

  /** Open the plan composer (optionally prefilled / editing an existing plan). */
  openComposer(prefill?: { stops?: string[]; plan?: Plan }): void {
    const p = prefill?.plan;
    this.draft = p
      ? {
          planId: p.id,
          name: p.name,
          stops: [...p.stops],
          headwayMin: p.headwayMin,
          winStart: p.winStart,
          winEnd: p.winEnd,
          boatIds: [...p.boatIds],
        }
      : {
          planId: null,
          name: "",
          stops: prefill?.stops ? [...prefill.stops] : [],
          headwayMin: 60,
          winStart: START,
          winEnd: 21 * 60,
          boatIds: [],
        };
    this.rebuild();
  }

  rebuild(): void {
    this.root.innerHTML = "";
    this.buildSheetBar();
    this.buildPalette();
    this.buildAxis();
    for (const boat of this.state.boats) this.buildLane(boat);
    if (this.draft) this.buildComposer();
  }

  // ---- sheet bar -------------------------------------------------------------

  private sheetBadge(s: Sheet): string {
    const day = s.dayType === "any" ? "" : s.dayType === "weekday" ? "Mon–Fri" : "Sat–Sun";
    const season =
      s.season === "any" ? "" : CONFIG.calendar.seasons.find((x) => x.id === s.season)?.name ?? "";
    const parts = [day, season].filter(Boolean);
    return parts.length ? parts.join(" · ") : "every day";
  }

  private buildSheetBar(): void {
    const bar = document.createElement("div");
    bar.className = "tl-sheets";
    const activeId = activeSheet(this.state, this.state.day).id;
    for (const s of this.state.sheets) {
      const chip = document.createElement("button");
      chip.className = "tl-sheet" + (s.id === this.selectedSheetId ? " sel" : "");
      chip.innerHTML =
        `<b>${s.name}</b><span>${this.sheetBadge(s)}</span>` +
        (s.id === activeId ? `<i class="tl-sheet-live">runs today</i>` : "");
      chip.addEventListener("click", () => {
        this.selectedSheetId = s.id;
        this.draft = null;
        this.rebuild();
      });
      bar.appendChild(chip);
    }
    const add = document.createElement("button");
    add.className = "tl-sheet tl-sheet-add";
    add.textContent = "＋ alt schedule";
    add.addEventListener("click", () => {
      this.newSheetOpen = !this.newSheetOpen;
      this.rebuild();
    });
    bar.appendChild(add);
    this.root.appendChild(bar);

    if (this.newSheetOpen) this.buildNewSheetForm();
  }

  private buildNewSheetForm(): void {
    const form = document.createElement("div");
    form.className = "tl-newsheet";
    const seasonOpts = CONFIG.calendar.seasons
      .map((s) => `<option value="${s.id}">${s.icon} ${s.name}</option>`)
      .join("");
    form.innerHTML = `
      <input class="ns-name" type="text" placeholder="Name it — e.g. Winter weekends" maxlength="24">
      <select class="ns-day">
        <option value="any">Every day</option>
        <option value="weekday">Weekdays</option>
        <option value="weekend">Weekends</option>
      </select>
      <select class="ns-season"><option value="any">All seasons</option>${seasonOpts}</select>
      <button class="ns-create">Create</button>`;
    form.querySelector<HTMLButtonElement>(".ns-create")!.addEventListener("click", () => {
      const name = form.querySelector<HTMLInputElement>(".ns-name")!.value;
      const day = form.querySelector<HTMLSelectElement>(".ns-day")!.value as Sheet["dayType"];
      const season = form.querySelector<HTMLSelectElement>(".ns-season")!.value;
      const sheet = addSheet(this.state, name, day, season);
      this.selectedSheetId = sheet.id;
      this.newSheetOpen = false;
      this.rebuild();
      this.onChange();
    });
    this.root.appendChild(form);

    if (this.selectedSheetId !== this.state.sheets[0].id) {
      const del = document.createElement("button");
      del.className = "ns-delete";
      del.textContent = `Delete “${this.sheet.name}”`;
      del.addEventListener("click", () => {
        if (!confirm(`Delete the ${this.sheet.name} schedule and its timetable?`)) return;
        removeSheet(this.state, this.selectedSheetId);
        this.selectedSheetId = this.state.sheets[0].id;
        this.newSheetOpen = false;
        this.rebuild();
        this.onChange();
      });
      form.appendChild(del);
    }
  }

  // ---- palette -----------------------------------------------------------------

  private buildPalette(): void {
    const pal = document.createElement("div");
    pal.className = "tl-palette";
    const planBtn = document.createElement("button");
    planBtn.className = "tl-plan-btn";
    planBtn.textContent = "＋ Service plan";
    planBtn.addEventListener("click", () => this.openComposer());
    pal.appendChild(planBtn);
    const hint = document.createElement("span");
    hint.className = "tl-hint";
    hint.textContent = "or drag a route onto a lane →";
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
  }

  private buildAxis(): void {
    const axis = document.createElement("div");
    axis.className = "tl-axis";
    for (let h = 6; h <= 22; h += 2) {
      const tick = document.createElement("span");
      tick.style.left = ((h * 60 - START) / SPAN) * 100 + "%";
      tick.textContent = h + "";
      axis.appendChild(tick);
    }
    this.root.appendChild(axis);
  }

  // ---- lanes ---------------------------------------------------------------------

  private buildLane(boat: Boat): void {
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

    const legs = this.legsOf(boat);
    const byPlan = new Map<number, Leg[]>();
    for (const l of legs) {
      if (l.planId === undefined) continue;
      (byPlan.get(l.planId) ?? byPlan.set(l.planId, []).get(l.planId)!).push(l);
    }

    // plan bands first (blocks render above them)
    for (const [planId, planLegs] of byPlan) {
      const plan = this.sheet.plans.find((p) => p.id === planId);
      const first = planLegs[0];
      const last = planLegs[planLegs.length - 1];
      const lastR = this.state.routes[last.routeId];
      const end = last.depart + (lastR ? legDuration(lastR, boat.classId) : 30);
      const band = document.createElement("div");
      band.className = "tl-band";
      band.style.left = ((first.depart - START) / SPAN) * 100 + "%";
      band.style.width = ((end - first.depart) / SPAN) * 100 + "%";
      band.innerHTML = `<span>⟳ ${plan?.name ?? "Plan"} · ${planLegs.length} legs</span>`;
      if (plan) {
        band.addEventListener("click", () => this.openComposer({ plan }));
      }
      lane.appendChild(band);
    }

    // individual (manual) legs as draggable blocks
    for (const leg of legs) {
      if (leg.planId !== undefined) continue;
      const R = this.state.routes[leg.routeId];
      if (!R) continue;
      const dur = legDuration(R, boat.classId);
      const destId = R.def.from === leg.from ? R.def.to : R.def.from;
      const dest = this.state.ports[destId];
      const block = document.createElement("div");
      block.className = "tl-block";
      block.style.left = ((leg.depart - START) / SPAN) * 100 + "%";
      block.style.width = (dur / SPAN) * 100 + "%";
      block.style.background = R.def.color;
      block.innerHTML =
        `<span class="tl-bt">→ ${dest.def.name} · ${hhmm(leg.depart)}</span>` +
        `<button class="tl-del">✕</button>`;
      block.addEventListener("pointerdown", (e) => {
        if ((e.target as HTMLElement).classList.contains("tl-del")) return;
        this.startDrag(e, { kind: "move", routeId: leg.routeId, legId: leg.id, fromBoat: boat });
      });
      block.querySelector(".tl-del")!.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        removeLeg(this.sheet, boat.id, leg.id);
        this.rebuild();
        this.onChange();
      });
      lane.appendChild(block);
    }
    row.appendChild(lane);

    // live projected cost of this lane AS SCHEDULED on the selected sheet
    const { fuel, crew } = projectedDailyCost(legs, boat.classId, this.state.routes);
    const cost = document.createElement("div");
    cost.className = "tl-cost";
    cost.innerHTML =
      `<span>${legs.length} leg${legs.length === 1 ? "" : "s"}</span>` +
      `<b>${money(fuel)} fuel</b>` +
      `<b>${money(crew)} crew</b>` +
      `<b class="tl-cost-total">${money(fuel + crew)} / day</b>`;

    const wrap = document.createElement("div");
    wrap.className = "tl-boat";
    wrap.append(row, cost);
    this.root.appendChild(wrap);
  }

  // ---- plan composer ---------------------------------------------------------

  private draftPlan(): Plan {
    const d = this.draft!;
    return {
      id: d.planId ?? -1,
      name: d.name || "Service plan",
      stops: d.stops,
      headwayMin: d.headwayMin,
      winStart: d.winStart,
      winEnd: d.winEnd,
      boatIds: d.boatIds,
    };
  }

  private buildComposer(): void {
    const d = this.draft!;
    const box = document.createElement("div");
    box.className = "tl-composer";

    const stopChips = d.stops
      .map(
        (pid, i) =>
          `<button class="pc-stop" data-i="${i}" style="border-color:${this.state.ports[pid].def.color}">
            ${i + 1}. ${this.state.ports[pid].def.name} ✕</button>`,
      )
      .join("");
    const addable = Object.values(this.state.ports)
      .filter((P) => P.slips.length > 0 && d.stops[d.stops.length - 1] !== P.def.id)
      .map(
        (P) =>
          `<button class="pc-add" data-port="${P.def.id}">
            <span class="dot" style="background:${P.def.color}"></span>${P.def.name}</button>`,
      )
      .join("");

    const boatChips = this.state.boats
      .map((b) => {
        const on = d.boatIds.includes(b.id);
        const yard = b.phase === "maint" || b.phase === "repair";
        return `<button class="pc-boat${on ? " on" : ""}" data-boat="${b.id}">
          ${on ? "✓ " : ""}${b.name} · ${vesselById(b.classId).short}${yard ? " 🔧" : ""}</button>`;
      })
      .join("");

    const timeOpts = (sel: number): string => {
      let out = "";
      for (let m = START; m <= 21 * 60 + 30; m += 30)
        out += `<option value="${m}"${m === sel ? " selected" : ""}>${hhmm(m)}</option>`;
      return out;
    };

    // The headway can't beat the slowest boat's round-the-loop time divided by
    // the boat count — raise it to that floor live so the preview, the strip,
    // and what actually gets stamped all agree (no silent bump on commit).
    const floor =
      d.stops.length >= 2 && d.boatIds.length ? planMinHeadway(this.state, this.draftPlan()) : Infinity;
    if (floor !== Infinity && d.headwayMin < floor) d.headwayMin = floor;
    const clampNote =
      floor !== Infinity && d.headwayMin <= floor
        ? `<em class="pc-warn">fleet minimum — add a boat for tighter service</em>`
        : "";

    // dry-run projection (stops are connected as they're added, so routes exist)
    const plan = this.draftPlan();
    let summary = "Pick at least 2 stops and a boat";
    if (d.stops.length >= 2 && d.boatIds.length) {
      const res = stampPlan(this.state, this.sheet, plan, true);
      summary =
        res.stamped === 0
          ? `⚠ No departures fit — the boat${d.boatIds.length > 1 ? "s are" : " is"} busy on other trips this day`
          : `${res.stamped} departures · ${res.legs} legs/day · ` +
            `${money(res.fuel + res.crew)} /day fuel+crew` +
            (res.skipped ? ` · ${res.skipped} skipped (boat busy)` : "");
    }

    box.innerHTML = `
      <div class="pc-head">
        <b>${d.planId === null ? "New service plan" : "Edit service plan"}</b>
        <button class="pc-close">✕</button>
      </div>
      <input class="pc-name" type="text" placeholder="Name — e.g. Lopez shuttle" maxlength="28" value="${d.name}">
      <div class="pc-sub">Stops, in order ${d.stops.length > 2 ? "(loop — returns to start)" : "(out and back)"}</div>
      <div class="pc-stops">${stopChips || `<span class="pc-hint">tap ports below to add</span>`}</div>
      <div class="pc-addlist">${addable}</div>
      <div class="pc-grid">
        <label>First<select class="pc-start">${timeOpts(d.winStart)}</select></label>
        <label>Last<select class="pc-end">${timeOpts(d.winEnd)}</select></label>
        <div class="pc-headway">
          <span>Every</span>
          <button class="pc-hw-dn">−</button><b>${d.headwayMin} min</b><button class="pc-hw-up">+</button>
          ${clampNote}
        </div>
      </div>
      <div class="pc-sub">Boats</div>
      <div class="pc-boats">${boatChips}</div>
      <canvas class="pc-strip" height="36"></canvas>
      <div class="pc-summary">${summary}</div>
      <div class="pc-actions">
        <button class="pc-stamp">${d.planId === null ? "Stamp plan" : "Save & re-stamp"}</button>
        ${d.planId !== null ? `<button class="pc-unpack">Unpack to trips</button><button class="pc-remove">Remove</button>` : ""}
      </div>`;

    box.querySelector(".pc-close")!.addEventListener("click", () => {
      this.draft = null;
      this.rebuild();
    });
    box.querySelector<HTMLInputElement>(".pc-name")!.addEventListener("change", (e) => {
      d.name = (e.target as HTMLInputElement).value;
    });
    box.querySelectorAll<HTMLButtonElement>(".pc-stop").forEach((b) =>
      b.addEventListener("click", () => {
        d.stops.splice(parseInt(b.dataset.i!, 10), 1);
        this.rebuild();
      }),
    );
    box.querySelectorAll<HTMLButtonElement>(".pc-add").forEach((b) =>
      b.addEventListener("click", () => {
        d.stops.push(b.dataset.port!);
        // connect the dots as they're picked (free) — the map draws the loop
        // live and the projection below sees real crossings
        if (d.stops.length >= 2) ensurePlanRoutes(this.state, d.stops);
        this.rebuild();
      }),
    );
    box.querySelectorAll<HTMLButtonElement>(".pc-boat").forEach((b) =>
      b.addEventListener("click", () => {
        const id = parseInt(b.dataset.boat!, 10);
        d.boatIds = d.boatIds.includes(id)
          ? d.boatIds.filter((x) => x !== id)
          : [...d.boatIds, id];
        this.rebuild();
      }),
    );
    box.querySelector<HTMLSelectElement>(".pc-start")!.addEventListener("change", (e) => {
      d.winStart = parseInt((e.target as HTMLSelectElement).value, 10);
      this.rebuild();
    });
    box.querySelector<HTMLSelectElement>(".pc-end")!.addEventListener("change", (e) => {
      d.winEnd = parseInt((e.target as HTMLSelectElement).value, 10);
      this.rebuild();
    });
    box.querySelector(".pc-hw-dn")!.addEventListener("click", () => {
      d.headwayMin = Math.max(floor === Infinity ? 15 : floor, d.headwayMin - 15);
      this.rebuild();
    });
    box.querySelector(".pc-hw-up")!.addEventListener("click", () => {
      d.headwayMin = Math.min(240, d.headwayMin + 15);
      this.rebuild();
    });
    box.querySelector(".pc-stamp")!.addEventListener("click", () => this.commitDraft());
    box.querySelector(".pc-unpack")?.addEventListener("click", () => {
      unpackPlan(this.sheet, d.planId!);
      this.draft = null;
      this.rebuild();
      this.onChange();
    });
    box.querySelector(".pc-remove")?.addEventListener("click", () => {
      if (!confirm("Remove this plan and every trip it stamped?")) return;
      removePlan(this.sheet, d.planId!);
      this.draft = null;
      this.rebuild();
      this.onChange();
    });

    this.root.appendChild(box);
    this.drawStrip(box.querySelector<HTMLCanvasElement>(".pc-strip")!);
  }

  /** Departure ticks over the day's aggregate demand curve. */
  private drawStrip(canvas: HTMLCanvasElement): void {
    const d = this.draft!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = (canvas.width = canvas.clientWidth || 280);
    const H = canvas.height;
    let peak = 0;
    const curve: number[] = [];
    for (let x = 0; x < W; x++) {
      const m = START + (x / W) * SPAN;
      let v = 0;
      for (const seg of CONFIG.segments) v += segCurve(seg, m);
      curve.push(v);
      peak = Math.max(peak, v);
    }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(87,182,224,0.25)";
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x < W; x++) ctx.lineTo(x, H - (curve[x] / peak) * (H - 4));
    ctx.lineTo(W, H);
    ctx.fill();
    if (d.stops.length >= 2 && d.boatIds.length) {
      ctx.fillStyle = "#5bd49a";
      for (let t = d.winStart; t <= d.winEnd; t += d.headwayMin) {
        const x = ((t - START) / SPAN) * W;
        ctx.fillRect(x, 3, 2, H - 6);
      }
    }
  }

  private commitDraft(): void {
    const d = this.draft!;
    if (d.stops.length < 2 || !d.boatIds.length) return;
    const minHw = planMinHeadway(this.state, this.draftPlan());
    if (minHw !== Infinity) d.headwayMin = Math.max(d.headwayMin, minHw);
    const body = {
      name: d.name.trim() || "Service plan",
      stops: [...d.stops],
      headwayMin: d.headwayMin,
      winStart: d.winStart,
      winEnd: Math.max(d.winStart, d.winEnd),
      boatIds: [...d.boatIds],
    };
    if (d.planId === null) {
      const made = createPlan(this.state, this.sheet, body);
      // nothing fit (boats booked / window too small) — undo and keep the
      // composer open so the live warning explains why, instead of closing blank
      if (!made || made.result.stamped === 0) {
        if (made) removePlan(this.sheet, made.plan.id);
        this.rebuild();
        return;
      }
    } else {
      const plan = this.sheet.plans.find((p) => p.id === d.planId);
      if (!plan) return;
      const res = updatePlan(this.state, this.sheet, plan, body);
      if (!res || res.stamped === 0) {
        this.rebuild(); // keep editing; the plan keeps its previous legs cleared
        return;
      }
    }
    this.draft = null;
    this.rebuild();
    this.onChange();
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

  /** Nearest free slot of `dur` minutes near `desired`, or null. */
  private findFree(
    boat: Boat, dur: number, desired: number, ignoreId?: number,
  ): number | null {
    const legs = this.legsOf(boat);
    const max = END - dur;
    const d = Math.max(START, Math.min(max, snap(desired)));
    if (!hasOverlap(legs, d, dur, this.state.routes, boat.classId, ignoreId)) return d;
    for (let step = SNAP; step <= SPAN; step += SNAP) {
      for (const cand of [d + step, d - step]) {
        if (cand < START || cand > max) continue;
        if (!hasOverlap(legs, cand, dur, this.state.routes, boat.classId, ignoreId)) return cand;
      }
    }
    return null;
  }

  private onPointerUp(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    drag.ghost.remove();
    this.drag = null;

    const hit = this.laneAt(e.clientX, e.clientY);
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
      const R = this.state.routes[drag.routeId];
      const desired = START + ((e.clientX - drag.grabDx - hit.rect.left) / hit.rect.width) * SPAN;
      if (drag.kind === "new") {
        // manual drop = classic round trip (out + back legs)
        const dur = 2 * legDuration(R, hit.boat.classId);
        const slot = this.findFree(hit.boat, dur, desired);
        if (slot !== null && dur <= SPAN) {
          addRoundTrip(this.state, this.sheet, hit.boat, drag.routeId, slot);
          this.onChange();
        }
      } else if (drag.legId !== undefined && drag.fromBoat) {
        const dur = legDuration(R, hit.boat.classId);
        const sameBoat = drag.fromBoat.id === hit.boat.id;
        const slot = this.findFree(hit.boat, dur, desired, sameBoat ? drag.legId : undefined);
        if (slot !== null) {
          if (sameBoat) moveLeg(this.sheet, hit.boat.id, drag.legId, slot);
          else transferLeg(this.sheet, drag.fromBoat.id, hit.boat.id, drag.legId, slot);
          this.onChange();
        }
      }
    }
    this.rebuild();
  }
}
