/**
 * Minimal database boundary used by the repositories. Production uses Neon
 * Postgres (lib/server/db/neon.ts); tests use an in-process Postgres (PGlite)
 * running the same migrations, so repository SQL is exercised against a real
 * Postgres engine without network access or credentials.
 */
export type Row = Record<string, unknown>;

export interface Database {
  /** One parameterised statement ($1, $2, …). Never interpolate values into `text`. */
  query<T extends Row = Row>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  /** One or more statements without parameters (migrations only). */
  exec(sql: string): Promise<void>;
  /** Runs fn inside BEGIN/COMMIT, rolling back if it throws. Nested calls reuse the outer transaction. */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
}

/** Thrown when the database is not configured; callers should fail closed. */
export class DatabaseUnavailableError extends Error {
  constructor(message = "Database is not configured.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}
