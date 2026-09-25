import Dexie from 'dexie';
import { useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Reactive local query: runs `query` and runs it again after every write to
 * the local database (Dexie's global "storagemutated" event, which also fires
 * for writes from other tabs).
 *
 * Why not dexie-react-hooks' useLiveQuery: it tracks which rows a query reads
 * through Dexie's async zones, and that tracking is lost in the browser as
 * soon as a query awaits a non-Dexie promise on the way (for example
 * getOwnerId()). Views then silently stopped updating. Re-running on any
 * write is coarser but cannot miss a change; the local tables are small.
 */
export function useDbQuery<T>(query: () => Promise<T>, deps: DependencyList): T | undefined {
  const [state, setState] = useState<{ value: T } | undefined>(undefined);
  const latest = useRef(query);
  latest.current = query;

  useEffect(() => {
    let alive = true;
    let running = false;
    let again = false;

    const run = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const value = await latest.current();
          if (alive) setState({ value });
        } while (again && alive);
      } catch (e) {
        console.error('Local query failed', e);
      } finally {
        running = false;
      }
    };

    void run();
    const onChange = () => void run();
    Dexie.on('storagemutated', onChange);
    return () => {
      alive = false;
      Dexie.on('storagemutated').unsubscribe(onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state?.value;
}
