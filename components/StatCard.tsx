import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** KPI stat card — real values only, mono numerals, restrained brand accent. */
export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "brand" | "high" | "warning" | "success" | "neutral";
}) {
  const toneClass =
    tone === "high"
      ? "bg-[var(--danger-tint)] text-[var(--danger)]"
      : tone === "warning"
        ? "bg-[var(--warning-tint)] text-[var(--warning)]"
        : tone === "success"
          ? "bg-[var(--success-tint)] text-[var(--success)]"
          : tone === "neutral"
          ? "bg-[var(--surface-strong)] text-[var(--muted-text)]"
          : "bg-[var(--rose-tint)] text-[var(--primary)]";

  return (
    <div className="layernet-card flex items-start gap-3.5 p-4">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneClass)}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="layernet-label">{label}</p>
        <p className="ln-data mt-1 text-[26px] font-semibold leading-none text-[var(--text)]">{value}</p>
        {hint ? <p className="mt-1.5 truncate text-xs text-[var(--muted-text)]">{hint}</p> : null}
      </div>
    </div>
  );
}
