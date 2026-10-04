import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createBehavioralBaseline } = require("../.test-build/behavioralBaseline.js");
const { engineerTransactionFeatures } = require("../.test-build/featureEngineering.js");
const { analyzeTransaction } = require("../.test-build/fraudAnalysis.js");
const { LocalStorageTransactionRepository } = require("../.test-build/transactionStorage.js");
const { TransactionService } = require("../.test-build/transactionService.js");
const { summarizeTransactions } = require("../.test-build/transactionMetrics.js");

function transaction(overrides = {}) {
  return {
    transactionId: "tx-current",
    accountId: "account-a",
    timestamp: "2026-09-01T10:00:00.000Z",
    amount: 100,
    type: "Purchase",
    location: "Lahore",
    channel: "Web",
    deviceId: "device-1",
    ...overrides,
  };
}

test("engineers account-scoped velocity and change features from prior events only", () => {
  const history = [
    transaction({ transactionId: "tx-previous", timestamp: "2026-09-01T09:45:00.000Z", amount: 20, location: "Karachi", channel: "Mobile", deviceId: "device-0" }),
    transaction({ transactionId: "tx-other-account", accountId: "account-b", timestamp: "2026-09-01T09:50:00.000Z", amount: 9000 }),
    transaction({ transactionId: "tx-future", timestamp: "2026-09-01T10:10:00.000Z", amount: 5000 }),
    transaction({ transactionId: "tx-current", timestamp: "2026-09-01T09:00:00.000Z", amount: 7000 }),
  ];

  const features = engineerTransactionFeatures(transaction(), history);
  const baseline = createBehavioralBaseline(transaction(), history);

  assert.equal(baseline.historicalTransactionCount, 1);
  assert.equal(baseline.averageAmount, 20);
  assert.equal(features.transactionsLastHour, 1);
  assert.equal(features.transactionsLast24Hours, 1);
  assert.equal(features.amountLast24Hours, 20);
  assert.equal(features.minutesSincePreviousTransaction, 15);
  assert.equal(features.locationChanged, true);
  assert.equal(features.channelChanged, true);
  assert.equal(features.deviceChanged, true);
  assert.equal(features.userBehavior.amountZScore, null);
});

test("does not infer a personal baseline or velocity without an account identifier", () => {
  const input = transaction({ accountId: undefined });
  const features = engineerTransactionFeatures(input, [transaction({ timestamp: "2026-09-01T09:00:00.000Z" })]);
  const baseline = createBehavioralBaseline(input, [transaction({ timestamp: "2026-09-01T09:00:00.000Z" })]);

  assert.equal(baseline.accountId, null);
  assert.equal(baseline.historicalTransactionCount, 0);
  assert.equal(features.transactionsLastHour, null);
  assert.equal(features.transactionsLast24Hours, null);
  assert.equal(features.userBehavior.averageAmount, null);
});

test("produces deterministic UTC calendar features and cyclical hour values", () => {
  const features = engineerTransactionFeatures(transaction({
    accountId: undefined,
    timestamp: "2026-08-30T00:00:00.000Z",
  }), []);

  assert.equal(features.hourUtc, 0);
  assert.equal(features.dayOfWeekUtc, 0);
  assert.equal(features.isWeekendUtc, true);
  assert.equal(features.hourSin, 0);
  assert.equal(features.hourCos, 1);
  assert.equal(features.schemaVersion, "layernet.transaction-features.v1");
});

test("uses only a strictly earlier upstream velocity snapshot", () => {
  const good = engineerTransactionFeatures(transaction({
    velocity: { asOf: "2026-09-01T09:59:00.000Z", transactionsLastHour: 8, transactionsLast24Hours: 21, amountLast24Hours: 450 },
  }), []);
  const sameTime = engineerTransactionFeatures(transaction({
    velocity: { asOf: "2026-09-01T10:00:00.000Z", transactionsLastHour: 99 },
  }), []);

  assert.equal(good.transactionsLastHour, 8);
  assert.equal(good.transactionsLast24Hours, 21);
  assert.equal(good.amountLast24Hours, 450);
  assert.equal(sameTime.transactionsLastHour, 0);
});

test("ignores invalid values in an otherwise valid upstream velocity snapshot", () => {
  const features = engineerTransactionFeatures(transaction({
    velocity: {
      asOf: "2026-09-01T09:59:00.000Z",
      transactionsLastHour: Number.POSITIVE_INFINITY,
      transactionsLast24Hours: -1,
      amountLast24Hours: Number.NaN,
    },
  }), []);

  assert.equal(features.transactionsLastHour, 0);
  assert.equal(features.transactionsLast24Hours, 0);
  assert.equal(features.amountLast24Hours, 0);
});

test("rejects invalid timestamps and non-finite or negative amounts", () => {
  assert.throws(() => engineerTransactionFeatures(transaction({ timestamp: "invalid" }), []), /timestamp/);
  assert.throws(() => engineerTransactionFeatures(transaction({ amount: Number.NaN }), []), /amount/);
  assert.throws(() => engineerTransactionFeatures(transaction({ amount: -1 }), []), /amount/);
});

test("keeps the heuristic fallback and does not label its score as a probability", () => {
  const assessment = analyzeTransaction(transaction());
  assert.equal(assessment.riskScore, 28);
  assert.equal(assessment.method, "LayerNet rules baseline v1");
  assert.equal("probability" in assessment, false);
});

test("repository migrates legacy records and upserts by transaction ID", async () => {
  const values = new Map([["layernet-transactions", JSON.stringify([{
    id: "legacy-1",
    amount: 25,
    type: "Purchase",
    location: "Lahore",
    device: "Mobile",
    timestamp: "2026-08-30T10:00:00.000Z",
    riskScore: 12,
    risk: "Low",
    status: "Cleared",
  }])]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    dispatchEvent: () => true,
  };
  try {
    const repository = new LocalStorageTransactionRepository();
    const [legacy] = await repository.list();
    assert.equal(legacy.transactionId, "legacy-1");
    assert.equal(legacy.channel, "Mobile");
    assert.equal("device" in legacy, false);

    await repository.save({ ...legacy, amount: 30 });
    const stored = JSON.parse(values.get("layernet-transactions"));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].amount, 30);
    assert.equal(stored[0].transactionId, "legacy-1");
  } finally {
    delete globalThis.window;
  }
});

test("transaction service injects a repository and returns features with the heuristic fallback", async () => {
  const service = new TransactionService({
    list: async () => [transaction({ transactionId: "tx-prior", timestamp: "2026-09-01T09:00:00.000Z", amount: 50 })],
    save: async () => {},
    clear: async () => {},
  });
  const result = await service.analyze(transaction());
  assert.equal(result.behavioralBaseline.historicalTransactionCount, 1);
  assert.equal(result.features.transactionsLastHour, 1);
  assert.equal(result.method, "LayerNet rules baseline v1");
});

test("transaction metrics summarize heuristic decisions without calling them fraud labels", () => {
  const metrics = summarizeTransactions([
    { ...transaction(), riskScore: 82, risk: "High", status: "Flagged" },
    { ...transaction({ transactionId: "tx-clear" }), riskScore: 12, risk: "Low", status: "Cleared" },
    { ...transaction({ transactionId: "tx-review" }), riskScore: 48, risk: "Medium", status: "Reviewed" },
  ]);

  assert.equal(metrics.total, 3);
  assert.equal(metrics.nonClearDecisions, 2);
  assert.equal(metrics.nonClearSharePercent, 66.7);
  assert.equal(metrics.averagePriorityScore, 47);
  assert.deepEqual(metrics.priorityCounts, { High: 1, Medium: 1, Low: 1 });
});

test("empty transaction metrics leave undefined aggregates unavailable", () => {
  const metrics = summarizeTransactions([]);

  assert.equal(metrics.total, 0);
  assert.equal(metrics.nonClearSharePercent, null);
  assert.equal(metrics.averagePriorityScore, null);
  assert.deepEqual(metrics.priorityCounts, { High: 0, Medium: 0, Low: 0 });
});
