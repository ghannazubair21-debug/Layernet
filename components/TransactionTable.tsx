"use client";

import React from "react";
import { Transaction } from "@/lib/types";
import RiskBadge from "./RiskBadge";

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatTimestamp(timestamp: string) {
  return formatter.format(new Date(timestamp));
}

export default function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="layernet-card overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="text-xs text-[var(--muted-text)]">
          <tr className="bg-[var(--surface-strong)]">
            <th className="text-left px-4 py-3">Transaction</th>
            <th className="text-left px-4 py-3">Amount</th>
            <th className="text-left px-4 py-3">Risk</th>
            <th className="text-left px-4 py-3">Device</th>
            <th className="text-left px-4 py-3">Location</th>
            <th className="text-left px-4 py-3">Time</th>
            <th className="text-left px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-t border-[var(--border)]">
              <td className="px-4 py-3 text-sm text-[var(--text)]">{t.id}</td>
              <td className="px-4 py-3 text-sm text-[var(--text)]">${t.amount.toFixed(2)}</td>
              <td className="px-4 py-3 text-sm"><RiskBadge risk={t.risk} /></td>
              <td className="px-4 py-3 text-sm text-[var(--muted-text)]">{t.device}</td>
              <td className="px-4 py-3 text-sm text-[var(--muted-text)]">{t.location}</td>
              <td className="px-4 py-3 text-sm text-[var(--muted-text)]">{formatTimestamp(t.timestamp)}</td>
              <td className="px-4 py-3 text-sm">{t.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
