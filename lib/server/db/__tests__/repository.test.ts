// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RiskAssessment, TransactionFact } from "@/lib/domain/contracts";
import type { Database } from "../database";
import {
  appendAuditEvent,
  appendRiskAssessment,
  createWorkspace,
  getMembership,
  getTransactionFact,
  grantMembership,
  insertTransactionFact,
  listAssessments,
  listRecentTransactions,
  upsertUserByIdentity,
} from "../repository";
import { createMigratedTestDatabase } from "./testDatabase";

let db: Database;
let pg: PGlite;

// PGlite boots a WebAssembly Postgres; allow for a slow first start.
beforeAll(async () => {
  ({ db, pg } = await createMigratedTestDatabase());
}, 30_000);
afterAll(async () => {
  await pg.close();
});

const HASH = "a".repeat(64);

async function setup() {
  const workspace = await createWorkspace(db, { name: "Test workspace" });
  const user = await upsertUserByIdentity(db, {
    issuer: "https://issuer.example",
    subject: `user-${randomUUID()}`,
    displayName: "Analyst",
  });
  return { workspace, user };
}

function fact(workspaceId: string, userId: string, overrides: Partial<TransactionFact> = {}): TransactionFact {
  return {
    id: randomUUID(),
    workspaceId,
    sourceTransactionId: `TX-${randomUUID()}`,
    eventTime: "2026-11-27T10:00:00.000Z",
    amount: 1250.5,
    currency: "PKR",
    type: "transfer",
    accountRef: "hmac1:abc",
    channel: "mobile",
    location: null,
    deviceRef: null,
    provenance: { kind: "manual-entry", enteredBy: userId },
    ingestedAt: "2026-11-27T10:00:01.000Z",
    ...overrides,
  };
}

function assessment(workspaceId: string, transactionId: string, overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    id: randomUUID(),
    workspaceId,
    transactionId,
    assessor: { kind: "rules", name: "LayerNet rules baseline", version: "v1.1" },
    mode: "primary",
    featureSchemaVersion: "rules-features-v1",
    inputSha256: HASH,
    score: 72,
    scoreScale: { min: 0, max: 100 },
    scoreSemantics: "uncalibrated-heuristic",
    calibrationRef: null,
    threshold: null,
    decision: "Review",
    factors: ["Amount above account baseline"],
    limitations: ["Rules baseline; not a probability"],
    assessedAt: "2026-11-27T10:00:02.000Z",
    recordedAt: "2026-11-27T10:00:03.000Z",
    legacyImport: false,
    ...overrides,
  };
}

describe("identity and membership", () => {
  it("returns the same user for the same OIDC identity and refreshes the display name", async () => {
    const subject = `s-${randomUUID()}`;
    const a = await upsertUserByIdentity(db, { issuer: "https://issuer.example", subject, displayName: "Old" });
    const b = await upsertUserByIdentity(db, { issuer: "https://issuer.example", subject, displayName: "New" });
    expect(b.id).toBe(a.id);
    expect(b.displayName).toBe("New");
  });

  it("grants a role and audits it in the same transaction", async () => {
    const { workspace, user } = await setup();
    const membership = await grantMembership(db, { workspaceId: workspace.id, userId: user.id, role: "analyst", grantedBy: user.id });
    expect(membership.role).toBe("analyst");
    expect(await getMembership(db, workspace.id, user.id)).toMatchObject({ role: "analyst" });

    const audit = await db.query("SELECT action, details FROM audit_events WHERE workspace_id = $1", [workspace.id]);
    expect(audit.rows).toEqual([{ action: "member.granted", details: { role: "analyst" } }]);
  });

  it("returns null for a user without membership", async () => {
    const { workspace, user } = await setup();
    expect(await getMembership(db, workspace.id, user.id)).toBeNull();
  });
});

describe("transaction facts", () => {
  it("round-trips a fact through Postgres unchanged", async () => {
    const { workspace, user } = await setup();
    const input = fact(workspace.id, user.id);
    const result = await insertTransactionFact(db, input);
    expect(result).toEqual({ status: "inserted", fact: input });
    expect(await getTransactionFact(db, workspace.id, input.id)).toEqual(input);
  });

  it("reports a duplicate sourceTransactionId and never overwrites the original", async () => {
    const { workspace, user } = await setup();
    const original = fact(workspace.id, user.id);
    await insertTransactionFact(db, original);
    const repeat = fact(workspace.id, user.id, { sourceTransactionId: original.sourceTransactionId, amount: 9 });
    expect(await insertTransactionFact(db, repeat)).toEqual({ status: "duplicate", existingId: original.id });
    expect((await getTransactionFact(db, workspace.id, original.id))?.amount).toBe(1250.5);
  });

  it("allows the same sourceTransactionId in different workspaces", async () => {
    const a = await setup();
    const b = await setup();
    const x = fact(a.workspace.id, a.user.id, { sourceTransactionId: "SAME-1" });
    const y = fact(b.workspace.id, b.user.id, { sourceTransactionId: "SAME-1" });
    expect((await insertTransactionFact(db, x)).status).toBe("inserted");
    expect((await insertTransactionFact(db, y)).status).toBe("inserted");
  });

  it("does not return a fact through another workspace", async () => {
    const a = await setup();
    const b = await setup();
    const x = fact(a.workspace.id, a.user.id);
    await insertTransactionFact(db, x);
    expect(await getTransactionFact(db, b.workspace.id, x.id)).toBeNull();
    expect(await listRecentTransactions(db, b.workspace.id)).toEqual([]);
  });

  it("stores legacy imports with an unknown (null) currency", async () => {
    const { workspace, user } = await setup();
    const legacy = fact(workspace.id, user.id, {
      currency: null,
      provenance: { kind: "legacy-local-import", importedBy: user.id, importBatchId: randomUUID() },
    });
    expect((await insertTransactionFact(db, legacy)).status).toBe("inserted");
  });

  it("rejects a missing currency outside legacy imports in the schema and in the database", async () => {
    const { workspace, user } = await setup();
    await expect(insertTransactionFact(db, fact(workspace.id, user.id, { currency: null }))).rejects.toThrow(/Currency is required/);
    await expect(db.query(
      `INSERT INTO transaction_facts (id, workspace_id, source_transaction_id, event_time, amount, currency, type, provenance_kind, provenance)
       VALUES ($1, $2, 'RAW-1', now(), 1, NULL, 'transfer', 'manual-entry', '{"kind":"manual-entry"}')`,
      [randomUUID(), workspace.id],
    )).rejects.toThrow();
  });

  it("refuses to update a fact", async () => {
    const { workspace, user } = await setup();
    const input = fact(workspace.id, user.id);
    await insertTransactionFact(db, input);
    await expect(db.query("UPDATE transaction_facts SET amount = 1 WHERE id = $1", [input.id])).rejects.toThrow(/immutable/);
  });

  it("refuses to delete a fact outside the audited deletion path, and allows it inside", async () => {
    const { workspace, user } = await setup();
    const input = fact(workspace.id, user.id);
    await insertTransactionFact(db, input);
    await expect(db.query("DELETE FROM transaction_facts WHERE id = $1", [input.id])).rejects.toThrow(/audited deletion path/);

    await db.transaction(async (tx) => {
      await tx.query("SELECT set_config('layernet.audited_delete', 'on', true)");
      await tx.query("DELETE FROM transaction_facts WHERE id = $1", [input.id]);
    });
    expect(await getTransactionFact(db, workspace.id, input.id)).toBeNull();
    // The flag is transaction-local: it does not leak into later statements.
    const other = fact(workspace.id, user.id);
    await insertTransactionFact(db, other);
    await expect(db.query("DELETE FROM transaction_facts WHERE id = $1", [other.id])).rejects.toThrow(/audited deletion path/);
  });
});

describe("risk assessments", () => {
  it("appends assessments; a re-score is a new row and the earlier one remains", async () => {
    const { workspace, user } = await setup();
    const tx = fact(workspace.id, user.id);
    await insertTransactionFact(db, tx);
    const first = assessment(workspace.id, tx.id);
    const second = assessment(workspace.id, tx.id, {
      score: 90, decision: "Block", assessedAt: "2026-11-28T09:00:00.000Z", recordedAt: "2026-11-28T09:00:01.000Z",
    });
    expect(await appendRiskAssessment(db, first)).toEqual(first);
    await appendRiskAssessment(db, second);
    expect(await listAssessments(db, workspace.id, tx.id)).toEqual([second, first]);
  });

  it("shows the latest primary assessment and ignores shadow assessments", async () => {
    const { workspace, user } = await setup();
    const tx = fact(workspace.id, user.id);
    await insertTransactionFact(db, tx);
    const primary = assessment(workspace.id, tx.id);
    const shadow = assessment(workspace.id, tx.id, {
      mode: "shadow",
      assessor: { kind: "model", family: "transformer", modelVersion: "shadow-test", artifactSha256: HASH },
      scoreScale: { min: 0, max: 1 },
      score: 0.99,
      scoreSemantics: "uncalibrated-model-score",
      decision: "Block",
      recordedAt: "2026-11-28T00:00:00.000Z",
    });
    await appendRiskAssessment(db, primary);
    await appendRiskAssessment(db, shadow);
    const [row] = await listRecentTransactions(db, workspace.id);
    expect(row.fact).toEqual(tx);
    expect(row.latestPrimaryAssessment).toEqual(primary);
  });

  it("lists a transaction without assessments with a null assessment", async () => {
    const { workspace, user } = await setup();
    const tx = fact(workspace.id, user.id);
    await insertTransactionFact(db, tx);
    expect(await listRecentTransactions(db, workspace.id)).toEqual([{ fact: tx, latestPrimaryAssessment: null }]);
  });

  it("rejects an assessment that points at another workspace's transaction", async () => {
    const a = await setup();
    const b = await setup();
    const tx = fact(a.workspace.id, a.user.id);
    await insertTransactionFact(db, tx);
    await expect(appendRiskAssessment(db, assessment(b.workspace.id, tx.id))).rejects.toThrow();
  });

  it("enforces score semantics in the database, not only in the schema", async () => {
    const { workspace, user } = await setup();
    const tx = fact(workspace.id, user.id);
    await insertTransactionFact(db, tx);
    // A rules assessor labelled as a calibrated probability: bypass zod and write raw SQL.
    await expect(db.query(
      `INSERT INTO risk_assessments (id, workspace_id, transaction_id, assessor_kind, assessor, mode, feature_schema_version,
         input_sha256, score, score_min, score_max, score_semantics, calibration_ref, decision, assessed_at, legacy_import)
       VALUES ($1, $2, $3, 'rules', '{"kind":"rules"}', 'primary', 'v', $4, 0.5, 0, 1, 'calibrated-probability', 'study', 'Clear', now(), false)`,
      [randomUUID(), workspace.id, tx.id, HASH],
    )).rejects.toThrow();
  });

  it("refuses to update an assessment", async () => {
    const { workspace, user } = await setup();
    const tx = fact(workspace.id, user.id);
    await insertTransactionFact(db, tx);
    const a = assessment(workspace.id, tx.id);
    await appendRiskAssessment(db, a);
    await expect(db.query("UPDATE risk_assessments SET score = 1 WHERE id = $1", [a.id])).rejects.toThrow(/immutable/);
  });
});

describe("audit events", () => {
  it("are append-only: no update, delete or truncate", async () => {
    const { workspace, user } = await setup();
    const event = await appendAuditEvent(db, {
      workspaceId: workspace.id, actorUserId: user.id, action: "data.exported", targetType: "workspace", targetId: null, details: { rows: 3 },
    });
    await expect(db.query("UPDATE audit_events SET action = 'data.imported' WHERE id = $1", [event.id])).rejects.toThrow(/immutable/);
    await expect(db.query("DELETE FROM audit_events WHERE id = $1", [event.id])).rejects.toThrow(/append-only/);
    await expect(db.exec("TRUNCATE audit_events")).rejects.toThrow(/append-only/);
  });

  it("rejects non-scalar details before writing", async () => {
    const { workspace, user } = await setup();
    await expect(appendAuditEvent(db, {
      workspaceId: workspace.id, actorUserId: user.id, action: "data.exported", targetType: "workspace", targetId: null,
      details: { nested: { secret: "x" } } as never,
    })).rejects.toThrow();
  });
});
