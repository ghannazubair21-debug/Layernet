import { beforeEach, describe, expect, it } from "vitest";
import { createBehavioralBaseline } from "@/lib/behavioralBaseline";
import { DEFAULT_CURRENCY, formatAmount, isCurrencyCode, UNKNOWN_CURRENCY_LABEL } from "@/lib/currency";
import { engineerTransactionFeatures } from "@/lib/featureEngineering";
import { analyzeTransaction } from "@/lib/fraudAnalysis";
import { getStoredTransactions, STORAGE_KEY } from "@/lib/transactionStorage";
import type { TransactionRecord } from "@/lib/types";

const base = {
  transactionId: "TX-CUR-1",
  amount: 10_000,
  type: "Withdrawal",
  location: "Lahore, PK",
  channel: "Mobile",
  timestamp: "2026-11-27T12:00:00.000Z",
} as const;

describe("formatAmount", () => {
  it("shows the original currency code and never a $ symbol for unknown currency", () => {
    expect(formatAmount(10_000, "PKR")).toBe("PKR 10,000.00");
    expect(formatAmount(12.5, "USD")).toBe("USD 12.50");
    expect(formatAmount(10_000, undefined)).toBe(`10,000.00 ${UNKNOWN_CURRENCY_LABEL}`);
    expect(formatAmount(10_000, null)).not.toContain("$");
    expect(formatAmount(1, "usd")).toBe(`1.00 ${UNKNOWN_CURRENCY_LABEL}`);
  });

  it("validates ISO 4217 alphabetic codes and defaults the demo currency to PKR", () => {
    expect(DEFAULT_CURRENCY).toBe("PKR");
    expect(isCurrencyCode("PKR")).toBe(true);
    expect(isCurrencyCode("pkr")).toBe(false);
    expect(isCurrencyCode("RUPEES")).toBe(false);
    expect(isCurrencyCode(undefined)).toBe(false);
  });
});

describe("rules baseline v1 with currency", () => {
  it("keeps the score identical for the same nominal amount regardless of currency (formula unchanged)", () => {
    const legacy = analyzeTransaction(base);
    const pkr = analyzeTransaction({ ...base, currency: "PKR" });
    const usd = analyzeTransaction({ ...base, currency: "USD" });
    // 10,000 → floor(10·log10(10000)) = 40, +15 Withdrawal, +5 Mobile = 60 (12:00 UTC adds nothing).
    expect([legacy.riskScore, pkr.riskScore, usd.riskScore]).toEqual([60, 60, 60]);
    expect(pkr.decision).toBe("Review");
    expect(pkr.method).toBe("LayerNet rules baseline v1");
  });

  it("names the original currency in the amount factor and discloses that it is not currency-adjusted", () => {
    const pkr = analyzeTransaction({ ...base, currency: "PKR" });
    expect(pkr.factors[0]).toBe(
      "Amount baseline: PKR 10,000.00 contributes 40 points using a log-scaled heuristic on the nominal amount (not currency-adjusted).",
    );
    expect(pkr.factors.join(" ")).not.toContain("$");
    expect(pkr.limitations.some((item) => item.includes("without exchange-rate adjustment"))).toBe(true);

    const legacy = analyzeTransaction(base);
    expect(legacy.factors[0]).toContain(`10,000.00 ${UNKNOWN_CURRENCY_LABEL}`);
  });
});

describe("amount aggregates never mix currencies", () => {
  const current: TransactionRecord = { ...base, transactionId: "TX-NOW", accountId: "C1", currency: "PKR" };
  const history: TransactionRecord[] = [
    { ...base, transactionId: "TX-P1", accountId: "C1", currency: "PKR", amount: 1_000, timestamp: "2026-11-27T08:00:00.000Z" },
    { ...base, transactionId: "TX-P2", accountId: "C1", currency: "PKR", amount: 3_000, timestamp: "2026-11-27T09:00:00.000Z" },
    { ...base, transactionId: "TX-U1", accountId: "C1", currency: "USD", amount: 900, timestamp: "2026-11-27T10:00:00.000Z" },
    { ...base, transactionId: "TX-L1", accountId: "C1", amount: 50_000, timestamp: "2026-11-27T11:00:00.000Z" },
  ];

  it("uses only same-currency history for mean, std-dev and 24-hour amount, while counts use all records", () => {
    const baseline = createBehavioralBaseline(current, history);
    expect(baseline.historicalTransactionCount).toBe(4);
    expect(baseline.averageAmount).toBe(2_000);
    expect(baseline.amountStandardDeviation).toBe(1_000);

    const features = engineerTransactionFeatures(current, history, baseline);
    expect(features.transactionsLast24Hours).toBe(4);
    expect(features.amountLast24Hours).toBe(4_000);
    expect(features.userBehavior.amountZScore).toBe(8);
  });

  it("reports amount aggregates as unavailable when the current record has no currency", () => {
    const { currency: _omit, ...unknownCurrent } = current;
    void _omit;
    const features = engineerTransactionFeatures(unknownCurrent, history);
    expect(features.amountLast24Hours).toBeNull();
    expect(features.userBehavior.averageAmount).toBeNull();
    expect(features.transactionsLast24Hours).toBe(4);
  });
});

describe("local storage decoding", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a recorded currency, keeps legacy records as unknown and drops malformed codes", () => {
    const stored = [
      { ...base, transactionId: "TX-NEW", currency: "PKR", riskScore: 60, risk: "Medium", status: "Reviewed" },
      { ...base, transactionId: "TX-OLD", riskScore: 60, risk: "Medium", status: "Reviewed" },
      { ...base, transactionId: "TX-BAD", currency: "rupees", riskScore: 60, risk: "Medium", status: "Reviewed" },
    ];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const decoded = getStoredTransactions();
    expect(decoded.map((item) => item.transactionId)).toEqual(["TX-NEW", "TX-OLD", "TX-BAD"]);
    expect(decoded[0].currency).toBe("PKR");
    expect(decoded[1]).not.toHaveProperty("currency");
    expect(decoded[2]).not.toHaveProperty("currency");
  });
});
