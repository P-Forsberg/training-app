import { create } from 'zustand';
import { currentUser, onAuthChange, type AuthUser } from '../remote/auth';
import { isRemoteConfigured } from '../remote/client';
import { supabaseStore } from '../remote/remoteStore';
import { getOwnerId, LOCAL_OWNER, setOwnerId } from '../session';
import { adoptLocalRows, clearUserData } from './adoptLocalRows';
import { onLocalWrite } from './events';
import { pullAll, pushOutbox } from './syncCore';

export type SyncState = 'local-only' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';

interface SyncStore {
  state: SyncState;
  user: AuthUser | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export const useSyncStore = create<SyncStore>(() => ({
  state: isRemoteConfigured() ? 'signed-out' : 'local-only',
  user: null,
  lastSyncedAt: null,
  lastError: null,
}));

const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 1500;

let running: Promise<void> | null = null;
let again = false;
let backoffMs = 0;

/** Runs one push + pull. Concurrent calls are coalesced into one follow-up run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(): Promise<void> {
  const { user } = useSyncStore.getState();
  if (!user) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    useSyncStore.setState({ state: 'offline' });
    return;
  }
  useSyncStore.setState({ state: 'syncing' });
  const owner = await getOwnerId();
  const push = await pushOutbox(supabaseStore, owner);
  if (push.transientError) {
    backoffMs = Math.min(backoffMs ? backoffMs * 2 : 5_000, 5 * 60_000);
    useSyncStore.setState({ state: 'offline', lastError: push.transientError });
    return;
  }
  const pull = await pullAll(supabaseStore);
  if (pull.transientError) {
    useSyncStore.setState({ state: 'offline', lastError: pull.transientError });
    return;
  }
  backoffMs = 0;
  useSyncStore.setState({
    state: push.failed ? 'error' : 'idle',
    lastSyncedAt: new Date().toISOString(),
    lastError: push.failed ? `${push.failed} ändringar kunde inte sparas på servern. Se Inställningar.` : null,
  });
}

async function handleUser(user: AuthUser | null): Promise<void> {
  if (!user) {
    const owner = await getOwnerId();
    if (owner !== LOCAL_OWNER) {
      // Signed out: the device keeps no data of the previous user.
      await clearUserData();
      await setOwnerId(LOCAL_OWNER);
    }
    useSyncStore.setState({ user: null, state: isRemoteConfigured() ? 'signed-out' : 'local-only' });
    return;
  }
  const previous = await getOwnerId();
  await adoptLocalRows(previous, user.id);
  useSyncStore.setState({ user, state: 'idle' });
  await syncNow();
}

/** Starts background sync. Returns a cleanup function. Safe to call without Supabase config. */
export function startSync(): () => void {
  if (!isRemoteConfigured()) return () => {};
  let debounce: number | undefined;
  let timer: number | undefined;

  const schedule = (ms = DEBOUNCE_MS) => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void syncNow(), ms);
  };
  const tick = () => {
    void syncNow();
    timer = window.setTimeout(tick, INTERVAL_MS + backoffMs);
  };

  void currentUser().then(handleUser);
  const offAuth = onAuthChange((u) => {
    if (u?.id !== useSyncStore.getState().user?.id) void handleUser(u);
  });
  const offWrite = onLocalWrite(() => schedule());
  const onOnline = () => schedule(200);
  const onVisible = () => document.visibilityState === 'visible' && schedule(200);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  timer = window.setTimeout(tick, INTERVAL_MS);

  return () => {
    offAuth();
    offWrite();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearTimeout(debounce);
    window.clearTimeout(timer);
  };
}
