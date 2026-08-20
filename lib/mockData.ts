import { Transaction } from "./types";

export const transactions: Transaction[] = [
  {
    id: "TX-1001",
    amount: 3420.0,
    type: "Purchase",
    location: "Chicago, IL",
    device: "Web",
    timestamp: "2026-08-19T09:42:00.000Z",
    riskScore: 81,
    risk: "Medium",
    status: "Flagged",
  },
  {
    id: "TX-1002",
    amount: 59.99,
    type: "Purchase",
    location: "New York, NY",
    device: "Mobile",
    timestamp: "2026-08-19T08:18:00.000Z",
    riskScore: 12,
    risk: "Low",
    status: "Cleared",
  },
  {
    id: "TX-1003",
    amount: 1299.0,
    type: "Refund",
    location: "San Francisco, CA",
    device: "Web",
    timestamp: "2026-08-18T17:05:00.000Z",
    riskScore: 65,
    risk: "Medium",
    status: "Reviewed",
  },
  {
    id: "TX-1004",
    amount: 10000.0,
    type: "Purchase",
    location: "Lagos, NG",
    device: "Mobile",
    timestamp: "2026-08-18T03:40:00.000Z",
    riskScore: 95,
    risk: "High",
    status: "Flagged",
  },
  {
    id: "TX-1005",
    amount: 6.5,
    type: "Purchase",
    location: "Austin, TX",
    device: "POS",
    timestamp: "2026-08-19T12:05:00.000Z",
    riskScore: 4,
    risk: "Low",
    status: "Cleared",
  },
];

export function getMetrics() {
  const total = transactions.length;
  const fraudDetected = transactions.filter((t) => t.risk !== "Low").length;
  const avgRisk = Math.round(
    transactions.reduce((s, t) => s + t.riskScore, 0) / Math.max(1, transactions.length)
  );
  const fraudRate = Math.round((fraudDetected / Math.max(1, total)) * 1000) / 10;

  return {
    total,
    fraudDetected,
    avgRisk,
    fraudRate,
  };
}

export function queryTransactions(query = "", filters: Partial<{ risk: string; type: string }> = {}) {
  const q = query.trim().toLowerCase();
  return transactions.filter((t) => {
    if (q) {
      if (!(t.id.toLowerCase().includes(q) || t.location.toLowerCase().includes(q))) return false;
    }
    if (filters.risk && filters.risk !== "All") {
      if (t.risk !== filters.risk) return false;
    }
    if (filters.type && filters.type !== "All") {
      if (t.type !== filters.type) return false;
    }
    return true;
  });
}
