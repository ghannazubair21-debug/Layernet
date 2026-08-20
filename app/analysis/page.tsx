"use client";

import { useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { analyzeTransaction } from "@/lib/fraudAnalysis";
import { saveTransaction } from "@/lib/transactionStorage";
import { AnalysisResult, Transaction } from "@/lib/types";

export default function Page() {
  const [id, setId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [type, setType] = useState("Purchase");
  const [location, setLocation] = useState("");
  const [device, setDevice] = useState("Web");
  const [timestamp, setTimestamp] = useState<string>("2026-08-19T12:00");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveMessage, setSaveMessage] = useState("");
  const submissionGuardRef = useRef(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!id) e.id = "Transaction ID is required";
    if (amount === "" || amount <= 0) e.amount = "Amount must be greater than 0";
    if (!location) e.location = "Location is required";
    return e;
  }

  const handleSubmit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();

    if (submissionGuardRef.current) return;

    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    submissionGuardRef.current = true;
    setLoading(true);

    const payload = { id, amount: Number(amount), type, location, device, timestamp };
    const res = analyzeTransaction(payload);
    await new Promise((r) => setTimeout(r, 400));

    const savedTransaction: Transaction = {
      id,
      amount: Number(amount),
      type,
      location,
      device,
      timestamp: new Date(timestamp).toISOString(),
      riskScore: res.riskScore,
      risk: res.risk,
      status: res.decision === "Clear" ? "Cleared" : res.decision === "Review" ? "Reviewed" : "Flagged",
    };

    saveTransaction(savedTransaction);
    setResult(res);
    setSaveMessage("Transaction analyzed and saved to History.");
    setLoading(false);
  };

  const handleReset = () => {
    submissionGuardRef.current = false;
    setId("");
    setAmount("");
    setType("Purchase");
    setLocation("");
    setDevice("Web");
    setTimestamp("2026-08-19T12:00");
    setErrors({});
    setResult(null);
    setSaveMessage("");
    setLoading(false);
  };

  return (
    <section className="space-y-6">
      <PageHeader title="Transaction Analysis" subtitle="Analyze a transaction and receive a deterministic mock risk assessment." />

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Transaction ID</span>
            <input value={id} onChange={(e) => setId(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
            {errors.id ? <p className="text-sm text-[var(--danger)]">{errors.id}</p> : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Amount</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} className="mt-1 block w-full rounded-md border px-3 py-2" />
            {errors.amount ? <p className="text-sm text-[var(--danger)]">{errors.amount}</p> : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Transaction Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2">
              <option>Purchase</option>
              <option>Refund</option>
              <option>Withdrawal</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
            {errors.location ? <p className="text-sm text-[var(--danger)]">{errors.location}</p> : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Device / Channel</span>
            <select value={device} onChange={(e) => setDevice(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2">
              <option>Web</option>
              <option>Mobile</option>
              <option>POS</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Timestamp</span>
            <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
          </label>

          <div className="flex gap-3">
            <button disabled={loading} type="submit" className="layernet-button layernet-button--primary">
              {loading ? "Analyzing..." : "Analyze Transaction"}
            </button>
            <button type="button" onClick={handleReset} className="layernet-button">
              Reset
            </button>
          </div>
        </div>

        <div>
          <div className="layernet-card p-4">
            <p className="layernet-label">Result</p>

            {result ? (
              <div className="mt-3 space-y-3">
                <p className="text-lg font-semibold">Risk: {result.risk}</p>
                <p className="text-2xl font-bold text-[var(--primary)]">Score: {result.riskScore}</p>
                <p className="layernet-muted">Probability: {(result.probability * 100).toFixed(1)}%</p>
                <p className="mt-2">Decision: <strong>{result.decision}</strong></p>

                <div>
                  <p className="font-semibold">Detected factors</p>
                  <ul className="mt-2 list-disc list-inside layernet-muted">
                    {result.factors.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                </div>

                <div>
                  <p className="font-semibold">Recommended action</p>
                  <p className="layernet-muted">{result.recommendation}</p>
                </div>

                <div>
                  <p className="font-semibold text-[var(--success)]">{saveMessage}</p>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer">Explanation</summary>
                  <p className="mt-2 layernet-muted">{result.explanation}</p>
                </details>
              </div>
            ) : (
              <p className="mt-3 layernet-muted">Fill the form and click Analyze to receive a deterministic mock assessment.</p>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
