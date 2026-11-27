import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import Page from "@/app/analysis/page";
import { STORAGE_KEY } from "@/lib/transactionStorage";

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

  it("moves focus to the first invalid field after a failed submit", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Analyze Transaction" }));
    expect(screen.getByLabelText("Transaction ID")).toHaveFocus();

    await user.type(screen.getByLabelText("Transaction ID"), "TX-FOCUS-1");
    await user.click(screen.getByRole("button", { name: "Analyze Transaction" }));
    expect(screen.getByLabelText("Amount")).toHaveFocus();
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

  it("offers a labelled currency selector defaulting to PKR and saves the chosen currency with the amount", async () => {
    const user = userEvent.setup();
    render(<Page />);

    const currency = screen.getByLabelText("Currency");
    expect(currency).toHaveValue("PKR");
    expect(currency).toHaveAccessibleDescription(/No conversion is applied/);

    await user.type(screen.getByLabelText("Transaction ID"), "TX-CUR-UI");
    await user.type(screen.getByLabelText("Amount"), "10000");
    await user.selectOptions(currency, "USD");
    await user.type(screen.getByLabelText("Location"), "Karachi, PK");
    fireEvent.change(screen.getByLabelText("Timestamp", { exact: false }), { target: { value: TIMESTAMP } });
    await user.click(screen.getByRole("button", { name: "Analyze Transaction" }));

    expect(
      await screen.findByText(
        "Amount baseline: USD 10,000.00 contributes 40 points using a log-scaled heuristic on the nominal amount (not currency-adjusted).",
      ),
    ).toBeInTheDocument();
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as Array<{ amount: number; currency?: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ amount: 10000, currency: "USD" });
  });
});
