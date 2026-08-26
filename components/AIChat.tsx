"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

const suggestedPrompts = [
  "Analyze a $4850 purchase from Pakistan with unusual activity.",
  "What factors contributed to this fraud score?",
  "What should an analyst investigate next?",
];

type ToolOutput = {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  transaction: {
    amount: number;
    country: string;
    transactionType: string;
  };
  reasons: string[];
  recommendation: string;
};

function getTextFromMessage(message: {
  parts?: Array<{ type?: string; text?: string }>;
}) {
  if (!message.parts) return "";

  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function RiskScoreCard({ output }: { output: ToolOutput }) {
  const levelLabel = output.riskLevel.toUpperCase();

  return (
    <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="layernet-label">Transaction Risk Analysis</p>
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            Structured result from LayerNet risk analysis
          </p>
        </div>

        <div className="text-right">
          <div className="text-3xl font-bold text-[var(--primary)]">
            {output.riskScore}
            <span className="text-sm font-medium">/100</span>
          </div>
          <div className="text-xs font-bold tracking-wider text-[var(--danger)]">
            {levelLabel} RISK
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] p-3">
          <p className="text-xs text-[var(--muted-text)]">Amount</p>
          <p className="mt-1 font-semibold text-[var(--text)]">
            ${output.transaction.amount.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] p-3">
          <p className="text-xs text-[var(--muted-text)]">Country</p>
          <p className="mt-1 font-semibold text-[var(--text)]">
            {output.transaction.country}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] p-3">
          <p className="text-xs text-[var(--muted-text)]">Type</p>
          <p className="mt-1 font-semibold capitalize text-[var(--text)]">
            {output.transaction.transactionType}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold text-[var(--text)]">
          Risk indicators
        </p>

        <ul className="mt-2 space-y-1 text-sm text-[var(--muted-text)]">
          {output.reasons.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-text)]">
          Recommendation
        </p>
        <p className="mt-1 text-sm text-[var(--text)]">
          {output.recommendation}
        </p>
      </div>
    </div>
  );
}

function ToolPart({ part }: { part: any }) {
  const type = part.type as string;

  if (!type.startsWith("tool-")) return null;

  const output = part.output as ToolOutput | undefined;

  if (type === "tool-scoreTransaction") {
    if (part.state === "input-streaming") {
      return (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted-text)]">
          🔄 Analyzing transaction input...
        </div>
      );
    }

    if (part.state === "input-available") {
      return (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted-text)]">
          📥 Transaction details received. Calculating risk...
        </div>
      );
    }

    if (part.state === "output-available" && output) {
      return <RiskScoreCard output={output} />;
    }

    if (part.state === "output-error") {
      return (
        <div className="mt-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--surface)] p-4">
          <p className="font-semibold text-[var(--danger)]">
            ❌ Risk analysis failed
          </p>
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            The transaction could not be analyzed. Please try again.
          </p>
        </div>
      );
    }
  }

  return null;
}

export default function AIChat() {
  const [followLatest, setFollowLatest] = useState(true);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { messages, status, stop, error, sendMessage, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const lastAssistantText = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    return lastAssistant ? getTextFromMessage(lastAssistant).trim() : "";
  }, [messages]);

  const showThinking =
    status === "submitted" &&
    (!lastAssistantText || messages.at(-1)?.role !== "assistant");

  const isGenerating = status === "submitted" || status === "streaming";

  useEffect(() => {
    const container = scrollRef.current;

    if (!container || !followLatest) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, status, followLatest]);

  const handleScroll = () => {
    const container = scrollRef.current;

    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    setFollowLatest(distanceFromBottom < 140);
  };

  const handleSubmit = (event?: {
    preventDefault?: () => void;
  }) => {
    event?.preventDefault?.();

    const trimmed = input.trim();

    if (!trimmed || isGenerating) return;

    sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <div className="layernet-card mt-6 overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4 sm:px-6">
        <p className="layernet-label">LayerNet AI Fraud Analyst</p>

        <h2 className="mt-1 text-xl font-semibold text-[var(--text)]">
          Ask about suspicious activity
        </h2>
      </div>

      <div className="flex h-[520px] flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                <p className="layernet-label">Empty conversation</p>

                <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                  Start with a fraud-analysis question
                </h3>

                <p className="mt-2 text-sm text-[var(--muted-text)]">
                  Ask LayerNet to analyze a transaction and calculate its
                  structured fraud risk.
                </p>

                <div className="mt-4 flex flex-col gap-2">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const text = getTextFromMessage(message);
              const isUser = message.role === "user";

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl border px-4 py-3 shadow-sm ${
                      isUser
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text)]"
                    }`}
                  >
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-80">
                      {isUser ? "Analyst" : "LayerNet AI"}
                    </div>

                    {text ? (
                      <div className="whitespace-pre-wrap break-words text-sm leading-6">
                        {text}
                      </div>
                    ) : null}

                    {message.role === "assistant" &&
                      message.parts?.map((part, index) => (
                        <ToolPart
                          key={`${message.id}-tool-${index}`}
                          part={part}
                        />
                      ))}
                  </div>
                </div>
              );
            })
          )}

          {showThinking ? (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-text)]">
                🔄 Thinking and preparing analysis...
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="flex justify-center">
              <div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-sm">
                <p className="font-semibold text-[var(--danger)]">
                  AI request failed
                </p>

                <p className="mt-2 text-[var(--muted-text)]">
                  The assistant could not generate a response.
                </p>

                <button
                  type="button"
                  onClick={() => regenerate()}
                  className="layernet-button layernet-button--primary mt-3 px-3 py-2 text-sm"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--surface-strong)] p-3 sm:p-4">
          <form
            onSubmit={(event) => handleSubmit(event)}
            className="flex flex-col gap-3"
          >
            <textarea
              aria-label="Message the LayerNet AI Fraud Analyst"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              rows={3}
              placeholder={
                isGenerating
                  ? "Generating analysis..."
                  : "Ask about a suspicious transaction..."
              }
              disabled={isGenerating}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted-text)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 disabled:opacity-70"
            />

            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--muted-text)]">
                {isGenerating
                  ? "LayerNet is analyzing the transaction."
                  : "Press Enter to send. Shift+Enter for a new line."}
              </div>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="layernet-button layernet-button--primary px-4 py-2.5 text-sm"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="layernet-button layernet-button--primary px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  Send
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}