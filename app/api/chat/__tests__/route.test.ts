import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ai-sdk/google", () => ({ google: vi.fn(() => "test-model") }));
vi.mock("ai", () => ({
  consumeStream: vi.fn(),
  convertToModelMessages: vi.fn(async (messages: unknown) => messages),
  createUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
  streamText: vi.fn((options: { onEnd?: (event: unknown) => void }) => {
    options.onEnd?.({});
    return { stream: new ReadableStream() };
  }),
  toUIMessageStream: vi.fn(() => new ReadableStream()),
}));

import { convertToModelMessages, streamText } from "ai";
import { GET, POST } from "@/app/api/chat/route";

describe("/api/chat", () => {
  const original = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key-value";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = original;
    vi.useRealTimers();
  });

  it("reports configuration without exposing the key", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ configured: true });
    expect(JSON.stringify(payload)).not.toContain("test-key-value");
  });

  it("reports not configured when the key is absent", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const response = await GET();
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

  it("limits concurrent provider requests and releases a slot when streaming ends", async () => {
    vi.mocked(streamText).mockImplementationOnce(() => ({ stream: new ReadableStream() }) as never);
    vi.mocked(streamText).mockImplementationOnce(() => ({ stream: new ReadableStream() }) as never);
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

    const firstOptions = vi.mocked(streamText).mock.calls[0]?.[0] as unknown as {
      onEnd?: (event: unknown) => void;
    };
    firstOptions.onEnd?.({});

    expect((await POST(request())).status).toBe(200);
  });

  it("propagates client cancellation to the model request", async () => {
    vi.mocked(streamText).mockImplementationOnce(() => ({ stream: new ReadableStream() }) as never);
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
    options.onAbort?.({});
  });

  it("aborts model generation at the route timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(streamText).mockImplementationOnce(() => ({ stream: new ReadableStream() }) as never);
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
    options.onAbort?.({});
  });
});
