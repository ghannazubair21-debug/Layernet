import type { AnalysisResult, RiskLevel, TransactionRecord } from "./types";

const ANALYSIS_METHOD = "LayerNet rules baseline v1";

export function analyzeTransaction(
  tx: Pick<TransactionRecord, "transactionId" | "amount" | "type" | "location" | "channel" | "timestamp">,
): Omit<AnalysisResult, "features" | "behavioralBaseline"> {
  const base = Math.min(50, Math.floor(Math.log10(Math.max(1, tx.amount)) * 10));
  let score = base;
  const factors: string[] = [`Amount baseline: $${tx.amount.toFixed(2)} contributes ${base} points using a log-scaled heuristic.`];

  if (tx.type === "Refund") {
    score += 10;
    factors.push("Transaction type is Refund: +10 heuristic points.");
  }
  if (tx.type === "Withdrawal") {
    score += 15;
    factors.push("Transaction type is Withdrawal: +15 heuristic points.");
  }

  if (tx.channel === "Mobile") {
    score += 5;
    factors.push("Channel is Mobile: +5 heuristic points.");
  }
  if (tx.channel === "Web") {
    score += 8;
    factors.push("Channel is Web: +8 heuristic points.");
  }
  if (tx.channel === "POS") {
    score -= 5;
    factors.push("Channel is POS: −5 heuristic points.");
  }

  // Use UTC consistently: the input has no timezone or account-local timezone.
  const date = new Date(tx.timestamp);
  const hour = date.getUTCHours();
  if (hour >= 0 && hour < 6) {
    score += 12;
    factors.push(`Timestamp is ${date.toISOString()} (UTC hour ${String(hour).padStart(2, "0")}): +12 heuristic points.`);
  }

  // Cap
  score = Math.max(0, Math.min(100, score));

  const risk = score >= 80 ? "High" : score >= 40 ? "Medium" : "Low";
  const decision = score >= 85 ? "Block" : score >= 60 ? "Review" : "Clear";

  const recommendation = decision === "Block" ? "Block and escalate to investigation" : decision === "Review" ? "Mark for manual review" : "Clear the transaction";

  const explanation = `${ANALYSIS_METHOD} produced a priority score of ${score}/100 from the listed input contributions. The score is not a calibrated fraud probability or a trained-model output.`;

  return {
    transactionId: tx.transactionId,
    riskScore: score,
    risk: risk as RiskLevel,
    decision: decision as AnalysisResult["decision"],
    factors,
    recommendation,
    explanation,
    method: ANALYSIS_METHOD,
    scoreMeaning: "An uncalibrated heuristic priority score (0–100), not a fraud probability or model confidence.",
    limitations: [
      "This rules baseline does not use the engineered behavioral features to change its score.",
      "No trained Transformer, XGBoost, Random Forest, or Isolation Forest adapter is registered; no fraud probability is produced.",
      "Location is collected but not scored because no validated location-risk source is configured.",
      "The UTC time rule is a fixed heuristic; account-local timezone is unknown.",
    ],
  };
}
