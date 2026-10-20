// 检查 src/core 的依赖方向：下层只被消费，不能反向 import 上层。
// 这是原来用 4 个 npm 包 physical 保证的那条约束，现在用一条脚本守着。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CORE = fileURLToPath(new URL("../src/core", import.meta.url));

/** 允许的依赖：key 可以 import value 里的层 */
const ALLOWED = {
  kernel: [],
  db: ["kernel"],
  ecs: ["kernel", "db"],
  agent: ["kernel"],
};

const LAYERS = Object.keys(ALLOWED);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function layerOf(file) {
  const rel = path.relative(CORE, file);
  return rel.split(path.sep)[0];
}

const violations = [];
const edges = new Map();

for (const file of walk(CORE)) {
  const from = layerOf(file);
  if (!LAYERS.includes(from)) continue;
  const source = fs.readFileSync(file, "utf8");
  const regex = /from\s+["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const spec = match[1];
    let target = null;
    if (spec.startsWith(".")) {
      const resolved = path.resolve(path.dirname(file), spec);
      const rel = path.relative(CORE, resolved);
      if (!rel.startsWith("..")) target = rel.split(path.sep)[0];
    } else if (spec.startsWith("#core/")) {
      target = spec.slice("#core/".length).split("/")[0];
    }
    if (!target || !LAYERS.includes(target) || target === from) continue;

    const key = `${from} → ${target}`;
    if (!edges.has(key)) edges.set(key, 0);
    edges.set(key, edges.get(key) + 1);

    if (!ALLOWED[from]?.includes(target)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${path.relative(process.cwd(), file)}:${line}  ${from} 不能依赖 ${target}（${spec}）`);
    }
  }
}

const summary = [...edges.entries()].map(([k, n]) => `${k} ×${n}`).join("  ");
console.log("core 依赖图：", summary || "(无跨层依赖)");

if (violations.length > 0) {
  console.error("\n依赖方向违规：");
  for (const v of violations) console.error("  ✗ " + v);
  process.exit(1);
}
console.log("✓ 依赖方向正确：kernel ← db ← ecs，kernel ← agent");