import { describe, expect, it } from "vitest";
import { analyzeTransaction } from "@/lib/fraudAnalysis";
import { BLOCK_THRESHOLD, decisionForScore, REVIEW_THRESHOLD, riskForScore } from "@/lib/riskBands";

describe("risk bands follow the decision", () => {
  it.each([
    [0, "Clear", "Low"],
    [40, "Clear", "Low"],
    [59, "Clear", "Low"],
    [60, "Review", "Medium"],
    [80, "Review", "Medium"],
    [84, "Review", "Medium"],
    [85, "Block", "High"],
    [100, "Block", "High"],
  ] as const)("score %i → %s / %s", (score, decision, risk) => {
    expect(decisionForScore(score)).toBe(decision);
    expect(riskForScore(score)).toBe(risk);
  });

  it("keeps the v1 decision thresholds", () => {
    expect([REVIEW_THRESHOLD, BLOCK_THRESHOLD]).toEqual([60, 85]);
  });

  it("never pairs an elevated risk level with a Clear decision for any score", () => {
    for (let score = 0; score <= 100; score += 1) {
      const pair = `${riskForScore(score)}/${decisionForScore(score)}`;
      expect(["Low/Clear", "Medium/Review", "High/Block"]).toContain(pair);
    }
  });

  it("labels the previously contradictory case (score 48) as Low risk with a Clear decision", () => {
    // 10,000 → 40 points, +8 Web = 48. Under v1 this was "Medium" risk with a "Clear" decision.
    const result = analyzeTransaction({
      transactionId: "TX-BAND-1",
      amount: 10_000,
      currency: "PKR",
      type: "Purchase",
      location: "Lahore, PK",
      channel: "Web",
      timestamp: "2026-11-27T12:00:00.000Z",
    });
    expect(result.riskScore).toBe(48);
    expect(result.decision).toBe("Clear");
    expect(result.risk).toBe("Low");
  });
});
