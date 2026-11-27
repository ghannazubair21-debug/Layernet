import { afterEach, describe, expect, it } from "vitest";
import { checkRequestOrigin } from "@/lib/server/requestGuard";

function request(url: string, headers: Record<string, string> = {}): Request {
  // undici's Request treats Host as a forbidden header, so model it with a
  // plain Headers-backed stub carrying exactly what a server would receive.
  const all = new Headers(headers);
  return { url, headers: all } as unknown as Request;
}

describe("checkRequestOrigin", () => {
  const original = process.env.LAYERNET_ALLOWED_HOSTS;
  afterEach(() => {
    if (original === undefined) delete process.env.LAYERNET_ALLOWED_HOSTS;
    else process.env.LAYERNET_ALLOWED_HOSTS = original;
  });

  it("allows same-origin browser requests to loopback hosts", () => {
    for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000"]) {
      expect(checkRequestOrigin(request("http://x/api/chat", {
        host,
        origin: `http://${host}`,
        "sec-fetch-site": "same-origin",
      }))).toEqual({ ok: true });
    }
  });

  it("allows non-browser clients that send only an allowed Host", () => {
    expect(checkRequestOrigin(request("http://x/api/chat", { host: "127.0.0.1:3000" }))).toEqual({ ok: true });
  });

  it("falls back to the request URL when no Host header is present", () => {
    expect(checkRequestOrigin(request("http://localhost/api/chat")).ok).toBe(true);
    expect(checkRequestOrigin(request("http://evil.example/api/chat")).ok).toBe(false);
  });

  it("rejects a DNS-rebinding Host even when the request looks same-origin", () => {
    const result = checkRequestOrigin(request("http://evil.example:3000/api/chat", {
      host: "evil.example:3000",
      origin: "http://evil.example:3000",
      "sec-fetch-site": "same-origin",
    }));
    expect(result).toEqual({ ok: false, status: 403, error: "Request origin is not allowed." });
  });

  it("rejects cross-site and same-site Fetch Metadata", () => {
    for (const site of ["cross-site", "same-site"]) {
      expect(checkRequestOrigin(request("http://x/api/chat", {
        host: "127.0.0.1:3000",
        "sec-fetch-site": site,
      })).ok).toBe(false);
    }
  });

  it("rejects foreign, mismatched, opaque, and non-http origins", () => {
    for (const origin of [
      "https://evil.example",
      "http://localhost:5173", // another local app on a different port
      "null",
      "file://",
      "not a url",
    ]) {
      expect(checkRequestOrigin(request("http://x/api/chat", { host: "127.0.0.1:3000", origin })).ok).toBe(false);
    }
  });

  it("never trusts forwarded-host headers", () => {
    expect(checkRequestOrigin(request("http://x/api/chat", {
      host: "evil.example",
      "x-forwarded-host": "127.0.0.1:3000",
      forwarded: "host=127.0.0.1:3000",
    })).ok).toBe(false);
  });

  it("rejects malformed Host values", () => {
    for (const host of ["", "user@127.0.0.1", "127.0.0.1/path", "127.0.0.1:99999999", "a b"]) {
      expect(checkRequestOrigin(request("http://x/api/chat", { host })).ok).toBe(false);
    }
  });

  it("accepts exact extra hosts from LAYERNET_ALLOWED_HOSTS", () => {
    process.env.LAYERNET_ALLOWED_HOSTS = "layernet.example, staging.layernet.example:8443";
    expect(checkRequestOrigin(request("http://x/api/chat", {
      host: "layernet.example",
      origin: "https://layernet.example",
    })).ok).toBe(true);
    expect(checkRequestOrigin(request("http://x/api/chat", { host: "staging.layernet.example:8443" })).ok).toBe(true);
    expect(checkRequestOrigin(request("http://x/api/chat", { host: "staging.layernet.example:9999" })).ok).toBe(false);
    expect(checkRequestOrigin(request("http://x/api/chat", { host: "sub.layernet.example" })).ok).toBe(false);
  });
});
