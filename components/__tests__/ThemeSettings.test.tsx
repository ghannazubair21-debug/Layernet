import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import ThemeSettings from "@/components/ThemeSettings";

describe("ThemeSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("persists a selected theme and applies it to the document", async () => {
    const user = userEvent.setup();
    render(<ThemeSettings />);

    await waitFor(() => expect(screen.getByRole("radio", { name: "System" })).toBeChecked());
    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(window.localStorage.getItem("layernet-settings")).toBe(JSON.stringify({ theme: "dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});
