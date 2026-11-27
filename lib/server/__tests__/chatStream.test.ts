import { simulateReadableStream, streamText, toUIMessageStream, type UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { surfaceTimeoutAborts } from "@/lib/server/chatErrors";
import { withStallRetry } from "@/lib/server/chatStream";

/** Exercises the real streamText first-chunk timeout with the AI SDK mock model (no provider call). */

const okChunks = [
  { type: "text-start" as const, id: "t1" },
  { type: "text-delta" as const, id: "t1", delta: "OK" },
  { type: "text-end" as const, id: "t1" },
  {
    type: "finish" as const,
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
  },
];

/** A provider stream that sends nothing until it is aborted, like the observed Gemini stall. */
function stalledStream(abortSignal: AbortSignal | undefined) {
  return new ReadableStream({
    start(controller) {
      abortSignal?.addEventListener("abort", () => controller.error(abortSignal.reason), { once: true });
    },
  });
}

function modelWith(behaviours: Array<"stall" | "ok">) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => {
      const behaviour = behaviours[Math.min(call, behaviours.length - 1)];
      call += 1;
      return { stream: behaviour === "stall" ? stalledStream(abortSignal) : simulateReadableStream({ chunks: okChunks }) };
    },
  });
}

async function collect(stream: ReadableStream<UIMessageChunk>) {
  const out: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

function run(model: MockLanguageModelV4, options: { maxAttempts?: number; userCancelled?: () => boolean } = {}) {
  const onDone = vi.fn();
  const userCancelled = options.userCancelled ?? (() => false);
  const stream = withStallRetry({
    startAttempt: () =>
      toUIMessageStream({ stream: streamText({ model, prompt: "hi", timeout: { firstChunkMs: 40 }, maxRetries: 0 }).stream }),
    maxAttempts: options.maxAttempts ?? 2,
    canRetry: () => !userCancelled(),
    onDone,
  }).pipeThrough(surfaceTimeoutAborts(userCancelled));
  return { stream, onDone };
}

const textOf = (chunks: UIMessageChunk[]) =>
  chunks.flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : [])).join("");

describe("withStallRetry with the real streamText first-chunk timeout", () => {
  it("restarts a stalled request once and streams only the successful attempt", async () => {
    const model = modelWith(["stall", "ok"]);
    const { stream, onDone } = run(model);
    const chunks = await collect(stream);

    expect(model.doStreamCalls).toHaveLength(2);
    expect(textOf(chunks)).toBe("OK");
    expect(chunks.filter((chunk) => chunk.type === "start")).toHaveLength(1);
    expect(chunks.some((chunk) => chunk.type === "abort" || chunk.type === "error")).toBe(false);
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("reports a timeout error, not a silent abort, when every attempt stalls", async () => {
    const model = modelWith(["stall"]);
    const { stream, onDone } = run(model);
    const chunks = await collect(stream);

    expect(model.doStreamCalls).toHaveLength(2);
    const error = chunks.find((chunk) => chunk.type === "error");
    expect(error && JSON.parse(error.errorText)).toEqual({ error: expect.stringContaining("did not respond in time") });
    expect(chunks.some((chunk) => chunk.type === "abort")).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not retry a healthy request", async () => {
    const model = modelWith(["ok"]);
    const chunks = await collect(run(model).stream);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(textOf(chunks)).toBe("OK");
  });

  it("does not retry after the user cancelled", async () => {
    const model = modelWith(["stall", "ok"]);
    const chunks = await collect(run(model, { userCancelled: () => true }).stream);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(chunks.some((chunk) => chunk.type === "abort")).toBe(true);
  });
});

describe("withStallRetry stream semantics", () => {
  const fromChunks = (chunks: UIMessageChunk[]) =>
    new ReadableStream<UIMessageChunk>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    });

  it("never retries once content has streamed, so a partial answer is not duplicated", async () => {
    const startAttempt = vi.fn(() =>
      fromChunks([{ type: "start" }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Part" }, { type: "abort" }]),
    );
    const chunks = await collect(withStallRetry({ startAttempt, maxAttempts: 2, canRetry: () => true, onDone: vi.fn() }));
    expect(startAttempt).toHaveBeenCalledTimes(1);
    expect(textOf(chunks)).toBe("Part");
    expect(chunks.at(-1)).toEqual({ type: "abort" });
  });

  it("calls onDone once when the client cancels mid-stream", async () => {
    const onDone = vi.fn();
    const stream = withStallRetry({
      startAttempt: () => new ReadableStream<UIMessageChunk>({ start: (c) => c.enqueue({ type: "start" }) }),
      maxAttempts: 2,
      canRetry: () => true,
      onDone,
    });
    const reader = stream.getReader();
    await reader.cancel("client left");
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
