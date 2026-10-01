// A tiny "something changed on this phone" signal. Writes call localChanged(); the sync engine
// listens and pushes shortly after. Kept separate so entry code doesn't depend on network code.

type Listener = () => void;
const listeners = new Set<Listener>();

export function localChanged(): void {
  for (const l of listeners) l();
}

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
