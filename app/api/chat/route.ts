import { google } from "@ai-sdk/google";
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import {
  AI_SYSTEM_PROMPT,
  GEMINI_MODEL_ID,
  GEMINI_MODEL_SETTINGS,
} from "@/lib/ai-config";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "Gemini API key is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({ messages: [] }))) as {
      messages?: UIMessage[];
    };

    if (!Array.isArray(body.messages)) {
      return Response.json(
        { error: "A valid message array is required." },
        { status: 400 },
      );
    }

    const result = streamText({
      model: google(GEMINI_MODEL_ID),
      system: AI_SYSTEM_PROMPT,
      messages: await convertToModelMessages(body.messages),
      abortSignal: request.signal,
      temperature: GEMINI_MODEL_SETTINGS.temperature,
      topP: GEMINI_MODEL_SETTINGS.topP,
      maxOutputTokens: GEMINI_MODEL_SETTINGS.maxOutputTokens,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onError: () => "The LayerNet AI Fraud Analyst could not complete this request.",
      }),
      consumeSseStream: consumeStream,
    });
  } catch (error) {
    console.error("LayerNet AI chat failure:", error);
    return Response.json(
      { error: "The LayerNet AI Fraud Analyst could not complete this request." },
      { status: 500 },
    );
  }
}
