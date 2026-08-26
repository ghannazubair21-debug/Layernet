import { tool } from "ai";
import { z } from "zod";

export const scoreTransaction = tool({
  description:
    "Analyze a financial transaction and return a structured fraud risk assessment.",

  inputSchema: z.object({
    amount: z
      .number()
      .positive()
      .describe("Transaction amount in USD."),

    country: z
      .string()
      .min(2)
      .max(60)
      .describe("Country where the transaction originated."),

    transactionType: z
      .enum(["purchase", "transfer", "withdrawal", "payment"])
      .describe("Type of financial transaction."),

    unusualActivity: z
      .boolean()
      .describe("Whether the transaction shows unusual activity."),
  }),

  execute: async ({
    amount,
    country,
    transactionType,
    unusualActivity,
  }) => {
    let riskScore = 20;
    const reasons: string[] = [];

    if (amount >= 3000) {
      riskScore += 25;
      reasons.push("High transaction amount");
    }

    if (unusualActivity) {
      riskScore += 35;
      reasons.push("Unusual activity detected");
    }

    if (transactionType === "withdrawal") {
      riskScore += 10;
      reasons.push("Cash withdrawal requires additional review");
    }

    if (country.toLowerCase() === "unknown") {
      riskScore += 10;
      reasons.push("Transaction origin could not be verified");
    }

    riskScore = Math.min(riskScore, 100);

    const riskLevel =
      riskScore >= 70
        ? "high"
        : riskScore >= 40
          ? "medium"
          : "low";

    return {
      riskScore,
      riskLevel,
      transaction: {
        amount,
        country,
        transactionType,
      },
      reasons,
      recommendation:
        riskLevel === "high"
          ? "Review transaction manually"
          : riskLevel === "medium"
            ? "Monitor transaction"
            : "Transaction appears low risk",
    };
  },
});