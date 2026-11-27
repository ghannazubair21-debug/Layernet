import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  CaseEventSchema,
  InvestigationCaseSchema,
  PERMISSIONS,
  RiskAssessmentSchema,
  ROLES,
  TransactionFactSchema,
  canTransitionCase,
  roleCan,
} from "@/lib/domain/contracts";
import { LEGACY_RULES_ASSESSOR, mapLegacyLocalRecord } from "@/lib/domain/legacyImport";
import type { Transaction } from "@/lib/types";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HASH = "a".repeat(64);
const T0 = "2026-11-27T10:00:00.000Z";
const T1 = "2026-11-27T10:00:01.000Z";

function fact(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(1),
    workspaceId: uuid(2),
    sourceTransactionId: "TX-1",
    eventTime: T0,
    amount: 250,
    currency: "PKR",
    type: "Purchase",
    accountRef: "acct-ref-1",
    channel: "Web",
    location: "Lahore, Pakistan",
    deviceRef: null,
    provenance: { kind: "manual-entry", enteredBy: uuid(3) },
    ingestedAt: T1,
    ...overrides,
  };
}

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(10),
    workspaceId: uuid(2),
    transactionId: uuid(1),
    assessor: { kind: "rules", name: "LayerNet rules baseline", version: "v1" },
    mode: "primary",
    featureSchemaVersion: "layernet.transaction-features.v1",
    inputSha256: HASH,
    score: 43,
    scoreScale: { min: 0, max: 100 },
    scoreSemantics: "uncalibrated-heuristic",
    calibrationRef: null,
    threshold: null,
    decision: "Review",
    factors: ["Amount baseline contributes 23 points."],
    limitations: ["Not a fraud probability."],
    assessedAt: T0,
    recordedAt: T1,
    legacyImport: false,
    ...overrides,
  };
}

function modelAssessment(overrides: Record<string, unknown> = {}) {
  return assessment({
    assessor: { kind: "model", family: "xgboost", modelVersion: "xgboost-v1", artifactSha256: HASH },
    score: 0.12,
    scoreScale: { min: 0, max: 1 },
    scoreSemantics: "uncalibrated-model-score",
    threshold: 0.5,
    decision: "Clear",
    ...overrides,
  });
}

function caseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(20),
    workspaceId: uuid(2),
    title: "Unusual web purchases",
    status: "open",
    transactionIds: [uuid(1)],
    assigneeUserId: null,
    openedBy: uuid(3),
    openedAt: T0,
    closedAt: null,
    disposition: null,
    ...overrides,
  };
}

describe("TransactionFact", () => {
  it("accepts a well-formed manual entry", () => {
    expect(TransactionFactSchema.safeParse(fact()).success).toBe(true);
  });

  it("requires a currency except for legacy local imports", () => {
    expect(TransactionFactSchema.safeParse(fact({ currency: null })).success).toBe(false);
    expect(TransactionFactSchema.safeParse(fact({
      currency: null,
      provenance: { kind: "legacy-local-import", importedBy: uuid(3), importBatchId: uuid(4) },
    })).success).toBe(true);
  });

  it("rejects negative or non-finite amounts, offset timestamps, and blank source IDs", () => {
    for (const bad of [
      { amount: -1 },
      { amount: Number.POSITIVE_INFINITY },
      { eventTime: "2026-11-27T15:00:00+05:00" },
      { sourceTransactionId: "   " },
      { currency: "pkr" },
    ]) {
      expect(TransactionFactSchema.safeParse(fact(bad)).success).toBe(false);
    }
  });
});

describe("RiskAssessment", () => {
  it("accepts rules and uncalibrated model assessments", () => {
    expect(RiskAssessmentSchema.safeParse(assessment()).success).toBe(true);
    expect(RiskAssessmentSchema.safeParse(modelAssessment()).success).toBe(true);
  });

  it("never lets the rules baseline claim to be a model score or probability", () => {
    for (const scoreSemantics of ["uncalibrated-model-score", "calibrated-probability"]) {
      expect(RiskAssessmentSchema.safeParse(assessment({ scoreSemantics })).success).toBe(false);
    }
  });

  it("requires a calibration reference and 0–1 scale for calibrated probabilities", () => {
    expect(RiskAssessmentSchema.safeParse(modelAssessment({ scoreSemantics: "calibrated-probability" })).success).toBe(false);
    expect(RiskAssessmentSchema.safeParse(modelAssessment({
      scoreSemantics: "calibrated-probability",
      calibrationRef: "calibration-study-001",
    })).success).toBe(true);
    expect(RiskAssessmentSchema.safeParse(modelAssessment({
      scoreSemantics: "calibrated-probability",
      calibrationRef: "calibration-study-001",
      score: 43,
      scoreScale: { min: 0, max: 100 },
    })).success).toBe(false);
    expect(RiskAssessmentSchema.safeParse(modelAssessment({ calibrationRef: "x" })).success).toBe(false);
  });

  it("rejects scores outside their declared scale", () => {
    expect(RiskAssessmentSchema.safeParse(assessment({ score: 101 })).success).toBe(false);
    expect(RiskAssessmentSchema.safeParse(assessment({ scoreScale: { min: 100, max: 0 } })).success).toBe(false);
  });

  it("requires timing and an input hash unless the record is a legacy import", () => {
    expect(RiskAssessmentSchema.safeParse(assessment({ assessedAt: null })).success).toBe(false);
    expect(RiskAssessmentSchema.safeParse(assessment({ inputSha256: null })).success).toBe(false);
    expect(RiskAssessmentSchema.safeParse(assessment({ assessedAt: null, inputSha256: null, legacyImport: true })).success).toBe(true);
    expect(RiskAssessmentSchema.safeParse(assessment({ assessedAt: T1, recordedAt: T0 })).success).toBe(false);
  });

  it("requires model assessments to carry an artifact hash", () => {
    expect(RiskAssessmentSchema.safeParse(modelAssessment({
      assessor: { kind: "model", family: "xgboost", modelVersion: "xgboost-v1" },
    })).success).toBe(false);
  });
});

describe("InvestigationCase and CaseEvent", () => {
  it("ties closedAt and disposition to the closed status", () => {
    expect(InvestigationCaseSchema.safeParse(caseRecord()).success).toBe(true);
    expect(InvestigationCaseSchema.safeParse(caseRecord({ status: "closed" })).success).toBe(false);
    expect(InvestigationCaseSchema.safeParse(caseRecord({ disposition: "not_fraud" })).success).toBe(false);
    expect(InvestigationCaseSchema.safeParse(caseRecord({
      status: "closed",
      closedAt: T1,
      disposition: "confirmed_fraud",
    })).success).toBe(true);
  });

  it("rejects duplicate transaction links", () => {
    expect(InvestigationCaseSchema.safeParse(caseRecord({ transactionIds: [uuid(1), uuid(1)] })).success).toBe(false);
  });

  it("enforces allowed status transitions in events", () => {
    const base = { id: uuid(30), workspaceId: uuid(2), caseId: uuid(20), actorUserId: uuid(3), occurredAt: T0 };
    expect(CaseEventSchema.safeParse({ ...base, type: "status_changed", from: "open", to: "in_review" }).success).toBe(true);
    expect(CaseEventSchema.safeParse({ ...base, type: "status_changed", from: "closed", to: "escalated" }).success).toBe(false);
    expect(canTransitionCase("closed", "in_review")).toBe(true);
    expect(canTransitionCase("escalated", "open")).toBe(false);
  });

  it("records AI assistance as an event, not as evidence or a disposition", () => {
    const base = { id: uuid(31), workspaceId: uuid(2), caseId: uuid(20), actorUserId: uuid(3), occurredAt: T0 };
    const parsed = CaseEventSchema.safeParse({
      ...base,
      type: "ai_assist_used",
      provider: "google",
      modelId: "gemini-2.5-flash",
      sharedTransactionIds: [uuid(1)],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "disposition" in parsed.data).toBe(false);
  });
});

describe("AuditEvent", () => {
  it("keeps details small and scalar", () => {
    const base = {
      id: uuid(40), workspaceId: uuid(2), actorUserId: uuid(3), action: "data.imported",
      targetType: "import-batch", targetId: uuid(4), occurredAt: T0,
    };
    expect(AuditEventSchema.safeParse({ ...base, details: { records: 12, skipped: 0 } }).success).toBe(true);
    expect(AuditEventSchema.safeParse({ ...base, details: { nested: { a: 1 } } }).success).toBe(false);
    expect(AuditEventSchema.safeParse({
      ...base,
      details: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])),
    }).success).toBe(false);
  });
});

describe("role permissions", () => {
  it("grants every permission to admin and only read access to viewers", () => {
    expect(PERMISSIONS.every((p) => roleCan("admin", p))).toBe(true);
    expect(PERMISSIONS.filter((p) => roleCan("viewer", p))).toEqual(["transaction.read", "assessment.read", "case.read"]);
  });

  it("reserves closing cases, deletion, and membership changes for senior roles", () => {
    expect(roleCan("analyst", "case.close")).toBe(false);
    expect(roleCan("lead", "case.close")).toBe(true);
    for (const role of ROLES.filter((r) => r !== "admin")) {
      expect(roleCan(role, "data.delete")).toBe(false);
      expect(roleCan(role, "workspace.manage-members")).toBe(false);
    }
  });
});

describe("mapLegacyLocalRecord", () => {
  let counter = 100;
  const context = {
    workspaceId: uuid(2),
    importedBy: uuid(3),
    importBatchId: uuid(4),
    newId: () => uuid(counter++),
    now: () => T1,
  };
  const local: Transaction = {
    transactionId: "TX-LEGACY-1",
    accountId: " C100000001 ",
    timestamp: T0,
    amount: 250,
    type: "Purchase",
    location: "Lahore, Pakistan",
    channel: "Web",
    riskScore: 43,
    risk: "Medium",
    status: "Reviewed",
  };

  it("maps facts and an honestly-labelled legacy assessment", () => {
    const result = mapLegacyLocalRecord(local, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fact).toMatchObject({
      sourceTransactionId: "TX-LEGACY-1",
      accountRef: "C100000001",
      currency: null,
      provenance: { kind: "legacy-local-import" },
    });
    expect(result.assessment).toMatchObject({
      transactionId: result.fact.id,
      assessor: LEGACY_RULES_ASSESSOR,
      score: 43,
      scoreSemantics: "uncalibrated-heuristic",
      assessedAt: null,
      inputSha256: null,
      legacyImport: true,
    });
  });

  it("maps the rules-derived status to a decision, never to a human review", () => {
    const decisions = (["Cleared", "Reviewed", "Flagged"] as const).map((status) => {
      const result = mapLegacyLocalRecord({ ...local, status }, context);
      return result.ok ? result.assessment.decision : null;
    });
    expect(decisions).toEqual(["Clear", "Review", "Block"]);
  });

  it("passes a recorded currency through and never assumes one for legacy records", () => {
    const withCurrency = mapLegacyLocalRecord({ ...local, currency: "PKR" }, context);
    expect(withCurrency.ok && withCurrency.fact.currency).toBe("PKR");
    const malformed = mapLegacyLocalRecord({ ...local, currency: "rupees" }, context);
    expect(malformed.ok && malformed.fact.currency).toBeNull();
  });

  it("reports records that violate the contract instead of importing them", () => {
    const result = mapLegacyLocalRecord({ ...local, riskScore: 140 }, context);
    expect(result).toMatchObject({ ok: false, sourceTransactionId: "TX-LEGACY-1" });
  });
});
