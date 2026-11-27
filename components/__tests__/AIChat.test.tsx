import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class {
  },
}));

import { useChat } from "@ai-sdk/react";
import AIChat, { describeChatError } from "@/components/AIChat";

const mockedUseChat = vi.mocked(useChat);
type ChatReturn = ReturnType<typeof useChat>;

function makeChatReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-chat",
    messages: [],
    status: "ready",
    error: undefined,
    sendMessage: vi.fn(),
    regenerate: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

function userMsg(text: string) {
  return {
    id: "user-1",
    role: "user" as const,
    parts: [{ type: "text", text }],
  };
}

function assistantMsg(text: string) {
  return {
    id: "assistant-1",
    role: "assistant" as const,
    parts: [{ type: "text", text }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseChat.mockReturnValue(makeChatReturn() as unknown as ChatReturn);
});

describe("AIChat", () => {
  it("renders the empty investigation state", () => {
    render(<AIChat />);

    expect(
      screen.getByRole("heading", {
        name: "Start with an investigation question",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /Which evidence should an analyst verify before escalating/i,
      }),
    ).toBeInTheDocument();
  });

  it("fills the message input when a suggested prompt is clicked", async () => {
    const user = userEvent.setup();

    render(<AIChat />);

    const prompt = screen.getByRole("button", {
      name: /Which evidence should an analyst verify before escalating/i,
    });

    await user.click(prompt);

    expect(
      screen.getByLabelText("Message the AI investigation assistant"),
    ).toHaveValue(
      "Which evidence should an analyst verify before escalating?",
    );
  });

  it("renders a user message and an assistant text message", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({
        messages: [
          userMsg("What should I investigate?"),
          assistantMsg("Review the source transaction records first."),
        ],
      }) as unknown as ChatReturn,
    );

    render(<AIChat />);

    expect(screen.getByText("Analyst")).toBeInTheDocument();
    expect(screen.getByText("AI assistant")).toBeInTheDocument();

    expect(
      screen.getByText("Review the source transaction records first."),
    ).toBeInTheDocument();
  });

  it("shows the submitted state while a request is being prepared", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({
        status: "submitted",
        messages: [],
      }) as unknown as ChatReturn,
    );

    render(<AIChat />);

    expect(screen.getByText("Thinking...")).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText("Generating response..."),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Stop" }),
    ).toBeInTheDocument();
  });

  it("shows the streaming state and allows stopping generation", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();

    mockedUseChat.mockReturnValue(
      makeChatReturn({
        status: "streaming",
        stop,
        messages: [
          assistantMsg("Investigating the available evidence..."),
        ],
      }) as unknown as ChatReturn,
    );

    render(<AIChat />);

    expect(
      screen.getByText("Investigating the available evidence..."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Stop" }),
    );

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("shows the error state and allows retry", async () => {
    const user = userEvent.setup();
    const regenerate = vi.fn();

    mockedUseChat.mockReturnValue(
      makeChatReturn({
        error: new Error("AI request failed"),
        regenerate,
      }) as unknown as ChatReturn,
    );

    render(<AIChat />);

    expect(
      screen.getByText("AI request failed"),
    ).toBeInTheDocument();

    expect(
  screen.getByText(
    /The assistant could not generate a response\. You can retry this request or ask another question\./i,
  ),
).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Retry" }),
    );

    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("sends a message when the user submits the form", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();

    mockedUseChat.mockReturnValue(
      makeChatReturn({
        sendMessage,
      }) as unknown as ChatReturn,
    );

    render(<AIChat />);

    const input = screen.getByLabelText(
      "Message the AI investigation assistant",
    );

    await user.type(
      input,
      "What evidence should I verify?",
    );

    await user.click(
      screen.getByRole("button", { name: "Send" }),
    );

    expect(sendMessage).toHaveBeenCalledWith({
      text: "What evidence should I verify?",
    });
  });

  it("keeps the textarea focusable while generating but does not send a second message", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    mockedUseChat.mockReturnValue(
      makeChatReturn({ status: "streaming", sendMessage, messages: [userMsg("First"), assistantMsg("Partial")] }) as unknown as ChatReturn,
    );
    render(<AIChat />);

    const input = screen.getByLabelText("Message the AI investigation assistant");
    expect(input).toBeEnabled();
    await user.type(input, "Follow-up{Enter}");
    expect(input).toHaveFocus();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole("log", { name: /Conversation with the AI investigation assistant/ })).toBeInTheDocument();
  });

  it("announces the server's error message so the analyst knows whether retrying helps", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({ error: new Error(JSON.stringify({ error: "Chat service is busy. Retry shortly." })) }) as unknown as ChatReturn,
    );
    render(<AIChat />);
    expect(screen.getByRole("alert")).toHaveTextContent("Chat service is busy. Retry shortly.");
  });
});

describe("AIChat finish notes", () => {
  it("explains a reply that Gemini's safety filter blocked instead of hiding it", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({
        messages: [userMsg("Question"), { id: "assistant-1", role: "assistant", parts: [], metadata: { finishReason: "content-filter" } }],
      }) as unknown as ChatReturn,
    );
    render(<AIChat />);
    expect(screen.getByText(/safety filter stopped this response/)).toBeInTheDocument();
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("keeps a truncated reply and notes that it may be cut off", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({
        messages: [userMsg("Question"), { ...assistantMsg("Partial answer"), metadata: { finishReason: "length" } }],
      }) as unknown as ChatReturn,
    );
    render(<AIChat />);
    expect(screen.getByText("Partial answer")).toBeInTheDocument();
    expect(screen.getByText(/may be cut off/)).toBeInTheDocument();
  });

  it("shows a mid-stream provider error encoded by the route", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({ status: "error", error: new Error(JSON.stringify({ error: "Gemini is temporarily unavailable. Retry shortly." })) }) as unknown as ChatReturn,
    );
    render(<AIChat />);
    expect(screen.getByRole("alert")).toHaveTextContent("Gemini is temporarily unavailable. Retry shortly.");
  });
});

describe("describeChatError", () => {
  it("falls back to generic text for non-JSON or empty errors", () => {
    expect(describeChatError(undefined)).toMatch(/could not generate a response/);
    expect(describeChatError(new Error("Failed to fetch"))).toMatch(/could not generate a response/);
    expect(describeChatError(new Error(JSON.stringify({ error: "   " })))).toMatch(/could not generate a response/);
  });

  it("uses the route's error string when present", () => {
    expect(describeChatError(new Error('{"error":"Gemini API key is not configured."}'))).toBe("Gemini API key is not configured.");
  });
});
