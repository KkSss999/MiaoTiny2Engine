import type { Entity } from "./entity.ts";
import type { World } from "./world.ts";

export type DebugFn = (...args: never[]) => unknown;

/**
 * Debug command registry.
 *
 * ECS introspection (entities/components/counts) belongs in core;
 * game-specific commands (give weapon/teleport/rewards) are registered by the game.
 */
export class DebugRegistry {
  private commands = new Map<string, { run: (...args: unknown[]) => unknown; help: string }>();

  register<A extends unknown[], R>(name: string, run: (...args: A) => R, help = ""): this {
    this.commands.set(name, { run: run as (...args: unknown[]) => unknown, help });
    return this;
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  list(): { name: string; help: string }[] {
    return [...this.commands.entries()].map(([name, cmd]) => ({ name, help: cmd.help }));
  }

  run(name: string, args: unknown[] = []): unknown {
    const cmd = this.commands.get(name);
    if (!cmd) throw new Error(`No debug command: ${name}`);
    return cmd.run(...args);
  }

  /** Attach to a global object for direct invocation by command name. */
  install(target: Record<string, unknown>, key = "__dbg"): void {
    const api: Record<string, unknown> = {};
    for (const [name, cmd] of this.commands) {
      api[name] = (...args: unknown[]) => cmd.run(...args);
    }
    api.help = () => this.list();
    target[key] = api;
  }
}

/** Entity → component-name/value map. */
export function inspectEntity(world: World, entity: Entity): Record<string, unknown> | null {
  const snapshot = world.snapshot(entity);
  if (!snapshot) return null;
  const out: Record<string, unknown> = {};
  for (const { name, value } of snapshot) out[name] = value;
  return out;
}

/** List live entities, optionally filtering by component name. */
export function listEntities(world: World, filter: string[] = []): { entity: Entity; components: string[] }[] {
  const out: { entity: Entity; components: string[] }[] = [];
  for (const entity of world.entities.aliveEntities()) {
    const snapshot = world.snapshot(entity);
    if (!snapshot) continue;
    const names = snapshot.map((s) => s.name);
    if (filter.length > 0 && !filter.every((f) => names.includes(f))) continue;
    out.push({ entity, components: names });
  }
  return out;
}

/** Count instances of each component. */
export function countComponents(world: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const arch of world.allArchetypes) {
    if (arch.size === 0) continue;
    for (const type of arch.types) {
      out[type.name] = (out[type.name] ?? 0) + arch.size;
    }
  }
  return out;
}