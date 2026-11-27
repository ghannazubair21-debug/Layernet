import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TransactionTable from "@/components/TransactionTable";
import type { Transaction } from "@/lib/types";

const base = {
  timestamp: "2026-11-27T10:00:00.000Z",
  amount: 250,
  type: "Purchase",
  risk: "Medium",
  riskScore: 43,
} as const;

const rows: Transaction[] = [
  { ...base, transactionId: "TX-CLEAR", status: "Cleared" },
  { ...base, transactionId: "TX-REVIEW", status: "Reviewed" },
  { ...base, transactionId: "TX-FLAG", status: "Flagged" },
];

describe("TransactionTable rules-decision labels", () => {
  it("labels the stored status as a rules decision, never as a human review", () => {
    render(<TransactionTable transactions={rows} />);
    const table = screen.getByRole("table");

    expect(within(table).getByText("Rules decision")).toBeInTheDocument();
    expect(within(table).queryByText("Status")).not.toBeInTheDocument();
    expect(within(table).getByText("Needs review")).toBeInTheDocument();
    expect(within(table).getByText("Clear")).toBeInTheDocument();
    expect(within(table).getByText("Flagged")).toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });
});
