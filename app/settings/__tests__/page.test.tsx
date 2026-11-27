import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/settings/page";
import { transactionService } from "@/lib/transactionService";

describe("Settings local transaction storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("reports a local-storage clear failure without claiming the vault was cleared", async () => {
    window.localStorage.setItem("layernet-transactions", JSON.stringify([{
      transactionId: "tx-settings-test",
      timestamp: "2026-09-01T10:00:00.000Z",
      amount: 25,
      type: "Purchase",
      riskScore: 12,
      risk: "Low",
      status: "Cleared",
    }]));
    vi.spyOn(transactionService, "clear").mockRejectedValueOnce(new Error("storage unavailable"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ configured: false }) }));
    const user = userEvent.setup();

    render(<SettingsPage />);
    const clearButton = await screen.findByRole("button", { name: "Clear local vault" });
    await waitFor(() => expect(clearButton).toBeEnabled());
    await user.click(clearButton);
    await user.click(screen.getByRole("button", { name: "Yes, clear everything" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Local data could not be cleared. Check browser storage permissions and try again.",
    );
    expect(screen.getByText("Delete all 1 saved records? This cannot be undone.")).toBeInTheDocument();
    expect(screen.queryByText("Local vault cleared.")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("layernet-transactions")).not.toBeNull();
  });

  it("preserves unreadable local history and allows an explicit clear", async () => {
    window.localStorage.setItem("layernet-transactions", "{not-json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ configured: false }) }));
    const user = userEvent.setup();

    render(<SettingsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Existing local data was left unchanged.");
    // The count is rendered in its own <span> inside a longer paragraph, so match the paragraph's full text.
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "P" &&
        (element.textContent ?? "").startsWith("Unavailable analyzed records are stored in this browser only."),
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear local vault" }));
    expect(screen.getByText("The saved records could not be read. Delete the local transaction store? This cannot be undone.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, clear everything" }));

    expect(await screen.findByText("Local vault cleared.")).toBeInTheDocument();
    expect(window.localStorage.getItem("layernet-transactions")).toBeNull();
  });
});
