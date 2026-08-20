import React from "react";

export default function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <p className="layernet-label layernet-accent">LayerNet</p>
      <h1 className="text-2xl sm:text-3xl font-bold layernet-title">{title}</h1>
      {subtitle ? <p className="mt-2 layernet-muted max-w-2xl">{subtitle}</p> : null}
    </header>
  );
}
