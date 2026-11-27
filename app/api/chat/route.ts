import { google, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessageChunk,
} from "ai";
import { parseChatMessages } from "@/lib/server/chatRequest";
import { acquireChatSlot } from "@/lib/server/chatSlots";
import { readBoundedJson } from "@/lib/server/readJsonBody";
import {
  CHAT_ERROR_MESSAGES,
  describeProviderError,
  encodeStreamError,
  errorChunkStream,
  surfaceTimeoutAborts,
} from "@/lib/server/chatErrors";
import { withStallRetry } from "@/lib/server/chatStream";
import { checkRequestOrigin } from "@/lib/server/requestGuard";
import type { ChatMessageMetadata } from "@/lib/chatOutcome";
import {
  AI_SYSTEM_PROMPT,
  GEMINI_MODEL_ID,
  GEMINI_MODEL_SETTINGS,
} from "@/lib/ai-config";

export const maxDuration = 30;
const MAX_CHAT_REQUEST_BYTES = 128_000;
const CHAT_TIMEOUT_MS = 25_000;

/** Truthful configuration probe for the Health screen. Never exposes the key itself. */
export async function GET(request: Request) {
  const guard = checkRequestOrigin(request);
  if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });
  return Response.json({ configured: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) });
}

export async function POST(request: Request) {
  const guard = checkRequestOrigin(request);
  if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

  const parsedBody = await readBoundedJson(request, MAX_CHAT_REQUEST_BYTES);
  if (!parsedBody.ok) {
    return Response.json({ error: parsedBody.error }, { status: parsedBody.status });
  }

  const parsedMessages = parseChatMessages(parsedBody.value);
  if (!parsedMessages.ok) {
    return Response.json({ error: parsedMessages.error }, { status: 400 });
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json({ error: "Gemini API key is not configured." }, { status: 503 });
  }

  const releaseSlot = acquireChatSlot();
  if (!releaseSlot) {
    return Response.json(
      { error: "Chat service is busy. Retry shortly." },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }

  const abortController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, CHAT_TIMEOUT_MS);
  const abortFromRequest = () => abortController.abort(request.signal.reason);
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abortFromRequest);
    releaseSlot();
  };
  request.signal.addEventListener("abort", abortFromRequest, { once: true });
  if (request.signal.aborted) {
    cleanup();
    abortFromRequest();
    return Response.json({ error: "Chat request was cancelled." }, { status: 499 });
  }

  try {
    const modelMessages = await convertToModelMessages(parsedMessages.messages);
    const startAttempt = (): ReadableStream<UIMessageChunk> => {
      try {
        const result = streamText({
          model: google(GEMINI_MODEL_ID),
          system: AI_SYSTEM_PROMPT,
          messages: modelMessages,
          abortSignal: abortController.signal,
          // A request with no content after this long is treated as stalled and restarted once.
          timeout: { firstChunkMs: GEMINI_MODEL_SETTINGS.firstChunkTimeoutMs },
          temperature: GEMINI_MODEL_SETTINGS.temperature,
          topP: GEMINI_MODEL_SETTINGS.topP,
          maxOutputTokens: GEMINI_MODEL_SETTINGS.maxOutputTokens,
          maxRetries: GEMINI_MODEL_SETTINGS.maxRetries,
          providerOptions: {
            google: {
              thinkingConfig: { thinkingBudget: GEMINI_MODEL_SETTINGS.thinkingBudget },
            } satisfies GoogleLanguageModelOptions,
          },
        });
        return toUIMessageStream({
          stream: result.stream,
          onError: (error) => encodeStreamError(describeProviderError(error, { timedOut })),
          // The finish reason lets the client explain safety blocks and length-truncated replies.
          messageMetadata: ({ part }): ChatMessageMetadata | undefined =>
            part.type === "finish" ? { finishReason: part.finishReason } : undefined,
        });
      } catch {
        return errorChunkStream(CHAT_ERROR_MESSAGES.generic);
      }
    };

    const userCancelled = () => request.signal.aborted;
    return createUIMessageStreamResponse({
      stream: withStallRetry({
        startAttempt,
        maxAttempts: GEMINI_MODEL_SETTINGS.stallAttempts,
        canRetry: () => !timedOut && !userCancelled(),
        // The chat slot and route timer are released once, when the combined stream ends.
        onDone: cleanup,
      }).pipeThrough(surfaceTimeoutAborts(userCancelled)),
      consumeSseStream: consumeStream,
    });
  } catch {
    // Provider exceptions can contain request details; do not log them verbatim.
    cleanup();
    return Response.json({ error: CHAT_ERROR_MESSAGES.generic }, { status: 500 });
  }
}
