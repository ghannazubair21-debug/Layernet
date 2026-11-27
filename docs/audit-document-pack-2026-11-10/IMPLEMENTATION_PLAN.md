# LayerNet Technical Implementation Plan

**Plan basis:** read-only technical audit of repository commit ca7d595cfd19fe307f7c5fc5e479c101931748e6, branch layernet-consolidation; audit date 2026-11-25. This is a new audit-pack roadmap and does not overwrite the existing root IMPLEMENTATION_PLAN.md.

## 1. Current project baseline

LayerNet is a functional Next.js 16 / React 19 research prototype with a Rose Quartz interface, deterministic rules baseline, browser-local transaction history/settings, optional general Gemini chat, separate ULB XGBoost/RF replay, and Python ML research package. Normal application analysis does not call trained models. PaySim evidence concerns synthetic C-recipient histories. Phase 16 is PARTIAL; Phase 17 is BLOCKED.

| Area | Status | Basis |
|---|---|---|
| Main pages and responsive styling | IMPLEMENTED; browser accessibility not fully reverified | Source and production route smoke |
| Heuristic transaction analysis | IMPLEMENTED | lib/fraudAnalysis.ts and service/tests |
| Account-history features/baseline | IMPLEMENTED as context, not score-driving | featureEngineering.ts and behavioralBaseline.ts |
| Browser history/settings | IMPLEMENTED, local only | localStorage repository/settings |
| Gemini general chat | IMPLEMENTED; route smoke passed | /api/chat, server-only key |
| ULB XGBoost/RF replay | IMPLEMENTED as isolated research utility | /api/benchmark and Python replay |
| Trained models in normal analysis | NOT IMPLEMENTED | service calls rules baseline |
| Durable backend/auth/cases | NOT IMPLEMENTED | no database/API/auth modules |
| PaySim temporal model result | Replay report exists; Phase 12 model folder could not be re-read in this audit | evidence reports; access denied |
| Phase 16 controlled history ablation | PARTIAL | paired seeds/exports plus recorded execution deviations and absent loss history |
| Phase 17 independent chronology | BLOCKED | no qualified unexposed temporal window |

## 2. Engineering scores

These are qualitative engineering judgments, not measured model metrics.

| Dimension | Score | Rationale |
|---|---:|---|
| Frontend quality | 83/100 | Cohesive visual system and shared shell; real-browser viewport/accessibility verification incomplete |
| Backend/API architecture | 60/100 | Two working routes with bounded responsibilities, but no auth, durable transaction API, complete schemas or rate controls |
| Gemini integration | 75/100 | Server-only provider, streaming, prompt boundaries and live smoke success; minimal validation/abuse controls and env-example mismatch |
| ML implementation | 88/100 | Versioned contracts, leakage-aware evaluation and real experiments; product inference disconnected and some artifact files inaccessible |
| ML research quality | 74/100 | Strong evidence discipline; synthetic single-domain evidence, Phase 16 PARTIAL, Phase 17 blocked, no qualified external replication |
| Security | 43/100 | Server secret/no user HTML sink verified, but unauthenticated costly routes, input/resource risks, no explicit headers, localStorage exposure and dependency advisories |
| Performance | 72/100 | Responsive architecture and moderate measured raw JS size; unbounded local history, per-request Python startup, parse-before-limit and remote font dependency |
| Testing and reliability | 77/100 | Typecheck, tests, build and route smoke passed; local E2E and pytest skipped; CI omits build/ML/audit |
| Code quality | 79/100 | Clear domain/service/repository and research boundaries; config mismatch and incomplete API validation remain |
| Deployment readiness | 38/100 | Build works with network, but no deployment config/evidence, auth or operations controls |

## 3. Significant findings

| Priority / severity | Finding and evidence | Impact | Direction |
|---|---|---|---|
| P0 / High | No auth/rate limit on chat and benchmark APIs; benchmark starts Python; chat may incur provider cost | Public exposure could be abused for compute or cost | Keep private/local until identity, limits, concurrency and deployment boundary are approved |
| P0 / High | Production audit reported 21 advisories: 2 critical, 11 high, 8 moderate; Zod 4.4.3 falls in a reported advisory range | Dependency risk; count alone does not prove exploitability | Review advisory details/reachability and patch under lockfile/tests |
| P0 / High | Benchmark parses JSON before checking 2 MB CSV cap (app/api/benchmark/route.ts:80-92) | Request can consume memory before application limit | Enforce body size before full parse and test the host/body boundary |
| P1 / Medium | Chat accepts any messages array; no explicit item/text/body bounds (app/api/chat/route.ts:31-50) | Malformed or cost-amplifying requests may reach provider | Add runtime schema, bounds and provider error handling |
| P1 / Medium | .env.example has GEMINI_API_KEY, code expects GOOGLE_GENERATIVE_AI_API_KEY | Onboarding failure | Align example/help in separately authorized change; do not rotate active key |
| P1 / Medium | No auth, durable transaction API, retention policy or case audit store | Cannot safely support shared multi-user workflows | Decide identity/tenant/privacy first, then version an API/schema |
| P1 / Medium | CI omits production build, Python tests/validation and npm audit | ML/production regressions may escape CI | Add reproducible data-free checks after build/dependency strategy |
| P1 / Medium | Phase 17 lacks an unexposed qualified time/entity/label dataset | Independent temporal replication is not defensible | Keep blocked; qualify authorization and prior exposure before preregistration |
| P2 / Medium | Browser history is unbounded JSON/localStorage and full-list work | Latency and quota risk as records grow | Set retention/pagination or move to approved backend |
| P2 / Medium | Python process/model load per benchmark request; 120 s timeout | Cold-start and concurrency pressure | Keep local-only; design bounded worker/service only if product use approved |
| P2 / Medium | next/font/google caused network-restricted build failure | Build reliability in offline CI | Consider self-hosted fonts or explicit deterministic asset strategy |
| P2 / Low | AI message list/chart accessibility needs browser/screen-reader verification | Possible assistive-technology issue | Verify first, then fix/test only if reproduced |
| P2 / Low | Root AGENTS.md describes Vite setup/no app source; actual project is Next.js | Contributor instruction conflict | Owner should reconcile in separate approved task |
| P2 / Low | Root planning docs call audit/design gates pending although redesigned UI exists | Governance status stale versus implementation | Reconcile planning docs in a separate task; they were not modified here |

These are static/runtime risk observations. No external attack, penetration test or exploitation was performed. No deployed production URL was identified.

## 4. Development principles and gates

1. Keep product and research work separate.
2. Preserve existing user work; no automatic commit or source changes are authorized here.
3. Never describe heuristic scores as trained predictions/probabilities.
4. Require source, terms, hash, schema, split and exposure evidence before using a dataset.
5. Separate validation decisions from final test measurement.
6. Do not integrate artifacts into the app without reviewing schema, runtime, ownership and rollback.
7. Mark a stage complete only after its acceptance evidence exists.

## 5. Sequential roadmap

No calendar duration is assigned; decisions and data access control the schedule.

### Phase A — P0: API exposure and dependency gate

**Objective:** establish safety before public access.
**Tasks:** review advisory details/reachability; plan compatible patches; design auth and rate/concurrency limits for chat/benchmark; bound bodies before parsing; define headers and provider budget.
**Likely files:** app/api/chat/route.ts, app/api/benchmark/route.ts, package.json/lockfile, next.config.ts, API tests, environment docs.
**Dependencies:** actual hosting target, user roles, provider budget and approval for dependency changes.
**Risks:** hosting limits vary; strict limits may affect intended uploads.
**Tests:** schema/size/timeout tests, authz tests, concurrency/abuse checks, dependency audit, typecheck/build.
**Acceptance / Definition of Done:** secrets remain server-only; oversized bodies rejected before full materialization; route budgets/access enforced; advisories triaged and patched or documented; tests pass.

### Phase B — P1: Setup and CI reliability

**Objective:** make onboarding and CI reflect the supported application and research checks.
**Tasks:** correct env example; make font/build behavior deterministic; add lint and production build to CI; provide data-free Python test setup; add ML compilation/contract tests without restricted data; isolate generated outputs.
**Likely files:** .env.example, README.md, ml/README.md, .github/workflows/ci.yml, Python metadata and tests.
**Dependencies:** Phase A review and approval for CI/config changes.
**Risks:** font strategy and Python CI may alter build environment.
**Tests:** clean npm ci, typecheck, Node/Vitest, Playwright CI, build, data-independent Python tests.
**Acceptance / Definition of Done:** copy-paste setup works; CI covers web build and data-free ML contracts; CI does not download datasets.

### Phase C — P1: Product identity, persistence and investigation contract

**Objective:** decide requirements needed before multi-user backend work.
**Tasks:** specify roles/tenant boundary, transaction source, privacy/legal basis, retention/deletion, audit events, case workflow, export and threat model.
**Likely files:** new approved design docs; later lib/types.ts, service interfaces and route modules.
**Dependencies:** owner/stakeholder decisions and privacy review.
**Risks:** premature schema lock-in or unnecessary sensitive data retention.
**Tests:** after approval, contract and authorization tests.
**Acceptance / Definition of Done:** versioned requirements answer open decisions; no migration starts before sign-off.

### Phase D — P1: Durable backend, conditional on Phase C

**Objective:** replace browser-only persistence for approved shared workflows.
**Tasks:** choose database/host; implement validated transaction/case APIs, auth, tenant authorization, immutable risk history, audit, retention, migration and backup. Preserve local prototype until parity is tested.
**Likely files:** new server modules, handlers, schema/migrations, repository implementation, tests.
**Dependencies:** Phase C, operations and secret management.
**Risks:** PII exposure, migration loss, inconsistent client/server state.
**Tests:** unit/integration, migration, authz matrix, backup/restore, deletion and concurrency.
**Acceptance / Definition of Done:** no cross-tenant reads/writes; traceable audit; documented retention; recovery tested; UI no longer implies local/server ambiguity.

### Phase E — P2: Evidence-linked investigation UX

**Objective:** evolve screens into an analyst workflow after backend contracts exist.
**Tasks:** add case lifecycle, notes/actions, provenance panel, evidence references, report export and accessible status timeline; retain heuristic labeling until model approval.
**Likely files:** app/history, app/analysis, app/analytics, components and API clients.
**Dependencies:** Phase C/D, privacy and retention rules.
**Risks:** analyst action could be conflated with ground-truth label or model output.
**Tests:** keyboard/screen-reader/viewport, state transition and audit-trail tests.
**Acceptance / Definition of Done:** each case decision traces to input and scoring version; no unsupported evidence appears; accessibility checks pass.

### Phase F — P2: Research dataset qualification, not training

**Objective:** identify eligible data for independent temporal replication.
**Tasks:** verify authorized source and terms, actual transaction labels, persistent entity IDs, timestamp semantics, source hash, sequence coverage, prior LayerNet/public exposure and candidate chronological window.
**Likely files:** DATASET_STRATEGY.md only if evidence materially changes it; a new qualification report after approval.
**Dependencies:** authorized access and terms evidence.
**Risks:** public exposure, synthetic-only scope, weak entity semantics or label timing.
**Tests:** schema/intake and leakage tests after access is verified; no model training in qualification.
**Acceptance / Definition of Done:** primary-source terms, actual schema, chronology/ties, identity/label coverage and exposure are documented; feasibility is assessed without selecting from test labels.
**Research status:** Phase 17 remains BLOCKED until this gate passes.

### Phase G — P2: Preregistered temporal replication, conditional

**Objective:** compare current-only and history-enabled conditions only on newly qualified data.
**Tasks:** freeze preregistration/config/split/seeds; matched arms; training-only weights; validation-only thresholds; row-keyed outputs; paired uncertainty and honest deviations.
**Likely files:** new dataset-specific ML modules/manifests/reports.
**Dependencies:** Phase F pass and separate authorization to execute.
**Risks:** compute, temporal drift, entity overlap, incomplete seed/output capture.
**Tests:** causal sequence, split, feature exclusion, provenance, threshold and replay checks.
**Acceptance / Definition of Done:** all preregistered seeds completed; hashes and losses recorded; predictions/metrics reproduce; uncertainty and limitations reported; incomplete work is PARTIAL/BLOCKED, never PASS.

### Phase H — P3: Performance and accessibility refinement

**Objective:** optimize based on measurement after core safety and workflow are stable.
**Tasks:** profile bundles/rendering; define history pagination/retention; reduce avoidable work; test charts/dialogs/keyboard; optimize fonts if still relevant.
**Likely files:** app/, components/, lib/summary.ts and app/globals.css.
**Dependencies:** browser environment and storage decision.
**Risks:** optimization can change visual/interaction behavior.
**Tests:** before/after Web Vitals or Lighthouse with environment recorded; browser and accessibility regression tests.
**Acceptance / Definition of Done:** measured baseline and targets; no invented performance claims or regressions.

## 6. Product and research workstreams

| Product workstream | Research workstream |
|---|---|
| API security, identity, persistence, cases, reporting and accessibility | Dataset qualification, frozen protocol and controlled temporal evaluation |
| Security/design decisions can proceed without claiming research success | Must remain blocked until authorized unexposed chronological data is verified |
| Application model integration only after adapter, contract and operations review | Experiments remain outside normal application analysis |

ULB remains a conventional benchmark. PaySim remains synthetic recipient-history evidence. Their metrics must not be treated as if they share a dataset or target population.

## 7. Audit verification record

### Passed

- npm run typecheck -- --incremental false.
- Focused ESLint over app, components, lib, playground, scripts, e2e and tests.
- npm test: 11 passed; npm run test:vitest: 37 passed.
- Production build passed after network access was allowed for next/font/google.
- Python source compilation passed for 17 ML modules; ML CLI help passed.
- ULB validator passed on local ignored ml/data/raw/creditcard.csv.
- Production smoke: ten pages returned HTTP 200; generic Gemini stream and five-row unlabeled ULB request succeeded.
- git diff --check was clean before creating this pack.

### Failed, skipped or limited

- Broad npm run lint encountered filesystem EPERM while scanning protected PaySim artifacts; focused lint passed.
- Local Playwright E2E not run because no usable browser binary was available.
- Python pytest suite not run because pytest was absent; no package installed.
- Production dependency audit returned 21 advisories above.
- Build requires network for Google fonts in current setup.
- No production URL/deployment configuration found.
- CreditTransAct Parquet schema not independently read because no reader package was installed.
- Phase 12 artifact folder could not be read due filesystem access denial.

## 8. Governance and evidence conflicts

Root AGENTS.md says Vite/React setup with no application source. Actual tree is a Next.js App Router app with pages, APIs and successful production build. Root IMPLEMENTATION_PLAN.md, TECHNICAL_DESIGN.md, SOURCE_OF_TRUTH.md, PROJECT_BRIEF.md and REQUIREMENTS.md are planning/governance inputs; some say audit/design gates are pending although the redesign is implemented. This plan records the discrepancy, does not overwrite them, and uses code/runtime evidence for implementation claims.

The pre-existing untracked .claude/, report/ and root AGENTS.md were protected. No application source, test, config, data, model, or existing report was changed for this pack.

## 9. Completion rule

This roadmap is not authorization to deploy or train. Every phase needs its stated decisions, tests, provenance and appropriate owner approval. Do not mark a phase complete from narrative alone.
