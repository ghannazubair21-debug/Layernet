import { describe, expect, it, vi } from "vitest";
import { readBoundedJson } from "@/lib/server/readJsonBody";

function jsonRequest(body: string, headers: HeadersInit = { "Content-Type": "application/json" }) {
  return new Request("http://localhost/api/test", { method: "POST", headers, body });
}

describe("readBoundedJson", () => {
  it("parses valid JSON within the byte limit", async () => {
    expect(await readBoundedJson(jsonRequest('{"ok":true}'), 32)).toEqual({ ok: true, value: { ok: true } });
  });

  it("requires application/json", async () => {
    const result = await readBoundedJson(jsonRequest("{}", { "Content-Type": "text/plain" }), 32);
    expect(result).toMatchObject({ ok: false, status: 415 });
  });

  it("rejects an oversized declared body before reading it", async () => {
    const result = await readBoundedJson(
      jsonRequest("{}", { "Content-Type": "application/json", "Content-Length": "99" }),
      32,
    );
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it("enforces actual stream size and cancels oversized bodies", async () => {
    const cancel = vi.fn();
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"data":"'));
          controller.enqueue(new Uint8Array(24).fill(97));
          controller.enqueue(new TextEncoder().encode('"}'));
        },
        cancel,
      }),
      duplex: "half",
    } as RequestInit);

    expect(await readBoundedJson(request, 16)).toMatchObject({ ok: false, status: 413 });
    expect(cancel).toHaveBeenCalled();
  });

  it("uses actual stream bytes when Content-Length understates the body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(24).fill(97));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);

    expect(await readBoundedJson(request, 16)).toMatchObject({ ok: false, status: 413 });
  });

  it("grows its bounded buffer while preserving multi-chunk JSON", async () => {
    const encoded = new TextEncoder().encode(JSON.stringify({ payload: "x".repeat(9_000) }));
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (let offset = 0; offset < encoded.length; offset += 1_024) {
            controller.enqueue(encoded.slice(offset, offset + 1_024));
          }
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);

    expect(await readBoundedJson(request, encoded.length)).toEqual({
      ok: true,
      value: { payload: "x".repeat(9_000) },
    });
  });

  it("cancels and settles a body read when the client disconnects", async () => {
    const abortController = new AbortController();
    const cancel = vi.fn();
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({ start() {}, cancel }),
      duplex: "half",
    } as RequestInit);
    // jsdom and Node use separate AbortSignal realms for Request construction.
    Object.defineProperty(request, "signal", { value: abortController.signal });
    const pending = readBoundedJson(request, 32);

    abortController.abort();

    expect(await pending).toMatchObject({ ok: false, status: 499 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a body that exceeds the total read deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    try {
      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: new ReadableStream<Uint8Array>({ start() {}, cancel }),
        duplex: "half",
      } as RequestInit);
      const pending = readBoundedJson(request, 32, 100);

      await vi.advanceTimersByTimeAsync(100);

      expect(await pending).toMatchObject({ ok: false, status: 408 });
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns controlled errors for malformed JSON and invalid UTF-8", async () => {
    const invalidUtf8 = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new Uint8Array([0xff]),
    });
    expect(await readBoundedJson(jsonRequest("{bad"), 32)).toMatchObject({ ok: false, status: 400 });
    expect(await readBoundedJson(invalidUtf8, 32)).toMatchObject({ ok: false, status: 400 });
  });
});
