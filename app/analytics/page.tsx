"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import RiskBadge from "@/components/RiskBadge";
import { SkeletonRows } from "@/components/LoadingSkeleton";
import { BarBreakdown, DonutChart, TrendChart } from "@/components/charts";
import { summarizeTransactions } from "@/lib/transactionMetrics";
import { useStoredTransactions } from "@/lib/useStoredTransactions";

function countBy(values: (string | undefined)[]): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value && value.trim() ? value : "Unavailable";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export default function Page() {
  const { transactions, isLoading } = useStoredTransactions();
  const metrics = summarizeTransactions(transactions);
  const highPriority = transactions.filter((t) => t.risk === "High");

  const trendPoints = useMemo(
    () => transactions.map((t) => ({ t: Date.parse(t.timestamp), score: t.riskScore, id: t.transactionId })),
    [transactions],
  );
  const typeBreakdown = useMemo(() => countBy(transactions.map((t) => t.type)), [transactions]);
  const channelBreakdown = useMemo(() => countBy(transactions.map((t) => t.channel)), [transactions]);

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Investigation"
        title="Analytics"
        subtitle="Review heuristic decisions for analyses saved in this browser."
      />

      <p className="ln-enter rounded-lg border-l-2 border-[var(--rose-gold)] bg-[var(--rose-tint)] px-4 py-3 text-sm text-[var(--muted-text)]">
        These summaries reflect the current rules-based priority score. There are no ground-truth fraud labels here,
        so this page does not report fraud rates or model performance.
      </p>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          title="Priority score trend"
          subtitle={`${transactions.length} saved analyses · all time`}
          className="ln-enter lg:col-span-8"
        >
          {isLoading ? <SkeletonRows rows={3} /> : <TrendChart points={trendPoints} height={250} />}
        </Panel>

        <Panel title="Risk distribution" className="ln-enter lg:col-span-4">
          {isLoading ? (
            <SkeletonRows rows={3} />
          ) : (
            <DonutChart
              data={[
                { label: "Low", value: metrics.priorityCounts.Low, color: "var(--success)" },
                { label: "Medium", value: metrics.priorityCounts.Medium, color: "var(--warning)" },
                { label: "High", value: metrics.priorityCounts.High, color: "var(--danger)" },
              ]}
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Non-clear decisions" className="ln-enter">
          <p className="ln-data text-3xl font-semibold text-[var(--text)]">{metrics.nonClearDecisions}</p>
          <p className="mt-2 text-xs text-[var(--muted-text)]">Heuristic decisions marked for review or escalation.</p>
        </Panel>
        <Panel title="Saved analyses" className="ln-enter">
          <p className="ln-data text-3xl font-semibold text-[var(--text)]">{metrics.total}</p>
          <p className="mt-2 text-xs text-[var(--muted-text)]">Stored by this browser.</p>
        </Panel>
        <Panel title="Mean priority score" className="ln-enter">
          <p className="ln-data text-3xl font-semibold text-[var(--primary)]">{metrics.averagePriorityScore ?? "—"}</p>
          <p className="mt-2 text-xs text-[var(--muted-text)]">Uncalibrated heuristic score, not probability.</p>
        </Panel>
        <Panel title="High-priority share" className="ln-enter">
          <p className="ln-data text-3xl font-semibold text-[var(--danger)]">
            {metrics.total ? Math.round((metrics.priorityCounts.High / metrics.total) * 100) : 0}%
          </p>
          <p className="mt-2 text-xs text-[var(--muted-text)]">
            {metrics.priorityCounts.High} of {metrics.total} saved records rated High.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title="Transaction type breakdown" className="ln-enter lg:col-span-4">
          {isLoading ? <SkeletonRows rows={3} /> : <BarBreakdown items={typeBreakdown} />}
        </Panel>
        <Panel title="Channel breakdown" className="ln-enter lg:col-span-4">
          {isLoading ? <SkeletonRows rows={3} /> : <BarBreakdown items={channelBreakdown} />}
        </Panel>

        <Panel
          title="High-priority watchlist"
          className="ln-enter lg:col-span-4"
          actions={
            <Link href="/history" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]">
              History <ArrowRight aria-hidden="true" className="size-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {isLoading ? (
            <div className="p-4"><SkeletonRows rows={3} /></div>
          ) : highPriority.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No high-priority decisions"
              subtitle="No saved analyses are rated High priority."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {highPriority.slice(0, 8).map((t) => (
                <li key={t.transactionId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="ln-data truncate text-sm text-[var(--text)]">{t.transactionId}</p>
                    <p className="truncate text-xs text-[var(--muted-text)]">{t.location ?? "Location unavailable"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RiskBadge risk={t.risk} />
                    <span className="ln-data text-sm font-medium text-[var(--text)]">{t.riskScore}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Current heuristic inputs" className="ln-enter">
        <p className="text-sm text-[var(--muted-text)]">
          Transaction amount, selected transaction types, selected channels, and UTC hour. Available behavioral,
          location, and device features are not used to change this score.
        </p>
      </Panel>
    </section>
  );
}
