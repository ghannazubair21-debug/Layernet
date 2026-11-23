import React from "react";
import { cn } from "@/lib/utils";

export type RiskLevel = "Low" | "Medium" | "High";

const RISK_STYLES: Record<RiskLevel, string> = {
  Low: "bg-[var(--success-tint)] text-[var(--success)]",
  Medium: "bg-[var(--warning-tint)] text-[var(--warning)]",
  High: "bg-[var(--danger-tint)] text-[var(--danger)]",
};

const DOT_STYLES: Record<RiskLevel, string> = {
  Low: "bg-[var(--success)]",
  Medium: "bg-[var(--warning)]",
  High: "bg-[var(--danger)]",
};

/** Semantic risk pill. Label text is a pinned test contract — keep Low/Medium/High verbatim. */
export default function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        RISK_STYLES[risk],
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", DOT_STYLES[risk])} />
      {risk}
    </span>
  );
}
