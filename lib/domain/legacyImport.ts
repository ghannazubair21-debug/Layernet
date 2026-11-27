/**
 * Maps one browser-local history record (lib/transactionStorage.ts shape) into
 * the v1 domain contract. Used only by an explicit, user-initiated import —
 * local history is never uploaded automatically.
 *
 * Honesty rules: the local record never stored the scoring method/version,
 * scoring time, input payload, or currency, so those are marked unknown
 * rather than guessed. The local `status` was derived from the rules
 * decision (it never meant a human reviewed anything), so it maps to an
 * assessment decision and never to a case or disposition.
 */
import type { Transaction } from "../types";
import {
  RiskAssessmentSchema,
  TransactionFactSchema,
  type RiskAssessment,
  type TransactionFact,
} from "./contracts";

export const LEGACY_RULES_ASSESSOR = {
  kind: "rules",
  name: "LayerNet rules baseline",
  version: "unrecorded-legacy",
} as const;

const LEGACY_LIMITATION =
  "Imported from browser-local history: the original scoring version, scoring time, and inputs were not recorded.";

const STATUS_TO_DECISION = {
  Cleared: "Clear",
  Reviewed: "Review",
  Flagged: "Block",
} as const;

export type LegacyImportContext = {
  workspaceId: string;
  importedBy: string;
  importBatchId: string;
  /** Injected for determinism and testability. */
  newId: () => string;
  now: () => string;
};

export type LegacyImportResult =
  | { ok: true; fact: TransactionFact; assessment: RiskAssessment }
  | { ok: false; sourceTransactionId: string; error: string };

export function mapLegacyLocalRecord(record: Transaction, context: LegacyImportContext): LegacyImportResult {
  const recordedAt = context.now();
  const factCandidate = {
    id: context.newId(),
    workspaceId: context.workspaceId,
    sourceTransactionId: record.transactionId,
    eventTime: record.timestamp,
    amount: record.amount,
    currency: null,
    type: record.type,
    accountRef: record.accountId?.trim() || null,
    channel: record.channel?.trim() || null,
    location: record.location?.trim() || null,
    deviceRef: (record.deviceId ?? record.deviceInfo?.id)?.trim() || null,
    provenance: { kind: "legacy-local-import", importedBy: context.importedBy, importBatchId: context.importBatchId },
    ingestedAt: recordedAt,
  };
  const fact = TransactionFactSchema.safeParse(factCandidate);
  if (!fact.success) {
    return { ok: false, sourceTransactionId: record.transactionId, error: fact.error.issues[0]?.message ?? "Invalid transaction." };
  }

  const assessment = RiskAssessmentSchema.safeParse({
    id: context.newId(),
    workspaceId: context.workspaceId,
    transactionId: fact.data.id,
    assessor: LEGACY_RULES_ASSESSOR,
    mode: "primary",
    featureSchemaVersion: "unrecorded-legacy",
    inputSha256: null,
    score: record.riskScore,
    scoreScale: { min: 0, max: 100 },
    scoreSemantics: "uncalibrated-heuristic",
    calibrationRef: null,
    threshold: null,
    decision: STATUS_TO_DECISION[record.status],
    factors: [],
    limitations: [LEGACY_LIMITATION],
    assessedAt: null,
    recordedAt,
    legacyImport: true,
  });
  if (!assessment.success) {
    return { ok: false, sourceTransactionId: record.transactionId, error: assessment.error.issues[0]?.message ?? "Invalid assessment." };
  }

  return { ok: true, fact: fact.data, assessment: assessment.data };
}
