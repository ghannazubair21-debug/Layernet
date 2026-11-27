/**
 * LayerNet canonical domain contract — v1 (PROPOSED, not yet persisted).
 *
 * Provider-neutral: nothing here assumes a database, ORM, or identity
 * provider. These schemas are the boundary every future server repository,
 * API route, and import path must validate against. The browser-local
 * history (lib/transactionStorage.ts) keeps working unchanged; see
 * mapLegacyLocalRecord for the explicit, user-initiated import path.
 *
 * Design rules encoded here (see docs/architecture/DATA_CONTRACT_v1.md):
 * 1. Transaction facts, risk assessments, and analyst workflow are separate.
 * 2. Risk assessments are immutable and versioned; a re-score is a new row.
 * 3. A score's meaning is explicit; "calibrated-probability" requires a
 *    calibration reference and a 0–1 scale. The rules baseline can only be
 *    an uncalibrated heuristic.
 * 4. accountRef is transaction-domain data, never an authenticated identity.
 * 5. Only an analyst's case disposition is a human judgement; nothing a rules
 *    engine, model, or AI assistant produces is a fraud label.
 */
import { z } from "zod";

export const CONTRACT_VERSION = "layernet.domain.v1" as const;

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: false }); // UTC, e.g. 2026-11-27T10:00:00.000Z
const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "Expected a lower-case SHA-256 hex digest.");

// ---------------------------------------------------------------------------
// Identity, tenancy, and authorization
// ---------------------------------------------------------------------------

export const WorkspaceSchema = z.object({
  id,
  name: nonEmpty(120),
  createdAt: timestamp,
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Authenticated principal. Identity comes from an OIDC issuer/subject pair, never from transaction data. */
export const UserSchema = z.object({
  id,
  identity: z.object({ issuer: z.url(), subject: nonEmpty(255) }),
  displayName: nonEmpty(120),
  createdAt: timestamp,
  disabledAt: timestamp.nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const ROLES = ["viewer", "analyst", "lead", "admin"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const MembershipSchema = z.object({
  workspaceId: id,
  userId: id,
  role: RoleSchema,
  grantedAt: timestamp,
  grantedBy: id,
});
export type Membership = z.infer<typeof MembershipSchema>;

export const PERMISSIONS = [
  "transaction.read",
  "transaction.create",
  "assessment.read",
  "assessment.create",
  "case.read",
  "case.create",
  "case.comment",
  "case.assign",
  "case.close",
  "ai.assist",
  "data.import",
  "data.export",
  "data.delete",
  "audit.read",
  "workspace.manage-members",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Proposed default matrix (requires approval). Roles are cumulative.
 * Enforcement must happen server-side per request; the UI may only mirror it.
 */
const ROLE_GRANTS: Record<Role, readonly Permission[]> = {
  viewer: ["transaction.read", "assessment.read", "case.read"],
  analyst: [
    "transaction.read", "transaction.create", "assessment.read", "assessment.create",
    "case.read", "case.create", "case.comment", "ai.assist",
  ],
  lead: [
    "transaction.read", "transaction.create", "assessment.read", "assessment.create",
    "case.read", "case.create", "case.comment", "case.assign", "case.close", "ai.assist",
    "data.export", "audit.read",
  ],
  admin: PERMISSIONS,
};

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_GRANTS[role].includes(permission);
}

// ---------------------------------------------------------------------------
// Transaction facts
// ---------------------------------------------------------------------------

export const TransactionProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual-entry"), enteredBy: id }),
  z.object({ kind: z.literal("api-ingest"), clientId: nonEmpty(120), payloadSha256: sha256Hex }),
  /** Imported from one browser's local history by an explicit user action. */
  z.object({ kind: z.literal("legacy-local-import"), importedBy: id, importBatchId: id }),
]);

/** Immutable facts about one financial event. Corrections are new records, not edits. */
export const TransactionFactSchema = z.object({
  id,
  workspaceId: id,
  /** The caller's own identifier; unique per workspace, not globally. */
  sourceTransactionId: nonEmpty(128),
  eventTime: timestamp,
  amount: z.number().finite().nonnegative(),
  /** ISO 4217. Null only for legacy imports, which never recorded a currency. */
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  type: nonEmpty(40),
  /** Transaction-domain account reference (pseudonymize at ingest). NOT a user identity. */
  accountRef: nonEmpty(128).nullable(),
  channel: nonEmpty(40).nullable(),
  location: nonEmpty(200).nullable(),
  deviceRef: nonEmpty(128).nullable(),
  provenance: TransactionProvenanceSchema,
  ingestedAt: timestamp,
}).superRefine((value, ctx) => {
  if (value.currency === null && value.provenance.kind !== "legacy-local-import") {
    ctx.addIssue({ code: "custom", path: ["currency"], message: "Currency is required except for legacy local imports." });
  }
});
export type TransactionFact = z.infer<typeof TransactionFactSchema>;

// ---------------------------------------------------------------------------
// Risk assessments (immutable, versioned)
// ---------------------------------------------------------------------------

export const ScoreSemanticsSchema = z.enum([
  "uncalibrated-heuristic",
  "uncalibrated-model-score",
  "calibrated-probability",
]);

export const AssessorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rules"), name: nonEmpty(80), version: nonEmpty(40) }),
  z.object({
    kind: z.literal("model"),
    family: nonEmpty(40),
    modelVersion: nonEmpty(80),
    /** Artifact integrity: must match the deployed model file's manifest. */
    artifactSha256: sha256Hex,
  }),
]);

export const RiskDecisionSchema = z.enum(["Clear", "Review", "Block"]);

export const RiskAssessmentSchema = z.object({
  id,
  workspaceId: id,
  transactionId: id,
  assessor: AssessorSchema,
  /** "primary" may drive the displayed decision; "shadow" is recorded for comparison only. */
  mode: z.enum(["primary", "shadow"]),
  featureSchemaVersion: nonEmpty(80),
  /** Hash of the exact feature/input payload scored, for reproducibility. Null for legacy imports. */
  inputSha256: sha256Hex.nullable(),
  score: z.number().finite(),
  scoreScale: z.object({ min: z.number().finite(), max: z.number().finite() }),
  scoreSemantics: ScoreSemanticsSchema,
  calibrationRef: nonEmpty(120).nullable(),
  threshold: z.number().finite().nullable(),
  decision: RiskDecisionSchema,
  factors: z.array(nonEmpty(500)).max(50),
  limitations: z.array(nonEmpty(500)).max(20),
  /** Null only for legacy imports, whose original scoring time was never stored. */
  assessedAt: timestamp.nullable(),
  recordedAt: timestamp,
  legacyImport: z.boolean(),
}).superRefine((value, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (value.scoreScale.min >= value.scoreScale.max) issue("scoreScale", "Score scale min must be below max.");
  if (value.score < value.scoreScale.min || value.score > value.scoreScale.max) issue("score", "Score is outside its declared scale.");
  if (value.assessor.kind === "rules" && value.scoreSemantics !== "uncalibrated-heuristic") {
    issue("scoreSemantics", "A rules assessor can only produce an uncalibrated heuristic score.");
  }
  if (value.scoreSemantics === "calibrated-probability") {
    if (value.calibrationRef === null) issue("calibrationRef", "A calibrated probability must reference its calibration study.");
    if (value.scoreScale.min !== 0 || value.scoreScale.max !== 1) issue("scoreScale", "A calibrated probability must use a 0–1 scale.");
  } else if (value.calibrationRef !== null) {
    issue("calibrationRef", "Only calibrated probabilities carry a calibration reference.");
  }
  if (!value.legacyImport && (value.assessedAt === null || value.inputSha256 === null)) {
    issue("assessedAt", "Recorded assessments need an assessment time and input hash.");
  }
  if (value.assessedAt !== null && Date.parse(value.assessedAt) > Date.parse(value.recordedAt)) {
    issue("assessedAt", "An assessment cannot be scored after it was recorded.");
  }
});
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

// ---------------------------------------------------------------------------
// Investigation cases and their append-only history
// ---------------------------------------------------------------------------

export const CASE_STATUSES = ["open", "in_review", "escalated", "closed"] as const;
export const CaseStatusSchema = z.enum(CASE_STATUSES);

/** The analyst's human judgement. This, not any score, is the closest thing to a label. */
export const CaseDispositionSchema = z.enum(["confirmed_fraud", "not_fraud", "inconclusive"]);

export const InvestigationCaseSchema = z.object({
  id,
  workspaceId: id,
  title: nonEmpty(200),
  status: CaseStatusSchema,
  transactionIds: z.array(id).min(1).max(500),
  assigneeUserId: id.nullable(),
  openedBy: id,
  openedAt: timestamp,
  closedAt: timestamp.nullable(),
  disposition: CaseDispositionSchema.nullable(),
}).superRefine((value, ctx) => {
  const closed = value.status === "closed";
  if (closed !== (value.closedAt !== null) || closed !== (value.disposition !== null)) {
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: "A case has closedAt and a disposition exactly when it is closed.",
    });
  }
  if (new Set(value.transactionIds).size !== value.transactionIds.length) {
    ctx.addIssue({ code: "custom", path: ["transactionIds"], message: "A transaction is linked to a case at most once." });
  }
});
export type InvestigationCase = z.infer<typeof InvestigationCaseSchema>;

/** Allowed case status transitions. Closing requires the case.close permission. */
const CASE_TRANSITIONS: Record<z.infer<typeof CaseStatusSchema>, readonly z.infer<typeof CaseStatusSchema>[]> = {
  open: ["in_review", "escalated", "closed"],
  in_review: ["open", "escalated", "closed"],
  escalated: ["in_review", "closed"],
  closed: ["in_review"], // reopen keeps history; the prior disposition stays in CaseEvents
};

export function canTransitionCase(
  from: z.infer<typeof CaseStatusSchema>,
  to: z.infer<typeof CaseStatusSchema>,
): boolean {
  return CASE_TRANSITIONS[from].includes(to);
}

const caseEventBase = {
  id,
  workspaceId: id,
  caseId: id,
  actorUserId: id,
  occurredAt: timestamp,
};

/** Append-only. Never updated or deleted except by an approved retention job. */
export const CaseEventSchema = z.discriminatedUnion("type", [
  z.object({ ...caseEventBase, type: z.literal("case_opened"), title: nonEmpty(200) }),
  z.object({ ...caseEventBase, type: z.literal("comment_added"), body: nonEmpty(4_000) }),
  z.object({ ...caseEventBase, type: z.literal("assignee_changed"), assigneeUserId: id.nullable() }),
  z.object({ ...caseEventBase, type: z.literal("status_changed"), from: CaseStatusSchema, to: CaseStatusSchema }),
  z.object({ ...caseEventBase, type: z.literal("transaction_linked"), transactionId: id }),
  z.object({ ...caseEventBase, type: z.literal("transaction_unlinked"), transactionId: id, reason: nonEmpty(500) }),
  z.object({ ...caseEventBase, type: z.literal("case_closed"), disposition: CaseDispositionSchema, rationale: nonEmpty(4_000) }),
  /**
   * Records that AI assistance was used and what was shared. The generated
   * text is assistance, not evidence; it is stored only if the workspace
   * policy allows it.
   */
  z.object({
    ...caseEventBase,
    type: z.literal("ai_assist_used"),
    provider: nonEmpty(40),
    modelId: nonEmpty(80),
    sharedTransactionIds: z.array(id).max(50),
  }),
]).superRefine((value, ctx) => {
  if (value.type === "status_changed" && !canTransitionCase(value.from, value.to)) {
    ctx.addIssue({ code: "custom", path: ["to"], message: `Case cannot move from ${value.from} to ${value.to}.` });
  }
});
export type CaseEvent = z.infer<typeof CaseEventSchema>;

/** Security/governance audit trail for actions outside a case (imports, exports, deletions, access changes). */
export const AuditEventSchema = z.object({
  id,
  workspaceId: id,
  actorUserId: id,
  action: z.enum([
    "data.imported",
    "data.exported",
    "data.deleted",
    "member.granted",
    "member.revoked",
    "session.started",
    "session.ended",
  ]),
  targetType: nonEmpty(40),
  targetId: nonEmpty(128).nullable(),
  occurredAt: timestamp,
  /** Small, non-sensitive context only (counts, batch IDs). Never secrets, prompts, or raw identifiers. */
  details: z.record(z.string().max(40), z.union([z.string().max(200), z.number().finite(), z.boolean()])).refine(
    (record) => Object.keys(record).length <= 20,
    "At most 20 detail entries.",
  ),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
