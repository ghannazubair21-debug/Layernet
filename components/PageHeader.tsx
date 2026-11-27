import React from "react";

export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="ln-enter mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <p className="layernet-label layernet-accent">{eyebrow}</p> : null}
        <h1 className="ln-display text-2xl text-[var(--text)] sm:text-[28px]">{title}</h1>
        {subtitle ? <p className="max-w-2xl text-sm text-[var(--muted-text)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
