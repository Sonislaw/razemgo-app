interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
interface Manifest {
  version: 1;
  generation: string;
  count: number;
}
const CHUNK_SIZE = 400; // At most 1600 UTF-8 bytes, including non-ASCII metadata.

/** Commit a manifest last so an interrupted write never replaces a valid session. */
export function createChunkedStorage(store: KeyValueStorage): KeyValueStorage {
  let queue: Promise<unknown> = Promise.resolve();
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }
  async function manifest(key: string): Promise<Manifest | null> {
    const raw = await store.getItem(key + '.manifest');
    if (!raw) return null;
    const value = JSON.parse(raw) as Manifest;
    if (
      value.version !== 1 ||
      !/^[a-z0-9-]+$/.test(value.generation) ||
      !Number.isInteger(value.count) ||
      value.count < 1 ||
      value.count > 1000
    )
      throw new Error('Nie udało się odczytać zapisanej sesji.');
    return value;
  }
  async function clean(key: string, value: Manifest | null) {
    if (!value) return;
    await Promise.allSettled(
      Array.from({ length: value.count }, (_, i) =>
        store.removeItem(`${key}.${value.generation}.${i}`),
      ),
    );
  }
  return {
    getItem: (key) =>
      run(async () => {
        const value = await manifest(key);
        if (!value) return null;
        const parts = await Promise.all(
          Array.from({ length: value.count }, (_, i) =>
            store.getItem(`${key}.${value.generation}.${i}`),
          ),
        );
        if (parts.some((part) => part === null))
          throw new Error(
            'Zapis sesji jest niekompletny. Zaloguj się ponownie.',
          );
        return parts.join('');
      }),
    setItem: (key, data) =>
      run(async () => {
        const previous = await manifest(key);
        const chunks: string[] = [];
        for (let start = 0; start < data.length;) {
          let end = Math.min(start + CHUNK_SIZE, data.length);
          const last = data.charCodeAt(end - 1);
          if (end < data.length && last >= 0xd800 && last <= 0xdbff) end--;
          chunks.push(data.slice(start, end));
          start = end;
        }
        if (!chunks.length) chunks.push('');
        const value: Manifest = {
          version: 1,
          generation: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
          count: chunks.length,
        };
        if (value.count > 1000)
          throw new Error('Przekroczono rozmiar zapisu sesji.');
        try {
          for (let i = 0; i < value.count; i++)
            await store.setItem(`${key}.${value.generation}.${i}`, chunks[i]);
          await store.setItem(key + '.manifest', JSON.stringify(value));
        } catch (error) {
          await clean(key, value);
          throw error;
        }
        await clean(key, previous);
      }),
    removeItem: (key) =>
      run(async () => {
        let previous: Manifest | null = null;
        try {
          previous = await manifest(key);
        } catch { /* A damaged manifest must not prevent removing the session. */ }
        // Failure to actually remove the manifest remains an error.
        await store.removeItem(key + '.manifest');
        await clean(key, previous);
      }),
  };
}
