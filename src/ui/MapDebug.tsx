import { useMemo, useState } from "react";
import { generateFloor, checkFloor, type Floor, type RoomNode, type RoomType } from "../game/gen/floor";
import { buildRoom } from "../game/gen/templates";
import { makeRng } from "#core/rng/index.ts";
import { ROOM_W, ROOM_H } from "../game/rooms";

const TYPE_COLOR: Record<RoomType, string> = {
  start: "#39e0c8",
  combat: "#b4552d",
  elite: "#d7263d",
  shop: "#c9a227",
  event: "#7b2fbe",
  rest: "#e8e2d0",
  boss: "#ff2a6d",
};

const TYPE_LABEL: Record<RoomType, string> = {
  start: "起点",
  combat: "战斗",
  elite: "精英",
  shop: "商店",
  event: "事件",
  rest: "休息",
  boss: "BOSS",
};

export function MapDebug() {
  const initial = Number(new URLSearchParams(location.search).get("seed") ?? 1) || 1;
  const [seed, setSeed] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [statsOnly, setStatsOnly] = useState(false);

  const floor = useMemo(() => generateFloor(seed), [seed]);
  const errors = useMemo(() => checkFloor(floor), [floor]);

  const batch = useMemo(() => {
    let bad = 0;
    let rooms = 0;
    let bossDist = 0;
    let cycles = 0;
    let minRooms = 99;
    let maxRooms = 0;
    const reasons = new Map<string, number>();
    const N = 300;
    for (let i = 1; i <= N; i++) {
      const f = generateFloor(i);
      const e = checkFloor(f);
      if (e.length) bad++;
      for (const msg of e) {
        const key = msg.replace(/\d+/g, "N");
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
      }
      rooms += f.nodes.length;
      minRooms = Math.min(minRooms, f.nodes.length);
      maxRooms = Math.max(maxRooms, f.nodes.length);
      const boss = f.nodes.find((n) => n.id === f.bossId);
      bossDist += boss?.dist ?? 0;
      cycles += f.edges.length - f.nodes.length + 1;
    }
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { N, bad, avgRooms: rooms / N, minRooms, maxRooms, avgBossDist: bossDist / N, avgCycles: cycles / N, top };
  }, []);

  const node = floor.nodes.find((n) => n.id === selected) ?? floor.nodes.find((n) => n.type === "combat") ?? floor.nodes[0];
  const roomBuild = useMemo(() => {
    const rng = makeRng(seed * 31 + node.gx * 7 + node.gy * 13);
    return buildRoom(floor.templateOf[node.id] ?? "open", node.doors, rng, node.type);
  }, [floor, node, seed]);

  const xs = floor.nodes.map((n) => n.gx);
  const ys = floor.nodes.map((n) => n.gy);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const CELL = 86;
  const PAD = 60;
  const W = (maxX - minX) * CELL + PAD * 2 + CELL;
  const H = (maxY - minY) * CELL + PAD * 2 + CELL;
  const px = (n: { gx: number }) => PAD + (n.gx - minX) * CELL + CELL / 2;
  const py = (n: { gy: number }) => PAD + (n.gy - minY) * CELL + CELL / 2;

  return (
    <div className="flex h-full w-full gap-6 overflow-auto bg-void p-6 text-bone">
      <div className="flex-1">
        <div className="mb-3 flex items-center gap-3">
          <h1 className="text-lg tracking-widest">地图生成 / DEBUG</h1>
          <input
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 1)}
            className="w-28 rounded border border-bone/20 bg-white/5 px-2 py-1 text-sm outline-none focus:border-bone/50"
          />
          <button
            className="rounded border border-bone/20 px-3 py-1 text-sm hover:bg-white/10"
            onClick={() => setSeed(Math.floor(Math.random() * 99999) + 1)}
          >
            换一张
          </button>
          <button
            className="rounded border border-bone/20 px-3 py-1 text-sm hover:bg-white/10"
            onClick={() => setStatsOnly((v) => !v)}
          >
            {statsOnly ? "显示图" : "只统计"}
          </button>
        </div>

        <div className={"mb-2 text-xs " + (errors.length ? "text-blood" : "text-soul")}>
          {errors.length ? "❌ " + errors.join(" · ") : "✓ 不变量全部通过"}
          <span className="ml-4 text-bone/40">
            房间 {floor.nodes.length} · Boss 距离 {floor.nodes.find((n) => n.id === floor.bossId)?.dist}
          </span>
        </div>

        {!statsOnly && (
          <svg width={W} height={H} className="rounded border border-white/10 bg-[#080b10]">
            {floor.edges.map(([a, b], i) => {
              const na = floor.nodes.find((n) => n.id === a)!;
              const nb = floor.nodes.find((n) => n.id === b)!;
              return <line key={i} x1={px(na)} y1={py(na)} x2={px(nb)} y2={py(nb)} stroke="#2f3b52" strokeWidth={6} />;
            })}
            {floor.nodes.map((n) => (
              <g key={n.id} onClick={() => setSelected(n.id)} style={{ cursor: "pointer" }}>
                <rect
                  x={px(n) - 30}
                  y={py(n) - 30}
                  width={60}
                  height={60}
                  rx={8}
                  fill={n.id === selected ? TYPE_COLOR[n.type] : "#11161f"}
                  stroke={TYPE_COLOR[n.type]}
                  strokeWidth={selected === n.id ? 4 : 2}
                />
                <text x={px(n)} y={py(n) + 4} textAnchor="middle" fontSize={11} fill={n.id === selected ? "#0a0e14" : TYPE_COLOR[n.type]}>
                  {TYPE_LABEL[n.type]}
                </text>
                {n.type === "boss" && (
                  <text x={px(n)} y={py(n) - 40} textAnchor="middle" fontSize={10} fill="#ff2a6d">
                    ◆
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}

        <div className="mt-3 text-xs text-bone/40">
          点房间看内部 · 300 张图校验：失败 {batch.bad}/{batch.N} · 房间数 {batch.minRooms}~{batch.maxRooms}（均 {batch.avgRooms.toFixed(1)}）· Boss 平均距离 {batch.avgBossDist.toFixed(1)} · 平均环数 {batch.avgCycles.toFixed(2)}
          {batch.top.length > 0 && <span className="ml-2 text-blood/70">{batch.top.map(([k, v]) => `${k}×${v}`).join(" · ")}</span>}
        </div>
      </div>

      <div className="w-[520px] shrink-0">
        <div className="mb-2 text-xs text-bone/40">
          {node.id} · {TYPE_LABEL[node.type]} · 门 {node.doors.join("") || "无"} · 模板 {floor.templateOf[node.id]}
        </div>
        <RoomPreview node={node} walls={roomBuild.walls} spawns={roomBuild.spawns} props={roomBuild.props} />
        <div className="mt-2 text-[11px] text-bone/35">尺寸 1800×1100，缩放 {((520 - 24) / ROOM_W).toFixed(2)}×</div>
      </div>
    </div>
  );
}

function RoomPreview({ node, walls, spawns, props }: {
  node: RoomNode;
  walls: { x: number; y: number; w: number; h: number }[];
  spawns: { x: number; y: number }[];
  props: { x: number; y: number; kind: string }[];
}) {
  const S = (520 - 24) / ROOM_W;
  const W = ROOM_W * S;
  const H = ROOM_H * S;
  const gate = (d: string) => {
    if (d === "N") return { x: W / 2 - 26, y: -4, w: 52, h: 12 };
    if (d === "S") return { x: W / 2 - 26, y: H - 8, w: 52, h: 12 };
    if (d === "E") return { x: W - 8, y: H / 2 - 26, w: 12, h: 52 };
    return { x: -4, y: H / 2 - 26, w: 12, h: 52 };
  };
  return (
    <svg width={W} height={H} className="rounded border border-white/10 bg-[#0d1218]">
      <rect x={0} y={0} width={W} height={H} fill="none" stroke="#243041" strokeWidth={2} />
      {walls.map((w, i) => (
        <rect key={i} x={w.x * S} y={w.y * S} width={w.w * S} height={w.h * S} fill="#1b2230" stroke="#2f3b52" strokeWidth={1} />
      ))}
      {spawns.map((s, i) => (
        <circle key={i} cx={s.x * S} cy={s.y * S} r={8} fill="#2a1c24" stroke="#d7263d" strokeWidth={2} />
      ))}
      {props.map((p, i) => (
        <circle key={i} cx={p.x * S} cy={p.y * S} r={7} fill={p.kind === "barrel" ? "#6b2f1c" : "#14453f"} stroke={p.kind === "barrel" ? "#b4552d" : "#39e0c8"} strokeWidth={2} />
      ))}
      {node.doors.map((d) => {
        const g = gate(d);
        return <rect key={d} x={g.x} y={g.y} width={g.w} height={g.h} fill="#39e0c8" />;
      })}
    </svg>
  );
}

export type { Floor };
