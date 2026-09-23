import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { unshareProgram } from '@/data/commands/program';
import { db } from '@/data/local/db';
import { shareProgramRemote } from '@/data/remote/rpc';
import { syncNow, useSyncStore } from '@/data/sync/engine';
import { Button, inputClass } from '@/ui/components';
import { cn } from '@/ui/cn';

/** Share the active program read-only with another user (partner, coach). */
export function ShareProgram({ programId }: { programId: string }) {
  const user = useSyncStore((s) => s.user);
  const shares = useLiveQuery(
    async () => (await db.program_shares.where('program_id').equals(programId).toArray()).filter((s) => !s.deleted_at && s.owner === user?.id),
    [programId, user?.id],
  );
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!user) return null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="text-sm font-semibold">Dela programmet</h3>
      <p className="text-xs text-muted">Den du delar med kan se planen men inte ändra den.</p>
      <ul className="mt-2 flex flex-col gap-1">
        {shares?.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            {s.shared_with_email ?? 'Delat konto'}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void unshareProgram(s.id)}>
              Sluta dela
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await syncNow();
          const r = await shareProgramRemote(programId, email);
          if (r.error) return setMessage({ ok: false, text: r.error });
          setMessage({ ok: true, text: `Programmet är delat med ${email}.` });
          setEmail('');
          await syncNow();
        }}
      >
        <label htmlFor="share-email" className="sr-only">
          E-post att dela med
        </label>
        <input id="share-email" type="email" placeholder="E-post" className={cn(inputClass, 'flex-1 text-left font-normal')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit">Dela</Button>
      </form>
      {message && <p className={cn('mt-1 text-sm', message.ok ? 'text-muted' : 'text-danger')}>{message.text}</p>}
    </div>
  );
}
