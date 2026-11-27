import type { Transaction } from "./types";

/**
 * Display labels for the stored local `status` value. That value is derived
 * from the rules decision at analysis time (Clear / Review / Block); no person
 * has reviewed anything. The stored strings stay unchanged for compatibility
 * with existing browser history; only what the UI says changes.
 */
export const RULES_DECISION_LABELS: Record<Transaction["status"], string> = {
  Cleared: "Clear",
  Reviewed: "Needs review",
  Flagged: "Flagged",
};

export const RULES_DECISION_HEADING = "Rules decision";
