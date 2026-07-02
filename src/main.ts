import "./style.css";
import { CONFIG } from "./config";
import {
  addSlip,
  advance,
  buildDock,
  buyBoat,
  clearSave,
  createState,
  loadGame,
  openRoute,
  saveGame,
  sellBoat,
  upgradeSlip,
} from "./sim";
import { MapRenderer } from "./render/canvas";
import { Panel } from "./ui/panel";
import { Timeline } from "./ui/timeline";

const state = loadGame() ?? createState();

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
  onSell: (boatId) => {
    if (sellBoat(state, boatId)) {
      timeline.rebuild(); // lane removed
      panel.buildFleet(); // row removed, berth freed
    }
  },
  onSpeed: (speed) => {
    state.speed = speed;
  },
  onBuildDock: (portId) => {
    if (buildDock(state, portId)) {
      timeline.rebuild();
      panel.selectDock(portId); // re-render detail, now an open dock
    }
  },
  onAddSlip: (portId) => {
    if (addSlip(state, portId)) {
      panel.buildFleet(); // hub: fleet cap changed
      panel.selectDock(portId);
    }
  },
  onUpgradeSlip: (portId, slipIdx) => {
    if (upgradeSlip(state, portId, slipIdx)) {
      if (portId === "hub") panel.buildFleet(); // bigger vessels now ownable
      else timeline.rebuild(); // bigger vessels now schedulable to this island
      panel.selectDock(portId);
    }
  },
  onOpenRoute: (fromId, toId) => {
    if (openRoute(state, fromId, toId)) {
      timeline.rebuild(); // new chip schedulable on the timetable
      panel.selectDock(fromId); // re-render detail, candidate list updated
    }
  },
  onPreviewRoute: (fromId, toId) => {
    renderer.previewFrom = fromId;
    renderer.previewTo = toId;
  },
});

timeline = new Timeline(state, () => panel.buildFleet());

// ---- Bottom tab bar: Map (base) · Schedule · Company -----------------------

const tabViews: Record<string, HTMLElement | null> = {
  schedule: document.getElementById("view-schedule"),
  company: document.getElementById("view-company"),
};
document.querySelectorAll<HTMLButtonElement>("#tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab!;
    for (const name in tabViews) tabViews[name]!.hidden = name !== tab;
    document
      .querySelectorAll("#tabbar button")
      .forEach((b) => b.classList.toggle("active", b === btn));
  });
});

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
    const next = id && panel.selectedDock !== id ? id : null; // hub opens home-port panel
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

// ---- Persistence: autosave + explicit new game ----------------------------

setInterval(() => saveGame(state), 5_000);
// mobile rarely fires unload events — save the moment the tab is backgrounded
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame(state);
});
window.addEventListener("pagehide", () => saveGame(state));

document.getElementById("new-game")!.addEventListener("click", () => {
  if (!confirm("Abandon this company and start over?")) return;
  clearSave();
  location.reload();
});

// ---- PWA service worker (production builds only; dev server stays uncached) -

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

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
