import type { RiskLevel, TransactionDecision } from "./types";

/**
 * Score bands for the rules baseline. The risk level is derived from the decision, so a transaction can never
 * be labelled e.g. "Medium risk" while the decision says "Clear". These thresholds are uncalibrated heuristics.
 */
export const REVIEW_THRESHOLD = 60;
export const BLOCK_THRESHOLD = 85;

export function decisionForScore(score: number): TransactionDecision {
  if (score >= BLOCK_THRESHOLD) return "Block";
  if (score >= REVIEW_THRESHOLD) return "Review";
  return "Clear";
}

const RISK_FOR_DECISION: Record<TransactionDecision, RiskLevel> = {
  Clear: "Low",
  Review: "Medium",
  Block: "High",
};

export function riskForScore(score: number): RiskLevel {
  return RISK_FOR_DECISION[decisionForScore(score)];
}
