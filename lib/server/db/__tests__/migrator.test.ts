// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations, migrationChecksum } from "../migrator.mjs";
import { MIGRATIONS_DIR, createEmptyTestDatabase } from "./testDatabase";

// PGlite boots a WebAssembly Postgres per test; the first boot can take several seconds.
describe("migration runner", { timeout: 30_000 }, () => {
  it("applies every migration once and is idempotent", async () => {
    const { db, pg } = await createEmptyTestDatabase();
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    expect(migrations.length).toBeGreaterThan(0);

    const first = await applyMigrations(db, migrations);
    expect(first.applied).toEqual(migrations.map((m) => m.id));

    const second = await applyMigrations(db, migrations);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toEqual(migrations.map((m) => m.id));
    await pg.close();
  });

  it("refuses to run when an applied migration was edited", async () => {
    const { db, pg } = await createEmptyTestDatabase();
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    await applyMigrations(db, migrations);

    const edited = migrations.map((m, i) => (i === 0 ? { ...m, checksum: migrationChecksum(m.sql + "\n-- edit") } : m));
    await expect(applyMigrations(db, edited)).rejects.toThrow(/modified after it was applied/);
    await pg.close();
  });

  it("refuses to run when an applied migration file is missing", async () => {
    const { db, pg } = await createEmptyTestDatabase();
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    await applyMigrations(db, migrations);
    await expect(applyMigrations(db, migrations.slice(1))).rejects.toThrow(/has no file/);
    await pg.close();
  });

  it("rolls back a failing migration without recording it", async () => {
    const { db, pg } = await createEmptyTestDatabase();
    const bad = { id: "0001_bad", sql: "CREATE TABLE half_done (id int); SELECT * FROM no_such_table;", checksum: migrationChecksum("x") };
    await expect(applyMigrations(db, [bad])).rejects.toThrow();
    const tables = await db.query("SELECT to_regclass('half_done') AS t");
    expect(tables.rows[0].t).toBeNull();
    const recorded = await db.query("SELECT count(*)::int AS n FROM schema_migrations");
    expect(recorded.rows[0].n).toBe(0);
    await pg.close();
  });

  it("computes the same checksum for CRLF and LF checkouts", () => {
    expect(migrationChecksum("a\r\nb\r\n")).toBe(migrationChecksum("a\nb\n"));
  });
});
