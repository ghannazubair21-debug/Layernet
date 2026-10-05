import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { Transaction } from "@/lib/types";

describe("smoke test", () => {
  it("renders JSX correctly", () => {
    function Hello() {
      return <div data-testid="hello">Hello LayerNet</div>;
    }

    render(<Hello />);

    expect(screen.getByTestId("hello")).toHaveTextContent("Hello LayerNet");
  });

  it("can import app modules with @/ alias", () => {
    const sample: Transaction = {
      transactionId: "TX-1",
      amount: 100,
      type: "Purchase",
      location: "NYC, NY",
      timestamp: "2026-01-01T00:00:00.000Z",
      riskScore: 50,
      risk: "Medium",
      status: "Reviewed",
    };

    expect(sample.transactionId).toBe("TX-1");
  });
});