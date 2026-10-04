import type { BehavioralBaseline, TransactionRecord } from "./types";

function validTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getPriorAccountTransactions(
  transaction: TransactionRecord,
  history: readonly TransactionRecord[],
): TransactionRecord[] {
  if (!transaction.accountId) return [];

  const currentTime = validTime(transaction.timestamp);
  if (currentTime === null) return [];

  return history
    .filter((candidate) => {
      if (candidate.accountId !== transaction.accountId || candidate.transactionId === transaction.transactionId) return false;
      const candidateTime = validTime(candidate.timestamp);
      return candidateTime !== null && candidateTime < currentTime;
    })
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], average: number | null): number | null {
  if (average === null || values.length === 0) return null;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function mostCommon(values: Array<string | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let winner: string | null = null;
  let winnerCount = 0;
  for (const [value, count] of counts) {
    if (count > winnerCount) {
      winner = value;
      winnerCount = count;
    }
  }
  return winner;
}

export function createBehavioralBaseline(
  transaction: TransactionRecord,
  history: readonly TransactionRecord[],
): BehavioralBaseline {
  const prior = getPriorAccountTransactions(transaction, history);
  const amounts = prior.map((item) => item.amount).filter(Number.isFinite);
  const averageAmount = mean(amounts);
  const times = prior.map((item) => item.timestamp);

  return {
    accountId: transaction.accountId ?? null,
    asOf: transaction.timestamp,
    historicalTransactionCount: prior.length,
    firstObservedAt: times[0] ?? null,
    lastObservedAt: times.at(-1) ?? null,
    averageAmount,
    amountStandardDeviation: standardDeviation(amounts, averageAmount),
    mostCommonLocation: mostCommon(prior.map((item) => item.location)),
    mostCommonChannel: mostCommon(prior.map((item) => item.channel)),
    mostCommonDeviceId: mostCommon(prior.map((item) => item.deviceId)),
  };
}
