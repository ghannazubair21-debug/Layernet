"use client";

import React, { useId, useState } from "react";

type DisclosureProps = {
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export default function Disclosure({ summary, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const id = useId();
  const contentId = `${id}-content`;

  return (
    <div>
      <button
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-2 bg-gray-100 rounded"
      >
        {summary}
      </button>

      <div id={contentId} hidden={!open} className="mt-2 p-3 border rounded">
        {children}
      </div>
    </div>
  );
}
