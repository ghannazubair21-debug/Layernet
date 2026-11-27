import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RiskBadge from "@/components/RiskBadge";

describe("RiskBadge", () => {
  it.each(["Low", "Medium", "High"] as const)("shows the %s risk level", (risk) => {
    render(<RiskBadge risk={risk} />);

    expect(screen.getByText(risk)).toBeInTheDocument();
  });
});
