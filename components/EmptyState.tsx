import React from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmptyState({
  title,
  subtitle,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-[var(--rose-tint)] text-[var(--primary)]">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-[var(--text)]">{title}</p>
      {subtitle ? <p className="mt-1 max-w-sm text-sm text-[var(--muted-text)]">{subtitle}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
