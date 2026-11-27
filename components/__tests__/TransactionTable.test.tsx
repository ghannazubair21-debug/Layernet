import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("keeps row semantics and exposes a keyboard-operable details button per record", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<TransactionTable transactions={rows} onRowClick={onRowClick} />);
    const table = screen.getByRole("table");

    expect(within(table).getAllByRole("row")).toHaveLength(rows.length + 1);
    const button = within(table).getByRole("button", { name: "View details for TX-REVIEW" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "TX-REVIEW" }));
  });

  it("shows the recorded currency and UNKNOWN for legacy records without a currency", () => {
    render(<TransactionTable transactions={[{ ...rows[0], currency: "PKR" }, { ...rows[1] }]} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("PKR 250.00")).toBeInTheDocument();
    expect(within(table).getByText("250.00 UNKNOWN")).toBeInTheDocument();
  });
});
