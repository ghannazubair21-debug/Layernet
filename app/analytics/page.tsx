"use client";

import PageHeader from "@/components/PageHeader";
import ChartCard from "@/components/ChartCard";
import { summarizeTransactions } from "@/lib/transactionMetrics";
import { useStoredTransactions } from "@/lib/useStoredTransactions";

export default function Page() {
  const { transactions, isLoading } = useStoredTransactions();
  const metrics = summarizeTransactions(transactions);
  const highPriority = transactions.filter((transaction) => transaction.risk === "High");

  return (
    <section className="space-y-6">
      <PageHeader title="Analytics" subtitle="Review heuristic decisions for analyses saved in this browser." />

      <p className="text-sm layernet-muted">These summaries reflect the current rules-based priority score. There are no ground-truth fraud labels here, so this page does not report fraud rates or model performance.</p>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <ChartCard title="Priority score by recent analysis">
            {isLoading ? <p className="mt-3 layernet-muted">Loading saved analyses…</p> : transactions.length === 0 ? (
              <p className="mt-3 layernet-muted">No saved analyses yet.</p>
            ) : <div className="mt-3 flex h-44 items-end gap-2 overflow-x-auto">
              {transactions.map((t) => (
                <div key={t.transactionId} className="flex h-full min-w-12 flex-1 flex-col justify-end">
                  <div className="mx-auto w-full rounded-t-md bg-[var(--primary)]" style={{ height: `${Math.max(8, t.riskScore)}px`, minHeight: 8 }} title={`Priority score ${t.riskScore}/100`} />
                  <p className="mt-2 text-xs text-center text-[var(--muted-text)]">{t.transactionId}</p>
                </div>
              ))}
            </div>}
          </ChartCard>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <ChartCard title="Non-clear decisions">
              <p className="text-2xl font-bold">{metrics.nonClearDecisions}</p>
              <p className="layernet-muted mt-2">Heuristic decisions marked for review or escalation.</p>
            </ChartCard>

            <ChartCard title="Saved analyses">
              <p className="text-2xl font-bold">{metrics.total}</p>
              <p className="layernet-muted mt-2">Stored by this browser.</p>
            </ChartCard>

            <ChartCard title="Mean priority score">
              <p className="text-2xl font-bold">{metrics.averagePriorityScore ?? "—"}</p>
              <p className="layernet-muted mt-2">Uncalibrated heuristic score, not probability.</p>
            </ChartCard>
          </div>
        </div>

        <div>
          <ChartCard title="High-priority heuristic decisions">
            {isLoading ? <p className="mt-3 layernet-muted">Loading saved analyses…</p> : highPriority.length === 0 ? (
              <p className="mt-3 layernet-muted">No high-priority decisions in saved analyses.</p>
            ) : <ul className="mt-3 space-y-3 text-sm layernet-muted">
              {highPriority.map((t) => (
                <li key={t.transactionId} className="flex items-center justify-between">
                  <span>{t.transactionId} — {t.location ?? "Location unavailable"}</span>
                  <span className="font-medium">{t.riskScore}</span>
                </li>
              ))}
            </ul>}
          </ChartCard>

          <div className="mt-4 layernet-card p-4">
            <p className="layernet-label">Current heuristic inputs</p>
            <p className="mt-3 text-sm layernet-muted">Transaction amount, selected transaction types, selected channels, and UTC hour. Available behavioral, location, and device features are not used to change this score.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
