import { APICallError, RetryError, type UIMessageChunk } from "ai";

/**
 * Fixed, analyst-facing messages for Gemini failures. Provider errors can echo request bodies,
 * URLs or key fragments, so only the HTTP status class is inspected and nothing is passed through.
 */
export const CHAT_ERROR_MESSAGES = {
  timeout: "Gemini did not respond in time. Retry, or ask a shorter question.",
  rateLimited: "Gemini's rate limit or quota has been reached. Wait a minute, then retry.",
  unauthorized: "Gemini rejected the server's API key. An administrator needs to check the configuration.",
  rejected: "Gemini could not process this request. Rephrase the question or start a new conversation.",
  unavailable: "Gemini is temporarily unavailable. Retry shortly.",
  generic: "The AI investigation assistant could not complete this response.",
} as const;

function statusCodeOf(error: unknown): number | undefined {
  const target = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(target) ? target.statusCode : undefined;
}

export function describeProviderError(error: unknown, options: { timedOut: boolean }): string {
  if (options.timedOut) return CHAT_ERROR_MESSAGES.timeout;
  const status = statusCodeOf(error);
  if (status === 429) return CHAT_ERROR_MESSAGES.rateLimited;
  if (status === 401 || status === 403) return CHAT_ERROR_MESSAGES.unauthorized;
  if (status !== undefined && status >= 500) return CHAT_ERROR_MESSAGES.unavailable;
  if (status !== undefined && status >= 400) return CHAT_ERROR_MESSAGES.rejected;
  return CHAT_ERROR_MESSAGES.generic;
}

/** Stream errors reach the client as error text; JSON keeps them in the same `{error}` shape as HTTP errors. */
export function encodeStreamError(message: string): string {
  return JSON.stringify({ error: message });
}

/**
 * streamText reports the route's own timeout and its first-chunk (stall) timeout as an "abort" chunk,
 * which the chat client treats like the user pressing Stop: the question silently gets no reply.
 * Unless the user cancelled, send the timeout message as an error instead.
 */
export function surfaceTimeoutAborts(isUserCancel: () => boolean): TransformStream<UIMessageChunk, UIMessageChunk> {
  return new TransformStream({
    transform(chunk, controller) {
      if (chunk.type === "abort" && !isUserCancel()) {
        controller.enqueue({ type: "error", errorText: encodeStreamError(CHAT_ERROR_MESSAGES.timeout) });
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

/** A one-chunk UI stream carrying a fixed error, for failures that happen before a model stream exists. */
export function errorChunkStream(message: string): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "error", errorText: encodeStreamError(message) });
      controller.close();
    },
  });
}
