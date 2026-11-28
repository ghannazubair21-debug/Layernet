// @ts-check
/**
 * Forward-only SQL migration runner shared by the CLI (scripts/db-migrate.mjs)
 * and the test suite. Plain ESM so it runs under Node without a TypeScript
 * loader.
 *
 * Rules:
 * - Migrations are `NNNN_name.sql` files applied in file-name order, each in
 *   its own transaction together with its schema_migrations row.
 * - An applied migration is immutable. Its SHA-256 (computed over the file with
 *   line endings normalised to LF, so Windows and Linux checkouts agree) is
 *   recorded; if a file later differs, the runner stops before applying
 *   anything. Fixes go in a new migration.
 * - A recorded migration whose file is missing also stops the runner.
 * - There are no down-migrations: rollback is a new forward migration.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * @typedef {object} MigrationExecutor
 * @property {(sql: string) => Promise<void>} exec Run one or more statements without parameters.
 * @property {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} query Run one parameterised statement.
 * @property {<T>(fn: (tx: MigrationExecutor) => Promise<T>) => Promise<T>} transaction Run fn inside BEGIN/COMMIT.
 */

/** @typedef {{ id: string; sql: string; checksum: string }} Migration */

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

/** @param {string} text */
export function migrationChecksum(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

/**
 * @param {string} directory
 * @returns {Promise<Migration[]>}
 */
export async function loadMigrations(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const invalid = names.filter((name) => !MIGRATION_FILE.test(name));
  if (invalid.length > 0) {
    throw new Error(`Migration file names must look like 0001_name.sql: ${invalid.join(", ")}`);
  }
  return Promise.all(names.map(async (name) => {
    const text = await readFile(join(directory, name), "utf8");
    return { id: name.replace(/\.sql$/, ""), sql: text.replace(/\r\n/g, "\n"), checksum: migrationChecksum(text) };
  }));
}

/**
 * Applies every pending migration. Returns the ids applied by this call.
 * @param {MigrationExecutor} db
 * @param {Migration[]} migrations
 * @returns {Promise<{ applied: string[]; alreadyApplied: string[] }>}
 */
export async function applyMigrations(db, migrations) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const { rows } = await db.query("SELECT id, checksum FROM schema_migrations ORDER BY id");
  const recorded = new Map(rows.map((row) => [String(row.id), String(row.checksum)]));
  const known = new Map(migrations.map((migration) => [migration.id, migration]));

  for (const [id, checksum] of recorded) {
    const migration = known.get(id);
    if (!migration) throw new Error(`Applied migration ${id} has no file; refusing to continue.`);
    if (migration.checksum !== checksum) {
      throw new Error(`Applied migration ${id} was modified after it was applied (checksum mismatch); add a new migration instead.`);
    }
  }

  const applied = [];
  for (const migration of migrations) {
    if (recorded.has(migration.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query("INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)", [migration.id, migration.checksum]);
    });
    applied.push(migration.id);
  }
  return { applied, alreadyApplied: [...recorded.keys()] };
}
