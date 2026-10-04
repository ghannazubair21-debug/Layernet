"use client";

import { useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { transactionService } from "@/lib/transactionService";
import type { AnalysisResult, Transaction, TransactionRecord } from "@/lib/types";

function currentLocalDateTimeInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function Page() {
  const [id, setId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [type, setType] = useState("Purchase");
  const [location, setLocation] = useState("");
  const [channel, setChannel] = useState("Web");
  const [deviceId, setDeviceId] = useState("");
  const [timestamp, setTimestamp] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveMessage, setSaveMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const submissionGuardRef = useRef(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!id) e.id = "Transaction ID is required";
    if (amount === "" || amount <= 0) e.amount = "Amount must be greater than 0";
    if (!location) e.location = "Location is required";
    if (!timestamp || !Number.isFinite(new Date(timestamp).getTime())) e.timestamp = "Enter a valid timestamp";
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
    setSubmitError("");
    try {
      const payload: TransactionRecord = {
        transactionId: id.trim(),
        ...(accountId.trim() ? { accountId: accountId.trim() } : {}),
        amount: Number(amount),
        type,
        location: location.trim(),
        channel,
        ...(deviceId.trim() ? { deviceId: deviceId.trim() } : {}),
        timestamp: new Date(timestamp).toISOString(),
      };
      const res = await transactionService.analyze(payload);
      const savedTransaction: Transaction = {
        ...payload,
        riskScore: res.riskScore,
        risk: res.risk,
        status: res.decision === "Clear" ? "Cleared" : res.decision === "Review" ? "Reviewed" : "Flagged",
      };

      await transactionService.save(savedTransaction);
      setResult(res);
      setSaveMessage("Transaction analyzed and saved to History.");
    } catch {
      setSubmitError("Analysis could not be saved. Check the transaction details and available browser storage, then try again.");
    } finally {
      submissionGuardRef.current = false;
      setLoading(false);
    }
  };

  const handleReset = () => {
    submissionGuardRef.current = false;
    setId("");
    setAccountId("");
    setAmount("");
    setType("Purchase");
    setLocation("");
    setChannel("Web");
    setDeviceId("");
    setTimestamp(currentLocalDateTimeInput());
    setErrors({});
    setResult(null);
    setSaveMessage("");
    setSubmitError("");
    setLoading(false);
  };

  return (
    <section className="space-y-6">
      <PageHeader title="Transaction Analysis" subtitle="Review a transparent rules-based baseline. It is not a trained-model prediction." />

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Transaction ID</span>
            <input value={id} onChange={(e) => setId(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
            {errors.id ? <p className="text-sm text-[var(--danger)]">{errors.id}</p> : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Account / User ID (optional)</span>
            <input value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
            <p className="mt-1 text-xs layernet-muted">Used only to compare against earlier transactions with the same ID.</p>
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
            <span className="text-sm font-medium">Channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2">
              <option>Web</option>
              <option>Mobile</option>
              <option>POS</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Device ID (optional)</span>
            <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Timestamp</span>
            <input
              type="datetime-local"
              value={timestamp}
              onFocus={() => {
                if (!timestamp) setTimestamp(currentLocalDateTimeInput());
              }}
              onChange={(e) => setTimestamp(e.target.value)}
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
            <p className="mt-1 text-xs layernet-muted">On first focus, this defaults to your current local time.</p>
            {errors.timestamp ? <p className="text-sm text-[var(--danger)]">{errors.timestamp}</p> : null}
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
                <p className="text-2xl font-bold text-[var(--primary)]">Priority score: {result.riskScore}/100</p>
                <p className="layernet-muted">{result.scoreMeaning}</p>
                <p className="text-sm layernet-muted">Method: {result.method}</p>
                <p className="mt-2">Decision: <strong>{result.decision}</strong></p>

                <details>
                  <summary className="cursor-pointer">Behavior context (not used in this score)</summary>
                  <p className="mt-2 layernet-muted">
                    {result.behavioralBaseline.accountId
                      ? `${result.behavioralBaseline.historicalTransactionCount} earlier transaction(s) for account ${result.behavioralBaseline.accountId}.`
                      : "No account ID was supplied, so personal history and account velocity are unavailable."}
                  </p>
                  <ul className="mt-2 list-disc list-inside layernet-muted">
                    <li>Transactions in prior 1 hour: {result.features.transactionsLastHour ?? "Unavailable"}</li>
                    <li>Transactions in prior 24 hours: {result.features.transactionsLast24Hours ?? "Unavailable"}</li>
                    <li>Prior 24-hour amount: {result.features.amountLast24Hours === null ? "Unavailable" : `$${result.features.amountLast24Hours.toFixed(2)}`}</li>
                    <li>Amount z-score vs account history: {result.features.userBehavior.amountZScore === null ? "Unavailable" : result.features.userBehavior.amountZScore.toFixed(2)}</li>
                    <li>Location / channel / device change: {String(result.features.locationChanged)} / {String(result.features.channelChanged)} / {String(result.features.deviceChanged)}</li>
                  </ul>
                </details>

                <div>
                  <p className="font-semibold">Evidence and score contributions</p>
                  <ul className="mt-2 list-disc list-inside layernet-muted">
                    {result.factors.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer">Method limitations</summary>
                  <ul className="mt-2 list-disc list-inside layernet-muted">
                    {result.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                  </ul>
                </details>

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
              <p className="mt-3 layernet-muted">Fill the form and click Analyze to see the current rules baseline and its evidence.</p>
            )}
            {submitError ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{submitError}</p> : null}
          </div>
        </div>
      </form>
    </section>
  );
}
