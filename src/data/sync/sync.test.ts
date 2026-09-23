import { beforeEach, describe, expect, it } from 'vitest';
import { createShoe, logFreeRun, updateLoggedRun } from '../commands/logging';
import { db } from '../local/db';
import type { RemoteError, RemoteStore } from '../remote/remoteStore';
import type { SyncedTable } from '../rows';
import { LOCAL_OWNER, resetOwnerCache, setOwnerId } from '../session';
import { adoptLocalRows } from './adoptLocalRows';
import { MAX_ATTEMPTS, pullAll, pushOutbox } from './syncCore';

const USER = '11111111-1111-4111-8111-111111111111';

/** In-memory server with the same LWW rule as the Postgres trigger. */
class FakeServer implements RemoteStore {
  tables = new Map<string, Map<string, Record<string, unknown>>>();
  clock = Date.parse('2026-10-01T00:00:00Z');
  offline = false;
  rejectIds = new Set<string>();
  upserts = 0;

  table(t: string) {
    if (!this.tables.has(t)) this.tables.set(t, new Map());
    return this.tables.get(t)!;
  }

  async upsert(table: SyncedTable, rows: Record<string, unknown>[]): Promise<RemoteError | null> {
    if (this.offline) return { transient: true, message: 'Failed to fetch' };
    if (rows.some((r) => this.rejectIds.has(r.id as string))) return { transient: false, message: 'violates check constraint', code: '23514' };
    this.upserts++;
    for (const r of rows) {
      const existing = this.table(table).get(r.id as string);
      if (existing && Date.parse(r.updated_at as string) < Date.parse(existing.updated_at as string)) continue;
      this.table(table).set(r.id as string, { ...r, server_updated_at: new Date(this.clock++).toISOString() });
    }
    return null;
  }

  async pull(table: SyncedTable, since: string, limit: number) {
    if (this.offline) return { rows: [], error: { transient: true, message: 'Failed to fetch' } };
    const rows = [...this.table(table).values()]
      .filter((r) => (r.server_updated_at as string) > since)
      .sort((a, b) => (a.server_updated_at as string).localeCompare(b.server_updated_at as string))
      .slice(0, limit);
    return { rows, error: null };
  }
}

async function fresh() {
  db.close();
  await db.delete();
  await db.open();
  resetOwnerCache();
  await setOwnerId(USER);
}

describe('sync: outbox', () => {
  beforeEach(fresh);

  it('local writes land in the outbox and are pushed parent-first, then cleared', async () => {
    const server = new FakeServer();
    const shoe = await createShoe({ name: 'Testsko' });
    await logFreeRun('2026-10-05', { distance_km: 10, shoe_id: shoe });
    expect(await db.outbox.count()).toBe(3);

    const result = await pushOutbox(server, USER);
    expect(result).toEqual({ pushed: 3, failed: 0 });
    expect(await db.outbox.count()).toBe(0);
    expect(server.table('logged_runs').size).toBe(1);
    expect(server.table('logged_sessions').size).toBe(1);
  });

  it('several edits of one row collapse to its latest version', async () => {
    const server = new FakeServer();
    const id = await logFreeRun('2026-10-05', { distance_km: 5 });
    await updateLoggedRun(id, { distance_km: 6 });
    await updateLoggedRun(id, { distance_km: 7 });
    await pushOutbox(server, USER);
    const runs = [...server.table('logged_runs').values()];
    expect(runs).toHaveLength(1);
    expect(runs[0]!.distance_km).toBe(7);
  });

  it('never pushes server-only columns', async () => {
    const server = new FakeServer();
    await createShoe({ name: 'Testsko' });
    const entry = (await db.outbox.toArray())[0]!;
    expect(entry.payload).not.toHaveProperty('server_updated_at');
    await pushOutbox(server, USER);
  });
});

describe('sync: offline', () => {
  beforeEach(fresh);

  it('keeps the queue intact while offline and pushes when back online', async () => {
    const server = new FakeServer();
    server.offline = true;
    await logFreeRun('2026-10-05', { distance_km: 12 });
    const offline = await pushOutbox(server, USER);
    expect(offline.transientError).toBeDefined();
    expect(await db.outbox.count()).toBe(2);
    expect((await db.outbox.toArray()).every((e) => e.attempts === 0)).toBe(true);

    server.offline = false;
    const online = await pushOutbox(server, USER);
    expect(online.pushed).toBe(2);
    expect(await db.outbox.count()).toBe(0);
  });

  it('a permanently rejected row goes to dead letter after max attempts without blocking others', async () => {
    const server = new FakeServer();
    const bad = await createShoe({ name: 'Trasig' });
    await createShoe({ name: 'Bra' });
    server.rejectIds.add(bad);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await pushOutbox(server, USER);
    expect(server.table('shoes').size).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.dead_letter.count()).toBe(1);
  });

  it('pull while offline reports a transient error and changes nothing', async () => {
    const server = new FakeServer();
    server.offline = true;
    const r = await pullAll(server);
    expect(r.transientError).toBeDefined();
    expect(await db.sync_cursors.count()).toBe(0);
  });
});

describe('sync: conflicts', () => {
  beforeEach(fresh);

  it('pull brings in rows from another device', async () => {
    const server = new FakeServer();
    await server.upsert('shoes', [
      {
        id: 'aaaaaaaa-0000-4000-8000-000000000001',
        owner: USER,
        name: 'Från annan enhet',
        surface_type: 'trail',
        start_km: 0,
        retire_km: 600,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]);
    await pullAll(server);
    expect((await db.shoes.toArray()).map((s) => s.name)).toEqual(['Från annan enhet']);
  });

  it('last write wins: a newer remote edit replaces an older local row', async () => {
    const server = new FakeServer();
    const id = await createShoe({ name: 'Lokal' });
    await pushOutbox(server, USER);
    const remote = server.table('shoes').get(id)!;
    await server.upsert('shoes', [{ ...remote, name: 'Nyare på annan enhet', updated_at: '2099-01-01T00:00:00.000Z' }]);
    await pullAll(server);
    expect((await db.shoes.get(id))!.name).toBe('Nyare på annan enhet');
  });

  it('an older remote version never overwrites a newer local row', async () => {
    const server = new FakeServer();
    const id = await createShoe({ name: 'Ny lokalt' });
    const local = (await db.shoes.get(id))!;
    await server.upsert('shoes', [{ ...local, name: 'Gammal', updated_at: '2000-01-01T00:00:00.000Z' }]);
    await db.outbox.clear();
    await pullAll(server);
    expect((await db.shoes.get(id))!.name).toBe('Ny lokalt');
  });

  it('a pending local write is not overwritten by pull, and the server keeps the newest', async () => {
    const server = new FakeServer();
    const id = await createShoe({ name: 'A' });
    await pushOutbox(server, USER);
    await db.shoes.update(id, { name: 'B lokal' });
    // Another device writes an older edit to the server.
    const remote = server.table('shoes').get(id)!;
    await server.upsert('shoes', [{ ...remote, name: 'C annan', updated_at: new Date(Date.parse(remote.updated_at as string) + 1).toISOString() }]);
    const { updateShoe } = await import('../commands/logging');
    await updateShoe(id, { name: 'D lokal senast' });
    await pullAll(server);
    expect((await db.shoes.get(id))!.name).toBe('D lokal senast');
    await pushOutbox(server, USER);
    expect(server.table('shoes').get(id)!.name).toBe('D lokal senast');
  });

  it('logged sessions from two devices are both kept, never merged', async () => {
    const server = new FakeServer();
    await logFreeRun('2026-10-05', { distance_km: 8 });
    await pushOutbox(server, USER);
    // Device B logged the same day independently.
    await server.upsert('logged_sessions', [
      {
        id: 'bbbbbbbb-0000-4000-8000-000000000001',
        owner: USER,
        planned_session_id: null,
        date: '2026-10-05',
        type: 'run',
        title: null,
        status: 'done',
        moved_from: null,
        feel: null,
        rpe: null,
        comment: null,
        created_at: '2026-10-05T10:00:00.000Z',
        updated_at: '2026-10-05T10:00:00.000Z',
        deleted_at: null,
      },
    ]);
    await pullAll(server);
    expect(await db.logged_sessions.where('date').equals('2026-10-05').count()).toBe(2);
  });
});

describe('sync: adopting rows created before sign-in', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    resetOwnerCache();
  });

  it('re-owns local rows and queues them for the real user', async () => {
    await logFreeRun('2026-10-05', { distance_km: 3 });
    expect((await db.logged_sessions.toArray())[0]!.owner).toBe(LOCAL_OWNER);
    await adoptLocalRows(LOCAL_OWNER, USER);
    expect((await db.logged_sessions.toArray())[0]!.owner).toBe(USER);
    const server = new FakeServer();
    const r = await pushOutbox(server, USER);
    expect(r.pushed).toBe(2);
  });
});
