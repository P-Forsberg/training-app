import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { href } from '@/app/router';
import { exportBackup, importBackup } from '@/data/commands/backup';
import { updateProfile } from '@/data/commands/logging';
import { deleteProgram, setActiveProgram, shiftProgram, updateProgram } from '@/data/commands/program';
import { lastUndoableBatch, undoBatch } from '@/data/commands/undo';
import { db } from '@/data/local/db';
import { sendMagicLink, signInWithProvider, signOut } from '@/data/remote/auth';
import { useOutboxCounts, usePrograms } from '@/data/repository';
import { getOwnerId } from '@/data/session';
import { discardFailed, retryFailed } from '@/data/sync/deadLetter';
import { syncNow, useSyncStore, type SyncState } from '@/data/sync/engine';
import { todayIso } from '@/domain/dates';
import { Block, Button, Chip, Field, inputClass, Segmented } from '@/ui/components';
import { cn } from '@/ui/cn';
import { formatDate } from '@/ui/format';
import { PageHeader } from '@/ui/PageHeader';
import { THEME_LABELS, type ThemeSetting } from '@/ui/theme';
import { ShareProgram } from './ShareProgram';

const SYNC_LABEL: Record<SyncState, string> = {
  'local-only': 'Bara på den här enheten',
  'signed-out': 'Logga in för att synka',
  idle: 'Synkat',
  syncing: 'Synkar…',
  offline: 'Offline, synkar när nätet är tillbaka',
  error: 'Vissa ändringar kunde inte sparas',
};

export function SettingsView() {
  return (
    <>
      <PageHeader title="Mer" />
      <div className="flex flex-col gap-3">
        <nav className="grid grid-cols-3 gap-2">
          <a className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm" href={href({ name: 'import' })}>
            Importera
          </a>
          <a className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm" href={href({ name: 'shoes' })}>
            Skor
          </a>
          <a className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm" href={href({ name: 'info' })}>
            Info
          </a>
        </nav>
        <Account />
        <Programs />
        <Theme />
        <Backup />
        <SyncStatus />
      </div>
    </>
  );
}

function Account() {
  const { user, state } = useSyncStore();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (state === 'local-only') {
    return (
      <Block className="p-4">
        <h2 className="text-[15px] font-semibold">Konto</h2>
        <p className="mt-1 text-sm text-muted">Synk är inte konfigurerad i den här versionen. Allt sparas på den här enheten.</p>
      </Block>
    );
  }

  return (
    <Block className="p-4">
      <h2 className="text-[15px] font-semibold">Konto</h2>
      {user ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-sm">{user.email}</span>
          <Button size="sm" className="ml-auto" onClick={() => void signOut()}>
            Logga ut
          </Button>
        </div>
      ) : (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage({ ok: false, text: 'Skriv en giltig e-postadress.' });
            const r = await sendMagicLink(email);
            setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: `Länken är skickad till ${email}. Öppna den på den här enheten.` });
          }}
        >
          <p className="text-sm text-muted">Logga in för att synka mellan enheter. Det du redan loggat följer med till kontot.</p>
          <label htmlFor="email" className="sr-only">
            E-post
          </label>
          <input id="email" type="email" autoComplete="email" placeholder="E-post" className={cn(inputClass, 'text-left font-normal')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="primary">
            Skicka inloggningslänk
          </Button>
          <Button onClick={async () => setMessage((await signInWithProvider('google')).error ? { ok: false, text: 'Google-inloggning är inte aktiverad än. Använd e-postlänken.' } : null)}>
            Logga in med Google
          </Button>
          {message && <p className={cn('text-sm', message.ok ? 'text-muted' : 'text-danger')}>{message.text}</p>}
        </form>
      )}
    </Block>
  );
}

function Programs() {
  const programs = usePrograms();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [shift, setShift] = useState('1');
  const [notice, setNotice] = useState<string | null>(null);
  const undoable = useLiveQuery(lastUndoableBatch, []);
  const active = programs?.find((p) => p.is_active) ?? programs?.[0];

  return (
    <Block className="p-4">
      <h2 className="text-[15px] font-semibold">Program</h2>
      {!programs?.length && <p className="mt-1 text-sm text-muted">Inga program än.</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {programs?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{p.name}</span>
            {p.id === active?.id && <Chip accent>Aktivt</Chip>}
            <span className="text-xs text-muted">från {formatDate(p.start_date, 'd MMM yyyy')}</span>
            <span className="ml-auto flex gap-1.5">
              {p.id !== active?.id && (
                <Button size="sm" onClick={() => void setActiveProgram(p.id)}>
                  Använd
                </Button>
              )}
              {confirmDelete === p.id ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await deleteProgram(p.id);
                    setConfirmDelete(null);
                  }}
                >
                  Ta bort programmet
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(p.id)}>
                  Ta bort
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {active && (
        <div className="mt-3 border-t border-line pt-2">
          <Field label="Loppdatum" htmlFor="race-date">
            <input
              id="race-date"
              type="date"
              className={cn(inputClass, 'w-44 font-normal')}
              value={active.race_date ?? ''}
              onChange={(e) => void updateProgram(active.id, { race_date: e.target.value || null })}
            />
          </Field>
          <Field label="Förskjut hela programmet (veckor)" htmlFor="shift">
            <input id="shift" inputMode="numeric" className={cn(inputClass, 'w-16')} value={shift} onChange={(e) => setShift(e.target.value)} />
            <Button
              size="sm"
              onClick={async () => {
                const n = Number(shift);
                if (!Number.isInteger(n) || n === 0) return setNotice('Skriv ett helt antal veckor, till exempel 2 eller -1.');
                await shiftProgram(active.id, n);
                setNotice(`Programmet flyttades ${n} ${Math.abs(n) === 1 ? 'vecka' : 'veckor'}. Loggade pass står kvar på sina datum.`);
              }}
            >
              Förskjut
            </Button>
          </Field>
        </div>
      )}
      {notice && <p className="mt-2 text-sm text-muted">{notice}</p>}
      {undoable && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={async () => {
            await undoBatch(undoable);
            setNotice('Den senaste ändringen i planen är ångrad.');
          }}
        >
          Ångra senaste ändringen i planen
        </Button>
      )}
      {active && <ShareProgram programId={active.id} />}
    </Block>
  );
}

function Theme() {
  const theme = useLiveQuery(async () => (await db.profiles.get(await getOwnerId()))?.theme ?? 'night', []);
  return (
    <Block className="p-4">
      <h2 className="mb-2 text-[15px] font-semibold">Tema</h2>
      <Segmented
        label="Tema"
        options={(Object.keys(THEME_LABELS) as ThemeSetting[]).map((t) => ({ value: t, label: THEME_LABELS[t] }))}
        value={theme}
        onChange={(v) => v && void updateProfile({ theme: v as ThemeSetting })}
      />
    </Block>
  );
}

function Backup() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Block className="p-4">
      <h2 className="text-[15px] font-semibold">Säkerhetskopia</h2>
      <p className="mt-1 text-sm text-muted">En JSON-fil med alla dina program, loggar och skor.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            const blob = new Blob([await exportBackup()], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `traning-${todayIso()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Exportera
        </Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-sm font-semibold text-muted hover:border-accent hover:text-accent">
          Återställ från fil
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const { rows } = await importBackup(await f.text());
                setMessage({ ok: true, text: `${rows} rader återställdes.` });
              } catch (err) {
                setMessage({ ok: false, text: err instanceof Error ? err.message : 'Återställningen misslyckades.' });
              }
            }}
          />
        </label>
      </div>
      {message && <p className={cn('mt-2 text-sm', message.ok ? 'text-muted' : 'text-danger')}>{message.text}</p>}
    </Block>
  );
}

function SyncStatus() {
  const { state, lastSyncedAt, lastError, user } = useSyncStore();
  const counts = useOutboxCounts();
  return (
    <Block className="p-4">
      <h2 className="text-[15px] font-semibold">Synk</h2>
      <p className="mt-1 text-sm">{SYNC_LABEL[state]}</p>
      <p className="text-xs text-muted">
        {counts?.pending ? `${counts.pending} ändringar väntar på att skickas. ` : ''}
        {lastSyncedAt ? `Senast ${new Date(lastSyncedAt).toLocaleString('sv-SE')}.` : ''}
      </p>
      {lastError && state !== 'idle' && <p className="mt-1 text-xs text-muted">{lastError}</p>}
      {!!counts?.failed && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-danger">{counts.failed} ändringar avvisades av servern.</span>
          <Button size="sm" onClick={() => void retryFailed()}>
            Försök igen
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void discardFailed()}>
            Behåll bara lokalt
          </Button>
        </div>
      )}
      {user && (
        <Button size="sm" className="mt-2" onClick={() => void syncNow()}>
          Synka nu
        </Button>
      )}
    </Block>
  );
}
