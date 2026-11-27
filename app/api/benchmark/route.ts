import { spawn } from "node:child_process";
import { acquireBenchmarkSlot } from "@/lib/server/benchmarkSlot";
import { readBoundedJson } from "@/lib/server/readJsonBody";
import { checkRequestOrigin } from "@/lib/server/requestGuard";
import type { BenchmarkMetrics, BenchmarkSuccess } from "@/lib/benchmark";

/**
 * ULB benchmark replay API. Inference runs exclusively server-side in the ML
 * virtualenv; model files and artifacts are never exposed to the browser.
 * The browser receives only scores, predictions, and metric summaries.
 *
 * No fs/path references to ml/ appear here because Turbopack traces those into
 * the build graph. The Python module resolves its own artifact root.
 */
export const runtime = "nodejs";

const MAX_CSV_BYTES = 2_000_000;
// JSON escaping may expand a CSV, so bound the request envelope separately.
const MAX_JSON_BODY_BYTES = MAX_CSV_BYTES * 6 + 16_384;
const INFERENCE_TIMEOUT_MS = 120_000;
const MAX_STDOUT_BYTES = 8_000_000;
const MAX_PROBE_OUTPUT_BYTES = 4_096;
const PYTHON_RELATIVE_PATH =
  process.platform === "win32" ? "ml/.venv/Scripts/python.exe" : "ml/.venv/bin/python";

type FailureKind = "input" | "model" | "internal" | "timeout";

function failure(kind: FailureKind, error: string, status: number): Response {
  return Response.json({ ok: false, error_kind: kind, error }, { status });
}

function childProcessEnvironment(): NodeJS.ProcessEnv {
  const allowedNames = process.platform === "win32"
    ? [
        "Path",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "LANG",
        "LC_ALL",
        "TZ",
        "OMP_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "MKL_NUM_THREADS",
        "NUMEXPR_NUM_THREADS",
      ]
    : [
        "PATH",
        "HOME",
        "TMPDIR",
        "TEMP",
        "TMP",
        "LANG",
        "LC_ALL",
        "TZ",
        "OMP_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "MKL_NUM_THREADS",
        "NUMEXPR_NUM_THREADS",
      ];
  const environment = Object.create(null) as NodeJS.ProcessEnv;
  for (const name of allowedNames) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  environment.PYTHONDONTWRITEBYTECODE = "1";
  return environment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isBenchmarkMetrics(value: unknown): value is BenchmarkMetrics {
  if (!isRecord(value)) return false;
  const scoreMetrics = [
    value.pr_auc,
    value.average_precision,
    value.roc_auc,
    value.precision_at_threshold,
    value.recall_at_threshold,
    value.f1_at_threshold,
    value.threshold,
  ];
  const counts = [value.true_positives, value.false_positives, value.false_negatives, value.true_negatives];
  return scoreMetrics.every(isFiniteNumber) && counts.every(isNonNegativeInteger);
}

function isModelSummary(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.family === "string" &&
    typeof value.model_version === "string" &&
    isFiniteNumber(value.threshold) &&
    typeof value.score_meaning === "string" &&
    (value.recorded_test_metrics === null || isBenchmarkMetrics(value.recorded_test_metrics));
}

function isModelOutput(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.score) && (value.prediction === 0 || value.prediction === 1);
}

function isFiniteNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isNonNegativeInteger);
}

function isBenchmarkPayload(value: unknown): value is BenchmarkSuccess {
  if (!isRecord(value) ||
      value.ok !== true ||
      value.benchmark !== "layernet-ulb-benchmark-replay.v1" ||
      typeof value.note !== "string" ||
      !Number.isSafeInteger(value.row_count) ||
      Number(value.row_count) < 1 ||
      Number(value.row_count) > 5_000 ||
      typeof value.labels_present !== "boolean" ||
      typeof value.metrics_note !== "string" ||
      !Array.isArray(value.models) || value.models.length !== 2 ||
      !value.models.every(isModelSummary) ||
      !Array.isArray(value.rows) || value.rows.length !== value.row_count ||
      !isRecord(value.comparison) ||
      !isNonNegativeInteger(value.comparison.agreements) ||
      value.comparison.agreements > value.row_count ||
      !isFiniteNumber(value.comparison.agreement_rate) ||
      value.comparison.agreement_rate < 0 || value.comparison.agreement_rate > 1 ||
      !isCountRecord(value.comparison.positives) ||
      !isFiniteNumberRecord(value.comparison.mean_scores) ||
      (value.uploaded_row_metrics !== null && !isRecord(value.uploaded_row_metrics))) {
    return false;
  }

  const comparison = value.comparison as Record<string, unknown>;
  const positives = comparison.positives as Record<string, number>;
  const meanScores = comparison.mean_scores as Record<string, number>;
  const families = new Set(value.models.map((model) => (model as Record<string, unknown>).family));
  if (families.size !== 2 || !families.has("xgboost") || !families.has("random_forest")) return false;
  if (Object.keys(positives).length !== 2 || Object.keys(meanScores).length !== 2) return false;
  if (!Object.keys(positives).every((family) => families.has(family)) ||
      !Object.keys(meanScores).every((family) => families.has(family))) return false;
  if (value.uploaded_row_metrics !== null &&
      (!families.has("xgboost") || !families.has("random_forest") ||
       !isBenchmarkMetrics(value.uploaded_row_metrics.xgboost) ||
       !isBenchmarkMetrics(value.uploaded_row_metrics.random_forest))) return false;

  return value.rows.every((row, index) =>
    isRecord(row) &&
    row.row === index &&
    isFiniteNumber(row.Time) && row.Time >= 0 &&
    isFiniteNumber(row.Amount) && row.Amount >= 0 &&
    (row.class === null || row.class === 0 || row.class === 1) &&
    isModelOutput(row.xgboost) && isModelOutput(row.random_forest) &&
    (!value.labels_present || row.class !== null) &&
    (value.labels_present || row.class === null),
  );
}

/** Avoid running the availability subprocess for Next.js's HEAD probe. */
export function HEAD(): Response {
  return new Response(null, { status: 204 });
}

/** Truthful availability probe for the Health screen. */
export async function GET(request: Request): Promise<Response> {
  const guard = checkRequestOrigin(request);
  if (!guard.ok) return failure("input", guard.error, guard.status);

  const probe = [
    "import json, os",
    "root = os.getcwd()",
    "checks = {",
    "  'xgboost': os.path.isfile(os.path.join(root, 'ml', 'artifacts', 'xgboost-v1', 'manifest.json')),",
    "  'random_forest': os.path.isfile(os.path.join(root, 'ml', 'artifacts', 'random-forest-v1', 'manifest.json')),",
    "}",
    "print(json.dumps(checks))",
  ].join("\n");

  if (request.signal.aborted) {
    return Response.json({ ok: true, available: false, reason: "Availability probe was cancelled." }, { status: 499 });
  }

  const releaseSlot = acquireBenchmarkSlot();
  if (!releaseSlot) {
    return Response.json({ ok: true, available: false, reason: "ML runtime is busy." });
  }

  return new Promise<Response>((resolve) => {
    let stdout = "";
    let stdoutBytes = 0;
    let settled = false;
    const timerHandle: { value?: ReturnType<typeof setTimeout> } = {};
    let abortListener = () => undefined;
    const finish = (payload: Record<string, unknown>, status = 200) => {
      if (settled) return;
      settled = true;
      if (timerHandle.value) clearTimeout(timerHandle.value);
      request.signal.removeEventListener("abort", abortListener);
      resolve(Response.json(payload, { status }));
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(PYTHON_RELATIVE_PATH, ["-c", probe], {
        cwd: process.cwd(),
        env: childProcessEnvironment(),
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      releaseSlot();
      finish({ ok: true, available: false, reason: "ML availability probe could not start." });
      return;
    }

    child.once("close", releaseSlot);
    timerHandle.value = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: true, available: false, reason: "Availability probe timed out." });
    }, 15_000);
    abortListener = () => {
      child.kill("SIGKILL");
      finish({ ok: true, available: false, reason: "Availability probe was cancelled." }, 499);
    };
    request.signal.addEventListener("abort", abortListener, { once: true });
    if (request.signal.aborted) {
      abortListener();
      return;
    }
    child.on("error", () => {
      releaseSlot();
      finish({ ok: true, available: false, reason: "ML runtime is unavailable." });
    });
    child.stdout!.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_PROBE_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish({ ok: true, available: false, reason: "Availability probe returned too much data." });
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      if (settled) return;
      try {
        const models = JSON.parse(stdout) as Record<string, boolean>;
        finish({ ok: true, available: code === 0 && Boolean(models.xgboost && models.random_forest), models });
      } catch {
        finish({ ok: true, available: false, reason: "Availability probe returned malformed output." });
      }
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  // Reject foreign origins before taking the slot or reading the upload.
  const guard = checkRequestOrigin(request);
  if (!guard.ok) return failure("input", guard.error, guard.status);

  // Acquire capacity before reading so concurrent uploads cannot all consume
  // their body-memory budget while waiting for the Python slot.
  const releaseSlot = acquireBenchmarkSlot();
  if (!releaseSlot) {
    return Response.json(
      { ok: false, error_kind: "internal", error: "Benchmark runtime is busy. Retry shortly." },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }

  let parsedBody: Awaited<ReturnType<typeof readBoundedJson>>;
  try {
    parsedBody = await readBoundedJson(request, MAX_JSON_BODY_BYTES);
  } catch {
    releaseSlot();
    return failure("internal", "Benchmark request could not be processed.", 500);
  }
  if (!parsedBody.ok) {
    releaseSlot();
    return failure("input", parsedBody.error, parsedBody.status);
  }

  const csv = (parsedBody.value as { csv?: unknown } | null)?.csv;
  if (typeof csv !== "string" || csv.trim().length === 0) {
    releaseSlot();
    return failure("input", "Request must include a non-empty 'csv' string.", 400);
  }
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    releaseSlot();
    return failure("input", `CSV exceeds the ${MAX_CSV_BYTES} byte upload limit.`, 413);
  }

  return new Promise<Response>((resolve) => {
    let stdout = "";
    let stdoutBytes = 0;
    let settled = false;
    const timerHandle: { value?: ReturnType<typeof setTimeout> } = {};
    let child: ReturnType<typeof spawn> | null = null;
    let abortListener = () => undefined;
    const finish = (response: Response) => {
      if (settled) return;
      settled = true;
      if (timerHandle.value) clearTimeout(timerHandle.value);
      request.signal.removeEventListener("abort", abortListener);
      resolve(response);
    };

    try {
      child = spawn(PYTHON_RELATIVE_PATH, ["-m", "layernet_ml.benchmark_replay"], {
        cwd: process.cwd(),
        env: childProcessEnvironment(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      releaseSlot();
      resolve(failure("model", "Could not start the ML runtime. Check the local ML environment.", 503));
      return;
    }

    const processChild = child;
    processChild.once("close", releaseSlot);
    timerHandle.value = setTimeout(() => {
      processChild.kill("SIGKILL");
      finish(failure("timeout", "Benchmark inference timed out. Try fewer rows.", 504));
    }, INFERENCE_TIMEOUT_MS);
    abortListener = () => {
      processChild.kill("SIGKILL");
      finish(failure("internal", "Benchmark request was cancelled.", 499));
    };
    request.signal.addEventListener("abort", abortListener, { once: true });
    if (request.signal.aborted) {
      abortListener();
      return;
    }

    processChild.on("error", () => {
      releaseSlot();
      finish(failure("model", "Could not start the ML runtime. Check the local ML environment.", 503));
    });
    processChild.stdout!.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        processChild.kill("SIGKILL");
        finish(failure("internal", "ML runtime returned more data than allowed.", 502));
        return;
      }
      stdout += chunk.toString("utf8");
    });
    // Drain stderr without retaining tracebacks or environment paths in memory.
    processChild.stderr!.on("data", () => undefined);
    processChild.stdin!.on("error", () => {
      /* The close handler reports early process exit. */
    });
    processChild.on("close", (code) => {
      if (settled) return;
      if (code === 0) {
        try {
          const payload: unknown = JSON.parse(stdout);
          if (!isBenchmarkPayload(payload)) {
            finish(failure("internal", "ML runtime returned an invalid response.", 502));
          } else {
            finish(Response.json(payload, { status: 200 }));
          }
        } catch {
          finish(failure("internal", "ML runtime returned malformed output.", 502));
        }
        return;
      }

      try {
        const payload = JSON.parse(stdout) as { error_kind?: FailureKind; error?: string };
        if (code === 2 && payload.error_kind === "input") {
          finish(failure("input", payload.error ?? "Invalid ULB CSV input.", 400));
        } else if (code === 3) {
          finish(failure("model", "Saved benchmark models are unavailable or failed integrity checks.", 503));
        } else {
          finish(failure("internal", "Benchmark inference failed inside the ML runtime.", 502));
        }
      } catch {
        finish(failure("internal", "Benchmark inference failed inside the ML runtime.", 502));
      }
    });

    try {
      processChild.stdin!.write(csv);
      processChild.stdin!.end();
    } catch {
      processChild.kill("SIGKILL");
      finish(failure("internal", "Could not send the validated CSV to the ML runtime.", 502));
    }
  });
}
