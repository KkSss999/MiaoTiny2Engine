import type { AudioPort, PlayOptions, SfxId } from "./index.ts";
import { createAssetCatalog, type AssetCatalog, type AudioEntry } from "../assets/manifest.ts";

/**
 * WebAudio: manifest audio entries → lazy loading → AudioBufferSourceNode.
 *
 * Required invariants:
 * 1. A user gesture unlocks audio; play stays silent until then and unlocked reports actual state.
 * 2. Cache buffers by id and coalesce fetch/decode; remember failures instead of retrying every shot.
 * 3. All volume flows through one master GainNode; setVolume changes gain immediately.
 *
 * This layer knows manifests/audio files, not gameplay; a bridge supplies sound ids.
 */

type AudioContextCtor = typeof AudioContext;

/** Older Safari exposes only webkitAudioContext. */
function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof AudioContext !== "undefined") return AudioContext;
  return (globalThis as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export class WebAudioPlayer implements AudioPort {
  private ctx: AudioContext | null;
  /** All sounds feed this gain; setVolume changes only this node. */
  private master: GainNode | null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>();
  /** Remember failed ids so missing assets are only attempted once. */
  private readonly broken = new Set<string>();
  private volume = 1;
  private disposed = false;

  private readonly assets: AssetCatalog;

  constructor(assets: AssetCatalog = createAssetCatalog({ sprites: [], sheets: [], audio: [] })) {
    this.assets = assets;
    const Ctor = audioContextCtor();
    if (!Ctor) throw new Error("Browser does not support WebAudio");
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

  /** Call on the first pointerdown/keydown; resume must run within a gesture to enable audio. */
  unlock(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed || ctx.state === "running") return;
    void ctx.resume().catch((err: unknown) => {
      console.warn("[audio] Unlock failed; audio remains silent", err);
    });
  }

  play(id: SfxId, options: PlayOptions = {}): void {
    if (this.disposed || !this.unlocked) return;
    const entry = this.assets.getAudioEntry(id);
    // Silently skip sounds absent from the manifest.
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

  // ------------------------------------------------------------------- Internals

  private async start(entry: AudioEntry, gain: number, rate: number): Promise<void> {
    const buffer = await this.load(entry);
    const ctx = this.ctx;
    const master = this.master;
    // Disposal may have occurred while loading.
    if (!buffer || !ctx || !master || this.disposed) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    // Per-voice gain multiplies entry/caller volume without changing the master.
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

  /** Lazy cached loading; concurrent requests for one id share a fetch. */
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
      console.warn(`[audio] Load failed for ${entry.id} (${entry.src})`, err);
      return null;
    }
  }
}

export function createWebAudio(assets?: AssetCatalog): AudioPort {
  return new WebAudioPlayer(assets);
}
