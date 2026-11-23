import { spawn } from "node:child_process";

/**
 * ULB benchmark replay API. Inference runs exclusively server-side in the ML
 * virtualenv; model files and artifacts are never exposed to the browser.
 * The browser receives only scores, predictions, and metric summaries.
 *
 * Note: no fs/path references to ml/ appear here on purpose — Turbopack traces
 * such references into the build graph and would enumerate artifact folders.
 * The Python module resolves its own artifact root; a missing virtualenv is
 * reported through the spawn error event.
 */
export const runtime = "nodejs";

const MAX_CSV_BYTES = 2_000_000;
const INFERENCE_TIMEOUT_MS = 120_000;
const STDERR_TAIL = 2_000;
const PYTHON_RELATIVE_PATH =
  process.platform === "win32" ? "ml/.venv/Scripts/python.exe" : "ml/.venv/bin/python";

type FailureKind = "input" | "model" | "internal" | "timeout";

function failure(kind: FailureKind, error: string, status: number): Response {
  return Response.json({ ok: false, error_kind: kind, error }, { status });
}

/**
 * Truthful availability probe for the Health screen. Runs a tiny Python check
 * (no pandas/sklearn imports) so no fs/path references to ml/ appear in this
 * module — Turbopack would otherwise trace artifact directories into the build.
 */
export async function GET(): Promise<Response> {
  const probe = [
    "import json, os",
    "root = os.getcwd()",
    "checks = {",
    "  'xgboost': os.path.isfile(os.path.join(root, 'ml', 'artifacts', 'xgboost-v1', 'manifest.json')),",
    "  'random_forest': os.path.isfile(os.path.join(root, 'ml', 'artifacts', 'random-forest-v1', 'manifest.json')),",
    "}",
    "print(json.dumps(checks))",
  ].join("\n");

  return new Promise<Response>((resolve) => {
    const child = spawn(PYTHON_RELATIVE_PATH, ["-c", probe], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let settled = false;
    const finish = (payload: Record<string, unknown>) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(Response.json(payload));
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: true, available: false, reason: "Availability probe timed out." });
    }, 15_000);
    child.on("error", () => {
      finish({ ok: true, available: false, reason: "ML virtualenv not found at ml/.venv." });
    });
    child.stdout.on("data", (chunk: Buffer) => {
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("input", "Request body must be JSON containing a 'csv' string.", 400);
  }
  const csv = (body as { csv?: unknown } | null)?.csv;
  if (typeof csv !== "string" || csv.trim().length === 0) {
    return failure("input", "Request must include a non-empty 'csv' string.", 400);
  }
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    return failure("input", `CSV exceeds the ${MAX_CSV_BYTES} byte upload limit.`, 400);
  }

  return new Promise<Response>((resolve) => {
    const child = spawn(PYTHON_RELATIVE_PATH, ["-m", "layernet_ml.benchmark_replay"], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (response: Response) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(response);
      }
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(failure("timeout", "Benchmark inference timed out. Try fewer rows.", 504));
    }, INFERENCE_TIMEOUT_MS);

    child.on("error", (error) => {
      finish(
        failure(
          "model",
          `Could not start the ML runtime at ml/.venv (${error.message}). Create the virtualenv and install ml/requirements.txt to enable benchmark inference.`,
          503,
        ),
      );
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.stdin.on("error", () => {
      /* The child may exit before consuming stdin; the close handler reports it. */
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code === 0) {
        try {
          const payload = JSON.parse(stdout);
          finish(Response.json(payload, { status: 200 }));
        } catch {
          finish(failure("internal", "ML runtime returned malformed output.", 502));
        }
        return;
      }
      try {
        const payload = JSON.parse(stdout) as { error_kind?: FailureKind; error?: string };
        if (code === 2) {
          finish(failure("input", payload.error ?? "Invalid ULB CSV input.", 400));
        } else if (code === 3) {
          finish(failure("model", payload.error ?? "Model artifacts unavailable.", 503));
        } else {
          finish(failure("internal", payload.error ?? stderr.slice(-STDERR_TAIL) ?? "Inference failed.", 502));
        }
      } catch {
        finish(failure("internal", stderr.slice(-STDERR_TAIL) || `ML runtime exited with code ${code}.`, 502));
      }
    });

    child.stdin.write(csv);
    child.stdin.end();
  });
}
