import { useDbQuery } from '@/data/live';
import { useState } from 'react';
import { db } from '@/data/local/db';
import { Button } from '@/ui/components';
import { cn } from '@/ui/cn';
import { formatDate } from '@/ui/format';
import { applyProposal, describeDiff, ProposalDiff, rejectProposal, undoProposal } from './proposalDiff';

/** A proposal as a diff card: what changes, why, and Godkänn / Avvisa. Accepted ones can be undone. */
export function ProposalCard({ proposalId }: { proposalId: string }) {
  const proposal = useDbQuery(() => db.proposals.get(proposalId), [proposalId]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!proposal) return null;
  const parsed = ProposalDiff.safeParse(proposal.diff);
  const lines = parsed.success ? describeDiff(parsed.data, (d) => formatDate(d, 'EEE d MMM')) : [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Det gick inte. Försök igen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-accent-soft bg-surface-2 p-3 text-sm">
      <p className="text-xs font-semibold text-accent">Förslag till ändring</p>
      {proposal.rationale && <p className="mt-1">{proposal.rationale}</p>}
      <ul className="mt-2 flex flex-col gap-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className={cn('w-3 font-bold', l.kind === 'add' ? 'text-accent' : l.kind === 'remove' ? 'text-danger' : 'text-muted')}>
              {l.kind === 'add' ? '+' : l.kind === 'remove' ? '−' : '~'}
            </span>
            <span className={cn(l.kind === 'remove' && 'text-muted line-through')}>
              <span className="sr-only">{l.kind === 'add' ? 'Läggs till: ' : l.kind === 'remove' ? 'Tas bort: ' : 'Ändras: '}</span>
              {l.text}
              {l.detail && <span className="block text-xs text-muted">{l.detail}</span>}
            </span>
          </li>
        ))}
        {!parsed.success && <li className="text-danger">Förslaget har ett okänt format och kan inte visas.</li>}
      </ul>
      {error && <p className="mt-2 text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        {proposal.status === 'pending' && parsed.success && (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => applyProposal(proposal.id))}>
              Godkänn
            </Button>
            <Button size="sm" disabled={busy} onClick={() => run(() => rejectProposal(proposal.id))}>
              Avvisa
            </Button>
          </>
        )}
        {proposal.status === 'accepted' && (
          <>
            <span className="self-center text-xs text-muted">Godkänt och inlagt i planen.</span>
            <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => run(() => undoProposal(proposal.id))}>
              Ångra
            </Button>
          </>
        )}
        {proposal.status === 'rejected' && <span className="text-xs text-muted">Avvisat.</span>}
        {proposal.status === 'undone' && <span className="text-xs text-muted">Ångrat. Planen är som innan.</span>}
      </div>
    </div>
  );
}
