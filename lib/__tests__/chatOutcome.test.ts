import { describe, expect, it } from "vitest";
import { describeFinishNote } from "@/lib/chatOutcome";

describe("describeFinishNote", () => {
  it("explains safety blocks and length truncation", () => {
    expect(describeFinishNote({ finishReason: "content-filter" })).toMatch(/safety filter/);
    expect(describeFinishNote({ finishReason: "length" })).toMatch(/length limit/);
  });

  it("adds nothing for normal or missing finish reasons", () => {
    expect(describeFinishNote({ finishReason: "stop" })).toBeNull();
    expect(describeFinishNote(undefined)).toBeNull();
    expect(describeFinishNote("content-filter")).toBeNull();
    expect(describeFinishNote({})).toBeNull();
  });
});
