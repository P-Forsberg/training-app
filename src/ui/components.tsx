import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './cn';
import { STATUS_LABEL, type StatusKind } from './status';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg',
        outline: 'border border-line text-muted hover:border-accent hover:text-accent',
        ghost: 'text-muted hover:text-fg',
        danger: 'border border-danger text-danger',
      },
      pressed: { true: '', false: '' },
      size: { md: '', sm: 'min-h-9 px-3 text-xs', icon: 'min-h-11 w-11 px-0' },
    },
    compoundVariants: [{ variant: 'outline', pressed: true, className: 'border-accent text-accent' }],
    defaultVariants: { variant: 'outline', size: 'md', pressed: false },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, pressed, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed ?? undefined}
      className={cn(buttonVariants({ variant, size, pressed }), className)}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

export function Block({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('overflow-hidden rounded-2xl border border-line bg-surface', className)}>{children}</section>;
}

export function BlockHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-3">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {meta != null && <span className="ml-auto text-sm text-muted">{meta}</span>}
      {children}
    </div>
  );
}

export function Rule() {
  return <div className="h-px bg-line" />;
}

export function Chip({ children, accent, className }: { children: ReactNode; accent?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs',
        accent ? 'border-accent-soft text-accent' : 'border-line text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full bg-line', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <span className="block h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-r-xl border-l-[3px] border-accent bg-surface-2 px-3.5 py-3 text-[13.5px] leading-relaxed">
      <b className="mb-0.5 block text-xs font-semibold text-accent">{title}</b>
      <span className="whitespace-pre-line">{children}</span>
    </aside>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 px-6 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <p className="text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function StatusDot({ status, className }: { status: StatusKind; className?: string }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      className={cn(
        'inline-block size-2.5 flex-none rounded-full border-[1.5px]',
        status === 'planned' && 'border-muted',
        status === 'done' && 'border-accent bg-accent',
        status === 'partial' && 'border-accent bg-[linear-gradient(90deg,var(--accent)_50%,transparent_50%)]',
        status === 'skipped' && 'border-muted bg-muted',
        status === 'moved' && 'border-dashed border-accent',
        status === 'missed' && 'border-danger',
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-line py-2 last:border-b-0">
      <label htmlFor={htmlFor} className="flex-1 text-sm text-muted">
        {label}
      </label>
      {hint != null && <span className="text-xs text-muted">{hint}</span>}
      {children}
    </div>
  );
}

export const inputClass =
  'min-h-11 rounded-lg border border-line bg-surface-2 px-3 text-right text-[15px] font-semibold tabular-nums placeholder:font-normal placeholder:text-muted/60';

interface CommitInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  /** Called on blur/Enter when the text changed. Return false to reject and show an error. */
  onCommit: (text: string) => void | boolean | Promise<void | boolean>;
  errorText?: string;
}

/**
 * Text input that saves when the user leaves the field or presses Enter.
 * There is no save button anywhere in the app.
 */
export function CommitInput({ value, onCommit, className, errorText, ...rest }: CommitInputProps) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  const commit = async () => {
    if (text === value) return;
    const ok = await onCommit(text);
    setInvalid(ok === false);
  };

  return (
    <input
      {...rest}
      value={text}
      aria-invalid={invalid || undefined}
      title={invalid ? errorText : rest.title}
      className={cn(inputClass, invalid && 'border-danger', className)}
      onFocus={(e) => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap justify-end gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={cn(
            'min-h-11 min-w-11 rounded-lg border px-2 text-sm',
            value === o.value ? 'border-accent text-accent' : 'border-line text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, 'text-left text-sm font-normal', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  tall?: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A closed sheet must not be reachable by keyboard or screen readers.
    panel.current?.toggleAttribute('inert', !open);
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn('fixed inset-0 z-40 bg-black/50 transition-opacity', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-xl flex-col rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)] outline-none transition-[transform,visibility] duration-300',
          tall ? 'h-[85vh]' : 'max-h-[70vh]',
          // Hidden after the slide-out, so a closed sheet can never be seen or reached.
          open ? 'visible translate-y-0' : 'invisible translate-y-[102%]',
        )}
      >
        <header className="flex items-center gap-3 px-4 pb-2 pt-3">
          <h2 id={id} className="text-[15px] font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={onClose} aria-label="Stäng">
            <X size={20} />
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
