import React from "react";

export default function RiskBadge({ risk }: { risk: "Low" | "Medium" | "High" }) {
  const base = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold";
  if (risk === "High") return <span className={`${base} text-[var(--danger)] bg-[rgba(248,113,113,0.08)] border border-[var(--border)]`}>High</span>;
  if (risk === "Medium") return <span className={`${base} text-[var(--warning)] bg-[rgba(251,191,36,0.08)] border border-[var(--border)]`}>Medium</span>;
  return <span className={`${base} text-[var(--success)] bg-[rgba(52,211,153,0.08)] border border-[var(--border)]`}>Low</span>;
}
