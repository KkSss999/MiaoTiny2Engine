/** Headless entrypoint. Browser adapters are opt-in subpath imports. */
export * as kernel from './core/kernel/index.ts';
export * as db from './core/db/index.ts';
export * as ecs from './core/ecs/index.ts';
export * as agent from './core/agent/index.ts';
export { World, Schedule, defineComponent } from './core/ecs/index.ts';
export { Loop } from './core/kernel/index.ts';
