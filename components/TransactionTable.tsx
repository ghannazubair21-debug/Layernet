"use client";

import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Transaction } from "@/lib/types";
import RiskBadge from "./RiskBadge";
import { cn, formatUsd } from "@/lib/utils";

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatTimestamp(timestamp: string) {
  return formatter.format(new Date(timestamp));
}

export type TransactionSortKey = "timestamp" | "amount" | "riskScore";
export type TransactionSort = { key: TransactionSortKey; dir: "asc" | "desc" };

const STATUS_STYLES: Record<Transaction["status"], string> = {
  Cleared: "bg-[var(--success-tint)] text-[var(--success)]",
  Reviewed: "bg-[var(--warning-tint)] text-[var(--warning)]",
  Flagged: "bg-[var(--danger-tint)] text-[var(--danger)]",
};

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey?: TransactionSortKey;
  sort?: TransactionSort;
  onSort?: (key: TransactionSortKey) => void;
  className?: string;
}) {
  if (!sortKey || !onSort) {
    return <th className={cn("px-4 py-3 text-left", className)}>{label}</th>;
  }
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn("px-4 py-3 text-left", className)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-[0.06em] transition-colors hover:text-[var(--primary)]"
      >
        {label}
        <Icon aria-hidden="true" className={cn("size-3", active ? "text-[var(--primary)]" : "opacity-50")} />
      </button>
    </th>
  );
}

/** Responsive transaction presentation: table on wide screens, cards below (lg for full, md for compact). */
export default function TransactionTable({
  transactions,
  onRowClick,
  sort,
  onSort,
  compact = false,
}: {
  transactions: Transaction[];
  /** Compact mode drops Type and Status columns so the table fits narrow panels. */
  compact?: boolean;
  onRowClick?: (transaction: Transaction) => void;
  sort?: TransactionSort;
  onSort?: (key: TransactionSortKey) => void;
}) {
  return (
    <>
      {/* Desktop / tablet table */}
      <div className={cn("hidden overflow-x-auto", compact ? "md:block" : "lg:block")}>
        <table className={cn("w-full border-collapse text-sm", !compact && "min-w-[820px]")}>
          <thead>
            <tr className="bg-[var(--surface-strong)] text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-text)]">
              <SortHeader label="Transaction" />
              <SortHeader label="Amount" sortKey="amount" sort={sort} onSort={onSort} />
              {!compact && <SortHeader label="Type" />}
              <SortHeader label="Risk" />
              <SortHeader label="Score" sortKey="riskScore" sort={sort} onSort={onSort} />
              <SortHeader label="Time (UTC)" sortKey="timestamp" sort={sort} onSort={onSort} />
              {!compact && <SortHeader label="Status" />}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr
                key={t.transactionId}
                onClick={onRowClick ? () => onRowClick(t) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(t);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                aria-label={onRowClick ? `View details for ${t.transactionId}` : undefined}
                className={cn(
                  "border-t border-[var(--border)] transition-colors",
                  onRowClick && "cursor-pointer hover:bg-[var(--rose-tint)]/50 focus-visible:bg-[var(--rose-tint)]/50",
                )}
              >
                <td className="ln-data px-4 py-3 font-medium text-[var(--text)]">{t.transactionId}</td>
                <td className="ln-data px-4 py-3 text-[var(--text)]">{formatUsd(t.amount)}</td>
                {!compact && <td className="px-4 py-3 text-[var(--muted-text)]">{t.type}</td>}
                <td className="px-4 py-3"><RiskBadge risk={t.risk} /></td>
                <td className="ln-data px-4 py-3 text-[var(--text)]">{t.riskScore}</td>
                <td className="ln-data px-4 py-3 text-xs text-[var(--muted-text)]">{formatTimestamp(t.timestamp)}</td>
                {!compact && (
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[t.status])}>
                      {t.status}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className={cn("grid gap-2.5", compact ? "md:hidden" : "sm:grid-cols-2 lg:hidden")}>
        {transactions.map((t) => {
          const cardBody = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="ln-data truncate text-sm font-medium text-[var(--text)]">{t.transactionId}</span>
                <RiskBadge risk={t.risk} />
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="ln-data text-lg font-semibold text-[var(--text)]">{formatUsd(t.amount)}</span>
                <span className="ln-data text-xs text-[var(--muted-text)]">score {t.riskScore}/100</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted-text)]">
                <span>{t.type}</span>
                {t.channel ? <span>{t.channel}</span> : null}
                <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_STYLES[t.status])}>{t.status}</span>
              </div>
              <p className="ln-data mt-1.5 text-[11px] text-[var(--muted-text)]">{formatTimestamp(t.timestamp)} UTC</p>
            </>
          );
          return (
            <li key={t.transactionId}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(t)}
                  aria-label={`View details for ${t.transactionId}`}
                  className="layernet-card block w-full p-3.5 text-left transition-colors active:bg-[var(--rose-tint)]/60"
                >
                  {cardBody}
                </button>
              ) : (
                <div className="layernet-card p-3.5">{cardBody}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
