/** Minimal rectangle description matching room walls. */
export type NavRect = { x: number; y: number; w: number; h: number };

/**
 * Room navigation field:
 * - Mark walkable cells, expanding walls by the enemy body size.
 * - Run BFS from the player cell to calculate distance to the player.
 * - Enemies follow the gradient at their cell to navigate around obstacles.
 *
 * Compute at most once per frame and share across enemies.
 */
export type NavGrid = {
  cell: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
  dist: Int32Array;
  roomId: string;
  startCell: number;
  version: number;
};

const overlap = (ax: number, ay: number, aw: number, ah: number, r: NavRect): boolean =>
  ax < r.x + r.w && ax + aw > r.x && ay < r.y + r.h && ay + ah > r.y;

export function buildNav(walls: NavRect[], width: number, height: number, cell = 40, inflate = 14): NavGrid {
  const cols = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;
  const blocked = new Uint8Array(cols * rows);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = x * cell - inflate;
      const cy = y * cell - inflate;
      const size = cell + inflate * 2;
      for (const wall of walls) {
        if (overlap(cx, cy, size, size, wall)) {
          blocked[y * cols + x] = 1;
          break;
        }
      }
    }
  }

  return {
    cell,
    cols,
    rows,
    blocked,
    dist: new Int32Array(cols * rows).fill(-1),
    roomId: "",
    startCell: -1,
    version: 0,
  };
}

export const cellXOf = (nav: NavGrid, x: number): number =>
  Math.min(nav.cols - 1, Math.max(0, Math.floor(x / nav.cell)));
export const cellYOf = (nav: NavGrid, y: number): number =>
  Math.min(nav.rows - 1, Math.max(0, Math.floor(y / nav.cell)));
export const cellIndexOf = (nav: NavGrid, x: number, y: number): number => cellYOf(nav, y) * nav.cols + cellXOf(nav, x);

/**
 * Run BFS from the start cell and write distances into dist.
 *
 * Use uniform cost 1 per step, rather than weighted costs 10/14.
 * A weighted version must requeue cells when a shorter path appears and may enqueue
 * far more entries than cells. A fixed queue can overflow into NaN; subsequent comparisons
 * can then loop forever and freeze the page. Uniform BFS enqueues each cell at most once.
 */
export function computeFlow(nav: NavGrid, startX: number, startY: number): void {
  nav.dist.fill(-1);
  const sx = cellXOf(nav, startX);
  const sy = cellYOf(nav, startY);
  const start = sy * nav.cols + sx;
  nav.startCell = start;
  nav.version += 1;

  // If the start is blocked, use the first nearby walkable cell.
  let from = start;
  if (nav.blocked[start]) {
    let best = -1;
    let bestScore = Number.MAX_SAFE_INTEGER;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
        const idx = ny * nav.cols + nx;
        if (nav.blocked[idx]) continue;
        const score = dx * dx + dy * dy;
        if (score < bestScore) {
          bestScore = score;
          best = idx;
        }
      }
    }
    if (best < 0) return;
    from = best;
  }

  const capacity = nav.cols * nav.rows;
  const queue = new Int32Array(capacity);
  let head = 0;
  let tail = 0;

  nav.dist[from] = 0;
  queue[tail++] = from;

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % nav.cols;
    const y = (idx / nav.cols) | 0;
    const nd = nav.dist[idx] + 1;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
        const ni = ny * nav.cols + nx;
        if (nav.blocked[ni]) continue;
        if (nav.dist[ni] !== -1) continue; // Already visited; never enqueue twice.
        // Diagonal movement must not cut wall corners.
        if (dx !== 0 && dy !== 0 && (nav.blocked[y * nav.cols + nx] || nav.blocked[ny * nav.cols + x])) continue;
        nav.dist[ni] = nd;
        if (tail < capacity) queue[tail++] = ni;
      }
    }
  }
}

/**
 * Direction toward the center of the next cell.
 * Calculate from the actual enemy position, not the current cell center;
 * otherwise movement near walls can point into a wall.
 */
export function flowDir(nav: NavGrid, x: number, y: number): { x: number; y: number } | null {
  const cx = cellXOf(nav, x);
  const cy = cellYOf(nav, y);

  let curX = cx;
  let curY = cy;
  let cur = cy * nav.cols + cx;

  // If the current cell is blocked by expanded walls, find the nearest usable cell in a 3x3 area.
  if (nav.blocked[cur] || nav.dist[cur] < 0) {
    let best = -1;
    let bestScore = Number.MAX_SAFE_INTEGER;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
        const idx = ny * nav.cols + nx;
        if (nav.blocked[idx] || nav.dist[idx] < 0) continue;
        const score = nav.dist[idx] + Math.abs(dx) + Math.abs(dy);
        if (score < bestScore) {
          bestScore = score;
          best = idx;
          curX = nx;
          curY = ny;
        }
      }
    }
    if (best < 0) return null;
    cur = best;
  }

  // Choose the neighboring cell with the smallest dist as the next cell.
  let lowest = nav.dist[cur];
  let nextX = curX;
  let nextY = curY;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = curX + dx;
      const ny = curY + dy;
      if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
      const ni = ny * nav.cols + nx;
      if (nav.blocked[ni] || nav.dist[ni] < 0) continue;
      if (dx !== 0 && dy !== 0 && (nav.blocked[curY * nav.cols + nx] || nav.blocked[ny * nav.cols + curX])) continue;
      if (nav.dist[ni] >= lowest) continue;
      lowest = nav.dist[ni];
      nextX = nx;
      nextY = ny;
    }
  }

  const tx = (nextX + 0.5) * nav.cell;
  const ty = (nextY + 0.5) * nav.cell;
  const dx = tx - x;
  const dy = ty - y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return null;
  return { x: dx / len, y: dy / len };
}
