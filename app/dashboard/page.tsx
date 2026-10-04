"use client";

import AIChat from "@/components/AIChat";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import TransactionTable from "@/components/TransactionTable";
import ChartCard from "@/components/ChartCard";
import EmptyState from "@/components/EmptyState";
import { summarizeTransactions } from "@/lib/transactionMetrics";
import { useStoredTransactions } from "@/lib/useStoredTransactions";

export default function Page() {
  const { transactions, isLoading } = useStoredTransactions();
  const metrics = summarizeTransactions(transactions);
  const recentTransactions = transactions.slice(0, 8);

  return (
    <section className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Saved analyses from this browser. Scores are heuristic priorities, not confirmed fraud labels." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Transactions analyzed" value={metrics.total} />
        <MetricCard title="Non-clear decisions" value={metrics.nonClearDecisions} delta={metrics.nonClearSharePercent === null ? undefined : `${metrics.nonClearSharePercent}% of saved`} />
        <MetricCard title="High-priority scores" value={metrics.priorityCounts.High} />
        <MetricCard title="Mean priority score" value={metrics.averagePriorityScore ?? "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Recent heuristic priority scores">
            {isLoading ? <p className="mt-3 layernet-muted">Loading saved analyses…</p> : recentTransactions.length === 0 ? (
              <p className="mt-3 layernet-muted">No saved analyses yet. Analyze a transaction to populate this view.</p>
            ) : <div className="mt-3 flex h-44 items-end gap-2 overflow-x-auto">
              {recentTransactions.map((t) => (
                <div key={t.transactionId} className="flex h-full min-w-12 flex-1 flex-col justify-end">
                  <div
                    className="mx-auto w-3 rounded-t-md bg-[var(--primary)]"
                    style={{ height: `${Math.max(8, t.riskScore)}%` }}
                  />
                  <p className="mt-2 text-xs text-center text-[var(--muted-text)]">{t.transactionId}</p>
                </div>
              ))}
            </div>}
          </ChartCard>

          <div className="mt-6">
            <ChartCard title="Heuristic priority distribution">
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">High priority</span>
                  <span className="text-sm font-semibold">{metrics.priorityCounts.High}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Medium priority</span>
                  <span className="text-sm font-semibold">{metrics.priorityCounts.Medium}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Low priority</span>
                  <span className="text-sm font-semibold">{metrics.priorityCounts.Low}</span>
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
            <p className="layernet-label">Scoring status</p>
            <p className="mt-3 text-sm layernet-muted">Rules baseline v1 is active. No trained ML model is connected. Behavioral features are shown with each analysis but do not change the current score.</p>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <AIChat />
      </div>

      <div>
        <p className="mb-3 layernet-label">Recent transactions</p>
        {isLoading ? <p className="layernet-muted">Loading saved analyses…</p> : recentTransactions.length === 0 ? (
          <EmptyState title="No saved analyses" subtitle="Analyze a transaction to create a record in this browser." />
        ) : <TransactionTable transactions={recentTransactions} />}
      </div>
    </section>
  );
}
