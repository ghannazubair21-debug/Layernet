// LayerNet visual QA sweep (headless Playwright against the running dev server).
// Usage: node qa-visual.mjs [outDir]
// Seeds records ONLY through the real Analysis UI + transactionService save flow.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = process.argv[2] ?? "qa-out";
const CSV = process.env.LAYERNET_ULB_CSV ?? "";
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ROUTES = ["dashboard", "analysis", "history", "analytics", "benchmark", "health", "settings", "micro-interactions"];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));

const report = { overflow: [], consoleErrors, checks: {} };

async function shot(name, fullPage = true) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

async function overflowCheck(label) {
  const r = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
  if (r.scrollW > r.innerW) report.overflow.push({ label, ...r });
}

async function setTheme(mode) {
  // Uses the real Settings persistence (layernet-settings) via the sidebar control.
  await page.getByRole("group", { name: "Color theme" }).getByRole("button", { name: `${mode} theme` }).click();
  await page.waitForTimeout(300);
}

async function kpis() {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".layernet-card .layernet-label"))
      .slice(0, 4)
      .map((n) => `${n.textContent}=${n.nextElementSibling?.textContent}`),
  );
}

// 1. Empty state (fresh context = no saved records)
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.getByText("No saved analyses").waitFor();
report.checks.emptyKpis = await kpis();
await shot("1440-dashboard-empty-light");
await setTheme("Dark");
await shot("1440-dashboard-empty-dark");
await setTheme("Light");

// 2. Seed three genuine records through the Analysis form.
//    Selects are targeted by role + accessible name (the label owns the name,
//    so option text can never collide with it).
await page.goto(`${BASE}/analysis`, { waitUntil: "networkidle" });
const cases = [
  { id: "TX-QA-1", amount: "10000", type: "Withdrawal", channel: "Mobile", location: "Lagos, NG", ts: "2026-01-15T12:00" },
  { id: "TX-QA-2", amount: "1000000", type: "Refund", channel: "Web", location: "London, UK", ts: "2026-01-15T07:00" },
  { id: "TX-QA-3", amount: "25", type: "Purchase", channel: "POS", location: "Berlin, DE", ts: "2026-01-16T12:00" },
];
// Validation feedback first (empty submit)
await page.getByRole("button", { name: "Analyze Transaction" }).click();
await page.getByText("Transaction ID is required").waitFor();
report.checks.validationInvalidAttr = await page.getByRole("textbox", { name: "Transaction ID" }).getAttribute("aria-invalid");
await shot("1440-analysis-validation", false);

report.checks.seededResults = [];
for (const [i, c] of cases.entries()) {
  await page.getByRole("textbox", { name: "Transaction ID" }).fill(c.id);
  await page.getByRole("spinbutton", { name: "Amount" }).fill(c.amount);
  await page.getByRole("combobox", { name: "Transaction Type" }).selectOption(c.type);
  await page.getByRole("combobox", { name: "Channel" }).selectOption(c.channel);
  await page.getByRole("textbox", { name: "Location" }).fill(c.location);
  await page.getByLabel("Timestamp").fill(c.ts);
  await page.getByRole("button", { name: "Analyze Transaction" }).click();
  await page.getByText("Transaction analyzed and saved to History.").waitFor();
  report.checks.seededResults.push(
    `${c.id}: ${await page.getByText(/^Risk: /).textContent()} / ${await page.getByText(/^Priority score: /).textContent()}`,
  );
  if (i === cases.length - 1) {
    await shot("1440-analysis-result-light");
    await setTheme("Dark");
    await shot("1440-analysis-result-dark");
    await setTheme("Light");
  }
  await page.getByRole("button", { name: "Reset" }).click();
}
report.checks.storedCount = await page.evaluate(() => {
  const keys = Object.keys(localStorage);
  return keys.map((k) => `${k}:${(localStorage.getItem(k) ?? "").length}`);
});

// 3. Dashboard with real records
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
report.checks.populatedKpis = await kpis();
report.checks.recentRows = await page.locator("table tbody tr").count();

// 4. Light + dark sweeps across every route
for (const theme of ["Light", "Dark"]) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await setTheme(theme);
  for (const route of ROUTES) {
    await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
    await overflowCheck(`1440/${theme}/${route}`);
    await shot(`1440-${route}-${theme.toLowerCase()}`);
  }
  await page.goto(BASE, { waitUntil: "networkidle" });
  await shot(`1440-home-${theme.toLowerCase()}`);
}
await page.reload({ waitUntil: "networkidle" });
report.checks.darkPersisted = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
await setTheme("Light");

// 5. Benchmark real upload (optional: needs a ULB-format CSV)
if (CSV && fs.existsSync(CSV)) {
  await page.goto(`${BASE}/benchmark`, { waitUntil: "networkidle" });
  await page.setInputFiles('input[aria-label="ULB dataset CSV"]', CSV);
  try {
    await page.getByText("Rows scored").waitFor({ timeout: 90000 });
    report.checks.benchmarkUpload = true;
  } catch {
    report.checks.benchmarkUpload = "no result within 90s";
  }
  await shot("1440-benchmark-results");
}

// 6. History detail drawer
await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /View details for TX-QA-2/ }).first().click();
await page.waitForTimeout(400);
report.checks.historyDrawer = await page.getByRole("dialog").first().isVisible();
await shot("1440-history-detail", false);
await page.keyboard.press("Escape");

// 7. Responsive sweep
for (const width of [1280, 768, 390, 360]) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  for (const route of [...ROUTES, ""]) {
    await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
    await overflowCheck(`${width}/${route || "home"}`);
    if (["dashboard", "history", "analysis", "analytics", ""].includes(route)) await shot(`${width}-${route || "home"}`);
  }
}

// 8. Mobile drawer + focus
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Open navigation" }).click();
await page.waitForTimeout(400);
await shot("390-drawer", false);
report.checks.mobileDrawer = await page.getByRole("dialog", { name: "Navigation" }).isVisible();
report.checks.drawerFocusInside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
report.checks.drawerEscClosed = !(await page.getByRole("dialog", { name: "Navigation" }).isVisible().catch(() => false));

// 9. AI assistant slide-over
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "AI Assistant" }).click();
await page.waitForTimeout(500);
report.checks.assistantOpens = await page.getByRole("dialog", { name: "AI investigation assistant" }).isVisible();
await shot("1440-assistant", false);

console.log(JSON.stringify(report, null, 2));
await browser.close();
