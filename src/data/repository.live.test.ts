import { liveQuery } from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { completePlannedSession, toggleInterval } from './commands/logging';
import { importProgram } from './commands/program';
import { db } from './local/db';
import { loadWeek } from './repository';
import { resetOwnerCache } from './session';
import { CanonicalProgram } from '@/import/canonical';
import { parse } from '@/import/adapters/xlsxKullamannen';
import { syntheticKullamannen } from '@/import/fixtures/syntheticKullamannen';

/** Resolves with the first emitted value that satisfies the predicate. */
function waitFor<T>(obs: ReturnType<typeof liveQuery<T>>, pred: (v: T) => boolean, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.unsubscribe();
      reject(new Error('live query did not update'));
    }, ms);
    const sub = obs.subscribe({
      next: (v) => {
        if (pred(v)) {
          clearTimeout(timer);
          sub.unsubscribe();
          resolve(v);
        }
      },
      error: reject,
    });
  });
}

describe('repository live queries', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    resetOwnerCache();
    await importProgram(CanonicalProgram.parse(parse(syntheticKullamannen(2), 'Test.xlsx')));
  });

  it('the week view updates when a run is logged and when intervals are ticked', async () => {
    const obs = liveQuery(() => loadWeek('2026-09-21', '2026-09-30'));
    const first = await waitFor(obs, () => true);
    const wed = first.days[2]!.sessions.find((s) => s.session.type === 'run')!;
    expect(wed.run).toBeUndefined();

    const updated = waitFor(obs, (w) => (w.days[2]!.sessions.find((s) => s.session.type === 'run')!.run?.intervals_done ?? []).length === 2);
    await toggleInterval(wed.session.id, 1);
    await toggleInterval(wed.session.id, 2);
    await updated;

    const done = waitFor(obs, (w) => w.days[2]!.sessions.find((s) => s.session.type === 'run')!.status === 'done');
    await completePlannedSession(wed.session.id, 'done', 10);
    await done;
  });
});
