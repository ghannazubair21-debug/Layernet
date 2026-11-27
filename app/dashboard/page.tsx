"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CircleCheck,
  FlaskConical,
  ScanSearch,
  TriangleAlert,
  MessageSquareText,
  Receipt,
  ShieldAlert,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Panel from "@/components/Panel";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import RiskBadge from "@/components/RiskBadge";
import TransactionTable from "@/components/TransactionTable";
import { SkeletonRows } from "@/components/LoadingSkeleton";
import { DonutChart, TrendChart } from "@/components/charts";
import { summarizeTransactions } from "@/lib/transactionMetrics";
import { useStoredTransactions } from "@/lib/useStoredTransactions";
import { formatAmount } from "@/lib/currency";

function shareHint(count: number, total: number) {
  if (total === 0) return "No saved records yet";
  return `${Math.round((count / total) * 100)}% of saved records`;
}

const RANGES = [
  { label: "All time", ms: null },
  { label: "Last 24 hours", ms: 86_400_000 },
  { label: "Last 7 days", ms: 7 * 86_400_000 },
  { label: "Last 30 days", ms: 30 * 86_400_000 },
] as const;

function subscribeToClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}

function readClockMinute() {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Page() {
  const { transactions, isLoading, loadError } = useStoredTransactions();
  const [rangeIndex, setRangeIndex] = useState(0);
  // Client clock (minute resolution) — the server snapshot keeps hydration stable.
  const nowMinute = useSyncExternalStore(subscribeToClock, readClockMinute, () => 0);
  const greeting = nowMinute === 0 ? "Welcome back" : greetingFor(new Date(nowMinute).getHours());

  const range = RANGES[rangeIndex];
  const filtered = useMemo(() => {
    if (range.ms === null || nowMinute === 0) return transactions;
    const cutoff = nowMinute - range.ms;
    return transactions.filter((t) => Date.parse(t.timestamp) >= cutoff);
  }, [transactions, range, nowMinute]);

  const metrics = summarizeTransactions(filtered);
  const recent = filtered.slice(0, 8);
  const highPriority = filtered.filter((t) => t.risk === "High" || t.status === "Flagged").slice(0, 6);
  const trendPoints = useMemo(
    () => filtered.map((t) => ({ t: Date.parse(t.timestamp), score: t.riskScore, id: t.transactionId })),
    [filtered],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow={greeting}
        title="Dashboard"
        subtitle="Saved analyses from this browser. Scores are heuristic priorities, not confirmed fraud labels."
        actions={
          <>
            <label className="flex items-center gap-2 text-xs text-[var(--muted-text)]">
              <span className="layernet-label">Range</span>
              <select
                aria-label="Activity date range"
                value={rangeIndex}
                onChange={(event) => setRangeIndex(Number(event.target.value))}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              >
                {RANGES.map((item, index) => (
                  <option key={item.label} value={index}>{item.label}</option>
                ))}
              </select>
            </label>
            <Link href="/analysis" className="layernet-button layernet-button--primary px-4 py-2 text-sm">
              <ScanSearch aria-hidden="true" className="size-4" /> New analysis
            </Link>
          </>
        }
      />

      {loadError ? <p role="alert" className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-tint)] px-4 py-3 text-sm text-[var(--text)]">{loadError} Dashboard totals are unavailable until the local history can be read.</p> : null}

      {/* KPI row — counts of actual saved records */}
      <div className="ln-enter-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total analyzed"
          value={isLoading ? "…" : loadError ? "—" : metrics.total}
          hint={loadError ? "History unavailable" : `${range.label.toLowerCase()} · this browser`}
          icon={Receipt}
        />
        <StatCard
          label="High risk"
          value={isLoading ? "…" : loadError ? "—" : metrics.priorityCounts.High}
          hint={loadError ? "History unavailable" : shareHint(metrics.priorityCounts.High, metrics.total)}
          icon={ShieldAlert}
          tone="high"
        />
        <StatCard
          label="Medium risk"
          value={isLoading ? "…" : loadError ? "—" : metrics.priorityCounts.Medium}
          hint={loadError ? "History unavailable" : shareHint(metrics.priorityCounts.Medium, metrics.total)}
          icon={TriangleAlert}
          tone="warning"
        />
        <StatCard
          label="Low risk"
          value={isLoading ? "…" : loadError ? "—" : metrics.priorityCounts.Low}
          hint={loadError ? "History unavailable" : shareHint(metrics.priorityCounts.Low, metrics.total)}
          icon={CircleCheck}
          tone="success"
        />
      </div>

      {/* Trend + risk distribution */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          title="Priority score activity"
          subtitle={`${filtered.length} record${filtered.length === 1 ? "" : "s"} · ${range.label.toLowerCase()}${
            metrics.averagePriorityScore === null ? "" : ` · avg ${metrics.averagePriorityScore}/100`
          }`}
          className="ln-enter lg:col-span-8"
        >
          {isLoading ? (
            <SkeletonRows rows={3} />
          ) : (
            <TrendChart points={trendPoints} />
          )}
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
              centerCaption="records"
            />
          )}
        </Panel>
      </div>

      {/* High priority + recent */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          title="High-risk alerts"
          subtitle="Saved records rated High or flagged for blocking"
          className="ln-enter lg:col-span-5"
          actions={
            <Link href="/history" className="text-xs font-medium text-[var(--primary)] transition-colors hover:text-[var(--primary-hover)]">
              View history
            </Link>
          }
          bodyClassName="p-0"
        >
          {isLoading ? (
            <div className="p-4"><SkeletonRows rows={3} /></div>
          ) : loadError ? (
            <p className="p-4 text-sm text-[var(--muted-text)]">Watchlist unavailable while saved history cannot be read.</p>
          ) : highPriority.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No high-priority records"
              subtitle="Nothing in this range is rated High or flagged. That is a real result, not missing data."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {highPriority.map((t) => (
                <li key={t.transactionId} className="flex items-center gap-3 px-4 py-3">
                  <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full bg-[var(--danger)]" />
                  <div className="min-w-0 flex-1">
                    <p className="ln-data truncate text-sm font-medium text-[var(--text)]">{t.transactionId}</p>
                    <p className="truncate text-xs text-[var(--muted-text)]">
                      {t.type} · {formatAmount(t.amount, t.currency)} · {t.location ?? "location unavailable"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RiskBadge risk={t.risk} />
                    <span className="ln-data text-xs text-[var(--muted-text)]">{t.riskScore}/100</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent transactions"
          className="ln-enter lg:col-span-7"
          actions={
            <Link href="/history" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] transition-colors hover:text-[var(--primary-hover)]">
              View all <ArrowRight aria-hidden="true" className="size-3" />
            </Link>
          }
          bodyClassName="p-0 md:p-0"
        >
          {isLoading ? (
            <div className="p-4"><SkeletonRows rows={4} /></div>
          ) : loadError ? (
            <p className="p-4 text-sm text-[var(--muted-text)]">Recent records unavailable while saved history cannot be read.</p>
          ) : recent.length === 0 ? (
            <EmptyState
              title="No saved analyses"
              subtitle="Analyze a transaction to create a record in this browser."
              action={
                <Link href="/analysis" className="layernet-button layernet-button--primary px-4 py-2 text-sm">
                  Analyze Transaction
                </Link>
              }
            />
          ) : (
            <div className="p-3 md:p-0">
              <TransactionTable transactions={recent} compact />
            </div>
          )}
        </Panel>
      </div>

      {/* System + quick actions + assistant */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="System overview" className="ln-enter">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted-text)]">Scoring engine</span>
              <span className="layernet-status layernet-status--success">Rules baseline v1</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted-text)]">Trained ML</span>
              <span className="text-right text-xs text-[var(--text)]">ULB benchmark replay only — not live scoring</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted-text)]">AI assistant</span>
              <span className="text-right text-xs text-[var(--text)]">Gemini · general investigation chat</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted-text)]">Storage</span>
              <span className="text-right text-xs text-[var(--text)]">{loadError ? "History unavailable" : `This browser · ${transactions.length} ${transactions.length === 1 ? "record" : "records"}`}</span>
            </li>
          </ul>
          <Link href="/health" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]">
            Full system health <ArrowRight aria-hidden="true" className="size-3" />
          </Link>
        </Panel>

        <Panel title="Quick actions" className="ln-enter">
          <div className="flex flex-col gap-2.5">
            <Link href="/analysis" className="layernet-button layernet-button--primary px-4 py-2.5 text-sm">
              <Receipt aria-hidden="true" className="size-4" /> Analyze Transaction
            </Link>
            <Link href="/history" className="layernet-button px-4 py-2.5 text-sm">
              <Activity aria-hidden="true" className="size-4" /> Transaction History
            </Link>
            <Link href="/benchmark" className="layernet-button px-4 py-2.5 text-sm">
              <FlaskConical aria-hidden="true" className="size-4" /> ULB Benchmark Replay
            </Link>
          </div>
        </Panel>

        <Panel title="AI investigation assistant" className="ln-enter md:col-span-2 xl:col-span-1">
          <p className="text-sm text-[var(--muted-text)]">
            Ask general investigation questions. The assistant sees only what you type — it cannot read saved
            history or change scores.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("layernet-open-assistant"))}
            className="layernet-button layernet-button--primary mt-4 px-4 py-2.5 text-sm"
          >
            <MessageSquareText aria-hidden="true" className="size-4" /> Open assistant
          </button>
        </Panel>
      </div>
    </section>
  );
}
