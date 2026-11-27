"use client";

import { useRef, useState } from "react";
import { RotateCcw, ScanSearch } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Panel from "@/components/Panel";
import ScoreIndicator from "@/components/ScoreIndicator";
import { transactionService } from "@/lib/transactionService";
import { DEFAULT_CURRENCY, SELECTABLE_CURRENCIES, formatAmount, type SelectableCurrency } from "@/lib/currency";
import type { AnalysisResult, Transaction, TransactionRecord } from "@/lib/types";

function currentLocalDateTimeInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** DOM ids of the validated inputs, keyed by validation error key. */
const FIELD_IDS = { id: "tx-id", amount: "tx-amount", location: "tx-location", timestamp: "tx-timestamp" } as const;

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] transition-colors placeholder:text-[var(--muted-text)] hover:border-[var(--rose-soft)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20";

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-[var(--text)]">
          {label}
        </label>
        {required ? (
          <span aria-hidden="true" className="text-sm text-[var(--primary)]">*</span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p id={`hint-${id}`} className="mt-1.5 text-xs text-[var(--muted-text)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`err-${id}`} className="mt-1.5 text-xs font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function Page() {
  const [id, setId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [currency, setCurrency] = useState<SelectableCurrency>(DEFAULT_CURRENCY);
  const [resultCurrency, setResultCurrency] = useState<SelectableCurrency>(DEFAULT_CURRENCY);
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
  const resultRef = useRef<HTMLDivElement>(null);

  function validate() {
    const e: Record<string, string> = {};
    if (!id.trim()) e.id = "Transaction ID is required";
    if (amount === "" || !Number.isFinite(amount) || amount <= 0) e.amount = "Amount must be a finite number greater than 0";
    if (!location.trim()) e.location = "Location is required";
    if (!timestamp || !Number.isFinite(new Date(timestamp).getTime())) e.timestamp = "Enter a valid timestamp";
    return e;
  }

  const handleSubmit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();

    if (submissionGuardRef.current) return;

    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      // Move keyboard/screen-reader focus to the first invalid field, in form order.
      const firstInvalid = (["id", "amount", "location", "timestamp"] as const).find((key) => e[key]);
      if (firstInvalid) document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }

    submissionGuardRef.current = true;
    setLoading(true);
    setSubmitError("");
    try {
      const payload: TransactionRecord = {
        transactionId: id.trim(),
        ...(accountId.trim() ? { accountId: accountId.trim() } : {}),
        amount: Number(amount),
        currency,
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
      setResultCurrency(currency);
      setResult(res);
      setSaveMessage("Transaction analyzed and saved to History.");
      window.requestAnimationFrame(() => {
        const node = resultRef.current;
        if (node && typeof node.scrollIntoView === "function") {
          node.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
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
    setCurrency(DEFAULT_CURRENCY);
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
    <section className="space-y-5">
      <PageHeader
        eyebrow="Investigation"
        title="Transaction Analysis"
        subtitle="Review a transparent rules-based baseline. It is not a trained-model prediction."
      />

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Form workbench */}
        <Panel title="Transaction details" className="ln-enter lg:col-span-5">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <fieldset className="space-y-4">
              <legend className="layernet-label mb-1">Identity</legend>
              <Field id="tx-id" label="Transaction ID" required error={errors.id}>
                <input
                  id="tx-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  aria-required="true"
                  aria-invalid={Boolean(errors.id)}
                  aria-describedby={errors.id ? "err-tx-id" : undefined}
                  placeholder="TX-0001"
                  className={inputClass}
                />
              </Field>

              <Field
                id="tx-account"
                label="Account / User ID (optional)"
                hint="Used only to compare against earlier transactions with the same ID."
              >
                <input
                  id="tx-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  aria-describedby="hint-tx-account"
                  placeholder="C123456789"
                  className={inputClass}
                />
              </Field>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="layernet-label mb-1">Transaction</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="tx-amount" label="Amount" required error={errors.amount}>
                  <input
                    id="tx-amount"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    aria-required="true"
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={errors.amount ? "err-tx-amount" : undefined}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`${inputClass} ln-data`}
                  />
                </Field>

                <Field
                  id="tx-currency"
                  label="Currency"
                  hint="Stored with the amount. No conversion is applied; the score uses the nominal amount."
                >
                  <select
                    id="tx-currency"
                    value={currency}
                    onChange={(e) => {
                      const next = e.target.value;
                      if ((SELECTABLE_CURRENCIES as readonly string[]).includes(next)) setCurrency(next as SelectableCurrency);
                    }}
                    aria-describedby="hint-tx-currency"
                    className={inputClass}
                  >
                    {SELECTABLE_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="tx-type" label="Transaction Type">
                  <select id="tx-type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
                    <option>Purchase</option>
                    <option>Refund</option>
                    <option>Withdrawal</option>
                  </select>
                </Field>
              </div>

              <Field id="tx-location" label="Location" required error={errors.location}>
                <input
                  id="tx-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  aria-required="true"
                  aria-invalid={Boolean(errors.location)}
                  aria-describedby={errors.location ? "err-tx-location" : undefined}
                  placeholder="City, Country"
                  className={inputClass}
                />
              </Field>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="layernet-label mb-1">Context</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="tx-channel" label="Channel">
                  <select id="tx-channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={inputClass}>
                    <option>Web</option>
                    <option>Mobile</option>
                    <option>POS</option>
                  </select>
                </Field>

                <Field id="tx-device" label="Device ID (optional)">
                  <input
                    id="tx-device"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="D-0001"
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field
                id="tx-timestamp"
                label="Timestamp"
                required
                hint="On first focus, this defaults to your current local time."
                error={errors.timestamp}
              >
                <input
                  id="tx-timestamp"
                  type="datetime-local"
                  value={timestamp}
                  onFocus={() => {
                    if (!timestamp) setTimestamp(currentLocalDateTimeInput());
                  }}
                  onChange={(e) => setTimestamp(e.target.value)}
                  aria-required="true"
                  aria-invalid={Boolean(errors.timestamp)}
                  aria-describedby={errors.timestamp ? "hint-tx-timestamp err-tx-timestamp" : "hint-tx-timestamp"}
                  className={`${inputClass} ln-data`}
                />
              </Field>
            </fieldset>

            <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-4">
              <button disabled={loading} type="submit" className="layernet-button layernet-button--primary px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                <ScanSearch aria-hidden="true" className="size-4" />
                {loading ? "Analyzing..." : "Analyze Transaction"}
              </button>
              <button type="button" onClick={handleReset} className="layernet-button px-4 py-2.5 text-sm">
                <RotateCcw aria-hidden="true" className="size-4" /> Reset
              </button>
            </div>
          </form>
        </Panel>

        {/* Result dossier */}
        <div ref={resultRef} className="lg:col-span-7">
          <Panel title="Assessment dossier" className="ln-enter">
            {result ? (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-5 rounded-lg bg-[var(--surface-strong)] p-5 sm:flex-row sm:items-center">
                  <ScoreIndicator score={result.riskScore} size={170} />
                  <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                    <p className="text-lg font-semibold text-[var(--text)]">Risk: {result.risk}</p>
                    <p className="ln-data text-2xl font-bold text-[var(--primary)]">
                      Priority score: {result.riskScore}/100
                    </p>
                    <p className="text-sm text-[var(--muted-text)]">{result.scoreMeaning}</p>
                    <p className="text-xs text-[var(--muted-text)]">Method: {result.method}</p>
                    <p className="text-sm text-[var(--text)]">
                      Decision:{" "}
                      <strong
                        className={
                          result.decision === "Block"
                            ? "text-[var(--danger)]"
                            : result.decision === "Review"
                              ? "text-[var(--warning)]"
                              : "text-[var(--success)]"
                        }
                      >
                        {result.decision}
                      </strong>
                    </p>
                  </div>
                </div>

                <div>
                  <p className="layernet-label mb-2">Evidence and score contributions</p>
                  <ul className="space-y-1.5">
                    {result.factors.map((f) => (
                      <li key={f} className="flex gap-2 text-sm text-[var(--muted-text)]">
                        <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--rose-gold)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
                    Behavior context (not used in this score)
                  </summary>
                  <div className="border-t border-[var(--border)] px-4 py-3">
                    <p className="text-sm text-[var(--muted-text)]">
                      {result.behavioralBaseline.accountId
                        ? `${result.behavioralBaseline.historicalTransactionCount} earlier transaction(s) for account ${result.behavioralBaseline.accountId}.`
                        : "No account ID was supplied, so personal history and account velocity are unavailable."}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-[var(--muted-text)]">
                      <li>Transactions in prior 1 hour: {result.features.transactionsLastHour ?? "Unavailable"}</li>
                      <li>Transactions in prior 24 hours: {result.features.transactionsLast24Hours ?? "Unavailable"}</li>
                      <li>Prior 24-hour amount: {result.features.amountLast24Hours === null ? "Unavailable" : formatAmount(result.features.amountLast24Hours, resultCurrency)}</li>
                      <li>Amount z-score vs account history: {result.features.userBehavior.amountZScore === null ? "Unavailable" : result.features.userBehavior.amountZScore.toFixed(2)}</li>
                      <li>Location / channel / device change: {String(result.features.locationChanged)} / {String(result.features.channelChanged)} / {String(result.features.deviceChanged)}</li>
                    </ul>
                  </div>
                </details>

                <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">Method limitations</summary>
                  <ul className="space-y-1.5 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-text)]">
                    {result.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </details>

                <div className="rounded-lg border-l-2 border-[var(--rose-gold)] bg-[var(--rose-tint)] px-4 py-3">
                  <p className="layernet-label">Recommended action</p>
                  <p className="mt-1 text-sm text-[var(--text)]">{result.recommendation}</p>
                </div>

                <p className="text-sm font-semibold text-[var(--success)]">{saveMessage}</p>

                <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">Explanation</summary>
                  <p className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-text)]">{result.explanation}</p>
                </details>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-[var(--rose-tint)] text-[var(--primary)]">
                  <ScanSearch aria-hidden="true" className="size-7" />
                </span>
                <p className="mt-4 max-w-sm text-sm text-[var(--muted-text)]">
                  Fill the form and click Analyze to see the current rules baseline and its evidence.
                </p>
              </div>
            )}
            {submitError ? (
              <p role="alert" className="mt-4 rounded-lg bg-[var(--danger-tint)] px-4 py-3 text-sm text-[var(--danger)]">
                {submitError}
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
    </section>
  );
}
