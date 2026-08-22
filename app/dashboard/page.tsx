"use client";

import { useEffect, useMemo, useState } from "react";
import AIChat from "@/components/AIChat";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import TransactionTable from "@/components/TransactionTable";
import ChartCard from "@/components/ChartCard";
import { transactions as mockTransactions } from "@/lib/mockData";
import { getStoredTransactions } from "@/lib/transactionStorage";
import { Transaction } from "@/lib/types";

function mergeTransactions(stored: Transaction[]) {
  return [...mockTransactions, ...stored].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export default function Page() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => mergeTransactions(getStoredTransactions()));

  useEffect(() => {
    const syncTransactions = () => {
      setTransactions(mergeTransactions(getStoredTransactions()));
    };

    syncTransactions();

    const handleStorageUpdate = () => {
      syncTransactions();
    };

    window.addEventListener("layernet-transactions-updated", handleStorageUpdate);
    return () => window.removeEventListener("layernet-transactions-updated", handleStorageUpdate);
  }, []);

  const metrics = useMemo(() => {
    const total = transactions.length;
    const fraudDetected = transactions.filter((t) => t.risk !== "Low").length;
    const avgRisk = Math.round(
      transactions.reduce((sum, t) => sum + t.riskScore, 0) / Math.max(1, transactions.length),
    );
    const fraudRate = Math.round((fraudDetected / Math.max(1, total)) * 1000) / 10;

    return { total, fraudDetected, avgRisk, fraudRate };
  }, [transactions]);

  return (
    <section className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Monitor fraud detection activity and system metrics." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Transactions" value={metrics.total} />
        <MetricCard title="Fraud Detected" value={metrics.fraudDetected} delta={`${metrics.fraudRate}%`} />
        <MetricCard title="Avg Risk Score" value={`${metrics.avgRisk}`} />
        <MetricCard title="Fraud Rate" value={`${metrics.fraudRate}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Fraud trend (last events)">
            <div className="mt-3 h-36 flex items-end gap-2">
              {transactions.map((t) => (
                <div key={t.id} className="h-full flex-1">
                  <div
                    className="mx-auto w-3 rounded-t-md bg-[var(--primary)]"
                    style={{ height: `${Math.max(8, t.riskScore)}%` }}
                  />
                  <p className="mt-2 text-xs text-center text-[var(--muted-text)]">{t.id}</p>
                </div>
              ))}
            </div>
          </ChartCard>

          <div className="mt-6">
            <ChartCard title="Risk distribution">
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">High</span>
                  <span className="text-sm font-semibold">{transactions.filter((t) => t.risk === "High").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Medium</span>
                  <span className="text-sm font-semibold">{transactions.filter((t) => t.risk === "Medium").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Low</span>
                  <span className="text-sm font-semibold">{transactions.filter((t) => t.risk === "Low").length}</span>
                </div>
              </div>
            </ChartCard>
          </div>
        </div>

        <div>
          <div className="layernet-card p-4">
            <p className="layernet-label">Quick actions</p>
            <div className="mt-3 flex flex-col gap-3">
              <a href="/analysis" className="layernet-button layernet-button--primary">Analyze Transaction</a>
              <a href="/history" className="layernet-button">Transaction History</a>
              <a href="/analytics" className="layernet-button">Open Analytics</a>
            </div>
          </div>

          <div className="mt-4 layernet-card p-4">
            <p className="layernet-label">Recent activity</p>
            <ul className="mt-3 text-sm layernet-muted">
              <li>Model updated: weights v1.2 (simulated)</li>
              <li>5 high-risk transactions flagged in last hour</li>
              <li>API latency nominal</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <AIChat />
      </div>

      <div>
        <p className="mb-3 layernet-label">Recent transactions</p>
        <TransactionTable transactions={transactions} />
      </div>
    </section>
  );
}
