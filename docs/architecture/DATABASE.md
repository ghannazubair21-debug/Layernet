# LayerNet Database (PostgreSQL on Neon)

**Status (2026-11-28):** schema and server repository layer implemented and tested; **not yet used by the running app**. The app still stores history in the browser (`localStorage`). Wiring the API routes to this layer needs authentication first (Clerk, pending), because every read and write is scoped to a signed-in user's workspace.

Design source: [`DATA_CONTRACT_v1.md`](./DATA_CONTRACT_v1.md) (decisions D1–D4, D6–D10 approved; D5 retention open).

## Provisioning

| Item | Value |
|---|---|
| Provider | Neon via the Vercel Marketplace, resource `layernet-db`, **Free plan** |
| Region | `iad1` (AWS us-east-1) |
| Neon Auth | Off (sign-in will be Clerk) |
| Connected project | `me-18c8/layernet` |
| Env vars (set by the integration) | `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), plus `PG*` / `POSTGRES_*` aliases |

One database currently serves Development, Preview and Production. Before real data is stored, decide whether previews should get Neon branches (open item below).

Local setup: the two `DATABASE_URL*` keys were appended to `.env.local` (Git-ignored); existing keys were left unchanged. Values are never printed by any script.

## Schema (`db/migrations/`)

`0001_core_identity_facts_assessments.sql` creates `workspaces`, `users`, `memberships`, `transaction_facts`, `risk_assessments`, `audit_events`. Investigation cases come in a later migration with their UI.

Enforced **in the database**, not only in application code:

| Rule | Mechanism |
|---|---|
| Facts, assessments and audit events are never updated | `BEFORE UPDATE` triggers raise |
| Audit events are never deleted or truncated | `BEFORE DELETE` / `TRUNCATE` triggers raise |
| Facts/assessments are deleted only by the audited admin path (D6) | Delete trigger requires transaction-local `layernet.audited_delete = 'on'` |
| An assessment scores a transaction of its **own** workspace | Composite FK `(workspace_id, transaction_id)` |
| One `sourceTransactionId` per workspace (import de-duplication) | `UNIQUE (workspace_id, source_transaction_id)` |
| Currency required except legacy imports (D10) | `CHECK` |
| Score semantics (rules ⇒ uncalibrated heuristic; calibrated ⇒ reference + 0–1 scale; model ⇒ artifact SHA-256; non-legacy ⇒ input hash + time) | `CHECK` constraints mirroring `RiskAssessmentSchema` |

## Migrations

```
npm run db:migrate
```

Forward-only. Each migration runs in its own transaction with its `schema_migrations` row. Applied migrations are immutable: the runner stops if an applied file's SHA-256 (line endings normalised) changed or if its file is missing. Fixes go in a new numbered file.

Applied to Neon on 2026-11-28: `0001_core_identity_facts_assessments` (re-run: "up to date").

## Code

| File | Role |
|---|---|
| `lib/server/db/database.ts` | `Database` interface (parameterised `query`, `exec`, `transaction`) |
| `lib/server/db/neon.ts` | Lazy Neon `Pool` adapter; importing it never needs `DATABASE_URL` (safe for `next build`) |
| `lib/server/db/repository.ts` | Workspace, user, membership, fact, assessment and audit functions; zod validation on every write **and** read; every query takes an explicit `workspaceId` |
| `lib/server/db/migrator.mjs` | Migration runner shared by CLI and tests |
| `lib/server/db/__tests__/` | 24 tests on PGlite (in-process Postgres) running the real migrations |

## Validation (2026-11-28)

- PGlite suite: 24/24 pass (runner idempotence, checksum and missing-file refusal, rollback of a failing migration, round-trip of facts and assessments, duplicate handling, cross-workspace isolation, shadow vs primary, immutability and audited deletion triggers, raw-SQL bypass attempts).
- Neon smoke test, inside a transaction that was rolled back (no rows left): insert succeeded; `UPDATE` and `DELETE` of a fact were refused by the triggers; all 7 tables present. The first connection attempt failed with a WebSocket error (consistent with the Free-plan compute waking from suspend) and succeeded on retry.

## Not done / open

1. **Not wired into the app.** Needs Clerk (pending terms acceptance) → API routes that resolve user → membership → `roleCan` → repository.
2. **Row-Level Security** not enabled: the app connects as the database owner, which bypasses RLS. Isolation currently relies on the mandatory `workspaceId` parameter. Planned: a separate least-privilege app role without UPDATE/DELETE grants, plus RLS policies.
3. **Pseudonymization (D4)** of `accountRef`/`deviceRef` needs a server-held HMAC key (`LAYERNET_PSEUDONYM_KEY`) — not created yet.
4. **Preview isolation:** previews and production share one database.
5. **Retention (D5)** still needs an owner decision.
6. **Legacy import UI** (explicit, never automatic) not built.
7. Connection retry for Neon cold starts not implemented.
