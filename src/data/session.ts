import { db } from './local/db';

/**
 * Owner used for rows created before the user has signed in. On first sign-in
 * every local row is re-owned to the real user id and queued for sync
 * (see sync/adoptLocalRows.ts).
 */
export const LOCAL_OWNER = '00000000-0000-0000-0000-000000000000';

const OWNER_KEY = 'owner_id';

let cachedOwner: string | null = null;

export async function getOwnerId(): Promise<string> {
  if (cachedOwner) return cachedOwner;
  const entry = await db.meta.get(OWNER_KEY);
  cachedOwner = typeof entry?.value === 'string' ? entry.value : LOCAL_OWNER;
  return cachedOwner;
}

export async function setOwnerId(id: string): Promise<void> {
  await db.meta.put({ key: OWNER_KEY, value: id });
  cachedOwner = id;
}

/** Test helper. */
export function resetOwnerCache(): void {
  cachedOwner = null;
}

export function newId(): string {
  return crypto.randomUUID();
}

let lastStamp = 0;

/** Strictly increasing ISO timestamp, so two writes in the same ms still order correctly (LWW). */
export function nowStamp(): string {
  const now = Math.max(Date.now(), lastStamp + 1);
  lastStamp = now;
  return new Date(now).toISOString();
}

/** Standard columns for a new row. */
export function baseColumns(owner: string) {
  const ts = nowStamp();
  return {
    id: newId(),
    owner,
    created_at: ts,
    updated_at: ts,
    server_updated_at: ts,
    deleted_at: null as string | null,
  };
}
