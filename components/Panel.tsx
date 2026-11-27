import React from "react";
import { cn } from "@/lib/utils";

/** Standard V2 surface panel with an optional toolbar row. */
export default function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("layernet-card overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="layernet-label">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-[var(--muted-text)]">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
