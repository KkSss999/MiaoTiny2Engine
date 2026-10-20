let nextEventId = 0;
const byName = new Map<string, EventToken<unknown>>();

/**
 * 事件类型 = 稳定 id + 名字。
 * 用 token 而不是字符串分派：没有拼写错误、没有字符串哈希、类型可推导。
 */
export interface EventToken<T> {
  readonly id: number;
  readonly name: string;
  /** 仅用于类型推导，运行时不存在 */
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
