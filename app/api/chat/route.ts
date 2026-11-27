import { google } from "@ai-sdk/google";
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { parseChatMessages } from "@/lib/server/chatRequest";
import { acquireChatSlot } from "@/lib/server/chatSlots";
import { readBoundedJson } from "@/lib/server/readJsonBody";
import { checkRequestOrigin } from "@/lib/server/requestGuard";
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
  const timeout = setTimeout(() => abortController.abort(), CHAT_TIMEOUT_MS);
  const abortFromRequest = () => abortController.abort(request.signal.reason);
  const cleanup = () => {
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
    const result = streamText({
      model: google(GEMINI_MODEL_ID),
      system: AI_SYSTEM_PROMPT,
      messages: await convertToModelMessages(parsedMessages.messages),
      abortSignal: abortController.signal,
      temperature: GEMINI_MODEL_SETTINGS.temperature,
      topP: GEMINI_MODEL_SETTINGS.topP,
      maxOutputTokens: GEMINI_MODEL_SETTINGS.maxOutputTokens,
      onEnd: cleanup,
      onAbort: cleanup,
      onError: cleanup,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onError: () => "The AI investigation assistant could not complete this response.",
      }),
      consumeSseStream: consumeStream,
    });
  } catch {
    // Provider exceptions can contain request details; do not log them verbatim.
    cleanup();
    return Response.json(
      { error: "The AI investigation assistant could not complete this response." },
      { status: 500 },
    );
  }
}
