"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

const suggestedPrompts = [
  "Why was this transaction flagged as high risk?",
  "What factors contributed to this fraud score?",
  "What should an analyst investigate next?",
];

function getTextFromMessage(message: { parts?: Array<{ type?: string; text?: string }> }) {
  if (!message.parts) return "";

  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

export default function AIChat() {
  const [followLatest, setFollowLatest] = useState(true);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { messages, status, stop, error, sendMessage, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const lastAssistantText = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    return lastAssistant ? getTextFromMessage(lastAssistant).trim() : "";
  }, [messages]);

  const showThinking = status === "submitted" && (!lastAssistantText || messages.at(-1)?.role !== "assistant");
  const isGenerating = status === "submitted" || status === "streaming";

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !followLatest) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, status, followLatest]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setFollowLatest(distanceFromBottom < 140);
  };

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();

    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <div className="layernet-card mt-6 overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="layernet-label">LayerNet AI Fraud Analyst</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text)]">Ask about suspicious activity</h2>
          </div>
          {!followLatest && (
            <button
              type="button"
              onClick={() => {
                setFollowLatest(true);
                const container = scrollRef.current;
                if (container) {
                  container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
                }
              }}
              className="layernet-button px-3 py-2 text-sm"
            >
              Jump to latest
            </button>
          )}
        </div>
      </div>

      <div className="flex h-[440px] flex-col">
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
                <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">Start with a fraud-analysis question</h3>
                <p className="mt-2 text-sm text-[var(--muted-text)]">
                  Ask about risk indicators, score drivers, suspicious patterns, and the next investigation steps.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
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

              if (!text && !isUser) {
                return null;
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  role="listitem"
                >
                  <div
                    className={`max-w-[82%] rounded-2xl border px-4 py-3 shadow-sm ${
                      isUser
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text)]"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-80">
                      <span>{isUser ? "Analyst" : "LayerNet AI"}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-sm leading-6">
                      {text || (isUser ? "" : "Thinking...")}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {showThinking ? (
            <div className="flex justify-start">
              <div className="max-w-[82%] rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-text)] shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--primary)]" />
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="flex justify-center">
              <div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-sm text-[var(--text)]">
                <p className="font-semibold text-[var(--danger)]">AI request failed</p>
                <p className="mt-2 text-[var(--muted-text)]">
                  The assistant could not generate a response. You can retry this request or ask another question.
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => regenerate()} className="layernet-button layernet-button--primary px-3 py-2 text-sm">
                    Retry
                  </button>
                  <button type="button" onClick={() => setInput("")} className="layernet-button px-3 py-2 text-sm">
                    Clear input
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--surface-strong)] p-3 sm:p-4">
          <form onSubmit={(event) => handleSubmit(event)} className="flex flex-col gap-3">
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
              placeholder={isGenerating ? "Generating analysis..." : "Ask about this transaction or suspicious pattern..."}
              disabled={isGenerating}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted-text)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-70"
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-[var(--muted-text)]">
                {isGenerating ? "The assistant is analyzing the latest fraud signals." : "Press Enter to send. Shift+Enter for a new line."}
              </div>

              <div className="flex gap-2">
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
                    className="layernet-button layernet-button--primary px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
