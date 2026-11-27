import { describe, expect, it } from "vitest";
import { MAX_CHAT_MESSAGES, parseChatMessages } from "@/lib/server/chatRequest";

function message(role: "user" | "assistant" | "system", text = "hello") {
  return { id: "message-1", role, parts: [{ type: "text", text }] };
}

describe("parseChatMessages", () => {
  it("accepts and normalizes text-only messages and discards metadata", () => {
    const result = parseChatMessages({
      messages: [
        { ...message("user"), metadata: { ignored: true } },
        { ...message("assistant", "reply"), parts: [{ type: "step-start" }, { type: "text", text: "reply", state: "done" }] },
      ],
    });
    expect(result).toEqual({ ok: true, messages: [message("user"), message("assistant", "reply")] });
  });

  it("rejects system roles, non-text parts, missing text, and malformed messages", () => {
    expect(parseChatMessages({ messages: [message("system")] }).ok).toBe(false);
    expect(parseChatMessages({ messages: [{ ...message("user"), parts: [{ type: "file", url: "data:" }] }] }).ok).toBe(false);
    expect(parseChatMessages({ messages: [{ ...message("user"), parts: [{ type: "step-start" }] }] }).ok).toBe(false);
    expect(parseChatMessages({ messages: [null] }).ok).toBe(false);
  });

  it("bounds message count, per-message length, and total text", () => {
    expect(parseChatMessages({ messages: Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => message("user")) }).ok).toBe(false);
    expect(parseChatMessages({ messages: [message("user", "x".repeat(6_001))] }).ok).toBe(false);
    expect(parseChatMessages({ messages: [
      message("user", "x".repeat(6_000)),
      message("assistant", "x".repeat(6_000)),
      message("user", "x".repeat(6_000)),
      message("assistant", "x".repeat(6_000)),
      message("user", "x"),
    ] }).ok).toBe(false);
  });
});
