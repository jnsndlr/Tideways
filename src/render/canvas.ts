import { CONFIG, vesselById } from "../config";
import type { Boat, DirQueue, GameState, RouteState, Vec2 } from "../types";

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
    const hub = this.px(CONFIG.hub.pos);
    const ids = Object.keys(state.routes);

    // route lines only to islands we actually serve
    for (const id of ids) {
      const R = state.routes[id];
      if (R.hasDock) this.drawRouteLine(hub, this.px(R.def.pos), R.def.color);
    }

    // terminals (locked islands draw dimmed with a padlock)
    for (const id of ids) {
      const R = state.routes[id];
      this.drawTerminal(
        this.px(R.def.pos), R.def.name, R.def.color, false,
        R.hasDock ? R.rep : null, this.selected === id, !R.hasDock, R.dockTier,
      );
    }
    this.drawTerminal(hub, CONFIG.hub.name, "#57b6e0", true, null, this.selected === "hub", false, -1);

    for (const boat of state.boats) this.drawBoat(state, boat);

    // queues drawn last so segment pips sit above terminals (never obscured)
    let qi = 0;
    for (const id of ids) {
      const R = state.routes[id];
      if (!R.hasDock) continue;
      const hubOff: Vec2 = { x: -54 + qi * 50, y: -64 };
      this.drawSegQueue(hub, hubOff, R.out);
      this.drawSegQueue(this.px(R.def.pos), { x: -18, y: 26 }, R.in);
      qi++;
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
    rep: number | null, selected: boolean, locked: boolean, dockTier: number,
  ): void {
    const { ctx } = this;
    const r = big ? 16 : 13;
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
      for (let i = 0; i <= dockTier; i++) {
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

  // segment-coloured queue: one short column of pips per segment
  private drawSegQueue(pt: Vec2, off: Vec2, dir: DirQueue): void {
    const { ctx } = this;
    let col = 0;
    for (const seg of CONFIG.segments) {
      const q = dir[seg.id];
      const people = q.foot + q.car * CONFIG.avgOccupancy;
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
    const hub = this.px(CONFIG.hub.pos);
    let pos: Vec2;
    let ang = 0;

    if (boat.phase === "idle" || !boat.routeId) {
      // idle boats rest at the hub, fanned out slightly so they're visible
      pos = { x: hub.x + (boat.id % 2 === 0 ? 24 : -24), y: hub.y + 4 + Math.floor(boat.id / 2) * 6 };
    } else {
      const R: RouteState = state.routes[boat.routeId];
      const dest = this.px(R.def.pos);
      if (boat.phase === "hub") {
        pos = hub;
        ang = Math.atan2(dest.y - hub.y, dest.x - hub.x);
      } else if (boat.phase === "dest") {
        pos = dest;
        ang = Math.atan2(hub.y - dest.y, hub.x - dest.x);
      } else {
        const p = boat.p;
        pos = { x: hub.x + (dest.x - hub.x) * p, y: hub.y + (dest.y - hub.y) * p };
        const dir = boat.phase === "out" ? 1 : -1;
        ang = Math.atan2((dest.y - hub.y) * dir, (dest.x - hub.x) * dir);
      }
    }

    const { ctx } = this;
    const sz = 0.8 + vc.peopleCap / 1400; // bigger vessels draw larger
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang);
    ctx.scale(sz, sz);
    if (boat.phase === "out" || boat.phase === "back") {
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
    if (within(this.px(CONFIG.hub.pos))) return "hub";
    for (const def of CONFIG.routes) if (within(this.px(def.pos))) return def.id;
    return null;
  }
}
