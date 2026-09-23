import { db } from '../local/db';
import { nowStamp } from '../session';
import { notifyLocalWrite } from './events';

/** Moves failed writes back into the outbox for another attempt. */
export async function retryFailed(): Promise<void> {
  await db.transaction('rw', db.outbox, db.dead_letter, async () => {
    const dead = await db.dead_letter.toArray();
    for (const d of dead) {
      await db.outbox.add({ table: d.table, row_id: d.row_id, payload: d.payload, attempts: 0, last_error: null, created_at: nowStamp() });
    }
    await db.dead_letter.clear();
  });
  notifyLocalWrite();
}

/** Drops failed writes. The rows stay on this device but are not sent to the server. */
export async function discardFailed(): Promise<void> {
  await db.dead_letter.clear();
}
