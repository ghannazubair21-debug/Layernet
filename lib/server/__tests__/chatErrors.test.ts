import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { CHAT_ERROR_MESSAGES, describeProviderError, encodeStreamError, surfaceTimeoutAborts } from "@/lib/server/chatErrors";
import type { UIMessageChunk } from "ai";

function apiError(statusCode: number | undefined) {
  return new APICallError({
    message: `provider said something with key AIza-secret (${statusCode})`,
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash",
    requestBodyValues: { contents: "private prompt" },
    statusCode,
  });
}

describe("describeProviderError", () => {
  it.each([
    [429, CHAT_ERROR_MESSAGES.rateLimited],
    [401, CHAT_ERROR_MESSAGES.unauthorized],
    [403, CHAT_ERROR_MESSAGES.unauthorized],
    [400, CHAT_ERROR_MESSAGES.rejected],
    [500, CHAT_ERROR_MESSAGES.unavailable],
    [503, CHAT_ERROR_MESSAGES.unavailable],
  ])("maps HTTP %i to a fixed message", (status, expected) => {
    expect(describeProviderError(apiError(status), { timedOut: false })).toBe(expected);
  });

  it("classifies the last error after retries are exhausted", () => {
    const retry = new RetryError({ message: "failed after 2 attempts", reason: "maxRetriesExceeded", errors: [apiError(503), apiError(429)] });
    expect(describeProviderError(retry, { timedOut: false })).toBe(CHAT_ERROR_MESSAGES.rateLimited);
  });

  it("reports the route timeout ahead of whatever abort error the provider raised", () => {
    expect(describeProviderError(new Error("This operation was aborted"), { timedOut: true })).toBe(CHAT_ERROR_MESSAGES.timeout);
  });

  it("falls back to the generic message for network or unknown failures", () => {
    expect(describeProviderError(new TypeError("fetch failed"), { timedOut: false })).toBe(CHAT_ERROR_MESSAGES.generic);
    expect(describeProviderError(apiError(undefined), { timedOut: false })).toBe(CHAT_ERROR_MESSAGES.generic);
  });

  it("never passes provider text, URLs or request bodies through", () => {
    for (const status of [400, 401, 429, 500]) {
      const encoded = encodeStreamError(describeProviderError(apiError(status), { timedOut: false }));
      expect(encoded).not.toMatch(/AIza|private prompt|googleapis|provider said/);
      expect(JSON.parse(encoded)).toHaveProperty("error");
    }
  });
});

async function run(chunks: UIMessageChunk[], userCancelled: boolean) {
  const out: UIMessageChunk[] = [];
  const source = new ReadableStream<UIMessageChunk>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  const reader = source.pipeThrough(surfaceTimeoutAborts(() => userCancelled)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

describe("surfaceTimeoutAborts", () => {
  it("turns a timeout or stall abort into the timeout error the analyst can see", async () => {
    const out = await run([{ type: "start" }, { type: "abort" }], false);
    expect(out).toEqual([{ type: "start" }, { type: "error", errorText: encodeStreamError(CHAT_ERROR_MESSAGES.timeout) }]);
  });

  it("leaves a user-initiated Stop as a normal abort", async () => {
    const out = await run([{ type: "start" }, { type: "abort" }], true);
    expect(out).toEqual([{ type: "start" }, { type: "abort" }]);
  });
});
