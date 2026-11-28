/**
 * Server-side persistence for LayerNet (DATA_CONTRACT_v1 §6 step 3).
 *
 * Every write is validated with the domain zod schema before it reaches SQL,
 * and every row read back is validated again, so a bad row is reported rather
 * than shown. Every read and write is scoped by an explicit workspaceId; there
 * is no query that crosses workspaces. Authorization (roleCan) is the caller's
 * job and happens before these functions are called.
 *
 * Facts, assessments and audit events are append-only here and in the
 * database (see db/migrations/0001_*.sql): this module offers no update path.
 */
import { randomUUID } from "node:crypto";
import {
  AuditEventSchema,
  MembershipSchema,
  RiskAssessmentSchema,
  TransactionFactSchema,
  UserSchema,
  WorkspaceSchema,
  type AuditEvent,
  type Membership,
  type RiskAssessment,
  type Role,
  type TransactionFact,
  type User,
  type Workspace,
} from "@/lib/domain/contracts";
import type { Database, Row } from "./database";

const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString();
const isoOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : iso(value));
const num = (value: unknown): number => (typeof value === "number" ? value : Number(value));
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : num(value));
const json = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

// ---------------------------------------------------------------------------
// Workspaces, users, memberships
// ---------------------------------------------------------------------------

function toWorkspace(row: Row): Workspace {
  return WorkspaceSchema.parse({ id: row.id, name: row.name, createdAt: iso(row.created_at) });
}

export async function createWorkspace(db: Database, input: { name: string }): Promise<Workspace> {
  const candidate = WorkspaceSchema.parse({ id: randomUUID(), name: input.name, createdAt: new Date().toISOString() });
  const { rows } = await db.query(
    "INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, $3) RETURNING *",
    [candidate.id, candidate.name, candidate.createdAt],
  );
  return toWorkspace(rows[0]);
}

function toUser(row: Row): User {
  return UserSchema.parse({
    id: row.id,
    identity: { issuer: row.issuer, subject: row.subject },
    displayName: row.display_name,
    createdAt: iso(row.created_at),
    disabledAt: isoOrNull(row.disabled_at),
  });
}

/**
 * Finds the user for an authenticated OIDC identity, creating it on first
 * sign-in. The display name is a profile field and is refreshed; the
 * identity itself never changes.
 */
export async function upsertUserByIdentity(
  db: Database,
  input: { issuer: string; subject: string; displayName: string },
): Promise<User> {
  const candidate = UserSchema.parse({
    id: randomUUID(),
    identity: { issuer: input.issuer, subject: input.subject },
    displayName: input.displayName,
    createdAt: new Date().toISOString(),
    disabledAt: null,
  });
  const { rows } = await db.query(
    `INSERT INTO users (id, issuer, subject, display_name, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (issuer, subject) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING *`,
    [candidate.id, candidate.identity.issuer, candidate.identity.subject, candidate.displayName, candidate.createdAt],
  );
  return toUser(rows[0]);
}

function toMembership(row: Row): Membership {
  return MembershipSchema.parse({
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    grantedAt: iso(row.granted_at),
    grantedBy: row.granted_by,
  });
}

/** Grants (or changes) a role and records a member.granted audit event in the same transaction. */
export async function grantMembership(
  db: Database,
  input: { workspaceId: string; userId: string; role: Role; grantedBy: string },
): Promise<Membership> {
  const candidate = MembershipSchema.parse({ ...input, grantedAt: new Date().toISOString() });
  return db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO memberships (workspace_id, user_id, role, granted_at, granted_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, granted_at = EXCLUDED.granted_at, granted_by = EXCLUDED.granted_by
       RETURNING *`,
      [candidate.workspaceId, candidate.userId, candidate.role, candidate.grantedAt, candidate.grantedBy],
    );
    await appendAuditEvent(tx, {
      workspaceId: candidate.workspaceId,
      actorUserId: candidate.grantedBy,
      action: "member.granted",
      targetType: "user",
      targetId: candidate.userId,
      details: { role: candidate.role },
    });
    return toMembership(rows[0]);
  });
}

export async function getMembership(db: Database, workspaceId: string, userId: string): Promise<Membership | null> {
  const { rows } = await db.query(
    "SELECT * FROM memberships WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId],
  );
  return rows.length === 0 ? null : toMembership(rows[0]);
}

// ---------------------------------------------------------------------------
// Transaction facts
// ---------------------------------------------------------------------------

function toTransactionFact(row: Row): TransactionFact {
  return TransactionFactSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    sourceTransactionId: row.source_transaction_id,
    eventTime: iso(row.event_time),
    amount: num(row.amount),
    currency: row.currency ?? null,
    type: row.type,
    accountRef: row.account_ref ?? null,
    channel: row.channel ?? null,
    location: row.location ?? null,
    deviceRef: row.device_ref ?? null,
    provenance: json(row.provenance),
    ingestedAt: iso(row.ingested_at),
  });
}

export type InsertFactResult =
  | { status: "inserted"; fact: TransactionFact }
  /** Same (workspaceId, sourceTransactionId) already exists; nothing was written or merged. */
  | { status: "duplicate"; existingId: string };

/**
 * Records an immutable transaction fact. A repeat of the same
 * sourceTransactionId in a workspace is reported as a duplicate and skipped,
 * never merged or overwritten (DATA_CONTRACT_v1 §6).
 *
 * accountRef/deviceRef must already be pseudonymized by the ingest path (D4).
 */
export async function insertTransactionFact(db: Database, input: TransactionFact): Promise<InsertFactResult> {
  const fact = TransactionFactSchema.parse(input);
  const { rows } = await db.query(
    `INSERT INTO transaction_facts (
       id, workspace_id, source_transaction_id, event_time, amount, currency, type,
       account_ref, channel, location, device_ref, provenance_kind, provenance, ingested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (workspace_id, source_transaction_id) DO NOTHING
     RETURNING *`,
    [
      fact.id, fact.workspaceId, fact.sourceTransactionId, fact.eventTime, fact.amount, fact.currency, fact.type,
      fact.accountRef, fact.channel, fact.location, fact.deviceRef, fact.provenance.kind,
      JSON.stringify(fact.provenance), fact.ingestedAt,
    ],
  );
  if (rows.length > 0) return { status: "inserted", fact: toTransactionFact(rows[0]) };

  const existing = await db.query(
    "SELECT id FROM transaction_facts WHERE workspace_id = $1 AND source_transaction_id = $2",
    [fact.workspaceId, fact.sourceTransactionId],
  );
  return { status: "duplicate", existingId: String(existing.rows[0]?.id) };
}

export async function getTransactionFact(db: Database, workspaceId: string, id: string): Promise<TransactionFact | null> {
  const { rows } = await db.query(
    "SELECT * FROM transaction_facts WHERE workspace_id = $1 AND id = $2",
    [workspaceId, id],
  );
  return rows.length === 0 ? null : toTransactionFact(rows[0]);
}

// ---------------------------------------------------------------------------
// Risk assessments
// ---------------------------------------------------------------------------

function toRiskAssessment(row: Row): RiskAssessment {
  return RiskAssessmentSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    transactionId: row.transaction_id,
    assessor: json(row.assessor),
    mode: row.mode,
    featureSchemaVersion: row.feature_schema_version,
    inputSha256: row.input_sha256 ?? null,
    score: num(row.score),
    scoreScale: { min: num(row.score_min), max: num(row.score_max) },
    scoreSemantics: row.score_semantics,
    calibrationRef: row.calibration_ref ?? null,
    threshold: numOrNull(row.threshold),
    decision: row.decision,
    factors: json(row.factors),
    limitations: json(row.limitations),
    assessedAt: isoOrNull(row.assessed_at),
    recordedAt: iso(row.recorded_at),
    legacyImport: row.legacy_import,
  });
}

/** Appends one assessment. Re-scoring a transaction is always a new row; earlier rows stay. */
export async function appendRiskAssessment(db: Database, input: RiskAssessment): Promise<RiskAssessment> {
  const a = RiskAssessmentSchema.parse(input);
  const { rows } = await db.query(
    `INSERT INTO risk_assessments (
       id, workspace_id, transaction_id, assessor_kind, assessor, mode, feature_schema_version,
       input_sha256, score, score_min, score_max, score_semantics, calibration_ref, threshold,
       decision, factors, limitations, assessed_at, recorded_at, legacy_import)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     RETURNING *`,
    [
      a.id, a.workspaceId, a.transactionId, a.assessor.kind, JSON.stringify(a.assessor), a.mode,
      a.featureSchemaVersion, a.inputSha256, a.score, a.scoreScale.min, a.scoreScale.max, a.scoreSemantics,
      a.calibrationRef, a.threshold, a.decision, JSON.stringify(a.factors), JSON.stringify(a.limitations),
      a.assessedAt, a.recordedAt, a.legacyImport,
    ],
  );
  return toRiskAssessment(rows[0]);
}

/** All assessments of one transaction, newest first. */
export async function listAssessments(db: Database, workspaceId: string, transactionId: string): Promise<RiskAssessment[]> {
  const { rows } = await db.query(
    `SELECT * FROM risk_assessments
     WHERE workspace_id = $1 AND transaction_id = $2
     ORDER BY recorded_at DESC, id`,
    [workspaceId, transactionId],
  );
  return rows.map(toRiskAssessment);
}

export interface TransactionWithAssessment {
  fact: TransactionFact;
  /** Latest *primary* assessment; shadow assessments never drive what is displayed (invariant 6). */
  latestPrimaryAssessment: RiskAssessment | null;
}

/** Most recent transactions of a workspace, each with its latest primary assessment. */
export async function listRecentTransactions(
  db: Database,
  workspaceId: string,
  options: { limit?: number } = {},
): Promise<TransactionWithAssessment[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 500);
  const { rows } = await db.query(
    `SELECT to_jsonb(f) AS fact, to_jsonb(a) AS assessment
     FROM transaction_facts f
     LEFT JOIN LATERAL (
       SELECT * FROM risk_assessments r
       WHERE r.workspace_id = f.workspace_id AND r.transaction_id = f.id AND r.mode = 'primary'
       ORDER BY r.recorded_at DESC, r.id
       LIMIT 1
     ) a ON true
     WHERE f.workspace_id = $1
     ORDER BY f.event_time DESC, f.id
     LIMIT $2`,
    [workspaceId, limit],
  );
  return rows.map((row) => {
    const assessment = json(row.assessment) as Row | null;
    return {
      fact: toTransactionFact(json(row.fact) as Row),
      latestPrimaryAssessment: assessment ? toRiskAssessment(assessment) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

export async function appendAuditEvent(
  db: Database,
  input: Omit<AuditEvent, "id" | "occurredAt">,
): Promise<AuditEvent> {
  const event = AuditEventSchema.parse({ ...input, id: randomUUID(), occurredAt: new Date().toISOString() });
  const { rows } = await db.query(
    `INSERT INTO audit_events (id, workspace_id, actor_user_id, action, target_type, target_id, occurred_at, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      event.id, event.workspaceId, event.actorUserId, event.action, event.targetType, event.targetId,
      event.occurredAt, JSON.stringify(event.details),
    ],
  );
  const row = rows[0];
  return AuditEventSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id ?? null,
    occurredAt: iso(row.occurred_at),
    details: json(row.details),
  });
}
