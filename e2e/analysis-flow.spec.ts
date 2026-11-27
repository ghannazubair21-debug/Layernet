import { test, expect } from "@playwright/test";

// Deterministic input: $10,000 Withdrawal on Mobile scores 40 (amount baseline)
// + 15 (Withdrawal) + 5 (Mobile) = 60, plus 12 only when the UTC hour is 00-05.
const TIMESTAMP = "2026-01-15T12:00";
const utcHour = new Date(TIMESTAMP).getUTCHours();
const EXPECTED_SCORE = 60 + (utcHour >= 0 && utcHour < 6 ? 12 : 0);

test("analyzes a transaction and displays the resulting risk assessment", async ({ page }) => {
  let chatRequests = 0;

  await page.route("**/api/chat", async (route) => {
    chatRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: [] }),
    });
  });

  await page.route("**/*generativelanguage.googleapis.com/**", async (route) => {
    await route.abort();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to LayerNet" })).toBeVisible();

  await page.getByRole("link", { name: "Analysis" }).click();
  await expect(page.getByRole("heading", { name: "Transaction Analysis" })).toBeVisible();
  // Dev mode compiles/hydrates on demand; interacting before hydration lets
  // React reset the controlled inputs. Wait until the page is quiet first.
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Transaction ID").fill("TX-E2E-1001");
  await expect(page.getByLabel("Transaction ID")).toHaveValue("TX-E2E-1001");
  await page.getByLabel("Amount").fill("10000");
  await page.getByLabel("Transaction Type").selectOption("Withdrawal");
  await page.getByLabel("Location").fill("Lagos, NG");
  await page.getByLabel("Channel").selectOption("Mobile");
  await page.getByLabel("Timestamp").fill(TIMESTAMP);
  await expect(page.getByLabel("Timestamp")).toHaveValue(TIMESTAMP);

  await page.getByRole("button", { name: "Analyze Transaction" }).click();

  await expect(page.getByText("Risk: Medium")).toBeVisible();
  await expect(page.getByText(`Priority score: ${EXPECTED_SCORE}/100`)).toBeVisible();
  await expect(page.getByText(/Decision:/)).toContainText("Review");
  await expect(page.getByText("Transaction type is Withdrawal: +15 heuristic points.")).toBeVisible();
  await expect(page.getByText("Transaction analyzed and saved to History.")).toBeVisible();
  expect(chatRequests).toBe(0);
});
