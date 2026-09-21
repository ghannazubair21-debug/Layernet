"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import SmartActionButton, {
  type SmartActionButtonState,
} from "@/components/SmartActionButton";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<SmartActionButtonState, string> = {
  idle: "Idle — ready to analyze",
  loading: "Loading — analyzing transaction...",
  success: "Success — analysis complete",
  error: "Error — analysis failed, click to retry",
  disabled: "Disabled",
};

export default function MicroInteractionsPage() {
  const [forceMode, setForceMode] = useState<"random" | "success" | "error">(
    "random",
  );
  const [currentState, setCurrentState] =
    useState<SmartActionButtonState>("idle");

  return (
    <section className="space-y-6">
      <PageHeader
        title="Micro-interactions"
        subtitle="AI fraud analysis action with intentional motion and state feedback."
      />

      {/* State indicator */}
      <div className="layernet-card p-4">
        <p className="layernet-label">Current state</p>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          {STATE_LABELS[currentState]}
        </p>
      </div>

      {/* Main Smart Action Button */}
      <div className="layernet-card p-6">
        <p className="layernet-label">Smart Action Button</p>
        <div className="mt-4 flex items-center justify-center">
          <SmartActionButton
            forceOutcome={forceMode}
            onStateChange={setCurrentState}
          />
        </div>
      </div>

      {/* Demo controls */}
      <div className="layernet-card p-6">
        <p className="layernet-label">Demo controls</p>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          Force a specific outcome to test every state on demand.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setForceMode("random")}
            className={cn(
              "layernet-button",
              forceMode === "random" &&
                "border-[var(--primary)] text-[var(--primary)]",
            )}
          >
            Random (20% failure)
          </button>
          <button
            type="button"
            onClick={() => setForceMode("success")}
            className={cn(
              "layernet-button",
              forceMode === "success" &&
                "border-[var(--primary)] text-[var(--primary)]",
            )}
          >
            Force Success
          </button>
          <button
            type="button"
            onClick={() => setForceMode("error")}
            className={cn(
              "layernet-button",
              forceMode === "error" &&
                "border-[var(--primary)] text-[var(--primary)]",
            )}
          >
            Force Error
          </button>
        </div>
      </div>

      {/* Motion rationale */}
      <div className="layernet-card p-6">
        <p className="layernet-label">Motion rationale</p>
        <ul className="mt-3 space-y-2 text-sm text-[var(--muted-text)]">
          <li>
            • <strong>Hover/focus:</strong> 150ms scale (1.02×) + background
            transition. Transform and opacity are compositor-friendly and avoid
            layout thrashing.
          </li>
          <li>
            • <strong>State transitions:</strong> 250–350ms for smooth
            idle↔loading↔success/error changes. Text and icon swap without
            reflowing the button (fixed min-width/min-height).
          </li>
          <li>
            • <strong>Success:</strong> 300ms opacity pulse to confirm
            completion, then auto-resets to idle after 1.5s.
          </li>
          <li>
            • <strong>Error:</strong> single 500ms shake animation
            (ease-in-out). Skipped entirely when{" "}
            <code>prefers-reduced-motion: reduce</code> is active.
          </li>
          <li>
            • <strong>Reduced motion:</strong> all transforms and animations
            are disabled; state feedback (text, icon, color) is preserved.
            Transitions are shortened to 50ms.
          </li>
        </ul>
      </div>
    </section>
  );
}
