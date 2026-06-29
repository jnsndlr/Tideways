import "./style.css";
import { CONFIG } from "./config";
import { advance, buyBoat, createState } from "./sim";
import { MapRenderer } from "./render/canvas";
import { Panel } from "./ui/panel";

const state = createState();

const canvas = document.getElementById("cv") as HTMLCanvasElement;
const renderer = new MapRenderer(canvas);

const panel = new Panel(state, {
  onAssign: (boatId, routeId) => {
    const boat = state.boats.find((b) => b.id === boatId);
    if (boat) boat.pendingRoute = routeId;
  },
  onBuy: () => {
    if (buyBoat(state)) panel.buildFleet();
  },
  onSpeed: (speed) => {
    state.speed = speed;
  },
});

// Main loop: advance sim by real elapsed time, then draw.
let last = performance.now();
function loop(now: number): void {
  const dtReal = Math.min((now - last) / 1000, 0.1); // clamp big gaps (tab switch)
  last = now;
  advance(state, dtReal * CONFIG.gameMinPerSec * state.speed);
  renderer.render(state);
  panel.updateHud();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
