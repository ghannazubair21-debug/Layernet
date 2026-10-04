import { createBehavioralBaseline, getPriorAccountTransactions } from "./behavioralBaseline";
import type { TransactionFeatures, TransactionRecord } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function validVelocityValue(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function changedFromPrevious<T>(
  current: T | undefined,
  history: readonly TransactionRecord[],
  select: (transaction: TransactionRecord) => T | undefined,
): boolean | null {
  if (current === undefined || current === "") return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const previous = select(history[index]);
    if (previous !== undefined && previous !== "") return previous !== current;
  }
  return null;
}

export function engineerTransactionFeatures(
  transaction: TransactionRecord,
  history: readonly TransactionRecord[],
): TransactionFeatures {
  const timestamp = Date.parse(transaction.timestamp);
  if (!Number.isFinite(timestamp)) throw new RangeError("Transaction timestamp must be a valid date.");
  if (!Number.isFinite(transaction.amount) || transaction.amount < 0) {
    throw new RangeError("Transaction amount must be a finite, non-negative number.");
  }

  const prior = getPriorAccountTransactions(transaction, history);
  const baseline = createBehavioralBaseline(transaction, history);
  const date = new Date(timestamp);
  const hourUtc = date.getUTCHours();
  const dayOfWeekUtc = date.getUTCDay();
  const priorWithTimes = prior.map((item) => ({ item, time: Date.parse(item.timestamp) }));
  const previous = priorWithTimes.at(-1);
  const oneDayAgo = timestamp - DAY_MS;
  const lastDay = priorWithTimes.filter(({ time }) => time >= oneDayAgo);
  const lastHour = lastDay.filter(({ time }) => time >= timestamp - HOUR_MS);
  const velocityAsOf = transaction.velocity ? Date.parse(transaction.velocity.asOf) : Number.NaN;
  const upstreamVelocity = transaction.accountId && Number.isFinite(velocityAsOf) && velocityAsOf < timestamp
    ? transaction.velocity
    : undefined;

  let amountZScore: number | null = null;
  if (baseline.averageAmount !== null && baseline.amountStandardDeviation !== null && baseline.amountStandardDeviation > 0) {
    amountZScore = (transaction.amount - baseline.averageAmount) / baseline.amountStandardDeviation;
  }

  const deviceIdentifier = transaction.deviceId ?? transaction.deviceInfo?.id;

  return {
    schemaVersion: "layernet.transaction-features.v1",
    amount: transaction.amount,
    amountLog1p: Math.log1p(transaction.amount),
    hourUtc,
    hourSin: Math.sin((2 * Math.PI * hourUtc) / 24),
    hourCos: Math.cos((2 * Math.PI * hourUtc) / 24),
    dayOfWeekUtc,
    isWeekendUtc: dayOfWeekUtc === 0 || dayOfWeekUtc === 6,
    minutesSincePreviousTransaction: previous ? (timestamp - previous.time) / 60_000 : null,
    transactionsLastHour: transaction.accountId
      ? validVelocityValue(upstreamVelocity?.transactionsLastHour) ?? lastHour.length
      : null,
    transactionsLast24Hours: transaction.accountId
      ? validVelocityValue(upstreamVelocity?.transactionsLast24Hours) ?? lastDay.length
      : null,
    amountLast24Hours: transaction.accountId
      ? validVelocityValue(upstreamVelocity?.amountLast24Hours) ?? lastDay.reduce((sum, { item }) => sum + item.amount, 0)
      : null,
    locationChanged: changedFromPrevious(transaction.location, prior, (item) => item.location),
    channelChanged: changedFromPrevious(transaction.channel, prior, (item) => item.channel),
    deviceChanged: changedFromPrevious(deviceIdentifier, prior, (item) => item.deviceId ?? item.deviceInfo?.id),
    userBehavior: {
      historicalTransactionCount: baseline.historicalTransactionCount,
      averageAmount: baseline.averageAmount,
      amountStandardDeviation: baseline.amountStandardDeviation,
      amountZScore,
    },
  };
}
