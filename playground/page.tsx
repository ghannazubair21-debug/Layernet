"use client";

import React, { useState } from "react";
import Modal from "./components/Modal";
import Tabs from "./components/Tabs";
import Disclosure from "./components/Disclosure";

export default function PlaygroundPage() {
  const [isModalOpen, setModalOpen] = useState(false);

  const tabs = [
    { label: "Overview", content: <p>This is an overview of the feature and accessibility notes.</p> },
    { label: "Details", content: <p>Details: keyboard navigation and ARIA patterns are demonstrated here.</p> },
    { label: "Examples", content: <p>Some realistic examples and usage guidance appear here.</p> },
  ];

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Accessible Component Fundamentals — Playground</h1>

      <section className="mb-6">
        <h2 className="text-xl font-medium mb-2">Modal (Dialog)</h2>
        <p className="mb-2">Open the modal to test focus management, Escape to close, and backdrop click to close.</p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-3 py-2 bg-blue-600 text-white rounded"
        >
          Open Modal
        </button>

        <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Demo Modal">
          <p>
            This modal demonstrates focus trapping, aria-modal=&quot;true&quot;, keyboard Escape to close, and returns focus to the
            trigger when closed.
          </p>
          <div className="mt-4">
            <label className="block mb-2">Your name</label>
            <input className="border px-2 py-1 rounded w-full" />
          </div>
        </Modal>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-medium mb-2">Tabs</h2>
        <p className="mb-2">Use ArrowRight, ArrowLeft, Home, End to navigate tabs; selected tab receives focus.</p>
        <Tabs tabs={tabs} />
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-medium mb-2">Disclosure</h2>
        <p className="mb-2">A simple disclosure pattern using aria-expanded and aria-controls.</p>
        <Disclosure summary="Show more info">
          <p>
            This content is revealed by the disclosure button. It has a stable id and can be toggled with Enter or Space
            when the button is focused.
          </p>
        </Disclosure>
      </section>

      <section className="mt-8 p-4 border rounded bg-gray-50">
        <h3 className="font-semibold mb-2">Keyboard testing</h3>
        <ul className="list-disc pl-5">
          <li>Tab</li>
          <li>Shift + Tab</li>
          <li>Escape</li>
          <li>ArrowLeft</li>
          <li>ArrowRight</li>
          <li>Home</li>
          <li>End</li>
        </ul>
      </section>
    </main>
  );
}
