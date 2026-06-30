import type { GameState } from "../types";

// Network routing over the graph of usable routes (legs whose BOTH endpoints are
// docked). Passengers pick a shortest path — fewest transfers, then least total
// crossing time — and the ferry loop reads `nextHop` to decide who boards a leg.
// Congestion-blind in v1: riders don't reroute around full boats.

export interface Routing {
  /** Next port to head to from `from` to eventually reach `dest`, or null if unreachable. */
  nextHop(from: string, dest: string): string | null;
  /** Ordered port ids from `from` to `dest` inclusive, or null if unreachable. */
  path(from: string, dest: string): string[] | null;
  reachable(from: string, dest: string): boolean;
}

interface Edge {
  to: string;
  cost: number; // base one-way crossing time (vessel-agnostic)
}

const HOP_PENALTY = 1e6; // dominates crossing time so fewer legs always wins first

/** Adjacency of usable legs: both endpoints must be docked. */
function buildAdjacency(state: GameState): Map<string, Edge[]> {
  const adj = new Map<string, Edge[]>();
  for (const id in state.ports) adj.set(id, []);
  for (const rid in state.routes) {
    const r = state.routes[rid].def;
    const a = state.ports[r.from];
    const b = state.ports[r.to];
    if (!a?.slips.length || !b?.slips.length) continue; // leg unusable until both docked
    adj.get(r.from)!.push({ to: r.to, cost: r.crossingMin });
    adj.get(r.to)!.push({ to: r.from, cost: r.crossingMin });
  }
  return adj;
}

/** Dijkstra from one source over (hops, crossing-time) lexicographic cost. */
function firstHops(adj: Map<string, Edge[]>, src: string): Map<string, string> {
  const dist = new Map<string, number>();
  const first = new Map<string, string>(); // dest -> the neighbor of src on the way
  dist.set(src, 0);
  // simple array-based PQ (port count is small)
  const seen = new Set<string>();
  const pending = new Map<string, number>([[src, 0]]);
  while (pending.size) {
    let u = "";
    let best = Infinity;
    for (const [n, d] of pending) if (d < best) ((best = d), (u = n));
    pending.delete(u);
    if (seen.has(u)) continue;
    seen.add(u);
    for (const e of adj.get(u) ?? []) {
      const nd = best + HOP_PENALTY + e.cost;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        first.set(e.to, u === src ? e.to : first.get(u)!);
        pending.set(e.to, nd);
      }
    }
  }
  return first;
}

function computeSig(state: GameState): string {
  const docked = Object.keys(state.ports)
    .filter((id) => state.ports[id].slips.length)
    .sort()
    .join(",");
  const routes = Object.keys(state.routes).sort().join(",");
  return docked + "|" + routes;
}

let cache: { sig: string; routing: Routing } | null = null;

/** Routing for the current topology (cached until docks/routes change). */
export function getRouting(state: GameState): Routing {
  const sig = computeSig(state);
  if (cache && cache.sig === sig) return cache.routing;

  const adj = buildAdjacency(state);
  const firstHopBySrc = new Map<string, Map<string, string>>();
  const hopOf = (from: string): Map<string, string> => {
    let m = firstHopBySrc.get(from);
    if (!m) {
      m = firstHops(adj, from);
      firstHopBySrc.set(from, m);
    }
    return m;
  };

  const routing: Routing = {
    nextHop: (from, dest) => (from === dest ? null : hopOf(from).get(dest) ?? null),
    reachable: (from, dest) => from === dest || hopOf(from).has(dest),
    path: (from, dest) => {
      if (from === dest) return [from];
      const out = [from];
      let cur = from;
      const guard = Object.keys(state.ports).length + 1;
      for (let i = 0; i < guard; i++) {
        const nh = hopOf(cur).get(dest);
        if (!nh) return null;
        out.push(nh);
        if (nh === dest) return out;
        cur = nh;
      }
      return null;
    },
  };

  cache = { sig, routing };
  return routing;
}
