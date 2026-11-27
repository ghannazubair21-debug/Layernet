import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => {
  const spawn = vi.fn();
  return { spawn, default: { spawn } };
});

import { spawn } from "node:child_process";
import { GET, HEAD, POST } from "@/app/api/benchmark/route";

type FakeChild = EventEmitter & {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/benchmark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeRawRequest(body: string, contentType = "application/json"): Request {
  return new Request("http://localhost/api/benchmark", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

function makeGetRequest(signal?: AbortSignal): Request {
  const request = new Request("http://localhost/api/benchmark");
  if (signal) Object.defineProperty(request, "signal", { value: signal });
  return request;
}

const successPayload = {
  ok: true,
  benchmark: "layernet-ulb-benchmark-replay.v1",
  note: "ULB benchmark replay; not live real-world transaction fraud prediction.",
  row_count: 1,
  labels_present: false,
  models: [
    { family: "xgboost", model_version: "xgboost-v1", threshold: 0.5, score_meaning: "fraud score", recorded_test_metrics: null },
    { family: "random_forest", model_version: "random-forest-v1", threshold: 0.5, score_meaning: "fraud score", recorded_test_metrics: null },
  ],
  rows: [{
    row: 0,
    Time: 0,
    Amount: 1,
    class: null,
    xgboost: { score: 0.1, prediction: 0 },
    random_forest: { score: 0.2, prediction: 0 },
  }],
  comparison: {
    agreements: 1,
    agreement_rate: 1,
    positives: { xgboost: 0, random_forest: 0 },
    mean_scores: { xgboost: 0.1, random_forest: 0.2 },
  },
  uploaded_row_metrics: null,
  metrics_note: "No Class column was uploaded; evaluation metrics are unavailable.",
};

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("POST /api/benchmark", () => {
  let child: FakeChild;

  beforeEach(() => {
    child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("rejects a non-JSON body", async () => {
    const response = await POST(makeRequest("this is not json"));
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error_kind).toBe("input");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects a missing csv field", async () => {
    const response = await POST(makeRequest({ notCsv: "x" }));
    expect(response.status).toBe(400);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects an oversized csv", async () => {
    const response = await POST(makeRequest({ csv: "a".repeat(2_000_001) }));
    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toMatch(/upload limit/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects wrong content type and oversized JSON before spawning Python", async () => {
    const wrongType = await POST(makeRawRequest("{}", "text/plain"));
    const tooLarge = await POST(makeRawRequest(" ".repeat(12_100_001)));

    expect(wrongType.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("returns 503 when the ML virtualenv is missing (spawn ENOENT)", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    child.emit("error", Object.assign(new Error("spawn ml/.venv/Scripts/python.exe ENOENT"), { code: "ENOENT" }));
    const response = await pending;
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error_kind).toBe("model");
    expect(payload.error).toMatch(/ML runtime/);
    expect(payload.error).not.toContain("ml/.venv/Scripts/python.exe");
  });

  it("returns the inference payload on success", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(child.stdin.write).toHaveBeenCalledWith("Time,Amount\n0,1\n");
    child.stdout.emit("data", Buffer.from(JSON.stringify(successPayload)));
    child.emit("close", 0);
    const response = await pending;
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.benchmark).toBe("layernet-ulb-benchmark-replay.v1");
  });

  it("maps input errors (exit 2) to 400", async () => {
    const pending = POST(makeRequest({ csv: "bad" }));
    await flushMicrotasks();
    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ ok: false, error_kind: "input", error: "missing required ULB columns: V1" })),
    );
    child.emit("close", 2);
    const response = await pending;
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toMatch(/V1/);
  });

  it("maps model availability errors (exit 3) to 503", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ ok: false, error_kind: "model", error: "checksum does not match" })),
    );
    child.emit("close", 3);
    const response = await pending;
    expect(response.status).toBe(503);
  });

  it("maps unexpected exits to a generic 502 without exposing stderr", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    child.stderr.emit("data", Buffer.from("Traceback: boom"));
    child.emit("close", 1);
    const response = await pending;
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toMatch(/inside the ML runtime/);
    expect(payload.error).not.toContain("boom");
  });

  it("rejects malformed runtime output", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    child.stdout.emit("data", Buffer.from("{not json"));
    child.emit("close", 0);
    const response = await pending;
    expect(response.status).toBe(502);
  });

  it("rejects a valid JSON envelope with malformed row prediction fields", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    const malformed = {
      ...successPayload,
      rows: [{ ...successPayload.rows[0], xgboost: { score: "0.1", prediction: 0 } }],
    };
    child.stdout.emit("data", Buffer.from(JSON.stringify(malformed)));
    child.emit("close", 0);

    const response = await pending;
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error_kind: "internal",
      error: "ML runtime returned an invalid response.",
    });
  });

  it("returns 503 when the runtime cannot start", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    child.emit("error", new Error("ENOENT"));
    const response = await pending;
    expect(response.status).toBe(503);
  });

  it("kills the runtime and returns 504 on timeout", async () => {
    vi.useFakeTimers();
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(child.kill).toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.error_kind).toBe("timeout");
    child.emit("close", null, "SIGKILL");
  });

  it("kills the runtime when the client cancels the request", async () => {
    const requestAbort = new AbortController();
    const request = makeRequest({ csv: "Time,Amount\n0,1\n" });
    Object.defineProperty(request, "signal", { value: requestAbort.signal });
    const pending = POST(request);
    await flushMicrotasks();

    requestAbort.abort();

    expect((await pending).status).toBe(499);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
  });

  it("kills a runtime that exceeds the stdout limit", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();

    child.stdout.emit("data", Buffer.alloc(8_000_001, 97));

    expect((await pending).status).toBe(502);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
  });

  it("does not pass secret environment variables into Python", async () => {
    const originalGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const originalToken = process.env.TEST_ACCESS_TOKEN;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalAwsKey = process.env.AWS_ACCESS_KEY_ID;
    const originalPath = process.env.PATH;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-provider-key";
    process.env.TEST_ACCESS_TOKEN = "test-access-token";
    process.env.DATABASE_URL = "postgres://test:secret@localhost/app";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";

    try {
      const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
      await flushMicrotasks();
      const options = vi.mocked(spawn).mock.calls.at(-1)?.[2] as { env?: NodeJS.ProcessEnv };
      expect(options.env?.GOOGLE_GENERATIVE_AI_API_KEY).toBeUndefined();
      expect(options.env?.TEST_ACCESS_TOKEN).toBeUndefined();
      expect(options.env?.DATABASE_URL).toBeUndefined();
      expect(options.env?.AWS_ACCESS_KEY_ID).toBeUndefined();
      const childEnvironment = (options.env ?? {}) as Record<string, string | undefined>;
      expect(childEnvironment["PATH"] ?? childEnvironment["Path"]).toBe(originalPath);
      const normalizedNames = Object.keys(childEnvironment).map((name) =>
        process.platform === "win32" ? name.toUpperCase() : name,
      );
      expect(new Set(normalizedNames).size).toBe(normalizedNames.length);
      child.stdout.emit("data", Buffer.from(JSON.stringify(successPayload)));
      child.emit("close", 0);
      await pending;
    } finally {
      if (originalGoogleKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      else process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleKey;
      if (originalToken === undefined) delete process.env.TEST_ACCESS_TOKEN;
      else process.env.TEST_ACCESS_TOKEN = originalToken;
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalAwsKey === undefined) delete process.env.AWS_ACCESS_KEY_ID;
      else process.env.AWS_ACCESS_KEY_ID = originalAwsKey;
    }
  });

  it("bounds concurrent benchmark work within this Node process", async () => {
    const first = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    const second = await POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));

    expect(second.status).toBe(429);
    expect(spawn).toHaveBeenCalledTimes(1);
    child.stdout.emit("data", Buffer.from(JSON.stringify(successPayload)));
    child.emit("close", 0);
    await first;
  });

  it("bounds concurrent upload parsing before Python starts", async () => {
    vi.useFakeTimers();
    const slowRequest = new Request("http://localhost/api/benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({ start() {} }),
      duplex: "half",
    } as RequestInit);
    const first = POST(slowRequest);
    const second = await POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));

    expect(second.status).toBe(429);
    expect(spawn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);

    expect((await first).status).toBe(408);
  });

  it("releases the benchmark slot when a client disconnects during upload parsing", async () => {
    const requestAbort = new AbortController();
    const cancel = vi.fn();
    const slowRequest = new Request("http://localhost/api/benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({ start() {}, cancel }),
      duplex: "half",
    } as RequestInit);
    Object.defineProperty(slowRequest, "signal", { value: requestAbort.signal });
    const first = POST(slowRequest);
    const busy = await POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    expect(busy.status).toBe(429);

    requestAbort.abort();

    expect((await first).status).toBe(499);
    expect(cancel).toHaveBeenCalledOnce();

    const recovered = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    expect(spawn).toHaveBeenCalledTimes(1);
    child.stdout.emit("data", Buffer.from(JSON.stringify(successPayload)));
    child.emit("close", 0);
    expect((await recovered).status).toBe(200);
  });
});

describe("GET /api/benchmark (availability probe)", () => {
  let child: FakeChild;

  beforeEach(() => {
    child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("answers HEAD without starting the Python availability probe", () => {
    const response = HEAD();

    expect(response.status).toBe(204);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("reports available when both artifact manifests exist", async () => {
    const pending = GET(makeGetRequest());
    await flushMicrotasks();
    child.stdout.emit("data", Buffer.from(JSON.stringify({ xgboost: true, random_forest: true })));
    child.emit("close", 0);
    const response = await pending;
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.available).toBe(true);
    expect(payload.models).toEqual({ xgboost: true, random_forest: true });
  });

  it("reports unavailable when an artifact is missing", async () => {
    const pending = GET(makeGetRequest());
    await flushMicrotasks();
    child.stdout.emit("data", Buffer.from(JSON.stringify({ xgboost: true, random_forest: false })));
    child.emit("close", 0);
    const response = await pending;
    const payload = await response.json();
    expect(payload.available).toBe(false);
  });

  it("reports unavailable when the virtualenv cannot start", async () => {
    const pending = GET(makeGetRequest());
    await flushMicrotasks();
    child.emit("error", new Error("ENOENT"));
    const response = await pending;
    const payload = await response.json();
    expect(payload.available).toBe(false);
    expect(payload.reason).toMatch(/runtime is unavailable/);
    expect(payload.reason).not.toContain("ml/.venv");
  });

  it("kills a stalled availability probe at its timeout", async () => {
    vi.useFakeTimers();
    const pending = GET(makeGetRequest());
    await vi.advanceTimersByTimeAsync(15_000);

    const response = await pending;
    expect((await response.json()).available).toBe(false);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
  });

  it("kills an availability probe that exceeds its stdout limit", async () => {
    const pending = GET(makeGetRequest());
    await flushMicrotasks();

    child.stdout.emit("data", Buffer.alloc(4_097, 97));

    expect((await (await pending).json()).available).toBe(false);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
  });

  it("does not start a probe after client cancellation", async () => {
    const requestAbort = new AbortController();
    requestAbort.abort();

    const response = await GET(makeGetRequest(requestAbort.signal));

    expect(response.status).toBe(499);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("kills an availability probe when the client disconnects", async () => {
    const requestAbort = new AbortController();
    const pending = GET(makeGetRequest(requestAbort.signal));
    await flushMicrotasks();

    requestAbort.abort();

    expect((await pending).status).toBe(499);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
  });
});
