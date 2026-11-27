import { afterEach, describe, expect, it } from "vitest";
import { acquireBenchmarkSlot } from "@/lib/server/benchmarkSlot";

describe("benchmark process slot", () => {
  let release: (() => void) | null = null;
  afterEach(() => {
    release?.();
    release = null;
  });

  it("allows one concurrent task and releases idempotently", () => {
    release = acquireBenchmarkSlot();
    expect(release).toBeTypeOf("function");
    expect(acquireBenchmarkSlot()).toBeNull();
    release?.();
    release?.();
    release = null;
    expect(acquireBenchmarkSlot()).toBeTypeOf("function");
  });
});
