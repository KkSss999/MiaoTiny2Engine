import { getManifest, missingImages } from "../engine/assets/index.ts";

/**
 * 资源清单（只读）。
 *
 * 开发页专用：把 content/manifest.json 里的 sprites / sheets / audio 全列出来，
 * 标清尺寸与缺图状态——接美术前一眼看清欠账。
 * 只读：改数据去 content/manifest.json，不在这里写回。
 */
type Tone = "muted" | "ok" | "warn";

type Row = {
  id: string;
  /** 尺寸 / 网格 / 源地址，取决于资源类型 */
  spec: string;
  status: string;
  tone: Tone;
};

const TONE_CLASS: Record<Tone, string> = {
  muted: "text-bone/35",
  ok: "text-soul/80",
  warn: "text-brass/70",
};

function AssetTable({
  label,
  count,
  missing,
  head,
  rows,
  empty,
}: {
  label: string;
  count: number;
  missing?: number;
  head: [string, string, string];
  rows: Row[];
  empty: string;
}) {
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] tracking-[0.4em] text-brass/50">{label}</span>
        <span className="text-[10px] text-bone/25">{count}</span>
        {missing !== undefined && missing > 0 && <span className="text-[10px] text-brass/60">缺图 {missing}</span>}
      </div>

      {rows.length === 0 ? (
        <div className="border border-bone/10 px-3 py-2 text-[11px] text-bone/30">{empty}</div>
      ) : (
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th
                  key={h}
                  className={
                    "border-b border-bone/10 px-2 py-1 text-left text-[10px] font-normal tracking-[0.2em] text-bone/35 " +
                    (i === 0 ? "w-2/5" : i === 1 ? "w-1/3" : "w-1/4")
                  }
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-white/5">
                <td className="truncate border-b border-bone/10 px-2 py-1 text-bone/70">{row.id}</td>
                <td className="truncate border-b border-bone/10 px-2 py-1 text-bone/40" title={row.spec}>
                  {row.spec}
                </td>
                <td
                  className={`truncate border-b border-bone/10 px-2 py-1 ${TONE_CLASS[row.tone]}`}
                  title={row.status}
                >
                  {row.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AssetBrowser() {
  const manifest = getManifest();
  const missing = missingImages();
  const missingTotal = missing.sprites.length + missing.sheets.length;

  const spriteRows: Row[] = manifest.sprites.map((entry) => ({
    id: entry.id,
    spec: entry.size ? `${entry.size[0]} × ${entry.size[1]}` : "—",
    status: entry.image ? `有图 · ${entry.image}` : "缺图",
    tone: entry.image ? "ok" : "warn",
  }));

  const sheetRows: Row[] = manifest.sheets.map((entry) => ({
    id: entry.id,
    spec: `${entry.frameWidth} × ${entry.frameHeight} · ${entry.cols}×${entry.rows} 帧`,
    status: entry.image ? `有图 · ${entry.image}` : "缺图",
    tone: entry.image ? "ok" : "warn",
  }));

  const audioRows: Row[] = manifest.audio.map((entry) => ({
    id: entry.id,
    spec: entry.src,
    status: entry.volume !== undefined ? `未接入 · vol ${entry.volume}` : "未接入",
    tone: "muted",
  }));

  return (
    <section className="mt-6 border-t border-bone/10 pt-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="text-[10px] tracking-[0.4em] text-brass/50">ASSETS</span>
        <span className="text-[10px] text-bone/25">content/manifest.json · 只读</span>
        <span className="text-[10px] text-bone/30">
          {manifest.sprites.length} sprites · {manifest.sheets.length} sheets · {manifest.audio.length} audio
        </span>
        {missingTotal > 0 && <span className="text-[10px] text-brass/70">缺图 {missingTotal}</span>}
      </div>

      <AssetTable
        label="SPRITES"
        count={manifest.sprites.length}
        missing={missing.sprites.length}
        head={["ID", "尺寸", "图片"]}
        rows={spriteRows}
        empty="清单里还没有 sprite"
      />
      <AssetTable
        label="SHEETS"
        count={manifest.sheets.length}
        missing={missing.sheets.length}
        head={["ID", "帧尺寸 · 网格", "图片"]}
        rows={sheetRows}
        empty="清单里还没有图集"
      />
      <AssetTable
        label="AUDIO"
        count={manifest.audio.length}
        head={["ID", "源", "状态"]}
        rows={audioRows}
        empty="清单里还没有音频（音频加载也未实现）"
      />
    </section>
  );
}
