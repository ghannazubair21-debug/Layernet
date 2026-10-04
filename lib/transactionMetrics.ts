import type { Transaction } from "./types";

export type TransactionMetrics = {
  total: number;
  nonClearDecisions: number;
  nonClearSharePercent: number | null;
  averagePriorityScore: number | null;
  priorityCounts: Record<Transaction["risk"], number>;
};

/** Summarize saved heuristic decisions. These counts are not fraud labels or model metrics. */
export function summarizeTransactions(transactions: readonly Transaction[]): TransactionMetrics {
  const total = transactions.length;
  const nonClearDecisions = transactions.filter((transaction) => transaction.status !== "Cleared").length;
  const averagePriorityScore = total > 0
    ? Math.round(transactions.reduce((sum, transaction) => sum + transaction.riskScore, 0) / total)
    : null;

  return {
    total,
    nonClearDecisions,
    nonClearSharePercent: total > 0 ? Math.round((nonClearDecisions / total) * 1000) / 10 : null,
    averagePriorityScore,
    priorityCounts: {
      High: transactions.filter((transaction) => transaction.risk === "High").length,
      Medium: transactions.filter((transaction) => transaction.risk === "Medium").length,
      Low: transactions.filter((transaction) => transaction.risk === "Low").length,
    },
  };
}
