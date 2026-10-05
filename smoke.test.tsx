import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
// Verify @/ path alias resolves correctly (ESM import only)
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
    // Transaction is a type; having this import compile confirms the alias works
    const sample: Transaction = {
      id: "TX-1",
      amount: 100,
      type: "Purchase",
      location: "NYC, NY",
      device: "Web",
      timestamp: "2026-01-01T00:00:00.000Z",
      riskScore: 50,
      risk: "Medium",
      status: "Reviewed",
    };
    expect(sample.id).toBe("TX-1");
  });
});

