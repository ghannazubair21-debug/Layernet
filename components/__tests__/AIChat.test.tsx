import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class {
    constructor(_options?: Record<string, unknown>) {}
  },
}));

import { useChat } from "@ai-sdk/react";
import AIChat from "@/components/AIChat";

const mockedUseChat = vi.mocked(useChat);

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
  mockedUseChat.mockReturnValue(makeChatReturn() as any);
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
      }) as any,
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
      }) as any,
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
      }) as any,
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
      }) as any,
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
      }) as any,
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
});