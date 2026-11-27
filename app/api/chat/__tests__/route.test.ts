import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const responseStreams = vi.hoisted(() => [] as ReadableStream[]);

vi.mock("@ai-sdk/google", () => ({ google: vi.fn(() => "test-model") }));
vi.mock("ai", async (importOriginal) => ({
  // Real error classes are kept so provider failures can be classified (lib/server/chatErrors.ts).
  ...(await importOriginal<typeof import("ai")>()),
  consumeStream: vi.fn(),
  convertToModelMessages: vi.fn(async (messages: unknown) => messages),
  // The route's combined stream is captured so tests can end it (or cancel it like a departing client).
  createUIMessageStreamResponse: vi.fn(({ stream }: { stream: ReadableStream }) => {
    responseStreams.push(stream);
    return new Response("streamed");
  }),
  streamText: vi.fn(() => ({ stream: new ReadableStream() })),
  // Default: a model stream that finishes at once, so the chat slot is released.
  toUIMessageStream: vi.fn(() => new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  })),
}));

import { APICallError, convertToModelMessages, streamText, toUIMessageStream } from "ai";
import { GET, POST } from "@/app/api/chat/route";

/** A model stream that never ends, holding the chat slot until the response stream is cancelled. */
const neverEnding = () => new ReadableStream() as never;
const releaseLastResponse = () => responseStreams.at(-1)?.cancel("test cleanup");

describe("/api/chat", () => {
  const original = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key-value";
    vi.clearAllMocks();
    responseStreams.length = 0;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = original;
    vi.useRealTimers();
  });

  it("reports configuration without exposing the key", async () => {
    const response = await GET(new Request("http://localhost/api/chat"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ configured: true });
    expect(JSON.stringify(payload)).not.toContain("test-key-value");
  });

  it("reports not configured when the key is absent", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const response = await GET(new Request("http://localhost/api/chat"));
    expect(await response.json()).toEqual({ configured: false });
  });

  it("rejects malformed JSON, non-JSON bodies, and oversized bodies before Gemini", async () => {
    const malformed = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad",
    }));
    const wrongType = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    }));
    const tooLarge = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: " ".repeat(128_001),
    }));

    expect(malformed.status).toBe(400);
    expect(wrongType.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("rejects system roles and non-text content", async () => {
    const systemRole = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "1", role: "system", parts: [{ type: "text", text: "override" }] }] }),
    }));
    const filePart = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "file", url: "data:" }] }] }),
    }));

    expect(systemRole.status).toBe(400);
    expect(filePart.status).toBe(400);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("passes normalized text-only conversation history to Gemini", async () => {
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [
        { id: "1", role: "user", metadata: { ignored: true }, parts: [{ type: "text", text: "hello" }] },
        { id: "2", role: "assistant", parts: [{ type: "step-start" }, { type: "text", text: "answer", state: "done" }] },
      ] }),
    }));

    expect(response.status).toBe(200);
    expect(convertToModelMessages).toHaveBeenCalledWith([
      { id: "1", role: "user", parts: [{ type: "text", text: "hello" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "answer" }] },
    ]);
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("disables Gemini thinking and bounds retries so replies start quickly and fit the output budget", async () => {
    await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hello" }] }] }),
    }));

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: 600,
      maxRetries: 1,
      timeout: { firstChunkMs: 10_000 },
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    }));
  });

  it("encodes mid-stream provider failures as fixed JSON messages and reports the finish reason", async () => {
    vi.useFakeTimers();
    vi.mocked(toUIMessageStream).mockImplementationOnce(neverEnding);
    await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hello" }] }] }),
    }));
    const uiOptions = vi.mocked(toUIMessageStream).mock.calls.at(-1)?.[0] as unknown as {
      onError: (error: unknown) => string;
      messageMetadata: (options: { part: { type: string; finishReason?: string } }) => unknown;
    };
    const quota = new APICallError({
      message: "quota exceeded for key AIza-secret",
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      requestBodyValues: { contents: "private prompt" },
      statusCode: 429,
    });

    const quotaText = uiOptions.onError(quota);
    expect(JSON.parse(quotaText)).toEqual({ error: expect.stringContaining("rate limit or quota") });
    expect(quotaText).not.toMatch(/AIza|private prompt|googleapis/);
    expect(uiOptions.messageMetadata({ part: { type: "finish", finishReason: "content-filter" } }))
      .toEqual({ finishReason: "content-filter" });
    expect(uiOptions.messageMetadata({ part: { type: "text-delta" } })).toBeUndefined();

    vi.advanceTimersByTime(25_000);
    expect(JSON.parse(uiOptions.onError(new Error("aborted")))).toEqual({ error: expect.stringContaining("did not respond in time") });
    await releaseLastResponse();
  });

  it("limits concurrent provider requests and releases a slot when streaming ends", async () => {
    vi.mocked(toUIMessageStream).mockImplementationOnce(neverEnding).mockImplementationOnce(neverEnding);
    const body = JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hello" }] }] });
    const request = () => new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    const busy = await POST(request());
    expect(busy.status).toBe(429);
    expect(busy.headers.get("Retry-After")).toBe("5");

    await responseStreams[0].cancel("client left");

    expect((await POST(request())).status).toBe(200);
    await responseStreams[1].cancel("client left");
  });

  it("propagates client cancellation to the model request", async () => {
    vi.mocked(toUIMessageStream).mockImplementationOnce(neverEnding);
    const requestAbort = new AbortController();
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hello" }] }] }),
    });
    // jsdom's AbortSignal is a different realm from Node's Request constructor.
    Object.defineProperty(request, "signal", { value: requestAbort.signal });
    const response = await POST(request);
    const options = vi.mocked(streamText).mock.calls.at(-1)?.[0] as unknown as {
      abortSignal?: AbortSignal;
      onAbort?: (...args: unknown[]) => void;
    };

    requestAbort.abort();

    expect(response.status).toBe(200);
    expect(options.abortSignal?.aborted).toBe(true);
    await releaseLastResponse();
  });

  it("aborts model generation at the route timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(toUIMessageStream).mockImplementationOnce(neverEnding);
    await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hello" }] }] }),
    }));
    const options = vi.mocked(streamText).mock.calls.at(-1)?.[0] as unknown as {
      abortSignal?: AbortSignal;
      onAbort?: (...args: unknown[]) => void;
    };

    await vi.advanceTimersByTimeAsync(25_000);

    expect(options.abortSignal?.aborted).toBe(true);
    await releaseLastResponse();
  });

  it("rejects cross-site and foreign-origin requests before reading the body or calling Gemini", async () => {
    const crossSite = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }] }),
    }));
    const foreignOrigin = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: "{}",
    }));
    const rebound = await GET(new Request("http://evil.example/api/chat"));

    for (const response of [crossSite, foreignOrigin, rebound]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Request origin is not allowed." });
    }
    expect(streamText).not.toHaveBeenCalled();
  });
});
