import React from "react";

export default function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="layernet-card p-4">
      <p className="layernet-label">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
