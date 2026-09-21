"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Check, AlertCircle, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export type SmartActionButtonState =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "disabled";

export type SmartActionButtonProps = {
  /** Label shown in the idle state. */
  label?: string;
  /**
   * The async action to perform when clicked.
   * If omitted, the component uses an internal simulated analysis.
   */
  onAnalyze?: () => Promise<void>;
  /**
   * Controls the internal simulation outcome (only used when onAnalyze is not provided).
   * - "random" — 20% failure probability with 800–1800ms delay
   * - "success" — always succeeds
   * - "error" — always fails
   */
  forceOutcome?: "success" | "error" | "random";
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Additional class names. */
  className?: string;
  /** Callback fired when the internal state changes. */
  onStateChange?: (state: SmartActionButtonState) => void;
};

const SUCCESS_AUTO_RESET_MS = 1500;
const SIMULATED_DELAY_MIN = 800;
const SIMULATED_DELAY_MAX = 1800;
const SIMULATED_FAILURE_RATE = 0.2;

export default function SmartActionButton({
  label = "Analyze Transaction",
  onAnalyze,
  forceOutcome = "random",
  disabled = false,
  className,
  onStateChange,
}: SmartActionButtonProps) {
  const [state, setState] = useState<SmartActionButtonState>("idle");

  // Keep onStateChange in a ref so we don't need to re-create the effect
  // every time the callback identity changes.
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  // Ref to track the success auto-reset timer so we can clean it up on unmount.
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  // The external `disabled` prop overrides the internal state for rendering.
  // We compute the effective state directly rather than syncing via an effect,
  // which avoids cascading renders.
  const effectiveState: SmartActionButtonState = disabled ? "disabled" : state;

  // Spam-click guard: prevent starting a new analysis while one is in flight
  // or while transitioning out of success.
  const isTransitionLocked = state === "loading" || state === "success";
  const isActionable = !disabled && !isTransitionLocked;

  const setInternalState = (next: SmartActionButtonState) => {
    setState(next);
    onStateChangeRef.current?.(next);
  };

  const runAnalysis = useCallback(async () => {
    if (onAnalyze) {
      return onAnalyze();
    }

    // Internal simulation
    const delay =
      SIMULATED_DELAY_MIN +
      Math.random() * (SIMULATED_DELAY_MAX - SIMULATED_DELAY_MIN);
    await new Promise((r) => setTimeout(r, delay));

    if (forceOutcome === "error") {
      throw new Error("Simulated analysis failure");
    }
    if (forceOutcome === "success") {
      return;
    }

    // Random outcome
    if (Math.random() < SIMULATED_FAILURE_RATE) {
      throw new Error("Simulated analysis failure");
    }
  }, [onAnalyze, forceOutcome]);

  const handleClick = useCallback(async () => {
    // Guard: ignore clicks while loading, transitioning, or disabled
    if (!isActionable) return;

    setInternalState("loading");

    try {
      await runAnalysis();
      setInternalState("success");

      // Auto-reset back to idle after a brief success display
      successTimerRef.current = setTimeout(() => {
        setInternalState("idle");
      }, SUCCESS_AUTO_RESET_MS);
    } catch {
      setInternalState("error");
    }
  }, [isActionable, runAnalysis]);

  // Render helpers
  const renderIcon = () => {
    switch (effectiveState) {
      case "loading":
        return (
          <Loader2
            className="layernet-spin h-4 w-4 shrink-0"
            aria-hidden="true"
          />
        );
      case "success":
        return (
          <Check
            className="h-4 w-4 shrink-0 text-[var(--success)]"
            aria-hidden="true"
          />
        );
      case "error":
        return (
          <AlertCircle
            className="h-4 w-4 shrink-0 text-[var(--danger)]"
            aria-hidden="true"
          />
        );
      case "disabled":
        return (
          <Brain
            className="h-4 w-4 shrink-0 opacity-50"
            aria-hidden="true"
          />
        );
      default:
        return (
          <Brain
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
        );
    }
  };

  const renderLabel = () => {
    switch (effectiveState) {
      case "loading":
        return "Analyzing...";
      case "success":
        return "✓ Analysis Complete";
      case "error":
        return "Retry Analysis";
      case "disabled":
        return label;
      default:
        return label;
    }
  };

  const buttonClasses = cn(
    "layernet-button layernet-button--primary layernet-smart-button",
    "inline-flex items-center justify-center gap-2",
    "min-w-[14rem] min-h-[2.5rem] px-5 py-2.5",
    "text-sm font-medium",
    "focus-visible:outline-none",
    effectiveState === "error" && "layernet-shake",
    effectiveState === "success" && "layernet-success-pulse",
    className,
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === "loading" || isTransitionLocked}
      aria-busy={state === "loading"}
      aria-live="polite"
      className={buttonClasses}
    >
      {renderIcon()}
      <span>{renderLabel()}</span>
    </button>
  );
}
