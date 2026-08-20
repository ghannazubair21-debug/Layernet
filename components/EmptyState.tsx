import React from "react";

export default function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="layernet-card p-6 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {subtitle ? <p className="mt-2 layernet-muted">{subtitle}</p> : null}
    </div>
  );
}
