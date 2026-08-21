"use client";

import React, { useId, useRef, useState } from "react";

type TabItem = {
  id?: string;
  label: string;
  content: React.ReactNode;
};

type TabsProps = {
  tabs: TabItem[];
  defaultIndex?: number;
};

export default function Tabs({ tabs, defaultIndex = 0 }: TabsProps) {
  const [selected, setSelected] = useState<number>(defaultIndex);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const idBase = useId();

  function focusTab(index: number) {
    const ref = tabRefs.current[index];
    if (ref) ref.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const key = e.key;
    if (key === "ArrowRight") {
      const next = (index + 1) % tabs.length;
      e.preventDefault();
      setSelected(next);
      focusTab(next);
    } else if (key === "ArrowLeft") {
      const next = (index - 1 + tabs.length) % tabs.length;
      e.preventDefault();
      setSelected(next);
      focusTab(next);
    } else if (key === "Home") {
      e.preventDefault();
      setSelected(0);
      focusTab(0);
    } else if (key === "End") {
      e.preventDefault();
      setSelected(tabs.length - 1);
      focusTab(tabs.length - 1);
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      // activate current (we already set selected on navigation in this model)
      setSelected(index);
    }
  }

  return (
    <div>
      <div role="tablist" aria-label="Demo Tabs" className="flex gap-2">
        {tabs.map((tab, i) => {
          const tabId = tab.id ?? `${idBase}-tab-${i}`;
          const panelId = `${idBase}-panel-${i}`;
          return (
            <button
              key={tabId}
              id={tabId}
              role="tab"
              ref={(el) => { tabRefs.current[i] = el; }}
              aria-selected={selected === i}
              aria-controls={panelId}
              tabIndex={selected === i ? 0 : -1}
              className={`px-3 py-1 rounded ${selected === i ? "bg-blue-600 text-white" : "bg-gray-100"}`}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tabs.map((tab, i) => {
          const panelId = `${idBase}-panel-${i}`;
          const tabId = tab.id ?? `${idBase}-tab-${i}`;
          return (
            <div
              key={panelId}
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId}
              hidden={selected !== i}
            >
              <div className="p-3 bg-white border rounded">{tab.content}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
