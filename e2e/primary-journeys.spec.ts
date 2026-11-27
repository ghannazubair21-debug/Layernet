import { expect, test, type Page } from "@playwright/test";

/**
 * Primary user journeys (Phase 3). External services are never called:
 * - /api/chat is stubbed, and Gemini's host is blocked, so no provider request or cost occurs.
 * - /api/benchmark POST is stubbed for determinism; the real Python replay is verified separately.
 */

async function blockExternalAi(page: Page) {
  await page.route("**/*generativelanguage.googleapis.com/**", (route) => route.abort());
}

/** Dev mode compiles and hydrates on demand; interacting before hydration lets React reset controlled inputs. */
async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => {
  await blockExternalAi(page);
});

test("analysis: validation focus, currency capture, and history details dialog", async ({ page }) => {
  await gotoReady(page, "/analysis");

  await page.getByRole("button", { name: "Analyze Transaction" }).click();
  await expect(page.getByLabel("Transaction ID")).toBeFocused();
  await expect(page.getByLabel("Transaction ID")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Transaction ID is required")).toBeVisible();

  await expect(page.getByLabel("Currency")).toHaveValue("PKR");
  await page.getByLabel("Transaction ID").fill("TX-E2E-PKR-1");
  await page.getByLabel("Amount").fill("25000");
  await page.getByLabel("Location").fill("Karachi, PK");
  await page.getByLabel("Timestamp").fill("2026-01-15T12:00");
  await page.getByRole("button", { name: "Analyze Transaction" }).click();

  await expect(page.getByText("Transaction analyzed and saved to History.")).toBeVisible();
  await expect(page.getByText(/^Amount baseline: PKR 25,000\.00 contributes 43 points/)).toBeVisible();

  await gotoReady(page, "/history");
  const detailsButton = page.getByRole("button", { name: "View details for TX-E2E-PKR-1" });
  await expect(page.getByRole("table").getByText("PKR 25,000.00")).toBeVisible();
  await detailsButton.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Details for TX-E2E-PKR-1" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("PKR 25,000.00")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(detailsButton).toBeFocused();
});

test("history: legacy records without a currency are shown as UNKNOWN, never as USD or PKR", async ({ page }) => {
  await gotoReady(page, "/");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "layernet-transactions",
      JSON.stringify([
        {
          transactionId: "TX-E2E-LEGACY",
          amount: 2500,
          type: "Purchase",
          location: "Lahore, PK",
          channel: "Web",
          timestamp: "2026-11-26T10:00:00.000Z",
          riskScore: 30,
          risk: "Low",
          status: "Cleared",
        },
      ]),
    );
  });
  await gotoReady(page, "/history");
  const table = page.getByRole("table");
  await expect(table.getByText("2,500.00 UNKNOWN")).toBeVisible();
  await expect(table).not.toContainText("$");
});

test("settings: theme choice persists across reloads", async ({ page }) => {
  await gotoReady(page, "/settings");
  await page.getByRole("radio", { name: "Dark" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  const stored = await page.evaluate(() => window.localStorage.getItem("layernet-settings"));
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ theme: "dark" });

  await page.getByRole("radio", { name: "System" }).check();
});

test("benchmark: client validation, loading, results, cancellation and retry", async ({ page }) => {
  let releaseSlow: (() => void) | null = null;
  let call = 0;
  await page.route("**/api/benchmark", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    call += 1;
    if (call === 1) {
      // First run is cancelled by the user while the request is still pending.
      await new Promise<void>((resolve) => {
        releaseSlow = resolve;
      });
      return route.abort().catch(() => undefined);
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        benchmark: "layernet-ulb-benchmark-replay.v1",
        note: "ULB benchmark replay on uploaded dataset rows.",
        row_count: 1,
        labels_present: false,
        // Same shape as the real route: both model families are always returned.
        models: [
          { family: "xgboost", model_version: "stub-xgb", threshold: 0.5, score_meaning: "Uncalibrated.", recorded_test_metrics: null },
          { family: "random_forest", model_version: "stub-rf", threshold: 0.5, score_meaning: "Uncalibrated.", recorded_test_metrics: null },
        ],
        rows: [
          { row: 0, Time: 0, Amount: 10, class: null, xgboost: { score: 0.01, prediction: 0 }, random_forest: { score: 0.02, prediction: 0 } },
        ],
        comparison: {
          agreements: 1,
          agreement_rate: 1,
          positives: { xgboost: 0, random_forest: 0 },
          mean_scores: { xgboost: 0.01, random_forest: 0.02 },
        },
        uploaded_row_metrics: null,
        metrics_note: "Stub: no labels uploaded.",
      }),
    });
  });

  await gotoReady(page, "/benchmark");
  // Scope to <main>: Next.js also renders a role="alert" route announcer.
  const main = page.locator("main");
  const input = page.getByLabel("ULB dataset CSV");

  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(main.getByRole("alert")).toHaveText("Upload a .csv file with genuine ULB dataset rows.");

  await input.setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) });
  await expect(main.getByRole("alert")).toContainText("The selected file is empty.");

  const csv = Buffer.from("Time,Amount\n0,10\n");
  await input.setInputFiles({ name: "rows.csv", mimeType: "text/csv", buffer: csv });
  await expect(main.getByRole("status")).toContainText("Running server-side inference");
  await expect(input).toBeDisabled();
  await page.getByRole("button", { name: "Cancel inference" }).click();
  await expect(page.getByText(/Inference cancelled/)).toBeVisible();
  await expect(input).toBeEnabled();
  (releaseSlow as (() => void) | null)?.();

  // Re-selecting the same file must start a new run (the input value is reset after each pick).
  await input.setInputFiles({ name: "rows.csv", mimeType: "text/csv", buffer: csv });
  await expect(page.getByText("Rows scored")).toBeVisible();
  await expect(main.getByRole("alert")).toHaveCount(0);
  expect(call).toBe(2);
});

test("assistant: opens as a modal, reports a busy server, keeps the conversation and restores focus", async ({ page }) => {
  let chatPosts = 0;
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    chatPosts += 1;
    return route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "Chat service is busy. Retry shortly." }),
    });
  });

  await gotoReady(page, "/dashboard");
  const opener = page.getByRole("button", { name: "AI Assistant" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "AI investigation assistant" });
  await expect(dialog).toBeVisible();

  const message = dialog.getByLabel("Message the AI investigation assistant");
  await message.fill("E2E stub question");
  await message.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("Chat service is busy. Retry shortly.");
  await expect(dialog.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(chatPosts).toBe(1);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(dialog.getByText("E2E stub question")).toBeVisible();
});

test.describe("responsive layouts", () => {
  const pages = ["/", "/dashboard", "/analysis", "/analytics", "/history", "/benchmark", "/health", "/settings"];

  for (const viewport of [
    { name: "mobile", width: 375, height: 812 },
    { name: "tablet", width: 768, height: 1024 },
  ]) {
    test(`${viewport.name}: no horizontal overflow on primary pages`, async ({ page }) => {
      // Eight pages, each compiled on demand by the dev server, can exceed the 30 s default.
      test.setTimeout(120_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const path of pages) {
        await gotoReady(page, path);
        await expectNoHorizontalOverflow(page);
      }
    });
  }

  test("mobile: navigation drawer is a labelled modal that traps focus and closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoReady(page, "/dashboard");
    const toggle = page.getByRole("button", { name: "Open navigation" });
    await toggle.click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();
  });
});

test("keyboard: skip link moves focus past the navigation to main content", async ({ page }) => {
  await gotoReady(page, "/dashboard");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#ln-main$/);
});
