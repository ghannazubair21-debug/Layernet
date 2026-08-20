import React from "react";

export default function MetricCard({ title, value, delta }: { title: string; value: string | number; delta?: string }) {
  return (
    <div className="layernet-card p-4">
      <p className="layernet-label">{title}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-2xl font-bold text-[var(--text)]">{value}</span>
        {delta ? <span className="text-sm text-[var(--muted-text)]">{delta}</span> : null}
      </div>
    </div>
  );
}
