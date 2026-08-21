"use client";

import React, { useEffect, useRef } from "react";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
};

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
];

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll(FOCUSABLE_SELECTORS.join(",")));
  return nodes.filter((n): n is HTMLElement => n instanceof HTMLElement && !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length));
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // capture stable references for cleanup (avoid reading refs in cleanup)
    const rootNode = containerRef.current;
    const bodyChildren = Array.from(document.body.children) as HTMLElement[];

    // mark other page content as hidden to assistive tech to prevent interaction while modal open
    bodyChildren.forEach((child) => {
      if (rootNode && child.contains(rootNode)) return;
      child.setAttribute("aria-hidden", "true");
    });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // move focus into the modal
    if (rootNode) {
      const focusable = getFocusableElements(rootNode);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        rootNode.focus();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!rootNode) return;
        const focusable = getFocusableElements(rootNode);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      bodyChildren.forEach((child) => {
        if (rootNode && child.contains(rootNode)) return;
        child.removeAttribute("aria-hidden");
      });
      document.body.style.overflow = prevOverflow;
      try {
        previouslyFocused.current?.focus();
      } catch {
        // ignore
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center"
      onMouseDown={(e) => {
        // close only when clicking the backdrop (the container wrapper)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        ref={containerRef}
        tabIndex={-1}
        className="relative max-w-lg w-full bg-white rounded shadow-lg p-6 z-10"
      >
        {title && (
          <h2 id="modal-title" className="text-lg font-semibold mb-4">
            {title}
          </h2>
        )}

        <div>{children}</div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
