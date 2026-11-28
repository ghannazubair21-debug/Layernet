import { Pool, type PoolClient } from "@neondatabase/serverless";
import { DatabaseUnavailableError, type Database, type Row } from "./database";

/**
 * Neon Postgres adapter. The pool is created lazily on first use so that
 * importing this module never needs DATABASE_URL (next build evaluates
 * modules without runtime secrets). Uses the WebSocket Pool rather than the
 * HTTP driver because repositories need interactive transactions.
 */
let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseUnavailableError("DATABASE_URL is not set.");
  pool = new Pool({ connectionString, max: 5 });
  // An idle pooled connection can fail in the background (for example when a
  // Free-plan Neon compute suspends). The pool reports that as an "error"
  // event; without a listener Node treats it as unhandled and can crash the
  // process. The pool discards the broken connection itself, so log and go on.
  pool.on("error", logIdleConnectionError);
  return pool;
}

/** Logs only the error's name and code: driver messages can echo connection details. */
export function logIdleConnectionError(error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "none";
  console.error(`[layernet:db] idle database connection error (${name}, code ${code}); the connection was discarded.`);
}

/** Test hook: forget the cached pool so the next call builds a new one. */
export function resetDatabasePoolForTests(): void {
  pool = null;
}

function clientDatabase(client: PoolClient): Database {
  const db: Database = {
    async query<T extends Row = Row>(text: string, params: readonly unknown[] = []) {
      const result = await client.query(text, [...params]);
      return { rows: result.rows as T[] };
    },
    async exec(sql: string) {
      await client.query(sql);
    },
    // Already inside a transaction: run in the same one.
    transaction: (fn) => fn(db),
  };
  return db;
}

export function getDatabase(): Database {
  return {
    async query<T extends Row = Row>(text: string, params: readonly unknown[] = []) {
      const result = await getPool().query(text, [...params]);
      return { rows: result.rows as T[] };
    },
    async exec(sql: string) {
      await getPool().query(sql);
    },
    async transaction(fn) {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const result = await fn(clientDatabase(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
