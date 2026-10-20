// 开发用内容 API：读写 content/*.json，用游戏自己的 schema 校验。
// 只在 vite dev server 里生效（apply: "serve"），不会进产物。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTENT_DIR = path.join(ROOT, "content");
const TABLES = ["weapons", "enemies", "affixes", "statuses", "animations"];

const fileOf = (table) => path.join(CONTENT_DIR, `${table}.json`);

function readTable(table) {
  return JSON.parse(fs.readFileSync(fileOf(table), "utf8"));
}

function writeTable(table, rows) {
  fs.writeFileSync(fileOf(table), JSON.stringify(rows, null, 2) + "\n", "utf8");
}

async function schemas() {
  const { AffixTable, AnimationTable, EnemyTable, StatusTable, WeaponTable } = await import("../src/game/contentSchema.ts");
  return {
    weapons: WeaponTable,
    enemies: EnemyTable,
    affixes: AffixTable,
    statuses: StatusTable,
    animations: AnimationTable,
  };
}

/**
 * 用游戏的表定义校验。
 * 注意：defineTable 按名字返回同一个单例，不能往里面 insert（会污染游戏侧的表），
 * 只跑 schema.parse —— 这就是唯一的规则来源。
 */
async function validateRow(table, row) {
  const defs = await schemas();
  const def = defs[table];
  if (!def) throw new Error(`未知表：${table}`);
  def.schema.parse(row);
  return row;
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) reject(new Error("body 过大"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function describeTables() {
  const defs = await schemas();
  const out = {};
  for (const [name, def] of Object.entries(defs)) {
    out[name] = {
      key: def.schema.key,
      fields: Object.keys(def.schema.shape),
      rows: readTable(name).length,
    };
  }
  return out;
}

export function devApi() {
  return {
    name: "cbb-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev", async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const parts = url.pathname.split("/").filter(Boolean);

        try {
          if (req.method === "GET" && parts[0] === "content") {
            const tables = {};
            for (const t of TABLES) tables[t] = readTable(t);
            return send(res, 200, { tables });
          }

          if (req.method === "GET" && parts[0] === "tables") {
            return send(res, 200, { tables: await describeTables() });
          }

          if (req.method === "POST" && parts[0] === "content" && parts.length === 2) {
            const table = parts[1];
            if (!TABLES.includes(table)) return send(res, 404, { error: `未知表：${table}` });

            const body = await readBody(req);
            const rows = readTable(table);
            const row = body.row ?? {};
            if (!row.id) return send(res, 400, { error: "新行必须有 id" });
            if (rows.some((r) => r.id === row.id)) return send(res, 409, { error: `id 已存在：${row.id}` });

            try {
              await validateRow(table, row);
            } catch (err) {
              return send(res, 400, { error: err?.message ?? "校验失败" });
            }

            rows.push(row);
            writeTable(table, rows);
            return send(res, 200, { ok: true, row });
          }

          if (req.method === "DELETE" && parts[0] === "content" && parts.length >= 3) {
            const table = parts[1];
            const id = decodeURIComponent(parts.slice(2).join("/"));
            if (!TABLES.includes(table)) return send(res, 404, { error: `未知表：${table}` });
            const rows = readTable(table);
            const next = rows.filter((r) => r.id !== id);
            if (next.length === rows.length) return send(res, 404, { error: `找不到行：${id}` });
            writeTable(table, next);
            return send(res, 200, { ok: true });
          }

          if (req.method === "PUT" && parts[0] === "content" && parts.length >= 3) {
            const table = parts[1];
            const id = decodeURIComponent(parts.slice(2).join("/"));
            if (!TABLES.includes(table)) return send(res, 404, { error: `未知表：${table}` });

            const body = await readBody(req);
            const rows = readTable(table);
            const index = rows.findIndex((r) => r.id === id);
            if (index < 0) return send(res, 404, { error: `找不到行：${table}/${id}` });

            const merged = { ...rows[index], ...(body.patch ?? body) };
            try {
              await validateRow(table, merged);
            } catch (err) {
              return send(res, 400, { error: err?.message ?? "校验失败" });
            }

            rows[index] = merged;
            writeTable(table, rows);
            return send(res, 200, { ok: true, row: merged });
          }

          if (req.method === "POST" && parts[0] === "content" && parts[1] === "reset") {
            return send(res, 405, { error: "还没有实现" });
          }

          return next();
        } catch (err) {
          return send(res, 500, { error: err?.message ?? String(err) });
        }
      });
    },
  };
}