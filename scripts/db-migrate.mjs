// Applies pending SQL migrations from db/migrations to the database named by
// DATABASE_URL (Neon). Usage: npm run db:migrate
//
// Prints migration ids and the target host's name only; the connection string
// and credentials are never printed.
import { Pool } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import { applyMigrations, loadMigrations } from "../lib/server/db/migrator.mjs";

// Schema changes use the direct (unpooled) endpoint when available.
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Pull it with `vercel env pull` (see docs/architecture/DATABASE.md).");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
// Background errors on an idle connection must not crash the run; log the code only.
pool.on("error", (error) => console.error(`Idle connection error (code ${error?.code ?? "none"}).`));
const client = await pool.connect();

/** @type {import("../lib/server/db/migrator.mjs").MigrationExecutor} */
const db = {
  async exec(sql) {
    await client.query(sql);
  },
  async query(sql, params = []) {
    const result = await client.query(sql, params);
    return { rows: result.rows };
  },
  async transaction(fn) {
    await client.query("BEGIN");
    try {
      const result = await fn(db);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  },
};

try {
  console.log(`Target host: ${new URL(connectionString).hostname}`);
  const migrations = await loadMigrations(fileURLToPath(new URL("../db/migrations/", import.meta.url)));
  const { applied, alreadyApplied } = await applyMigrations(db, migrations);
  console.log(`Already applied: ${alreadyApplied.length ? alreadyApplied.join(", ") : "none"}`);
  console.log(`Applied now: ${applied.length ? applied.join(", ") : "none (up to date)"}`);
} catch (error) {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
