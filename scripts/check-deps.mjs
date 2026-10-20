// 依赖方向检查：分层只能向下依赖，反向 import 直接失败。
// 1) src 顶层分层：core / content / engine / game / render / ui
// 2) core 内部子层：kernel / db / ecs / agent
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const CORE = path.join(SRC, "core");

const TOP_ALLOWED = {
  core: [],
  content: ["core"],
  engine: ["core", "content"],
  // TODO: game.ts 是编排层（装配 pixi），拆分到 src/app 后要收紧成 ["core","content","engine"]
  game: ["core", "content", "engine", "render"],
  render: ["core", "content", "engine", "game"],
  // ui 是最上层；开发页面允许读 render 的只读工具
  ui: ["core", "content", "engine", "game", "render"],
};

const CORE_ALLOWED = {
  kernel: [],
  db: ["kernel"],
  ecs: ["kernel", "db"],
  agent: ["kernel"],
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const topOf = (file) => path.relative(SRC, file).split(path.sep)[0];
const coreLayerOf = (file) => path.relative(CORE, file).split(path.sep)[0];

function resolveSpec(file, spec) {
  if (spec.startsWith("#core/")) return "core";
  if (spec.startsWith("#content/")) return "content";
  if (!spec.startsWith(".")) return null;
  const resolved = path.resolve(path.dirname(file), spec);
  if (!resolved.startsWith(SRC)) return null;
  return topOf(resolved);
}

const violations = [];
const edges = new Map();

for (const file of walk(SRC)) {
  const from = topOf(file);
  if (!(from in TOP_ALLOWED)) continue;

  const source = fs.readFileSync(file, "utf8");
  const regex = /from\s+["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const spec = match[1];
    const target = resolveSpec(file, spec);
    if (!target || target === from || !(target in TOP_ALLOWED)) continue;

    const key = `${from} → ${target}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);

    if (!TOP_ALLOWED[from].includes(target)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${path.relative(process.cwd(), file)}:${line}  ${from} 不能依赖 ${target}（${spec}）`);
    }
  }

  // core 内部子层
  if (from !== "core") continue;
  const sub = coreLayerOf(file);
  if (!(sub in CORE_ALLOWED)) continue;

  regex.lastIndex = 0;
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
    if (!target || !(target in CORE_ALLOWED) || target === sub) continue;

    const key = `core/${sub} → core/${target}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);

    if (!CORE_ALLOWED[sub].includes(target)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${path.relative(process.cwd(), file)}:${line}  core/${sub} 不能依赖 core/${target}（${spec}）`);
    }
  }
}

const summary = [...edges.entries()].map(([k, n]) => `${k} ×${n}`).join("  ");
console.log("依赖图：", summary || "(无跨层依赖)");

if (violations.length > 0) {
  console.error("\n依赖方向违规：");
  for (const v of violations) console.error("  ✗ " + v);
  process.exit(1);
}
console.log("✓ 依赖方向正确：core ← content ← engine ← game ← render/ui");