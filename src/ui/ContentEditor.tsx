import { useCallback, useEffect, useState } from "react";
import { SpriteGallery } from "./SpriteGallery";

type TableInfo = { key: string; fields: string[]; rows: number };
type Row = Record<string, unknown>;

const TABLE_LABEL: Record<string, string> = {
  weapons: "武器",
  enemies: "敌人",
  affixes: "词条",
  statuses: "状态",
};

/**
 * 内容编辑器（开发用，仅 dev server 下可用）。
 * 数据在 content/*.json，保存走 /__dev，校验用游戏自己的 schema。
 */
export function ContentEditor() {
  const [tables, setTables] = useState<Record<string, TableInfo>>({});
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [table, setTable] = useState("weapons");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [info, content] = await Promise.all([
      fetch("/__dev/tables").then((r) => r.json()),
      fetch("/__dev/content").then((r) => r.json()),
    ]);
    setTables(info.tables);
    setData(content.tables);
    setError(null);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [load]);

  const rows = data[table] ?? [];
  const row = rows.find((r) => r.id === selected) ?? null;
  const fields = tables[table]?.fields ?? Object.keys(row ?? {});

  const selectRow = (id: string) => {
    setSelected(id);
    const found = rows.find((r) => r.id === id);
    setDraft(found ? { ...found } : {});
    setStatus(null);
  };

  const save = async () => {
    if (!row) return;
    const patch: Row = {};
    for (const f of fields) patch[f] = draft[f];

    const res = await fetch(`/__dev/content/${table}/${encodeURIComponent(row.id as string)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch }),
    });
    const body = await res.json();

    if (!res.ok) {
      setStatus({ kind: "err", text: body.error ?? "保存失败" });
      return;
    }
    setStatus({ kind: "ok", text: "已保存，页面会自动重载" });
    await load();
  };

  const revert = () => {
    const fresh = rows.find((r) => r.id === selected);
    setDraft(fresh ? { ...fresh } : {});
    setStatus(null);
  };

  const dirty = row ? fields.some((f) => draft[f] !== row[f]) : false;

  return (
    <div className="flex h-full w-full bg-void font-mono text-bone">
      {/* 表 */}
      <div className="w-40 shrink-0 border-r border-bone/10 p-3">
        <div className="mb-3 text-[10px] tracking-[0.4em] text-brass/50">TABLES</div>
        {Object.keys(tables).map((name) => (
          <button
            key={name}
            onClick={() => {
              setTable(name);
              setSelected(null);
              setDraft({});
            }}
            className={
              "mb-1 flex w-full items-center justify-between px-2 py-1 text-left text-[12px] transition " +
              (name === table ? "bg-brass/15 text-bone" : "text-bone/50 hover:bg-white/5")
            }
          >
            <span>{TABLE_LABEL[name] ?? name}</span>
            <span className="text-[10px] text-bone/25">{tables[name]?.rows ?? 0}</span>
          </button>
        ))}
      </div>

      {/* 行 */}
      <div className="w-48 shrink-0 overflow-auto border-r border-bone/10 p-2">
        {rows.map((r) => (
          <button
            key={String(r.id)}
            onClick={() => selectRow(String(r.id))}
            className={
              "mb-0.5 block w-full truncate px-2 py-1 text-left text-[11px] transition " +
              (r.id === selected ? "bg-brass/15 text-bone" : "text-bone/55 hover:bg-white/5")
            }
          >
            {String(r.name ?? r.id)}
            <span className="ml-1 text-[9px] text-bone/25">{String(r.id)}</span>
          </button>
        ))}
      </div>

      {/* 编辑 */}
      <div className="flex-1 overflow-auto p-4">
        {error && <div className="mb-3 border border-blood/40 bg-blood/10 p-2 text-[11px] text-blood">{error}</div>}

        {!row && <div className="text-[11px] text-bone/30">选一行开始编辑</div>}

        {row && (
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[13px] text-bone">{String(row.name ?? row.id)}</span>
              <span className="text-[10px] text-bone/30">{table}/{String(row.id)}</span>
              {dirty && <span className="text-[10px] text-brass/70">未保存</span>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {fields.map((f) => {
                const value = draft[f];
                const isNumber = typeof value === "number";
                return (
                  <label key={f} className="flex items-center justify-between gap-2 border border-bone/10 px-2 py-1">
                    <span className="text-[10px] text-bone/40">{f}</span>
                    {isNumber ? (
                      <input
                        type="number"
                        step="any"
                        value={String(value ?? 0)}
                        onChange={(e) => setDraft({ ...draft, [f]: Number(e.target.value) })}
                        className="w-28 bg-transparent text-right text-[11px] text-bone outline-none"
                      />
                    ) : (
                      <input
                        value={String(value ?? "")}
                        onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                        className="w-40 bg-transparent text-right text-[11px] text-bone outline-none"
                      />
                    )}
                  </label>
                );
              })}
            </div>

            {fields.includes("color") && typeof draft.color === "number" && (
              <div className="mt-2 flex items-center gap-2 text-[10px] text-bone/35">
                <span
                  className="h-4 w-8 border border-bone/20"
                  style={{ background: `#${(draft.color as number).toString(16).padStart(6, "0")}` }}
                />
                #{(draft.color as number).toString(16).padStart(6, "0")}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={save}
                disabled={!dirty}
                className="border border-brass/50 bg-brass/10 px-4 py-1.5 text-[11px] tracking-[0.2em] text-bone/90 transition hover:bg-brass/20 disabled:opacity-30"
              >
                保存
              </button>
              <button onClick={revert} className="border border-bone/10 px-3 py-1.5 text-[11px] text-bone/50">
                还原
              </button>
              {status && (
                <span className={status.kind === "ok" ? "text-[11px] text-soul/80" : "text-[11px] text-blood"}>
                  {status.text}
                </span>
              )}
            </div>
          </div>
        )}

        <SpriteGallery />
      </div>
    </div>
  );
}
