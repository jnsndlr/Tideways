import { CONFIG, vesselById } from "../config";
import { portPopulation, townTier } from "../sim/growth";
import { segWaiting } from "../sim/sim";
import type { Boat, GameState, Vec2 } from "../types";

export function repColor(rep: number): string {
  if (rep < 40) return "#f0795f";
  if (rep < 65) return "#f3c14b";
  return "#5bd49a";
}

export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  selected: string | null = null;
  previewFrom: string | null = null;
  previewTo: string | null = null;

  // Camera: the world is a unit square [0,1]². (cx,cy) is the world point
  // sitting at the screen centre; zoom multiplies a uniform fit scale so the
  // map never squishes regardless of the canvas aspect ratio.
  private cam = { cx: 0.5, cy: 0.5, zoom: 1 };
  private static MIN_ZOOM = 0.6;
  private static MAX_ZOOM = 6;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    // the map container changes size as the panel fills in / scrolls; track it
    // so positions and hit-testing stay aligned with what's drawn.
    const wrap = canvas.parentElement;
    if (wrap && "ResizeObserver" in window) {
      new ResizeObserver(() => this.resize()).observe(wrap);
    }
  }

  resize(): void {
    const wrap = this.canvas.parentElement ?? this.canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = wrap.clientWidth;
    this.H = wrap.clientHeight;
    this.canvas.width = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Uniform world->screen scale (px per world unit) at the current zoom. */
  private scale(): number {
    return Math.min(this.W, this.H) * 0.86 * this.cam.zoom;
  }

  private px(pt: Vec2): Vec2 {
    const s = this.scale();
    return {
      x: this.W / 2 + (pt.x - this.cam.cx) * s,
      y: this.H / 2 + (pt.y - this.cam.cy) * s,
    };
  }

  private screenToWorld(sx: number, sy: number): Vec2 {
    const s = this.scale();
    return {
      x: (sx - this.W / 2) / s + this.cam.cx,
      y: (sy - this.H / 2) / s + this.cam.cy,
    };
  }

  // ---- camera controls (driven from main.ts pointer/wheel handlers) --------

  /** Drag the map by a screen-space delta (right-drag / swipe). */
  panBy(dxPx: number, dyPx: number): void {
    const s = this.scale();
    this.cam.cx -= dxPx / s;
    this.cam.cy -= dyPx / s;
    this.clampCam();
  }

  /** Zoom by `factor` about a screen point, keeping that point fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.max(
      MapRenderer.MIN_ZOOM,
      Math.min(MapRenderer.MAX_ZOOM, this.cam.zoom * factor),
    );
    const after = this.screenToWorld(sx, sy);
    this.cam.cx += before.x - after.x;
    this.cam.cy += before.y - after.y;
    this.clampCam();
  }

  private clampCam(): void {
    this.cam.cx = Math.max(-0.25, Math.min(1.25, this.cam.cx));
    this.cam.cy = Math.max(-0.25, Math.min(1.25, this.cam.cy));
  }

  render(state: GameState): void {
    this.drawWater();

    // route lines for usable legs (both endpoints docked)
    for (const rid in state.routes) {
      const R = state.routes[rid].def;
      const a = state.ports[R.from];
      const b = state.ports[R.to];
      if (a.slips.length && b.slips.length)
        this.drawRouteLine(this.px(a.def.pos), this.px(b.def.pos), R.color);
    }

    // proposed-route preview (hovering a candidate in the port detail panel)
    if (this.previewFrom && this.previewTo) {
      const a = state.ports[this.previewFrom];
      const b = state.ports[this.previewTo];
      if (a && b) this.drawPreviewLine(this.px(a.def.pos), this.px(b.def.pos));
    }

    // terminals: every port (hub included; locked islands dimmed with a padlock)
    for (const pid in state.ports) {
      const P = state.ports[pid];
      const isHub = P.def.isHub === true;
      const docked = P.slips.length > 0;
      const tier = docked ? Math.max(...P.slips) : -1;
      this.drawTerminal(
        this.px(P.def.pos), P.def.name, isHub ? "#57b6e0" : P.def.color, isHub,
        docked ? P.rep : null, this.selected === pid, !docked, tier,
        townTier(portPopulation(P)).rank,
      );
    }

    for (const boat of state.boats) this.drawBoat(state, boat);

    // queues drawn last so segment pips sit above terminals (never obscured).
    // Aggregated per port by segment across all destinations.
    for (const pid in state.ports) {
      const P = state.ports[pid];
      if (!P.slips.length) continue;
      const off: Vec2 = P.def.isHub ? { x: -54, y: -64 } : { x: -18, y: 26 };
      this.drawSegQueue(this.px(P.def.pos), off, segWaiting(P));
    }
  }

  private drawWater(): void {
    const { ctx, W, H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1d5a7a");
    g.addColorStop(1, "#10374e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 2;
    const t = performance.now() / 1000;
    for (let i = 0; i < 7; i++) {
      const y = ((i + 1) / 8) * H + Math.sin(t + i) * 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin(x / 60 + t + i) * 3);
      ctx.stroke();
    }
  }

  private drawTerminal(
    pt: Vec2, label: string, color: string, big: boolean,
    rep: number | null, selected: boolean, locked: boolean, berthTier: number,
    townRank: number,
  ): void {
    const { ctx } = this;
    // island footprint grows with its town tier — long-term investment is
    // witnessed on the map, not just in the numbers
    const r = big ? 17 : 10 + townRank * 1.5;
    ctx.save();
    if (locked) ctx.globalAlpha = 0.6;
    if (selected) {
      ctx.strokeStyle = "#eaf3f8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r + 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = locked ? "#3a4a52" : "#43734f";
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, r + 18, r + 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = locked ? "#46585f" : "#4f8059";
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, r + 10, r + 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = locked ? "#6b7d84" : color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#eaf3f8";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, pt.x, pt.y + r + 28);

    if (locked) {
      ctx.font = "10px -apple-system, sans-serif";
      ctx.fillText("🔒", pt.x, pt.y + 3);
    } else if (rep !== null) {
      const bw = 40;
      const bx = pt.x - bw / 2;
      const by = pt.y + r + 34;
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = repColor(rep);
      ctx.fillRect(bx, by, (bw * rep) / 100, 4);
      // tier pips: how big a vessel this dock can berth
      for (let i = 0; i <= berthTier; i++) {
        ctx.fillStyle = "#eaf3f8";
        ctx.fillRect(bx + i * 5, by + 6, 3, 3);
      }
    }
    ctx.restore();
  }

  private drawRouteLine(a: Vec2, b: Vec2, color: string): void {
    const { ctx } = this;
    ctx.strokeStyle = color + "55";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawPreviewLine(a: Vec2, b: Vec2): void {
    const { ctx } = this;
    ctx.strokeStyle = "#f3c14bcc";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -((performance.now() / 60) % 16); // marching ants
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  // segment-coloured queue: one short column of pips per segment
  private drawSegQueue(pt: Vec2, off: Vec2, byseg: Record<string, number>): void {
    const { ctx } = this;
    let col = 0;
    for (const seg of CONFIG.segments) {
      const people = byseg[seg.id] ?? 0;
      const n = Math.min(Math.ceil(people / 14), 12);
      if (n <= 0) continue;
      const ox = pt.x + off.x + col * 7;
      const oy = pt.y + off.y;
      ctx.fillStyle = seg.color;
      for (let i = 0; i < n; i++) ctx.fillRect(ox, oy - i * 5, 5, 4);
      col++;
    }
  }

  private drawBoat(state: GameState, boat: Boat): void {
    const vc = vesselById(boat.classId);
    let pos: Vec2;
    let ang = 0;

    if (boat.phase === "repair" && boat.atPort) {
      // dead at the dock where it limped in
      const dock = this.px(state.ports[boat.atPort].def.pos);
      pos = { x: dock.x + 22, y: dock.y + 16 };
    } else if (
      boat.phase === "idle" || boat.phase === "maint" || !boat.routeId || !boat.sailFrom
    ) {
      // resting/yard boats sit where they last docked, fanned so they're visible
      const at = this.px(state.ports[boat.atPort ?? boat.lastPort].def.pos);
      pos = { x: at.x + (boat.id % 2 === 0 ? 24 : -24), y: at.y + 4 + Math.floor(boat.id / 2) * 6 };
    } else {
      const R = state.routes[boat.routeId].def;
      const destId = R.from === boat.sailFrom ? R.to : R.from;
      const from = this.px(state.ports[boat.sailFrom].def.pos);
      const to = this.px(state.ports[destId].def.pos);
      ang = Math.atan2(to.y - from.y, to.x - from.x);
      pos =
        boat.phase === "atPort"
          ? from
          : { x: from.x + (to.x - from.x) * boat.p, y: from.y + (to.y - from.y) * boat.p };
    }

    const { ctx } = this;
    const sz = 0.8 + vc.peopleCap / 1400; // bigger vessels draw larger
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang);
    ctx.scale(sz, sz);
    if (boat.phase === "sailing") {
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.beginPath();
      ctx.moveTo(-10, -7);
      ctx.lineTo(-26, 0);
      ctx.lineTo(-10, 7);
      ctx.fill();
    }
    ctx.fillStyle = vc.carCap === 0 ? "#3f7fae" : "#1f6f54"; // PO boats bluer
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(6, -7);
    ctx.lineTo(-12, -7);
    ctx.lineTo(-12, 7);
    ctx.lineTo(6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(-8, -5, 12, 10);
    ctx.restore();

    // yard stays (and a mid-crossing breakdown limp) get a wrench so a down
    // boat is spottable at a glance
    if (boat.phase === "maint" || boat.phase === "repair" || boat.limping) {
      ctx.font = "12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🔧", pos.x, pos.y - 12);
    }

    if (boat.phase !== "idle") {
      const load = (boat.pax.foot + boat.pax.car * CONFIG.avgOccupancy) / vc.peopleCap;
      if (load > 0.001) {
        ctx.fillStyle = "rgba(0,0,0,.4)";
        ctx.fillRect(pos.x - 14, pos.y - 20, 28, 4);
        ctx.fillStyle = load > 0.95 ? "#f0795f" : "#5bd49a";
        ctx.fillRect(pos.x - 14, pos.y - 20, 28 * Math.min(1, load), 4);
      }
    }
  }

  hitTestTerminal(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const within = (p: Vec2) => Math.hypot(p.x - x, p.y - y) < 34;
    for (const def of CONFIG.ports) if (within(this.px(def.pos))) return def.id;
    return null;
  }
}
