import { LocalStorageAdapter, type StorageAdapter } from "../../core/db/adapters.ts";

/** JSON convenience over the same asynchronous string adapter used by Database. */
export interface SavePort {
  read<T>(key: string): Promise<T | null>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Missing keys return null. Parse, serialization, quota and I/O failures reject. */
export function createSavePort(storage: StorageAdapter): SavePort {
  return {
    async read<T>(key: string): Promise<T | null> {
      const raw = await storage.read(key);
      return raw === null ? null : JSON.parse(raw) as T;
    },
    async write(key: string, value: unknown): Promise<void> {
      const data = JSON.stringify(value);
      if (data === undefined) throw new TypeError("Value is not JSON serializable");
      await storage.write(key, data);
    },
    async remove(key: string): Promise<void> {
      await storage.delete(key);
    },
  };
}

export function createLocalSave(prefix = "cbb"): SavePort {
  return createSavePort(new LocalStorageAdapter(`${prefix}:`));
}
