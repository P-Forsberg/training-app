/** Tiny event bus so commit() can wake the sync engine without importing it. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onLocalWrite(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function notifyLocalWrite(): void {
  for (const l of listeners) l();
}
