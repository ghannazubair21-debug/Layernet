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

function assistantMsg(parts: any[]) {
  return {
    id: "assistant-1",
    role: "assistant" as const,
    parts,
  };
}

const toolOutput = {
  riskScore: 78,
  riskLevel: "high" as const,
  transaction: {
    amount: 4850,
    country: "Pakistan",
    transactionType: "purchase",
  },
  reasons: ["High transaction amount", "Unusual activity detected"],
  recommendation: "Review transaction manually",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseChat.mockReturnValue(makeChatReturn() as any);
});

describe("AIChat", () => {
  it("renders the empty conversation state", () => {
    render(<AIChat />);

    expect(
      screen.getByRole("heading", {
        name: "Start with a fraud-analysis question",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /Analyze a \$4850 purchase from Pakistan/i,
      })
    ).toBeInTheDocument();
  });

  it("fills the message input when a suggested prompt is clicked", async () => {
    const user = userEvent.setup();

    render(<AIChat />);

    const prompt = screen.getByRole("button", {
      name: /What factors contributed to this fraud score/i,
    });

    await user.click(prompt);

    expect(
      screen.getByLabelText("Message the LayerNet AI Fraud Analyst")
    ).toHaveValue("What factors contributed to this fraud score?");
  });

  it("renders a user message and an assistant text message", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({
        messages: [
          userMsg("Analyze this transaction"),
          assistantMsg([
            {
              type: "text",
              text: "The transaction has elevated fraud risk.",
            },
          ]),
        ],
      }) as any
    );

    render(<AIChat />);

    expect(screen.getByText("Analyst")).toBeInTheDocument();
    expect(screen.getByText("LayerNet AI")).toBeInTheDocument();

    expect(
      screen.getByText("The transaction has elevated fraud risk.")
    ).toBeInTheDocument();
  });

  it("shows the thinking state while a request is submitted", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({
        status: "submitted",
        messages: [],
      }) as any
    );

    render(<AIChat />);

    expect(
      screen.getByText("Thinking and preparing analysis...")
    ).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText("Generating analysis...")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Stop" })
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
          assistantMsg([
            {
              type: "text",
              text: "Analyzing the transaction...",
            },
          ]),
        ],
      }) as any
    );

    render(<AIChat />);

    expect(
      screen.getByText("Analyzing the transaction...")
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Stop" })
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
      }) as any
    );

    render(<AIChat />);

    expect(
      screen.getByText("AI request failed")
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "The assistant could not generate a response."
      )
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Retry" })
    );

    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("renders the transaction risk tool result", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({
        messages: [
          assistantMsg([
            {
              type: "tool-scoreTransaction",
              state: "output-available",
              output: toolOutput,
            },
          ]),
        ],
      }) as any
    );

    render(<AIChat />);

    expect(
      screen.getByText("Transaction Risk Analysis")
    ).toBeInTheDocument();

    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getByText("HIGH RISK")).toBeInTheDocument();
    expect(screen.getByText("$4,850")).toBeInTheDocument();
    expect(screen.getByText("Pakistan")).toBeInTheDocument();

    expect(
      screen.getByText("High transaction amount")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Review transaction manually")
    ).toBeInTheDocument();
  });

  it("shows the tool input-streaming state", () => {
    mockedUseChat.mockReturnValue(
      makeChatReturn({
        messages: [
          assistantMsg([
            {
              type: "tool-scoreTransaction",
              state: "input-streaming",
            },
          ]),
        ],
      }) as any
    );

    render(<AIChat />);

    expect(
      screen.getByText("Analyzing transaction input...")
    ).toBeInTheDocument();
  });

  it("sends a message when the user submits the form", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();

    mockedUseChat.mockReturnValue(
      makeChatReturn({
        sendMessage,
      }) as any
    );

    render(<AIChat />);

    const input = screen.getByLabelText(
      "Message the LayerNet AI Fraud Analyst"
    );

    await user.type(
      input,
      "Analyze a suspicious purchase"
    );

    await user.click(
      screen.getByRole("button", { name: "Send" })
    );

    expect(sendMessage).toHaveBeenCalledWith({
      text: "Analyze a suspicious purchase",
    });
  });
});