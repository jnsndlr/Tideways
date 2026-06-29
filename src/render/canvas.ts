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

    // queues: per-route outbound near hub, inbound at the destination
    let qi = 0;
    const ids = Object.keys(state.routes);
    for (const id of ids) {
      const R = state.routes[id];
      const hubOff: Vec2 = { x: -54 + qi * 50, y: -64 };
      this.drawSegQueue(hub, hubOff, R.out);
      this.drawSegQueue(this.px(R.def.pos), { x: -18, y: 26 }, R.in);
      qi++;
    }

    for (const id of ids) {
      const R = state.routes[id];
      this.drawTerminal(this.px(R.def.pos), R.def.name, R.def.color, false, R.rep, this.selected === id);
    }
    this.drawTerminal(hub, CONFIG.hub.name, "#57b6e0", true, null, this.selected === "hub");

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

  private drawTerminal(
    pt: Vec2, label: string, color: string, big: boolean,
    rep: number | null, selected: boolean,
  ): void {
    const { ctx } = this;
    const r = big ? 16 : 13;
    if (selected) {
      ctx.strokeStyle = "#eaf3f8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r + 22, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    if (rep !== null) {
      const bw = 40;
      const bx = pt.x - bw / 2;
      const by = pt.y + r + 34;
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = repColor(rep);
      ctx.fillRect(bx, by, (bw * rep) / 100, 4);
    }
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
