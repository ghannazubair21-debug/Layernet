/** Metadata the chat route attaches to each assistant message when Gemini finishes. */
export type ChatMessageMetadata = {
  finishReason?: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
};

/**
 * A short note for replies that did not end normally. Gemini's SAFETY / blocklist stops arrive as
 * "content-filter" (often with no text at all); MAX_TOKENS arrives as "length".
 */
export function describeFinishNote(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || !("finishReason" in metadata)) return null;
  const { finishReason } = metadata as ChatMessageMetadata;
  if (finishReason === "content-filter") {
    return "Gemini's safety filter stopped this response. Rephrase the question without sensitive or personal details and retry.";
  }
  if (finishReason === "length") {
    return "This response reached the length limit and may be cut off. Ask for a shorter answer or a specific part.";
  }
  return null;
}
