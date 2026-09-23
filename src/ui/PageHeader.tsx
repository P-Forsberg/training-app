import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 -mx-4 flex items-center gap-3 bg-bg/95 px-4 pb-2.5 pt-3.5 backdrop-blur">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex gap-1.5">{actions}</div>}
    </header>
  );
}
