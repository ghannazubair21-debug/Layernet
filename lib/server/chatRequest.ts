import type { UIMessage } from "ai";

export const MAX_CHAT_MESSAGES = 20;
export const MAX_CHAT_MESSAGE_CHARS = 6_000;
export const MAX_CHAT_TOTAL_CHARS = 24_000;
export const MAX_CHAT_TOTAL_TEXT_BYTES = 48_000;

export type ChatMessagesResult =
  | { ok: true; messages: UIMessage[] }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate and reduce client chat history to bounded, text-only messages. */
export function parseChatMessages(body: unknown): ChatMessagesResult {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return { ok: false, error: "A valid message array is required." };
  }
  if (body.messages.length < 1 || body.messages.length > MAX_CHAT_MESSAGES) {
    return {
      ok: false,
      error: `Chat history must contain between 1 and ${MAX_CHAT_MESSAGES} messages.`,
    };
  }

  const messages: UIMessage[] = [];
  let totalChars = 0;
  let totalTextBytes = 0;
  const encoder = new TextEncoder();

  for (const candidate of body.messages) {
    if (!isRecord(candidate)) {
      return { ok: false, error: "Each chat message must be a valid text message." };
    }
    const { id, role, parts } = candidate;
    if (
      typeof id !== "string" || id.length < 1 || id.length > 128 ||
      (role !== "user" && role !== "assistant") ||
      !Array.isArray(parts) || parts.length < 1 || parts.length > 8
    ) {
      return { ok: false, error: "Each chat message must be a valid text message." };
    }

    const textParts: Array<{ type: "text"; text: string }> = [];
    for (const part of parts) {
      if (!isRecord(part)) {
        return { ok: false, error: "Only plain text chat messages are supported." };
      }
      // AI SDK streams can include non-content step boundaries alongside text.
      if (part.type === "step-start") continue;
      if (part.type !== "text" || typeof part.text !== "string") {
        return { ok: false, error: "Only plain text chat messages are supported." };
      }
      if (part.text.length > MAX_CHAT_MESSAGE_CHARS) {
        return { ok: false, error: "A chat message exceeds the allowed length." };
      }

      totalChars += part.text.length;
      totalTextBytes += encoder.encode(part.text).byteLength;
      if (totalChars > MAX_CHAT_TOTAL_CHARS || totalTextBytes > MAX_CHAT_TOTAL_TEXT_BYTES) {
        return { ok: false, error: "The conversation exceeds the allowed size." };
      }
      textParts.push({ type: "text", text: part.text });
    }

    if (textParts.length === 0 || textParts.every((part) => part.text.trim().length === 0)) {
      return { ok: false, error: "Each chat message must contain text." };
    }
    messages.push({ id, role, parts: textParts });
  }

  return { ok: true, messages };
}
