import { CONFIG } from "../config";
import type { Boat, GameState, RouteState, Vec2 } from "../types";

// Canvas map renderer. Reads GameState and draws it; never mutates state.
export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
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

  private px(pt: Vec2): Vec2 {
    return { x: pt.x * this.W, y: pt.y * this.H };
  }

  render(state: GameState): void {
    this.drawWater();
    const hub = this.px(CONFIG.hub.pos);

    for (const id in state.routes) {
      this.drawRouteLine(hub, this.px(state.routes[id].def.pos), state.routes[id].def.color);
    }

    // queues: hub-side outbound (per route) and destination-side inbound
    let qi = 0;
    for (const id in state.routes) {
      const R = state.routes[id];
      this.drawQueue(hub, { x: -50 + qi * 44, y: -56 }, R.out.foot, R.out.car, R.def.color);
      this.drawQueue(this.px(R.def.pos), { x: -16, y: 22 }, R.in.foot, R.in.car, R.def.color);
      qi++;
    }

    for (const id in state.routes) {
      const R = state.routes[id];
      this.drawTerminal(this.px(R.def.pos), R.def.name, R.def.color, false);
    }
    this.drawTerminal(hub, CONFIG.hub.name, "#57b6e0", true);

    for (const boat of state.boats) this.drawBoat(state, boat);
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

  private drawTerminal(pt: Vec2, label: string, color: string, big: boolean): void {
    const { ctx } = this;
    const r = big ? 16 : 13;
    ctx.fillStyle = "#43734f";
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, r + 18, r + 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4f8059";
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, r + 10, r + 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
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

  private drawQueue(pt: Vec2, off: Vec2, foot: number, car: number, color: string): void {
    const { ctx } = this;
    const total = Math.round(foot) + Math.round(car);
    if (total <= 0) return;
    const cols = 8;
    const size = 4;
    const gap = 5;
    const n = Math.min(Math.ceil(total / 12), 40); // 1 pip ~ 12 people
    const cars = Math.min(Math.ceil(car / 8), 12);
    const ox = pt.x + off.x;
    const oy = pt.y + off.y;
    for (let i = 0; i < n; i++) {
      const cx = ox + (i % cols) * gap;
      const cy = oy + Math.floor(i / cols) * gap;
      ctx.fillStyle = i < cars ? "#e7b04a" : color;
      ctx.fillRect(cx, cy, size, size);
    }
    ctx.fillStyle = "#eaf3f8";
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(String(total), ox, oy - 4);
  }

  private drawBoat(state: GameState, boat: Boat): void {
    if (!boat.routeId) return;
    const R: RouteState = state.routes[boat.routeId];
    const hub = this.px(CONFIG.hub.pos);
    const dest = this.px(R.def.pos);
    let pos: Vec2;
    let ang: number;

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

    const { ctx } = this;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang);
    // wake
    ctx.fillStyle = "rgba(255,255,255,.10)";
    ctx.beginPath();
    ctx.moveTo(-10, -7);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-10, 7);
    ctx.fill();
    // hull
    ctx.fillStyle = "#1f6f54";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(6, -7);
    ctx.lineTo(-12, -7);
    ctx.lineTo(-12, 7);
    ctx.lineTo(6, 7);
    ctx.closePath();
    ctx.fill();
    // deck house
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(-8, -5, 12, 10);
    ctx.fillStyle = R.def.color;
    ctx.fillRect(-8, -5, 3, 10);
    ctx.restore();

    // load indicator above boat
    const load =
      (boat.pax.foot + boat.pax.car * CONFIG.ferry.avgOccupancy) / CONFIG.ferry.peopleCap;
    if (load > 0.001) {
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(pos.x - 14, pos.y - 18, 28, 4);
      ctx.fillStyle = load > 0.95 ? "#f0795f" : "#5bd49a";
      ctx.fillRect(pos.x - 14, pos.y - 18, 28 * Math.min(1, load), 4);
    }
  }
}
