import { AnalysisResult, Transaction } from "./types";

// Deterministic mock analysis logic: score influenced by amount, location risk, device, and type
const highRiskCountries = ["NG", "PK", "RU", "VN"];

function countryFromLocation(loc: string) {
  const parts = loc.split(",");
  if (!parts[1]) return "US";
  const maybe = parts[1].trim().split(" ")[0];
  return maybe || "US";
}

export function analyzeTransaction(tx: Pick<Transaction, "id" | "amount" | "type" | "location" | "device" | "timestamp">): AnalysisResult {
  const base = Math.min(50, Math.floor(Math.log10(Math.max(1, tx.amount)) * 10));
  let score = base;

  // Type adjustments
  if (tx.type === "Refund") score += 10;
  if (tx.type === "Withdrawal") score += 15;

  // Device adjustments
  if (tx.device === "Mobile") score += 5;
  if (tx.device === "Web") score += 8;
  if (tx.device === "POS") score -= 5;

  // Location adjustments (simple country code search)
  const country = countryFromLocation(tx.location);
  if (highRiskCountries.includes(country)) score += 25;

  // Time window: odd hours (00:00 - 05:00) increases risk
  const date = new Date(tx.timestamp);
  const hour = date.getHours();
  if (hour >= 0 && hour < 6) score += 12;

  // Cap
  score = Math.max(0, Math.min(100, score));

  const probability = Math.round((score / 100) * 1000) / 1000;
  const risk = score >= 80 ? "High" : score >= 40 ? "Medium" : "Low";
  const decision = score >= 85 ? "Block" : score >= 60 ? "Review" : "Clear";

  const factors: string[] = [];
  if (tx.amount > 5000) factors.push("Large transaction amount");
  if (tx.type === "Refund") factors.push("Refund initiated");
  if (tx.device === "Web") factors.push("Web channel activity");
  if (hour >= 0 && hour < 6) factors.push("Transaction at unusual hour");
  if (highRiskCountries.includes(country)) factors.push("High-risk country of origin");
  if (factors.length === 0) factors.push("No obvious risk factors detected in supplied fields");

  const recommendation = decision === "Block" ? "Block and escalate to investigation" : decision === "Review" ? "Mark for manual review" : "Clear the transaction";

  const explanation = `Deterministic mock analysis: base=${base}, score adjustments applied => final ${score}. Factors: ${factors.join(", ")}`;

  return {
    id: tx.id,
    riskScore: score,
    risk: risk as AnalysisResult["risk"],
    probability,
    decision: decision as AnalysisResult["decision"],
    factors,
    recommendation,
    explanation,
  };
}
