import type { AudioPort, PlayOptions, SfxId } from "./index.ts";
import { createAssetCatalog, type AssetCatalog, type AudioEntry } from "../assets/manifest.ts";

/**
 * WebAudio 实现：manifest 的 audio 条目 → 懒加载 → AudioBufferSourceNode。
 *
 * 三条必须守住的东西：
 * 1. 浏览器要求用户手势后才能出声：unlock() 之前 play 一律静默，unlocked 如实反映。
 * 2. buffer 按 id 缓存，同一 id 只 fetch + decode 一次；失败也记住，别每次开枪重试。
 * 3. 音量走一条 master GainNode，setVolume 直接改 gain，实时生效。
 *
 * 这一层不认识玩法，只认 manifest 与音频文件；音效 id 从哪来是 bridge 的事。
 */

type AudioContextCtor = typeof AudioContext;

/** Safari 老版本只给 webkitAudioContext */
function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof AudioContext !== "undefined") return AudioContext;
  return (globalThis as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export class WebAudioPlayer implements AudioPort {
  private ctx: AudioContext | null;
  /** 所有声音都汇到这条 gain 上：setVolume 只动它一个 */
  private master: GainNode | null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>();
  /** 加载失败过的 id：素材缺失是常态，记一次就够了 */
  private readonly broken = new Set<string>();
  private volume = 1;
  private disposed = false;

  private readonly assets: AssetCatalog;

  constructor(assets: AssetCatalog = createAssetCatalog({ sprites: [], sheets: [], audio: [] })) {
    this.assets = assets;
    const Ctor = audioContextCtor();
    if (!Ctor) throw new Error("浏览器不支持 WebAudio");
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
  }

  get unlocked(): boolean {
    return !this.disposed && this.ctx?.state === "running";
  }

  /** 在首次 pointerdown / keydown 里调用：只有手势里 resume 才真的能出声 */
  unlock(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed || ctx.state === "running") return;
    void ctx.resume().catch((err: unknown) => {
      console.warn("[audio] 解锁失败，继续静音", err);
    });
  }

  play(id: SfxId, options: PlayOptions = {}): void {
    if (this.disposed || !this.unlocked) return;
    const entry = this.assets.getAudioEntry(id);
    // manifest 里还没有这条音效：静默跳过（现在的常态）
    if (!entry || this.broken.has(entry.id)) return;
    const gain = Math.max(0, options.volume ?? 1) * Math.max(0, entry.volume ?? 1);
    if (gain <= 0) return;
    const rate = clamp(options.rate ?? 1, 0.01, 8);
    void this.start(entry, gain, rate);
  }

  setVolume(master: number): void {
    this.volume = clamp(master, 0, 1);
    if (this.master && !this.disposed) this.master.gain.value = this.volume;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.buffers.clear();
    this.pending.clear();
    this.broken.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (!ctx) return;
    void ctx.close().catch(() => {});
  }

  // ------------------------------------------------------------------- 内部

  private async start(entry: AudioEntry, gain: number, rate: number): Promise<void> {
    const buffer = await this.load(entry);
    const ctx = this.ctx;
    const master = this.master;
    // 等加载的这几毫秒里可能已经 dispose 了
    if (!buffer || !ctx || !master || this.disposed) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    // 每条声音自己的 gain：条目 volume + 调用方 volume 叠乘，不污染 master
    const voice = ctx.createGain();
    voice.gain.value = gain;
    source.connect(voice);
    voice.connect(master);
    source.onended = () => {
      source.disconnect();
      voice.disconnect();
    };
    source.start();
  }

  /** 懒加载 + 缓存；同一 id 的并发请求合并成一次 fetch */
  private load(entry: AudioEntry): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(entry.id);
    if (cached) return Promise.resolve(cached);
    const inflight = this.pending.get(entry.id);
    if (inflight) return inflight;
    const task = this.decode(entry).finally(() => this.pending.delete(entry.id));
    this.pending.set(entry.id, task);
    return task;
  }

  private async decode(entry: AudioEntry): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const res = await fetch(entry.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      if (this.disposed) return null;
      this.buffers.set(entry.id, buffer);
      return buffer;
    } catch (err) {
      this.broken.add(entry.id);
      console.warn(`[audio] 加载失败 ${entry.id}（${entry.src}）`, err);
      return null;
    }
  }
}

export function createWebAudio(assets?: AssetCatalog): AudioPort {
  return new WebAudioPlayer(assets);
}
