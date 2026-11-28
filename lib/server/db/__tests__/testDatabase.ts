import { PGlite, type Transaction } from "@electric-sql/pglite";
import { resolve } from "node:path";
import { applyMigrations, loadMigrations } from "../migrator.mjs";
import type { Database, Row } from "../database";

type PgLike = Pick<PGlite, "query" | "exec"> | Transaction;

function wrap(pg: PgLike, root: PGlite | null): Database {
  const db: Database = {
    async query<T extends Row = Row>(text: string, params: readonly unknown[] = []) {
      const result = await pg.query<T>(text, [...params]);
      return { rows: result.rows };
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    transaction: root ? (fn) => root.transaction((tx) => fn(wrap(tx, null))) : (fn) => fn(db),
  };
  return db;
}

export const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");

/** A fresh in-process Postgres with every migration applied. */
export async function createMigratedTestDatabase(): Promise<{ db: Database; pg: PGlite }> {
  const pg = await PGlite.create();
  const db = wrap(pg, pg);
  await applyMigrations(db, await loadMigrations(MIGRATIONS_DIR));
  return { db, pg };
}

export async function createEmptyTestDatabase(): Promise<{ db: Database; pg: PGlite }> {
  const pg = await PGlite.create();
  return { db: wrap(pg, pg), pg };
}
