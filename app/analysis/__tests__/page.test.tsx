import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import Page from "@/app/analysis/page";

// Deterministic input: $10,000 Withdrawal on Mobile scores 40 (amount baseline)
// + 15 (Withdrawal) + 5 (Mobile) = 60, plus 12 only when the UTC hour is 00-05.
// Computing the UTC hour here keeps the expectation timezone-independent.
const TIMESTAMP = "2026-01-15T12:00";
const utcHour = new Date(TIMESTAMP).getUTCHours();
const EXPECTED_SCORE = 60 + (utcHour >= 0 && utcHour < 6 ? 12 : 0);

describe("transaction analysis form", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows validation feedback when required fields are missing", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Analyze Transaction" }));

    expect(screen.getByText("Transaction ID is required")).toBeInTheDocument();
    expect(screen.getByText("Amount must be a finite number greater than 0")).toBeInTheDocument();
    expect(screen.getByText("Location is required")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid timestamp")).toBeInTheDocument();
    expect(
      screen.getByText("Fill the form and click Analyze to see the current rules baseline and its evidence."),
    ).toBeInTheDocument();
  });

  it("rejects whitespace-only transaction IDs and locations", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.type(screen.getByLabelText("Transaction ID"), "   ");
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.type(screen.getByLabelText("Location"), "   ");
    fireEvent.change(screen.getByLabelText("Timestamp", { exact: false }), { target: { value: TIMESTAMP } });
    await user.click(screen.getByRole("button", { name: "Analyze Transaction" }));

    expect(screen.getByText("Transaction ID is required")).toBeInTheDocument();
    expect(screen.getByText("Location is required")).toBeInTheDocument();
    expect(screen.queryByText("Transaction analyzed and saved to History.")).not.toBeInTheDocument();
  });

  it("submits valid transaction details and renders the saved rules-baseline result", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.type(screen.getByLabelText("Transaction ID"), "TX-TEST-1");
    await user.type(screen.getByLabelText("Amount"), "10000");
    await user.type(screen.getByLabelText("Location"), "Lagos, NG");
    await user.selectOptions(screen.getByLabelText("Transaction Type"), "Withdrawal");
    await user.selectOptions(screen.getByLabelText("Channel"), "Mobile");
    fireEvent.change(screen.getByLabelText("Timestamp", { exact: false }), { target: { value: TIMESTAMP } });

    await user.click(screen.getByRole("button", { name: "Analyze Transaction" }));

    expect(await screen.findByText("Risk: Medium")).toBeInTheDocument();
    expect(screen.getByText(`Priority score: ${EXPECTED_SCORE}/100`)).toBeInTheDocument();
    expect(screen.getByText(/Decision:/)).toHaveTextContent("Review");
    expect(screen.getByText("Transaction type is Withdrawal: +15 heuristic points.")).toBeInTheDocument();
    expect(screen.getByText("Channel is Mobile: +5 heuristic points.")).toBeInTheDocument();
    expect(screen.getByText("Transaction analyzed and saved to History.")).toBeInTheDocument();
  });
});
