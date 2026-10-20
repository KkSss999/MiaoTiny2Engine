import { makeRng, type Rng } from "#core/rng/index.ts";

export const DIRS = ["N", "E", "S", "W"] as const;
export type Dir = (typeof DIRS)[number];

export const DELTA: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { N: "S", S: "N", E: "W", W: "E" };

export type RoomType = "start" | "combat" | "elite" | "shop" | "event" | "rest" | "boss";

export type RoomNode = {
  id: string;
  gx: number;
  gy: number;
  type: RoomType;
  doors: Dir[];
  dist: number;
};

export type Floor = {
  seed: number;
  nodes: RoomNode[];
  edges: [string, string][];
  startId: string;
  bossId: string;
  templateOf: Record<string, string>;
};

export type GenOptions = { spineLength?: number; branches?: number; loopChance?: number };

const cellKey = (x: number, y: number) => `${x},${y}`;

/**
 * 三层结构：
 * 1) 主干（spine）：从起点随机游走 5~7 步，保证「离 Boss 足够远」
 * 2) 分支：往主干上挂 3~5 个侧房，保证每局形状不同
 * 3) 加环：相邻未连通的房间有概率开门，制造回路（绕后/抄近路）
 * 最后按 BFS 距离撒商店/休息/精英，最远点（主干末端）永远是 Boss。
 */
export function generateFloor(seed: number, opts: GenOptions = {}): Floor {
  const rng = makeRng(seed);
  const spineLen = opts.spineLength ?? rng.int(5, 7);
  const branchCount = opts.branches ?? rng.int(3, 5);
  const loopChance = opts.loopChance ?? 0.4;

  const cellMap = new Map<string, RoomNode>();
  const nodes: RoomNode[] = [];
  const edgeSet = new Set<string>();
  const edges: [string, string][] = [];
  const edgeIsLoop: boolean[] = [];

  const addNode = (gx: number, gy: number): RoomNode => {
    const node: RoomNode = { id: `r${nodes.length}`, gx, gy, type: "combat", doors: [], dist: 0 };
    cellMap.set(cellKey(gx, gy), node);
    nodes.push(node);
    return node;
  };

  const addEdge = (a: RoomNode, b: RoomNode, loop = false): boolean => {
    const key = [a.id, b.id].sort().join("|");
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    edges.push([a.id, b.id]);
    edgeIsLoop.push(loop);
    return true;
  };

  const freeNeighbors = (n: RoomNode): Dir[] =>
    DIRS.filter((d) => {
      const [dx, dy] = DELTA[d];
      const gx = n.gx + dx;
      const gy = n.gy + dy;
      return Math.abs(gx) <= 6 && Math.abs(gy) <= 5 && !cellMap.has(cellKey(gx, gy));
    });

  const start = addNode(0, 0);
  start.type = "start";

  // 1) 主干
  const spine: RoomNode[] = [start];
  let cur = start;
  for (let i = 0; i < spineLen; i++) {
    let host = cur;
    let options = freeNeighbors(host);
    if (!options.length) {
      // 撞墙了就从主干上往前回溯，找还能长的地方（保证主干够长）
      for (let k = spine.length - 1; k >= 0; k--) {
        if (freeNeighbors(spine[k]).length) {
          host = spine[k];
          options = freeNeighbors(host);
          break;
        }
      }
    }
    if (!options.length) break;
    const dir = rng.pick(options);
    const [dx, dy] = DELTA[dir];
    const next = addNode(host.gx + dx, host.gy + dy);
    addEdge(host, next);
    spine.push(next);
    cur = next;
  }
  const spineEnd = cur;

  // 2) 分支
  for (let i = 0; i < branchCount; i++) {
    const hosts = nodes.filter((n) => freeNeighbors(n).length > 0);
    if (!hosts.length) break;
    const host = rng.pick(hosts);
    const dir = rng.pick(freeNeighbors(host));
    const [dx, dy] = DELTA[dir];
    const node = addNode(host.gx + dx, host.gy + dy);
    addEdge(host, node);
  }

  // 3) 加环
  const tryLoops = () => {
    for (const a of nodes) {
      for (const dir of DIRS) {
        const [dx, dy] = DELTA[dir];
        const b = cellMap.get(cellKey(a.gx + dx, a.gy + dy));
        if (!b) continue;
        if (!rng.chance(loopChance)) continue;
        addEdge(a, b, true);
      }
    }
  };
  tryLoops();

  // 4) BFS
  const adj = () => {
    const m = new Map<string, string[]>();
    for (const n of nodes) m.set(n.id, []);
    for (const [a, b] of edges) {
      m.get(a)?.push(b);
      m.get(b)?.push(a);
    }
    return m;
  };
  const bfs = (root: string) => {
    const dist = new Map<string, number>([[root, 0]]);
    const q = [root];
    while (q.length) {
      const c = q.shift()!;
      for (const nxt of adj().get(c) ?? []) {
        if (dist.has(nxt)) continue;
        dist.set(nxt, (dist.get(c) ?? 0) + 1);
        q.push(nxt);
      }
    }
    return dist;
  };

  // 环太多会把图压扁（Boss 三两步就到）：一旦最远距离 < 3 就退化成树
  let dist = bfs(start.id);
  const maxDistOf = (m: Map<string, number>) => Math.max(...nodes.map((n) => m.get(n.id) ?? 0));
  if (maxDistOf(dist) < 3) {
    for (let i = edges.length - 1; i >= 0; i--) {
      if (!edgeIsLoop[i]) continue;
      edgeSet.delete([edges[i][0], edges[i][1]].sort().join("|"));
      edges.splice(i, 1);
      edgeIsLoop.splice(i, 1);
    }
    dist = bfs(start.id);
  }

  // 5) 修剪死胡同（保留起点/主干末端）
  for (let pass = 0; pass < 2; pass++) {
    const deg = new Map<string, number>();
    for (const n of nodes) deg.set(n.id, 0);
    for (const [a, b] of edges) {
      deg.set(a, (deg.get(a) ?? 0) + 1);
      deg.set(b, (deg.get(b) ?? 0) + 1);
    }
    const leaves = nodes.filter((n) => n !== start && n !== spineEnd && (deg.get(n.id) ?? 0) <= 1);
    for (const leaf of leaves) {
      if (nodes.length <= 6) break;
      if (!rng.chance(0.5)) continue;
      removeNode(leaf);
    }
  }

  const finalAdj = adj();
  dist = bfs(start.id);
  for (const n of nodes) n.dist = dist.get(n.id) ?? 0;

  // 6) Boss = 离起点最远的房间（并列时优先主干末端）
  const farthest = [...nodes]
    .filter((n) => n.id !== start.id)
    .sort((a, b) => (b.dist - a.dist) || (b.id === spineEnd.id ? 1 : 0) - (a.id === spineEnd.id ? 1 : 0))[0];
  const boss = farthest ?? spineEnd;
  boss.type = "boss";
  const bossId = nodes.find((n) => n.type === "boss")?.id ?? spineEnd.id;

  // 7) 房间类型
  const used = new Set([start.id, bossId]);
  const maxDist = Math.max(...nodes.map((n) => n.dist));
  const take = (minDist: number, pred?: (n: RoomNode) => boolean): RoomNode | undefined => {
    const cands = nodes.filter((n) => !used.has(n.id) && n.dist >= minDist && (!pred || pred(n)));
    if (!cands.length) return undefined;
    const chosen = rng.pick(cands);
    used.add(chosen.id);
    return chosen;
  };
  const shop = take(2);
  if (shop) shop.type = "shop";
  const rest = take(2);
  if (rest) rest.type = "rest";
  const event = take(1);
  if (event) event.type = "event";
  const elite = take(Math.max(2, Math.round(maxDist / 2)));
  if (elite) elite.type = "elite";

  // 8) 门
  for (const n of nodes) n.doors = [];
  for (const [a, b] of edges) {
    const na = nodes.find((n) => n.id === a)!;
    const nb = nodes.find((n) => n.id === b)!;
    const dir = directionBetween(na, nb);
    if (!dir) continue;
    na.doors.push(dir);
    nb.doors.push(OPPOSITE[dir]);
  }
  for (const n of nodes) n.doors.sort();

  const templateOf: Record<string, string> = {};
  for (const n of nodes) templateOf[n.id] = pickTemplateFor(n, rng);

  void finalAdj;

  return { seed, nodes, edges, startId: start.id, bossId, templateOf };

  function removeNode(node: RoomNode) {
    const i = nodes.indexOf(node);
    if (i < 0) return;
    nodes.splice(i, 1);
    cellMap.delete(cellKey(node.gx, node.gy));
    for (let j = edges.length - 1; j >= 0; j--) {
      const [a, b] = edges[j];
      if (a !== node.id && b !== node.id) continue;
      edgeSet.delete([a, b].sort().join("|"));
      edges.splice(j, 1);
      edgeIsLoop.splice(j, 1);
    }
  }
}

function directionBetween(a: RoomNode, b: RoomNode): Dir | null {
  const dx = b.gx - a.gx;
  const dy = b.gy - a.gy;
  if (dx === 1 && dy === 0) return "E";
  if (dx === -1 && dy === 0) return "W";
  if (dx === 0 && dy === 1) return "S";
  if (dx === 0 && dy === -1) return "N";
  return null;
}

function pickTemplateFor(node: RoomNode, rng: Rng): string {
  const doorCount = node.doors.length;
  const pool = doorCount >= 3 ? ["cross", "pillars", "open"] : doorCount === 2 ? ["pillars", "lane", "open", "crates", "room"] : ["room", "pillars", "crates"];
  return rng.pick(pool);
}

/** 不变量检查：给调试页和 CI 用 */
export function checkFloor(f: Floor): string[] {
  const errs: string[] = [];
  const ids = new Set(f.nodes.map((n) => n.id));
  if (ids.size !== f.nodes.length) errs.push("房间 id 重复");

  const seen = new Set<string>();
  for (const n of f.nodes) {
    const k = `${n.gx},${n.gy}`;
    if (seen.has(k)) errs.push(`坐标重叠 ${k}`);
    seen.add(k);
  }

  const adj = new Map<string, string[]>();
  for (const n of f.nodes) adj.set(n.id, []);
  for (const [a, b] of f.edges) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  const visited = new Set<string>([f.startId]);
  const q = [f.startId];
  while (q.length) {
    const cur = q.shift()!;
    for (const nxt of adj.get(cur) ?? []) if (!visited.has(nxt)) { visited.add(nxt); q.push(nxt); }
  }
  if (visited.size !== f.nodes.length) errs.push(`不连通：${visited.size}/${f.nodes.length}`);

  const starts = f.nodes.filter((n) => n.type === "start");
  const bosses = f.nodes.filter((n) => n.type === "boss");
  if (starts.length !== 1) errs.push(`起点数量 ${starts.length}`);
  if (bosses.length !== 1) errs.push(`Boss 数量 ${bosses.length}`);
  const boss = bosses[0];
  if (boss && boss.dist < 3) errs.push(`Boss 太近 dist=${boss.dist}`);
  if (boss && (adj.get(boss.id)?.length ?? 0) < 1) errs.push("Boss 没有门");

  for (const n of f.nodes) {
    for (const d of n.doors) {
      const [dx, dy] = DELTA[d];
      const nb = f.nodes.find((m) => m.gx === n.gx + dx && m.gy === n.gy + dy);
      if (!nb) { errs.push(`${n.id} 的门 ${d} 没有房间`); continue; }
      if (!f.edges.some(([a, b]) => (a === n.id && b === nb.id) || (b === n.id && a === nb.id))) {
        errs.push(`${n.id} 门 ${d} 缺少边`);
      }
    }
  }
  if (f.nodes.length < 6) errs.push(`房间太少 ${f.nodes.length}`);
  return errs;
}
