import { INTENT_LABEL, QUALITY, type IntentInfo } from '@/domain/sessionIntent';
import { cn } from './cn';

/**
 * Run type as a label. Quality sessions are filled with the accent so they
 * stand out in the week; long runs are outlined; easy runs stay quiet.
 */
export function IntentChip({ info, className }: { info: IntentInfo; className?: string }) {
  const quality = QUALITY.has(info.intent);
  return (
    <span
      title={info.source === 'default' ? 'Tolkat: övriga pass i en vecka med namngivna kvalitetspass' : undefined}
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        quality && 'bg-accent text-accent-fg',
        info.intent === 'long' && 'border border-accent text-accent',
        info.intent === 'easy' && 'border border-line font-normal text-muted',
        className,
      )}
    >
      {INTENT_LABEL[info.intent]}
    </span>
  );
}
