import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/chat/route";

describe("GET /api/chat (configuration probe)", () => {
  const original = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = original;
  });

  it("reports configured without exposing the key", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key-value";
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ configured: true });
    expect(JSON.stringify(payload)).not.toContain("test-key-value");
  });

  it("reports not configured when the key is absent", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const response = await GET();
    const payload = await response.json();
    expect(payload).toEqual({ configured: false });
  });
});
