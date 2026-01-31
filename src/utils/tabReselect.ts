export type BottomTabName = 'index' | 'finance' | 'ai' | 'add';

type Listener = () => void;

const listenersByTab: Record<BottomTabName, Set<Listener>> = {
  index: new Set(),
  finance: new Set(),
  ai: new Set(),
  add: new Set(),
};

export function emitTabReselect(tab: BottomTabName) {
  // Copy to array in case a listener unsubscribes while iterating.
  Array.from(listenersByTab[tab]).forEach((cb) => {
    try {
      cb();
    } catch {
      // Intentionally ignore listener errors.
    }
  });
}

export function onTabReselect(tab: BottomTabName, cb: Listener) {
  listenersByTab[tab].add(cb);
  return () => {
    listenersByTab[tab].delete(cb);
  };
}

