"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import TransactionTable from "@/components/TransactionTable";
import { transactions as mockTransactions } from "@/lib/mockData";
import { Transaction } from "@/lib/types";
import EmptyState from "@/components/EmptyState";
import { getStoredTransactions } from "@/lib/transactionStorage";

export default function Page() {
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<string>("All");
  const [type, setType] = useState<string>("All");
  const [storedTransactions, setStoredTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setStoredTransactions(getStoredTransactions());
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const allTransactions = useMemo(() => {
    const merged = [...mockTransactions, ...storedTransactions];
    return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [storedTransactions]);

  const results = useMemo(() => {
    const search = q.trim().toLowerCase();
    return allTransactions.filter((transaction) => {
      const matchesQuery =
        !search ||
        transaction.id.toLowerCase().includes(search) ||
        transaction.location.toLowerCase().includes(search);
      const matchesRisk = risk === "All" || transaction.risk === risk;
      const matchesType = type === "All" || transaction.type === type;
      return matchesQuery && matchesRisk && matchesType;
    });
  }, [allTransactions, q, risk, type]);

  return (
    <section className="space-y-6">
      <PageHeader title="Analysis History" subtitle="Review previously analyzed transactions." />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <input placeholder="Search by transaction or location" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-md border px-3 py-2" />
        </div>

        <div className="flex items-center gap-2">
          <select value={risk} onChange={(e) => setRisk(e.target.value)} className="rounded-md border px-3 py-2">
            <option>All</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>

          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border px-3 py-2">
            <option>All</option>
            <option>Purchase</option>
            <option>Refund</option>
            <option>Withdrawal</option>
          </select>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState title="No transactions found" subtitle="Try a different search or filter." />
      ) : (
        <TransactionTable transactions={results as Transaction[]} />
      )}
    </section>
  );
}
