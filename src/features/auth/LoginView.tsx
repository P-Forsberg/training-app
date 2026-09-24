import { useState } from 'react';
import { requestPasswordReset, signInWithPassword, updatePassword } from '@/data/remote/auth';
import { useSyncStore } from '@/data/sync/engine';
import { Block, Button, inputClass } from '@/ui/components';
import { cn } from '@/ui/cn';

const MIN_PASSWORD = 10;

/** The only screen shown until someone on the allowlist has signed in. */
export function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Träning</h1>
      <p className="mt-1 text-sm text-muted">Logga in för att se din plan.</p>
      <Block className="mt-6 p-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!email.trim() || !password) return setMessage({ ok: false, text: 'Fyll i e-post och lösenord.' });
            setBusy(true);
            setMessage(null);
            const r = await signInWithPassword(email, password);
            setBusy(false);
            if (r.error) setMessage({ ok: false, text: r.error });
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-muted">
            E-post
            <input type="email" autoComplete="username" className={cn(inputClass, 'text-left font-normal')} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Lösenord
            <input type="password" autoComplete="current-password" className={cn(inputClass, 'text-left font-normal')} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Loggar in…' : 'Logga in'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage({ ok: false, text: 'Skriv din e-postadress först, sedan kan du få en återställningslänk.' });
              const r = await requestPasswordReset(email);
              setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: `Om adressen har ett konto kommer en länk till ${email}. Öppna den på den här enheten.` });
            }}
          >
            Glömt lösenordet?
          </Button>
          {message && (
            <p role="status" className={cn('text-sm', message.ok ? 'text-muted' : 'text-danger')}>
              {message.text}
            </p>
          )}
        </form>
      </Block>
      <p className="mt-4 text-xs text-muted">Appen är stängd. Bara inbjudna konton kan logga in.</p>
    </main>
  );
}

/** Shown after a password reset link: choose a new password, then continue into the app. */
export function SetPasswordView() {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Nytt lösenord</h1>
      <Block className="mt-6 p-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password.length < MIN_PASSWORD) return setError(`Använd minst ${MIN_PASSWORD} tecken.`);
            if (password !== repeat) return setError('Lösenorden är inte likadana.');
            setBusy(true);
            const r = await updatePassword(password);
            setBusy(false);
            if (r.error) return setError(r.error);
            useSyncStore.setState({ recovery: false });
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-muted">
            Nytt lösenord
            <input type="password" autoComplete="new-password" className={cn(inputClass, 'text-left font-normal')} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Samma lösenord igen
            <input type="password" autoComplete="new-password" className={cn(inputClass, 'text-left font-normal')} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </label>
          <Button type="submit" variant="primary" disabled={busy}>
            Byt lösenord
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      </Block>
    </main>
  );
}
