/**
 * Kernel: runtime primitives independent of game and data semantics.
 * Event bus/lifetimes, fixed-step loop, input state and seeded randomness.
 */
export * from "./event/index.ts";
export * from "./time/Loop.ts";
export * from "./input/index.ts";
export * from "./rng/index.ts";
