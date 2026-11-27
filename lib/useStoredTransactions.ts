"use client";

import { useEffect, useState } from "react";
import { transactionService } from "./transactionService";
import { TRANSACTIONS_UPDATED_EVENT } from "./transactionStorage";
import type { Transaction } from "./types";

/** Reads only transactions persisted by this browser's repository adapter. */
export function useStoredTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const syncTransactions = async () => {
      try {
        const stored = await transactionService.list();
        if (active) {
          setTransactions(stored.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)));
          setLoadError(null);
          setIsLoading(false);
        }
      } catch {
        if (active) {
          setTransactions([]);
          setLoadError("Saved transaction history could not be read. Existing local data was left unchanged.");
          setIsLoading(false);
        }
      }
    };

    void syncTransactions();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, syncTransactions);
    window.addEventListener("storage", syncTransactions);
    return () => {
      active = false;
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, syncTransactions);
      window.removeEventListener("storage", syncTransactions);
    };
  }, []);

  return { transactions, isLoading, loadError };
}
