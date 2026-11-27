"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import RiskBadge from "@/components/RiskBadge";
import TransactionTable, { type TransactionSort, type TransactionSortKey } from "@/components/TransactionTable";
import { SkeletonRows } from "@/components/LoadingSkeleton";
import { useStoredTransactions } from "@/lib/useStoredTransactions";
import type { Transaction } from "@/lib/types";
import { formatUsd } from "@/lib/utils";
import { RULES_DECISION_HEADING, RULES_DECISION_LABELS } from "@/lib/transactionStatus";

const detailFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeStyle: "medium",
  timeZone: "UTC",
});

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-2.5 last:border-0">
      <dt className="shrink-0 text-xs uppercase tracking-[0.06em] text-[var(--muted-text)]">{label}</dt>
      <dd className="ln-data min-w-0 break-all text-right text-sm text-[var(--text)]">{value}</dd>
    </div>
  );
}

function TransactionDetail({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = panelRef.current?.closest('[role="dialog"]');
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Details for ${transaction.transactionId}`}>
      <button type="button" aria-label="Close details" onClick={onClose} className="ln-fade absolute inset-0 bg-black/40" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="ln-slide-over absolute inset-y-0 right-0 w-full overflow-y-auto bg-[var(--page-bg)] shadow-2xl outline-none sm:w-[440px]"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--border)] bg-[var(--page-bg)] px-5 py-4">
          <div>
            <p className="layernet-label">Transaction record</p>
            <p className="ln-data mt-0.5 text-sm font-medium text-[var(--text)]">{transaction.transactionId}</p>
          </div>
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--muted-text)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="flex items-center justify-between rounded-lg bg-[var(--surface-strong)] px-4 py-3">
            <RiskBadge risk={transaction.risk} />
            <span className="ln-data text-lg font-semibold text-[var(--text)]">{transaction.riskScore}/100</span>
          </div>

          <dl>
            <DetailRow label="Amount" value={formatUsd(transaction.amount)} />
            <DetailRow label="Type" value={transaction.type} />
            <DetailRow label={RULES_DECISION_HEADING} value={RULES_DECISION_LABELS[transaction.status]} />
            <DetailRow label="Timestamp" value={`${detailFormatter.format(new Date(transaction.timestamp))} UTC`} />
            <DetailRow label="Account ID" value={transaction.accountId ?? "Not provided"} />
            <DetailRow label="Channel" value={transaction.channel ?? "Not provided"} />
            <DetailRow label="Location" value={transaction.location ?? "Not provided"} />
            <DetailRow label="Device ID" value={transaction.deviceId ?? "Not provided"} />
            {transaction.deviceInfo?.type ? <DetailRow label="Device type" value={transaction.deviceInfo.type} /> : null}
            {transaction.deviceInfo?.operatingSystem ? <DetailRow label="Device OS" value={transaction.deviceInfo.operatingSystem} /> : null}
            {transaction.deviceInfo?.browser ? <DetailRow label="Browser" value={transaction.deviceInfo.browser} /> : null}
          </dl>

          {transaction.velocity ? (
            <div>
              <p className="layernet-label mb-2">Upstream velocity snapshot</p>
              <dl>
                <DetailRow label="As of" value={transaction.velocity.asOf} />
                {transaction.velocity.transactionsLastHour !== undefined ? (
                  <DetailRow label="Tx last hour" value={String(transaction.velocity.transactionsLastHour)} />
                ) : null}
                {transaction.velocity.transactionsLast24Hours !== undefined ? (
                  <DetailRow label="Tx last 24h" value={String(transaction.velocity.transactionsLast24Hours)} />
                ) : null}
                {transaction.velocity.amountLast24Hours !== undefined ? (
                  <DetailRow label="Amount last 24h" value={formatUsd(transaction.velocity.amountLast24Hours)} />
                ) : null}
              </dl>
            </div>
          ) : null}

          <p className="text-xs text-[var(--muted-text)]">
            Persisted fields only. The priority score is an uncalibrated heuristic, not a fraud probability.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<string>("All");
  const [type, setType] = useState<string>("All");
  const [sort, setSort] = useState<TransactionSort>({ key: "timestamp", dir: "desc" });
  const [selected, setSelected] = useState<Transaction | null>(null);
  const { transactions: allTransactions, isLoading, loadError } = useStoredTransactions();

  const results = useMemo(() => {
    const search = q.trim().toLowerCase();
    const filtered = allTransactions.filter((transaction) => {
      const matchesQuery =
        !search ||
        transaction.transactionId.toLowerCase().includes(search) ||
        transaction.location?.toLowerCase().includes(search);
      const matchesRisk = risk === "All" || transaction.risk === risk;
      const matchesType = type === "All" || transaction.type === type;
      return matchesQuery && matchesRisk && matchesType;
    });
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "timestamp") return (Date.parse(a.timestamp) - Date.parse(b.timestamp)) * direction;
      return (a[sort.key] - b[sort.key]) * direction;
    });
  }, [allTransactions, q, risk, type, sort]);

  const handleSort = (key: TransactionSortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "timestamp" ? "desc" : "asc" },
    );
  };

  const selectClass =
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition-colors hover:border-[var(--rose-soft)]";

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Investigation"
        title="Analysis History"
        subtitle="Review previously analyzed transactions. Select a record for full details."
      />

      {loadError ? <p role="alert" className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-tint)] px-4 py-3 text-sm text-[var(--text)]">{loadError} History is unavailable until the local records can be read.</p> : null}

      <Panel className="ln-enter" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative flex-1 lg:max-w-md">
            <span className="sr-only">Search by transaction or location</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-text)]" />
            <input
              placeholder="Search by transaction or location"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm text-[var(--text)] transition-colors placeholder:text-[var(--muted-text)] hover:border-[var(--rose-soft)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="size-4 text-[var(--muted-text)]" />
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted-text)]">
              Risk
              <select aria-label="Filter by risk" value={risk} onChange={(e) => setRisk(e.target.value)} className={selectClass}>
                <option>All</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted-text)]">
              Type
              <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
                <option>All</option>
                <option>Purchase</option>
                <option>Refund</option>
                <option>Withdrawal</option>
              </select>
            </label>
            <span className="ln-data ml-1 text-xs text-[var(--muted-text)]">
              {results.length} / {allTransactions.length}
            </span>
          </div>
        </div>
      </Panel>

      <Panel className="ln-enter" bodyClassName="p-0">
        {isLoading ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : loadError ? (
          <p className="p-4 text-sm text-[var(--muted-text)]">Saved records could not be loaded. They have not been changed.</p>
        ) : results.length === 0 ? (
          <EmptyState
            title={allTransactions.length === 0 ? "No saved analyses" : "No transactions found"}
            subtitle={
              allTransactions.length === 0
                ? "Analyze a transaction to create a record in this browser."
                : "Try a different search or filter."
            }
            action={
              allTransactions.length === 0 ? (
                <Link href="/analysis" className="layernet-button layernet-button--primary px-4 py-2 text-sm">
                  Analyze Transaction
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    setRisk("All");
                    setType("All");
                  }}
                  className="layernet-button px-4 py-2 text-sm"
                >
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <div className="p-3 lg:p-0">
            <TransactionTable transactions={results} onRowClick={setSelected} sort={sort} onSort={handleSort} />
          </div>
        )}
      </Panel>

      {selected ? <TransactionDetail transaction={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
