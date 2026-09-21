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
import { scoreTransaction } from "@/lib/tools/score-transaction";

export const maxDuration = 30;

export async function POST(request: Request) {
  // Check API key before starting the request.
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      {
        error: "Gemini API key is not configured.",
      },
      {
        status: 503,
      },
    );
  }

  // FE-08 testing flags.
  const testError = request.headers.get("x-test-error");

  try {
    // --------------------------------------------------
    // FE-08: Forced API failure test
    // --------------------------------------------------
    // This intentionally returns a 500 error so we can
    // verify that the frontend error + retry UI works.
    if (testError === "force") {
      console.error("FE-08 TEST: Simulated API failure.");

      return Response.json(
        {
          error: "FE-08 TEST: Simulated API failure.",
        },
        {
          status: 500,
        },
      );
    }

    // --------------------------------------------------
    // Read request body
    // --------------------------------------------------
    const body = (await request.json().catch(() => ({
      messages: [],
    }))) as {
      messages?: UIMessage[];
    };

    // Validate messages.
    if (!Array.isArray(body.messages)) {
      return Response.json(
        {
          error: "A valid message array is required.",
        },
        {
          status: 400,
        },
      );
    }

    // --------------------------------------------------
    // Gemini streaming response
    // --------------------------------------------------
    const result = streamText({
      model: google(GEMINI_MODEL_ID),

      system: `${AI_SYSTEM_PROMPT}

When the user asks you to analyze a transaction, assess fraud risk, explain a transaction's risk, or calculate a fraud score, use the scoreTransaction tool.

Do not invent the tool result. Use the structured tool output when available.`,

      messages: await convertToModelMessages(body.messages),

      tools: {
        scoreTransaction,
      },

      stopWhen: ({ steps }) => steps.length >= 3,

      abortSignal: request.signal,

      temperature: GEMINI_MODEL_SETTINGS.temperature,

      topP: GEMINI_MODEL_SETTINGS.topP,

      maxOutputTokens: GEMINI_MODEL_SETTINGS.maxOutputTokens,
    });

    // --------------------------------------------------
    // Convert Gemini stream to UI message stream
    // --------------------------------------------------
    const uiStream = toUIMessageStream({
      stream: result.stream,

      onError: (error) => {
        console.error("LayerNet AI stream error:", error);

        return "The LayerNet AI Fraud Analyst could not complete this request.";
      },
    });

    // --------------------------------------------------
    // Return streaming response
    // --------------------------------------------------
    return createUIMessageStreamResponse({
      stream: uiStream,
      consumeSseStream: consumeStream,
    });
  } catch (error) {
    console.error("LayerNet AI chat failure:", error);

    return Response.json(
      {
        error:
          "The LayerNet AI Fraud Analyst could not complete this request.",
      },
      {
        status: 500,
      },
    );
  }
}