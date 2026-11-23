"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import {
  MAX_CSV_BYTES,
  runBenchmark,
  type BenchmarkMetrics,
  type BenchmarkSuccess,
} from "@/lib/benchmark";

const DISPLAY_ROW_LIMIT = 100;

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the uploaded file."));
    reader.readAsText(file);
  });
}

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

function MetricsTable({ title, metrics }: { title: string; metrics: Record<string, BenchmarkMetrics> }) {
  const families = Object.keys(metrics);
  return (
    <div className="layernet-card p-4">
      <p className="layernet-label">{title}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left layernet-muted">
              <th className="py-1 pr-4">Model</th>
              {METRIC_LABELS.map(({ label }) => (
                <th key={label} className="py-1 pr-4">{label}</th>
              ))}
              <th className="py-1 pr-4">Threshold</th>
              <th className="py-1">TP / TN / FP / FN</th>
            </tr>
          </thead>
          <tbody>
            {families.map((family) => {
              const entry = metrics[family];
              return (
                <tr key={family} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-4 font-medium">{family}</td>
                  {METRIC_LABELS.map(({ key }) => (
                    <td key={key} className="py-1 pr-4">{formatMetric(entry[key])}</td>
                  ))}
                  <td className="py-1 pr-4">{entry.threshold}</td>
                  <td className="py-1">
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

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
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
    setLoading(true);
    try {
      const csv = await readFileText(file);
      setResult(await runBenchmark(csv));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Benchmark inference failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeader
        title="ML Benchmark Replay"
        subtitle="Score genuine ULB/Worldline dataset rows with the saved trained models. Server-side inference only."
      />

      <div role="note" className="layernet-card border-l-4 border-[var(--warning)] p-4">
        <p className="font-semibold">ULB benchmark inference — not live real-world transaction prediction.</p>
        <p className="mt-1 text-sm layernet-muted">
          Models were trained and evaluated on the public ULB/Worldline credit-card dataset. Uploads must contain the
          published columns (Time, Amount, V1–V28; optional Class). Scores are uncalibrated ranking scores, not
          calibrated fraud probabilities. Use the Analysis page for the rules-based baseline on ordinary transactions.
        </p>
      </div>

      <div className="layernet-card p-4">
        <label className="block">
          <span className="text-sm font-medium">ULB dataset CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="ULB dataset CSV"
            className="mt-2 block w-full text-sm"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
        <p className="mt-2 text-xs layernet-muted">
          Required columns: Time, Amount, V1–V28. Optional Class enables evaluation on the uploaded rows. Maximum 5,000 rows / 2 MB.
        </p>
        {fileName ? <p className="mt-2 text-sm">Selected: {fileName}</p> : null}
        {loading ? <p className="mt-2 text-sm layernet-muted" role="status">Running server-side inference…</p> : null}
        {error ? <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      {result ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="layernet-card p-4">
              <p className="layernet-label">Rows scored</p>
              <p className="text-2xl font-bold">{result.row_count}</p>
            </div>
            <div className="layernet-card p-4">
              <p className="layernet-label">Labels uploaded</p>
              <p className="text-2xl font-bold">{result.labels_present ? "Yes" : "No"}</p>
            </div>
            <div className="layernet-card p-4">
              <p className="layernet-label">Model agreement</p>
              <p className="text-2xl font-bold">{(result.comparison.agreement_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="layernet-card p-4">
              <p className="layernet-label">Flagged (score ≥ threshold)</p>
              <p className="text-sm mt-1">
                {Object.entries(result.comparison.positives)
                  .map(([family, count]) => `${family}: ${count}`)
                  .join(" · ")}
              </p>
            </div>
          </div>

          {result.models.map((model) => (
            <div key={model.family} className="layernet-card p-4">
              <p className="font-semibold">{model.family}</p>
              <p className="text-xs layernet-muted mt-1">
                Model version {model.model_version} · frozen threshold {model.threshold} · {model.score_meaning}
              </p>
            </div>
          ))}

          {result.uploaded_row_metrics ? (
            <MetricsTable title="Evaluation on uploaded rows" metrics={result.uploaded_row_metrics} />
          ) : null}
          <p className="text-sm layernet-muted">{result.metrics_note}</p>

          {result.models.some((model) => model.recorded_test_metrics) ? (
            <details className="layernet-card p-4">
              <summary className="cursor-pointer font-medium">Recorded original held-out test metrics (reference)</summary>
              <div className="mt-3 space-y-3">
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

          <div className="layernet-card p-4">
            <p className="layernet-label">
              Predictions {result.row_count > DISPLAY_ROW_LIMIT ? `(first ${DISPLAY_ROW_LIMIT} of ${result.row_count} rows)` : ""}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left layernet-muted">
                    <th className="py-1 pr-4">Row</th>
                    <th className="py-1 pr-4">Time</th>
                    <th className="py-1 pr-4">Amount</th>
                    <th className="py-1 pr-4">Class</th>
                    <th className="py-1 pr-4">XGBoost score</th>
                    <th className="py-1 pr-4">XGBoost pred</th>
                    <th className="py-1 pr-4">RF score</th>
                    <th className="py-1">RF pred</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, DISPLAY_ROW_LIMIT).map((row) => (
                    <tr key={row.row} className="border-t border-[var(--border)]">
                      <td className="py-1 pr-4">{row.row}</td>
                      <td className="py-1 pr-4">{row.Time}</td>
                      <td className="py-1 pr-4">{row.Amount.toFixed(2)}</td>
                      <td className="py-1 pr-4">{row.class ?? "—"}</td>
                      <td className="py-1 pr-4">{row.xgboost.score.toFixed(4)}</td>
                      <td className="py-1 pr-4">{row.xgboost.prediction}</td>
                      <td className="py-1 pr-4">{row.random_forest.score.toFixed(4)}</td>
                      <td className="py-1">{row.random_forest.prediction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
