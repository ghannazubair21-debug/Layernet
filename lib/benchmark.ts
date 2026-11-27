/** Client-side types and fetch helper for the ULB benchmark replay API. Inference runs server-side only. */

export type BenchmarkMetrics = {
  pr_auc: number;
  average_precision: number;
  roc_auc: number;
  precision_at_threshold: number;
  recall_at_threshold: number;
  f1_at_threshold: number;
  threshold: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  true_negatives: number;
};

export type BenchmarkModelSummary = {
  family: string;
  model_version: string;
  threshold: number;
  score_meaning: string;
  recorded_test_metrics: BenchmarkMetrics | null;
};

export type BenchmarkModelOutput = {
  score: number;
  prediction: 0 | 1;
};

export type BenchmarkRow = {
  row: number;
  Time: number;
  Amount: number;
  class: number | null;
  xgboost: BenchmarkModelOutput;
  random_forest: BenchmarkModelOutput;
};

export type BenchmarkComparison = {
  agreements: number;
  agreement_rate: number;
  positives: Record<string, number>;
  mean_scores: Record<string, number>;
};

export type BenchmarkSuccess = {
  ok: true;
  benchmark: string;
  note: string;
  row_count: number;
  labels_present: boolean;
  models: BenchmarkModelSummary[];
  rows: BenchmarkRow[];
  comparison: BenchmarkComparison;
  uploaded_row_metrics: Record<string, BenchmarkMetrics> | null;
  metrics_note: string;
};

export type BenchmarkErrorKind = "input" | "model" | "internal" | "timeout";

export type BenchmarkFailure = {
  ok: false;
  error_kind: BenchmarkErrorKind;
  error: string;
};

export class BenchmarkRequestError extends Error {
  readonly kind: BenchmarkErrorKind;

  constructor(kind: BenchmarkErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Thrown when the user cancels an in-flight benchmark request. */
export class BenchmarkCancelledError extends Error {
  constructor() {
    super("Benchmark inference was cancelled.");
    this.name = "BenchmarkCancelledError";
  }
}

export const MAX_CSV_BYTES = 2_000_000;

/** POST the CSV text to the server-side benchmark route; model files never reach the browser. */
export async function runBenchmark(csv: string, signal?: AbortSignal): Promise<BenchmarkSuccess> {
  let response: Response;
  try {
    response = await fetch("/api/benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
      signal,
    });
  } catch {
    // Aborting the request also makes the server kill the Python inference process.
    if (signal?.aborted) throw new BenchmarkCancelledError();
    throw new BenchmarkRequestError("internal", "Could not reach the benchmark service. Is the dev server running?");
  }

  let payload: BenchmarkSuccess | BenchmarkFailure;
  try {
    payload = (await response.json()) as BenchmarkSuccess | BenchmarkFailure;
  } catch {
    if (signal?.aborted) throw new BenchmarkCancelledError();
    throw new BenchmarkRequestError("internal", `Benchmark service returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok || !payload.ok) {
    const failure = payload as BenchmarkFailure;
    throw new BenchmarkRequestError(failure.error_kind ?? "internal", failure.error ?? "Benchmark inference failed.");
  }
  return payload;
}
