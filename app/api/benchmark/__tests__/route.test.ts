import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => {
  const spawn = vi.fn();
  return { spawn, default: { spawn } };
});

import { spawn } from "node:child_process";
import { POST } from "@/app/api/benchmark/route";

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

const successPayload = {
  ok: true,
  benchmark: "layernet-ulb-benchmark-replay.v1",
  note: "ULB benchmark replay; not live real-world transaction fraud prediction.",
  row_count: 1,
  labels_present: false,
  models: [],
  rows: [],
  comparison: { agreements: 1, agreement_rate: 1, positives: {}, mean_scores: {} },
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
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toMatch(/upload limit/);
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
    expect(payload.error).toMatch(/virtualenv/);
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

  it("maps unexpected exits to 502 with stderr context", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    child.stderr.emit("data", Buffer.from("Traceback: boom"));
    child.emit("close", 1);
    const response = await pending;
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toMatch(/boom/);
  });

  it("rejects malformed runtime output", async () => {
    const pending = POST(makeRequest({ csv: "Time,Amount\n0,1\n" }));
    await flushMicrotasks();
    child.stdout.emit("data", Buffer.from("{not json"));
    child.emit("close", 0);
    const response = await pending;
    expect(response.status).toBe(502);
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
  });
});
