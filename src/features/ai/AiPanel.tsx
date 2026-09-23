import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { navigate, type Route } from '@/app/router';
import { callAi } from '@/data/remote/ai';
import type { ProposalRow } from '@/data/rows';
import { loadActiveProgram } from '@/data/repository';
import { syncNow } from '@/data/sync/engine';
import { todayIso } from '@/domain/dates';
import { fromAiProgram, usePendingImport } from '@/features/import/pendingImport';
import { Button, inputClass, Sheet } from '@/ui/components';
import { cn } from '@/ui/cn';
import { buildAiContext } from './context';
import { ProposalCard } from './ProposalCard';
import { storeIncomingProposals } from './proposalDiff';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  proposalIds?: string[];
  programReady?: boolean;
  error?: boolean;
}

const SUGGESTIONS = ['Varför ser veckan ut så här?', 'Jag är förkyld, vad gör jag med veckan?', '45 minuter i dag, bara hantlar, axeln är öm', 'Vilken vikt ska jag ta på böjen?'];

const STORAGE_KEY = 'ai-chat';

function loadHistory(): Message[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as Message[];
  } catch {
    return [];
  }
}

/** Fixed AI button bottom right; opens a panel over half the screen with today's context loaded. */
export function AiPanel({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const setPending = usePendingImport((s) => s.set);
  const date = route.name === 'day' ? route.date : todayIso();

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // ignore
    }
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    try {
      await syncNow(); // the server reads the plan when it builds proposals
      const [context, program] = await Promise.all([buildAiContext(date), loadActiveProgram()]);
      const { data, error } = await callAi<{ text: string; proposals: ProposalRow[]; program: Record<string, unknown> | null }>({
        action: 'chat',
        question: q,
        history,
        context,
        activeProgramId: program?.id ?? null,
      });
      if (error || !data) {
        setMessages((m) => [...m, { role: 'assistant', content: error ?? 'Inget svar.', error: true }]);
        return;
      }
      await storeIncomingProposals(data.proposals);
      if (data.program) setPending(fromAiProgram(data.program, 'ai'));
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.text || 'Klart.', proposalIds: data.proposals.map((p) => p.id), programReady: !!data.program },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Fråga assistenten"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-[max(1rem,calc(50%-17rem))] z-30 grid size-13 place-items-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-black/30"
      >
        <Sparkles size={22} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Assistenten" tall>
        <div className="flex flex-1 flex-col gap-2.5 px-4 pb-2" aria-live="polite">
          {!messages.length && (
            <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
              Jag ser din plan och det du loggat. Fråga om dagens pass, be om ett pass som passar i dag, eller säg till om något krånglar så föreslår jag en ändring. Inget ändras utan att du godkänner.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex flex-col gap-2', m.role === 'user' ? 'items-end' : 'items-start')}>
              <p
                className={cn(
                  'max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2.5 text-sm leading-relaxed',
                  m.role === 'user' ? 'bg-surface-2' : m.error ? 'border border-danger text-danger' : 'border border-accent-soft',
                )}
              >
                {m.content}
              </p>
              {m.proposalIds?.map((id) => (
                <div key={id} className="w-full">
                  <ProposalCard proposalId={id} />
                </div>
              ))}
              {m.programReady && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setOpen(false);
                    navigate({ name: 'import' });
                  }}
                >
                  Granska programmet
                </Button>
              )}
            </div>
          ))}
          {busy && <p className="text-sm text-muted">Tänker…</p>}
          <div ref={end} />
        </div>
        {!messages.length && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => void ask(s)} className="min-h-9 rounded-full border border-line px-3 text-xs text-muted">
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2 border-t border-line px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <label htmlFor="ai-input" className="sr-only">
            Fråga
          </label>
          <input id="ai-input" className={cn(inputClass, 'flex-1 text-left font-normal')} placeholder="Knäet känns ömt i dag…" value={input} onChange={(e) => setInput(e.target.value)} />
          <Button type="submit" variant="primary" disabled={busy || !input.trim()}>
            Fråga
          </Button>
        </form>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" className="mx-4 mb-2 self-start" onClick={() => setMessages([])}>
            Rensa samtalet
          </Button>
        )}
      </Sheet>
    </>
  );
}
