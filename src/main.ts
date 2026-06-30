import "./style.css";
import { CONFIG } from "./config";
import { advance, buildDock, buyBoat, createState, upgradeDock } from "./sim";
import { MapRenderer } from "./render/canvas";
import { Panel } from "./ui/panel";
import { Timeline } from "./ui/timeline";

const state = createState();

const canvas = document.getElementById("cv") as HTMLCanvasElement;
const renderer = new MapRenderer(canvas);

let timeline: Timeline;

const panel = new Panel(state, {
  onSetPrice: (routeId, kind, price) => {
    const R = state.routes[routeId];
    if (kind === "foot") R.footPrice = price;
    else R.carPrice = price;
  },
  onBuy: (classId) => {
    if (buyBoat(state, classId)) timeline.rebuild(); // new lane on the timetable
  },
  onSpeed: (speed) => {
    state.speed = speed;
  },
  onBuildDock: (routeId) => {
    if (buildDock(state, routeId)) {
      panel.buildRoutes();
      timeline.rebuild();
      panel.selectDock(routeId); // re-render detail, now an open dock
    }
  },
  onUpgradeDock: (routeId) => {
    if (upgradeDock(state, routeId)) {
      timeline.rebuild(); // bigger vessels may now be schedulable here
      panel.selectDock(routeId);
    }
  },
});

timeline = new Timeline(state, () => panel.buildFleet());

// ---- Map camera: tap to select, drag/swipe to pan, wheel/pinch to zoom ----

const pointers = new Map<number, { x: number; y: number }>();
let panId: number | null = null;
let downX = 0;
let downY = 0;
let moved = false;
let pinchDist = 0;

const twoPoints = () => [...pointers.values()];
const twoDist = () => {
  const [a, b] = twoPoints();
  return Math.hypot(a.x - b.x, a.y - b.y);
};
const twoMid = () => {
  const [a, b] = twoPoints();
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};
const local = (cx: number, cy: number) => {
  const r = canvas.getBoundingClientRect();
  return { x: cx - r.left, y: cy - r.top };
};

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = local(e.clientX, e.clientY);
    renderer.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  },
  { passive: false },
);

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    pinchDist = twoDist();
    moved = true; // a pinch is never a tap
    return;
  }
  downX = e.clientX;
  downY = e.clientY;
  moved = false;
  // right mouse button or any touch starts a pan; left mouse is reserved for tap
  panId = e.pointerType !== "mouse" || e.button === 2 ? e.pointerId : null;
});

canvas.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    const d = twoDist();
    if (pinchDist > 0) {
      const m = local(twoMid().x, twoMid().y);
      renderer.zoomAt(m.x, m.y, d / pinchDist);
    }
    pinchDist = d;
    moved = true;
    return;
  }

  if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 5) moved = true;
  if (panId === e.pointerId) renderer.panBy(dx, dy);
});

function endPointer(e: PointerEvent): void {
  const tap = !moved && pointers.size === 1;
  pointers.delete(e.pointerId);
  if (e.pointerId === panId) panId = null;
  if (pointers.size < 2) pinchDist = 0;
  if (tap && (e.pointerType !== "mouse" || e.button === 0)) {
    const id = renderer.hitTestTerminal(e.clientX, e.clientY);
    const next = id && id !== "hub" && panel.selectedDock !== id ? id : null;
    panel.selectDock(next);
    renderer.selected = next;
  }
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", (e) => {
  pointers.delete(e.pointerId);
  if (e.pointerId === panId) panId = null;
  if (pointers.size < 2) pinchDist = 0;
});

// Main loop.
let last = performance.now();
function loop(now: number): void {
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;
  advance(state, dtReal * CONFIG.gameMinPerSec * state.speed);
  renderer.render(state);
  panel.updateHud();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
