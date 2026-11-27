"use client";

import { useEffect, useRef, useState } from "react";
import { FlaskConical, Upload } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Panel from "@/components/Panel";
import {
  BenchmarkCancelledError,
  MAX_CSV_BYTES,
  runBenchmark,
  type BenchmarkMetrics,
  type BenchmarkSuccess,
} from "@/lib/benchmark";

const DISPLAY_ROW_LIMIT = 100;

const METRIC_LABELS: { key: keyof BenchmarkMetrics; label: string }[] = [
  { key: "pr_auc", label: "PR-AUC" },
  { key: "average_precision", label: "Average Precision" },
  { key: "roc_auc", label: "ROC-AUC" },
  { key: "precision_at_threshold", label: "Precision" },
  { key: "recall_at_threshold", label: "Recall" },
  { key: "f1_at_threshold", label: "F1" },
];

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the uploaded file."));
    reader.readAsText(file);
  });
}

function MetricsTable({ title, metrics }: { title: string; metrics: Record<string, BenchmarkMetrics> }) {
  const families = Object.keys(metrics);
  return (
    <div>
      {title ? <p className="layernet-label">{title}</p> : null}
      <div className={title ? "mt-3 overflow-x-auto" : "overflow-x-auto"}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--muted-text)]">
              <th className="py-1.5 pr-4">Model</th>
              {METRIC_LABELS.map(({ label }) => (
                <th key={label} className="py-1.5 pr-4">{label}</th>
              ))}
              <th className="py-1.5 pr-4">Threshold</th>
              <th className="py-1.5">TP / TN / FP / FN</th>
            </tr>
          </thead>
          <tbody>
            {families.map((family) => {
              const entry = metrics[family];
              return (
                <tr key={family} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-4 font-medium text-[var(--text)]">{family}</td>
                  {METRIC_LABELS.map(({ key }) => (
                    <td key={key} className="ln-data py-2 pr-4 text-[var(--text)]">{formatMetric(entry[key])}</td>
                  ))}
                  <td className="ln-data py-2 pr-4 text-[var(--muted-text)]">{entry.threshold}</td>
                  <td className="ln-data py-2 text-[var(--muted-text)]">
                    {entry.true_positives} / {entry.true_negatives} / {entry.false_positives} / {entry.false_negatives}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BenchmarkPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BenchmarkSuccess | null>(null);
  const [fileName, setFileName] = useState("");
  const [notice, setNotice] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  // Abort an in-flight request if the user navigates away; the server then stops the Python process.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const cancel = () => controllerRef.current?.abort();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice("");
    setError("");
    setResult(null);
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Upload a .csv file with genuine ULB dataset rows.");
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setError(`File exceeds the ${MAX_CSV_BYTES} byte upload limit. Upload a smaller slice of the dataset.`);
      return;
    }
    if (file.size === 0) {
      setError("The selected file is empty. Choose a CSV that contains a header row and ULB data rows.");
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const csv = await readFileText(file);
      setResult(await runBenchmark(csv, controller.signal));
    } catch (cause) {
      if (cause instanceof BenchmarkCancelledError) {
        setNotice("Inference cancelled. No results were produced; choose a file to run again.");
      } else {
        setError(cause instanceof Error ? cause.message : "Benchmark inference failed.");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Intelligence"
        title="ML Benchmark Replay"
        subtitle="Score genuine ULB/Worldline dataset rows with the saved trained models. Server-side inference only."
      />

      <div role="note" className="ln-enter rounded-lg border border-[var(--rose-gold)]/40 border-l-4 border-l-[var(--rose-gold)] bg-[var(--rose-tint)] px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <FlaskConical aria-hidden="true" className="size-4 text-[var(--rose-gold)]" />
          ULB benchmark inference — not live real-world transaction prediction.
        </p>
        <p className="mt-1.5 text-sm text-[var(--muted-text)]">
          Models were trained and evaluated on the public ULB/Worldline credit-card dataset. Uploads must contain the
          published columns (Time, Amount, V1–V28; optional Class). Scores are uncalibrated ranking scores, not
          calibrated fraud probabilities. Use the Analysis page for the rules-based baseline on ordinary transactions.
        </p>
      </div>

      <Panel title="Dataset upload" className="ln-enter">
        <label className="block">
          <span className="text-sm font-medium text-[var(--text)]">ULB dataset CSV</span>
          <span
            className={`mt-2 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--rose-soft)] bg-[var(--surface-strong)]/60 px-4 py-8 transition-colors focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface)] ${
              loading ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--rose-tint)]/60"
            }`}
          >
            <Upload aria-hidden="true" className="size-6 text-[var(--primary)]" />
            <span className="text-sm text-[var(--muted-text)]">
              {loading ? "Inference in progress — wait for it to finish" : "Choose a CSV file with genuine ULB rows"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="ULB dataset CSV"
              className="sr-only"
              disabled={loading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Reset so choosing the same file again (e.g. after fixing it) fires a new change event.
                event.target.value = "";
                void handleFile(file);
              }}
            />
          </span>
        </label>
        <p className="mt-2.5 text-xs text-[var(--muted-text)]">
          Required columns: Time, Amount, V1–V28. Optional Class enables evaluation on the uploaded rows. Maximum 5,000 rows / 2 MB.
        </p>
        {fileName ? <p className="ln-data mt-2 text-sm text-[var(--text)]">Selected: {fileName}</p> : null}
        {loading ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm text-[var(--muted-text)]" role="status">
              <span aria-hidden="true" className="layernet-spin inline-block size-3.5 rounded-full border-2 border-[var(--rose-soft)] border-t-[var(--primary)]" />
              Running server-side inference…
            </p>
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--rose-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              Cancel inference
            </button>
          </div>
        ) : null}
        {notice ? <p role="status" className="mt-2 text-sm text-[var(--muted-text)]">{notice}</p> : null}
        {error ? <p role="alert" className="mt-2 rounded-lg bg-[var(--danger-tint)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Panel>

      {result ? (
        <div className="ln-enter-stagger space-y-4">
          <p className="layernet-label">Uploaded dataset results · scope: rows in your CSV only</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="layernet-card p-4">
              <p className="layernet-label">Rows scored</p>
              <p className="ln-data mt-1.5 text-[26px] font-semibold leading-none text-[var(--text)]">{result.row_count}</p>
            </div>
            <div className="layernet-card p-4">
              <p className="layernet-label">Labels uploaded</p>
              <p className="ln-data mt-1.5 text-[26px] font-semibold leading-none text-[var(--text)]">{result.labels_present ? "Yes" : "No"}</p>
            </div>
            <div className="layernet-card p-4">
              <p className="layernet-label">Model agreement</p>
              <p className="ln-data mt-1.5 text-[26px] font-semibold leading-none text-[var(--text)]">{(result.comparison.agreement_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="layernet-card p-4">
              <p className="layernet-label">Flagged (score ≥ threshold)</p>
              <ul className="mt-2 space-y-1">
                {Object.entries(result.comparison.positives).map(([family, count]) => (
                  <li key={family} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="ln-data text-xs text-[var(--muted-text)]">{family}</span>
                    <span className="ln-data font-semibold text-[var(--text)]">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {result.models.map((model) => (
              <div key={model.family} className="layernet-card p-4">
                <p className="text-sm font-semibold text-[var(--text)]">{model.family}</p>
                <p className="ln-data mt-1 text-xs text-[var(--muted-text)]">
                  version {model.model_version} · frozen threshold {model.threshold}
                </p>
                <p className="mt-1.5 text-xs text-[var(--muted-text)]">{model.score_meaning}</p>
              </div>
            ))}
          </div>

          {result.uploaded_row_metrics ? (
            <Panel title="Evaluation on uploaded rows" className="ln-enter">
              <MetricsTable title="" metrics={result.uploaded_row_metrics} />
            </Panel>
          ) : null}
          <p className="text-sm text-[var(--muted-text)]">{result.metrics_note}</p>

          {result.models.some((model) => model.recorded_test_metrics) ? (
            <details className="layernet-card ln-enter p-4">
              <summary className="cursor-pointer text-sm font-medium text-[var(--text)]">
                Recorded original held-out test metrics (reference)
              </summary>
              <div className="mt-4 space-y-5">
                {result.models
                  .filter((model) => model.recorded_test_metrics)
                  .map((model) => (
                    <MetricsTable
                      key={model.family}
                      title={`${model.family} — original ULB test split`}
                      metrics={{ [model.family]: model.recorded_test_metrics as BenchmarkMetrics }}
                    />
                  ))}
              </div>
            </details>
          ) : null}

          <Panel
            title={`Predictions${result.row_count > DISPLAY_ROW_LIMIT ? ` (first ${DISPLAY_ROW_LIMIT} of ${result.row_count} rows)` : ""}`}
            className="ln-enter"
            bodyClassName="p-0"
          >
            <div className="max-h-[560px] overflow-auto" tabIndex={0} role="region" aria-label="Per-row benchmark predictions">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-[var(--surface-strong)] text-left text-[11px] uppercase tracking-[0.06em] text-[var(--muted-text)]">
                    <th className="px-4 py-2.5">Row</th>
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Class</th>
                    <th className="px-4 py-2.5">XGBoost score</th>
                    <th className="px-4 py-2.5">XGBoost pred</th>
                    <th className="px-4 py-2.5">RF score</th>
                    <th className="px-4 py-2.5">RF pred</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, DISPLAY_ROW_LIMIT).map((row) => (
                    <tr key={row.row} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--rose-tint)]/40">
                      <td className="ln-data px-4 py-2 text-[var(--muted-text)]">{row.row}</td>
                      <td className="ln-data px-4 py-2 text-[var(--muted-text)]">{row.Time}</td>
                      <td className="ln-data px-4 py-2 text-[var(--text)]">{row.Amount.toFixed(2)}</td>
                      <td className="ln-data px-4 py-2 text-[var(--muted-text)]">{row.class ?? "—"}</td>
                      <td className="ln-data px-4 py-2 text-[var(--primary)]">{row.xgboost.score.toFixed(4)}</td>
                      <td className="ln-data px-4 py-2 text-[var(--text)]">{row.xgboost.prediction}</td>
                      <td className="ln-data px-4 py-2 text-[var(--primary)]">{row.random_forest.score.toFixed(4)}</td>
                      <td className="ln-data px-4 py-2 text-[var(--text)]">{row.random_forest.prediction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}
    </section>
  );
}
