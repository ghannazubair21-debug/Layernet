// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the Neon Pool: an EventEmitter that records its options and
// answers queries, so no network or credentials are needed.
const pools: FakePool[] = [];
class FakePool extends EventEmitter {
  constructor(public options: { connectionString: string }) {
    super();
    pools.push(this);
  }
  async query() {
    return { rows: [{ ok: 1 }] };
  }
}
vi.mock("@neondatabase/serverless", () => ({ Pool: FakePool }));

const SECRET_URL = "postgresql://user:s3cret-password@example-host.invalid/db";

describe("Neon adapter", () => {
  beforeEach(async () => {
    pools.length = 0;
    vi.stubEnv("DATABASE_URL", SECRET_URL);
    (await import("../neon")).resetDatabasePoolForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not create a pool until the first query", async () => {
    const { getDatabase } = await import("../neon");
    const db = getDatabase();
    expect(pools).toHaveLength(0);
    await db.query("SELECT 1");
    expect(pools).toHaveLength(1);
  });

  it("fails closed with DatabaseUnavailableError when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getDatabase } = await import("../neon");
    await expect(getDatabase().query("SELECT 1")).rejects.toMatchObject({ name: "DatabaseUnavailableError" });
  });

  it("handles idle connection errors instead of crashing, and never logs connection details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { getDatabase } = await import("../neon");
    await getDatabase().query("SELECT 1");
    const [pool] = pools;
    expect(pool.listenerCount("error")).toBe(1);

    const error = Object.assign(new Error(`connection to ${SECRET_URL} terminated`), { code: "57P01" });
    // With no listener, EventEmitter#emit("error") throws: this is the crash being prevented.
    expect(() => pool.emit("error", error, {})).not.toThrow();

    expect(log).toHaveBeenCalledTimes(1);
    const message = String(log.mock.calls[0][0]);
    expect(message).toContain("57P01");
    expect(message).not.toContain("s3cret-password");
    expect(message).not.toContain("example-host");
  });
});
