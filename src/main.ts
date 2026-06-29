import "./style.css";
import { CONFIG } from "./config";
import { advance, buyBoat, createState } from "./sim";
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
});

timeline = new Timeline(state, () => panel.buildFleet());

// Tap a dock to open/close its reputation + segment detail.
canvas.addEventListener("click", (e) => {
  const id = renderer.hitTestTerminal(e.clientX, e.clientY);
  const next = id && id !== "hub" && panel.selectedDock !== id ? id : null;
  panel.selectDock(next);
  renderer.selected = next;
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
