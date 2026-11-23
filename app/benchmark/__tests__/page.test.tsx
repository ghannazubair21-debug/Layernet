import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BenchmarkPage from "@/app/benchmark/page";
import type { BenchmarkSuccess } from "@/lib/benchmark";

const successPayload: BenchmarkSuccess = {
  ok: true,
  benchmark: "layernet-ulb-benchmark-replay.v1",
  note: "ULB benchmark replay on uploaded dataset rows; not live real-world transaction fraud prediction.",
  row_count: 2,
  labels_present: true,
  models: [
    {
      family: "xgboost",
      model_version: "19963fe109752f91",
      threshold: 0.5,
      score_meaning: "Uncalibrated XGBoost ranking score.",
      recorded_test_metrics: null,
    },
    {
      family: "random_forest",
      model_version: "94ed04c3e40f6079",
      threshold: 0.5,
      score_meaning: "Uncalibrated Random Forest positive-class score.",
      recorded_test_metrics: null,
    },
  ],
  rows: [
    { row: 0, Time: 0, Amount: 149.62, class: 0, xgboost: { score: 0.0123, prediction: 0 }, random_forest: { score: 0.02, prediction: 0 } },
    { row: 1, Time: 10, Amount: 10000, class: 1, xgboost: { score: 0.91, prediction: 1 }, random_forest: { score: 0.85, prediction: 1 } },
  ],
  comparison: {
    agreements: 2,
    agreement_rate: 1,
    positives: { xgboost: 1, random_forest: 1 },
    mean_scores: { xgboost: 0.46, random_forest: 0.43 },
  },
  uploaded_row_metrics: {
    xgboost: {
      pr_auc: 1, average_precision: 1, roc_auc: 1,
      precision_at_threshold: 1, recall_at_threshold: 1, f1_at_threshold: 1,
      threshold: 0.5, true_positives: 1, true_negatives: 1, false_positives: 0, false_negatives: 0,
    },
    random_forest: {
      pr_auc: 1, average_precision: 1, roc_auc: 1,
      precision_at_threshold: 1, recall_at_threshold: 1, f1_at_threshold: 1,
      threshold: 0.5, true_positives: 1, true_negatives: 1, false_positives: 0, false_negatives: 0,
    },
  },
  metrics_note: "Metrics computed on the uploaded rows only at each model's frozen manifest threshold.",
};

function csvFile(name = "ulb-rows.csv"): File {
  return new File(["Time,Amount,V1\n0,149.62,0.1\n"], name, { type: "text/csv" });
}

describe("BenchmarkPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("labels the page as ULB benchmark inference, not live prediction", () => {
    render(<BenchmarkPage />);
    expect(screen.getByRole("heading", { name: "ML Benchmark Replay" })).toBeInTheDocument();
    expect(
      screen.getByText(/ULB benchmark inference — not live real-world transaction prediction/),
    ).toBeInTheDocument();
  });

  it("rejects non-CSV files without calling the API", async () => {
    const user = userEvent.setup();
    render(<BenchmarkPage />);
    await user.upload(
      screen.getByLabelText("ULB dataset CSV"),
      new File(["hello"], "notes.txt", { type: "text/csv" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(".csv");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized files without calling the API", async () => {
    const user = userEvent.setup();
    render(<BenchmarkPage />);
    const big = new File(["a".repeat(2_000_001)], "big.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("ULB dataset CSV"), big);
    expect(await screen.findByRole("alert")).toHaveTextContent(/upload limit/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders predictions, comparison and metrics after a successful upload", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(successPayload), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const user = userEvent.setup();
    render(<BenchmarkPage />);
    await user.upload(screen.getByLabelText("ULB dataset CSV"), csvFile());

    expect(await screen.findByText("Rows scored")).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
    expect(screen.getByText("Evaluation on uploaded rows")).toBeInTheDocument();
    expect(screen.getByText("0.9100")).toBeInTheDocument();
    expect(screen.getByText("0.8500")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/benchmark",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows server validation errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error_kind: "input", error: "Uploaded CSV is missing required ULB columns: V1, V2" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    render(<BenchmarkPage />);
    await user.upload(screen.getByLabelText("ULB dataset CSV"), csvFile());
    expect(await screen.findByRole("alert")).toHaveTextContent("missing required ULB columns: V1, V2");
  });

  it("shows model availability errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error_kind: "model", error: "ML virtualenv not found at ml/.venv." }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    render(<BenchmarkPage />);
    await user.upload(screen.getByLabelText("ULB dataset CSV"), csvFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/virtualenv/));
  });
});
