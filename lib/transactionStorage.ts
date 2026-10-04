import type { RiskLevel, Transaction, TransactionRepository } from "./types";

export const STORAGE_KEY = "layernet-transactions";
export const TRANSACTIONS_UPDATED_EVENT = "layernet-transactions-updated";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeTransaction(value: unknown): Transaction | null {
  if (!isRecord(value)) return null;

  // Migrate the previous { id, device } shape without losing stored history.
  const transactionId = typeof value.transactionId === "string" ? value.transactionId : value.id;
  const channel = typeof value.channel === "string" ? value.channel : value.device;
  const validRisk = value.risk === "Low" || value.risk === "Medium" || value.risk === "High";
  const validStatus = value.status === "Cleared" || value.status === "Flagged" || value.status === "Reviewed";

  if (
    typeof transactionId !== "string" ||
    typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0 ||
    typeof value.type !== "string" ||
    typeof value.timestamp !== "string" || !Number.isFinite(Date.parse(value.timestamp)) ||
    typeof value.riskScore !== "number" || !Number.isFinite(value.riskScore) ||
    !validRisk || !validStatus
  ) return null;

  const transaction: Transaction = {
    transactionId,
    amount: value.amount,
    type: value.type,
    timestamp: new Date(value.timestamp).toISOString(),
    riskScore: value.riskScore,
    risk: value.risk as RiskLevel,
    status: value.status as Transaction["status"],
  };

  if (typeof value.accountId === "string" && value.accountId.trim()) transaction.accountId = value.accountId.trim();
  if (typeof value.location === "string") transaction.location = value.location;
  if (typeof channel === "string" && channel) transaction.channel = channel;
  if (typeof value.deviceId === "string" && value.deviceId) transaction.deviceId = value.deviceId;
  if (isRecord(value.deviceInfo)) {
    transaction.deviceInfo = {
      ...(typeof value.deviceInfo.id === "string" ? { id: value.deviceInfo.id } : {}),
      ...(typeof value.deviceInfo.type === "string" ? { type: value.deviceInfo.type } : {}),
      ...(typeof value.deviceInfo.operatingSystem === "string" ? { operatingSystem: value.deviceInfo.operatingSystem } : {}),
      ...(typeof value.deviceInfo.browser === "string" ? { browser: value.deviceInfo.browser } : {}),
    };
  }

  if (isRecord(value.velocity) && typeof value.velocity.asOf === "string" && Number.isFinite(Date.parse(value.velocity.asOf))) {
    const velocity: NonNullable<Transaction["velocity"]> = { asOf: new Date(value.velocity.asOf).toISOString() };
    if (typeof value.velocity.transactionsLastHour === "number" && Number.isFinite(value.velocity.transactionsLastHour) && value.velocity.transactionsLastHour >= 0) velocity.transactionsLastHour = value.velocity.transactionsLastHour;
    if (typeof value.velocity.transactionsLast24Hours === "number" && Number.isFinite(value.velocity.transactionsLast24Hours) && value.velocity.transactionsLast24Hours >= 0) velocity.transactionsLast24Hours = value.velocity.transactionsLast24Hours;
    if (typeof value.velocity.amountLast24Hours === "number" && Number.isFinite(value.velocity.amountLast24Hours) && value.velocity.amountLast24Hours >= 0) velocity.amountLast24Hours = value.velocity.amountLast24Hours;
    transaction.velocity = velocity;
  }

  return transaction;
}

function readTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(decodeTransaction).filter((item): item is Transaction => item !== null)
      : [];
  } catch {
    return [];
  }
}

function emitUpdate() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TRANSACTIONS_UPDATED_EVENT));
}

/** Browser adapter. The repository interface keeps callers independent of this storage choice. */
export class LocalStorageTransactionRepository implements TransactionRepository {
  async list(): Promise<Transaction[]> {
    return readTransactions();
  }

  async save(transaction: Transaction): Promise<void> {
    if (typeof window === "undefined") return;
    const transactions = readTransactions();
    const index = transactions.findIndex((item) => item.transactionId === transaction.transactionId);
    if (index >= 0) transactions[index] = transaction;
    else transactions.push(transaction);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    emitUpdate();
  }

  async clear(): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
    emitUpdate();
  }
}

// Kept as a small compatibility seam for older callers; new application flows use the service.
export function getStoredTransactions(): Transaction[] {
  return readTransactions();
}

export function saveTransaction(transaction: Transaction): void {
  void new LocalStorageTransactionRepository().save(transaction);
}

export function clearStoredTransactions(): void {
  void new LocalStorageTransactionRepository().clear();
}
