let nextEventId = 0;
const byName = new Map<string, EventToken<unknown>>();

/**
 * Event type = stable id and name.
 * Dispatch with tokens rather than strings to avoid typos/string hashing and preserve type inference.
 */
export interface EventToken<T> {
  readonly id: number;
  readonly name: string;
  /** Type inference only; absent at runtime. */
  readonly __payload?: T;
}

export function defineEvent<T>(name: string): EventToken<T> {
  const existing = byName.get(name);
  if (existing) return existing as EventToken<T>;
  const token: EventToken<T> = { id: nextEventId++, name };
  byName.set(name, token as EventToken<unknown>);
  return token;
}

export type PayloadOf<T> = T extends EventToken<infer U> ? U : never;
