import { chromium } from "@playwright/test";

const b = await chromium.launch();
const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
try {
  await p.goto("http://localhost:3000/analysis", { waitUntil: "networkidle" });
  await p.getByLabel("Transaction ID", { exact: true }).fill("TX-DBG-1");
  await p.getByLabel("Amount", { exact: true }).fill("10000");
  await p.getByLabel("Transaction Type").selectOption("Withdrawal");
  await p.getByLabel("Channel").selectOption("Mobile");
  await p.getByLabel("Location", { exact: true }).fill("Lagos, NG");
  await p.getByLabel("Timestamp").fill("2026-01-15T12:00");
  const tsValue = await p.getByLabel("Timestamp").inputValue();
  console.log("timestamp value:", tsValue);
  await p.getByRole("button", { name: "Analyze Transaction" }).click();
  await p.waitForTimeout(2500);
  const t = await p.evaluate(() => document.body.innerText);
  const i = t.indexOf("Assessment dossier");
  console.log(t.slice(i, i + 800));
} catch (e) {
  console.log("ERR:", e.message.slice(0, 500));
}
await b.close();
