import { Transaction } from "./types";

export const STORAGE_KEY = "layernet-transactions";

export function getStoredTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is Transaction => {
      if (!item || typeof item !== "object") return false;
      return typeof item.id === "string" && typeof item.amount === "number" && typeof item.type === "string" && typeof item.location === "string" && typeof item.device === "string" && typeof item.timestamp === "string" && typeof item.riskScore === "number" && typeof item.risk === "string" && typeof item.status === "string";
    });
  } catch {
    return [];
  }
}

export function saveTransaction(transaction: Transaction) {
  if (typeof window === "undefined") return;

  const stored = getStoredTransactions();
  const next = [...stored];
  const idx = next.findIndex((item) => item.id === transaction.id);

  if (idx >= 0) {
    next[idx] = transaction;
  } else {
    next.push(transaction);
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearStoredTransactions() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
