import { useSyncExternalStore } from "react";
import { hud } from "../game/store";
import { api } from "../game/api";
import { Menu } from "./Menu";

const bar = "h-1.5 rounded-full transition-all duration-150";

export function Hud() {
  const s = useSyncExternalStore(hud.subscribe, hud.get);

  if (s.mode === "menu") return <Menu />;

  const hpPct = Math.max(0, (s.hp / s.maxHp) * 100);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute left-4 top-4 w-64">
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-widest text-bone/40">
          <span>{s.race === "human" ? "HUMAN / 改造者" : "UNDEAD / 刻印者"}</span>
          <span>
            {s.roomType} {s.room}/{s.rooms}
          </span>
        </div>
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-rust/20">
          <div className={bar + " bg-blood"} style={{ width: hpPct + "%" }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] text-bone/40">{s.race === "human" ? "HEAT" : "SOUL"}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={bar + (s.race === "human" ? " bg-brass" : " bg-soul")}
              style={{ width: (s.race === "human" ? s.heat : s.souls) + "%" }}
            />
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: s.maxDashes }).map((_, i) => (
            <div key={i} className={"h-1 w-6 rounded-full " + (i < s.dashes ? "bg-bone" : "bg-bone/15")} />
          ))}
        </div>
      </div>

      <div className="absolute right-4 top-3 text-right text-[11px] text-bone/30">
        <div>击杀 {s.kills}</div>
        <div className="text-bone/20">seed {s.seed}</div>
        <div className="mt-2 text-[10px] text-bone/20">ESC 暂停</div>
      </div>

      {s.mode === "paused" && <PauseOverlay />}
      {(s.over || s.won) && <EndOverlay won={s.won} kills={s.kills} seed={s.seed} />}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-5 bg-void/80 font-mono backdrop-blur-[2px]">
      {children}
    </div>
  );
}

function PauseOverlay() {
  return (
    <Overlay>
      <div className="text-[11px] tracking-[0.5em] text-brass/60">PAUSED</div>
      <div className="text-2xl tracking-[0.3em] text-bone">暂 停</div>
      <div className="mt-2 flex w-56 flex-col gap-2">
        <button onClick={() => api.resume()} className="border border-bone/20 py-2 text-[11px] tracking-[0.3em] text-bone/80 transition hover:border-brass/60 hover:bg-brass/10">
          继续
        </button>
        <button onClick={() => api.restart()} className="border border-bone/10 py-2 text-[11px] tracking-[0.3em] text-bone/50 transition hover:border-bone/30 hover:text-bone/80">
          重开一局
        </button>
        <button onClick={() => api.toMenu()} className="border border-bone/10 py-2 text-[11px] tracking-[0.3em] text-bone/50 transition hover:border-bone/30 hover:text-bone/80">
          回到主菜单
        </button>
      </div>
      <div className="mt-1 text-[10px] tracking-[0.3em] text-bone/20">ESC 继续</div>
    </Overlay>
  );
}

function EndOverlay({ won, kills, seed }: { won: boolean; kills: number; seed: number }) {
  return (
    <Overlay>
      <div className="text-[11px] tracking-[0.5em] text-brass/60">{won ? "CLEARED" : "TERMINATED"}</div>
      <div className="text-2xl tracking-[0.3em] text-bone">{won ? "傀 儡 停 机" : "R.I.P."}</div>
      <div className="mt-1 flex gap-6 text-[11px] text-bone/35">
        <span>击杀 {kills}</span>
        <span>seed {seed}</span>
      </div>
      <div className="mt-3 flex w-56 flex-col gap-2">
        <button onClick={() => api.restart()} className="border border-brass/50 bg-brass/10 py-2 text-[11px] tracking-[0.3em] text-bone/90 transition hover:border-brass hover:bg-brass/20">
          再来一局
        </button>
        <button onClick={() => api.toMenu()} className="border border-bone/10 py-2 text-[11px] tracking-[0.3em] text-bone/50 transition hover:border-bone/30 hover:text-bone/80">
          回到主菜单
        </button>
      </div>
    </Overlay>
  );
}
