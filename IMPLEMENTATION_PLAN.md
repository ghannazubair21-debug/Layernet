# LayerNet — Implementation Plan

**Document:** `IMPLEMENTATION_PLAN.md`  
**Version:** 1.0  
**Status:** Proposed execution plan; awaiting repository audit and approval  
**Project:** LayerNet — Multi-Layered Transformer-Based Fraud Detection, Analysis & Investigation Intelligence System

## 1. Purpose

This document defines the order of work, phase dependencies, tasks, exit criteria, verification requirements, blockers, and completion rules for LayerNet.

The objective is to preserve the existing application while establishing a defensible research project and delivering a consistent, modern frontend.

Implementation must be evidence-driven. The plan must not assume that datasets are available, research experiments have completed, tests currently pass, or proposed features already work.

## 2. Approved Project Direction

The following decisions are fixed for this plan:

- Preserve the existing application as the starting point.
- Balance research contribution and product quality.
- Assess dataset suitability and permitted use before choosing a primary dataset.
- Use a left-side vertical sidebar as primary navigation.
- Support both dark and light themes with a user-accessible toggle.
- Use balanced premium animations and purposeful micro-interactions.
- Redesign every verified existing application page consistently.
- Protect fraud-scoring logic, APIs, research contracts, data integrity, accessibility, responsiveness, and performance.
- Do not invent research results or make unsupported novelty claims.
- Do not begin implementation until the required audit and design gates are satisfied.

## 3. Execution Rules

### 3.1 One phase at a time

Each phase must have a defined scope, recorded evidence, and exit criteria.

A phase is not complete simply because an agent reports that it is complete. Its acceptance criteria must be supported by inspection, executed tests, artifacts, or approved decisions as applicable.

### 3.2 Research and product work must remain distinguishable

The project has two related workstreams.

**Product workstream:** current application audit, design system, navigation, themes, responsive layouts, interactions, and visual validation.

**Research workstream:** literature review, dataset feasibility, research hypothesis, experimental protocol, model comparisons, evaluation, and reproducibility.

The workstreams can progress in parallel only where their dependencies permit. Frontend implementation must not pretend that the ML research is complete, and research implementation must not proceed around unresolved data-use or methodology blockers.

### 3.3 Preserve existing behavior

Before changing a feature, record how it currently behaves.

A visual refactor must not silently change an API contract, model score, transaction record, investigation status, or research evaluation procedure.

### 3.4 Evidence-based status

Every task must be marked as one of:

- **Not started**
- **In progress**
- **Blocked**
- **Completed**
- **Needs rework**

A completed task must include relevant evidence. A blocked task must identify the missing input and the next action needed to unblock it.

## 4. Phase Overview

| Phase | Main objective | Dependency | Exit condition |
|---|---|---|---|
| 0 | Confirm document baseline | Current approved scope | Required documents agree |
| 1 | Audit the repository | Phase 0 | Current application and test state documented |
| 2 | Finalize research design and dataset assessment | Phase 0; relevant evidence from Phase 1 | Defensible, approved research protocol |
| 3 | Finalize frontend technical design | Phase 1 and approved requirements | Implementable design decisions recorded |
| 4 | Implement shared frontend foundations | Phase 3 approval | Shell, sidebar, themes, and shared components pass checks |
| 5 | Redesign individual pages | Phase 4 | All verified pages meet acceptance criteria |
| 6 | Verify quality and regressions | Phases 4–5 | Required checks pass or approved limitations are recorded |
| 7 | Implement and evaluate research experiments | Phase 2 and environment/data readiness | Reproducible experimental evidence produced |
| 8 | Integrate validated research outputs | Relevant completed research phase | UI and research results agree |
| 9 | Final acceptance and documentation | Applicable prior phases | Release and research claims supported by evidence |

Phases 2 and 3 may proceed in parallel after the necessary repository and document evidence is available. Research implementation in Phase 7 must remain blocked until its own data and methodology prerequisites are met.

## 5. Phase 0 — Document Baseline

**Priority:** P0  
**Status:** Documents drafted; consistency review pending

### Tasks

- Review `PROJECT_BRIEF.md`.
- Review `REQUIREMENTS.md`.
- Review `TECHNICAL_DESIGN.md`.
- Review `SOURCE_OF_TRUTH.md`.
- Review this `IMPLEMENTATION_PLAN.md`.
- Check for conflicting decisions, duplicated or contradictory requirements, and unsupported claims.
- Confirm that the left sidebar, both themes, balanced animations, all-page redesign, and research protections are consistent across documents.
- Record unresolved questions rather than inventing answers.

### Exit criteria

- All five documents reflect the same approved project direction.
- The requirements are traceable to the brief.
- Technical decisions are separated from assumptions and repository unknowns.
- Every critical open decision has an owner or defined resolution step.
- No implementation begins based solely on these drafts.

## 6. Phase 1 — Repository and Runtime Audit

**Priority:** P0  
**Status:** Pending

### Tasks

1. Confirm repository path, active Git branch, current commit, remote configuration, and working-tree status.
2. Identify the framework and dependency versions from the actual project files and lockfile.
3. Inventory every existing route, shared layout, page component, and navigation destination.
4. Identify the current implementation of charts, tables, transaction forms, status indicators, and AI Chat.
5. Inspect current theme handling, styles, design tokens, and responsive conventions.
6. Map existing APIs, data schemas, scoring modules, research contracts, and security boundaries.
7. Inspect test configuration, package scripts, environment requirements, and current known failures.
8. Check dataset locations, ML environment availability, and existing experiment artifacts without exposing secrets.
9. Record a frontend performance and accessibility baseline using a repeatable environment.
10. Identify defects already present before redesign begins.

### Required evidence

- Current Git state and commit identifier.
- Route and component inventory.
- Dependency/version summary.
- Protected API and data-contract inventory.
- Available test commands and observed results.
- Dataset/environment availability report.
- Baseline performance and accessibility observations.
- Known defects and unresolved issues.

### Exit criteria

- The actual starting state is documented.
- Existing functionality that must be preserved is identified.
- Tests and build commands are confirmed from repository configuration.
- Unknowns and pre-existing failures are distinguished from new regressions.

**Blocker rule:** If repository access is unavailable, the phase must remain blocked. Historical reports must not be represented as a current audit.

## 7. Phase 2 — Research Design and Dataset Feasibility

**Priority:** P0 for research implementation  
**Status:** Pending

### Tasks

1. Review relevant research literature and primary dataset documentation.
2. Identify the research gap and competing explanations or existing approaches.
3. Assess candidate datasets without committing prematurely.
4. Verify data provenance, license, terms, access conditions, and permitted use.
5. Examine target labels, feature meanings, timestamps, entity identifiers, missingness, duplicates, and class balance.
6. Determine whether valid temporal sequences and personalized behavioral histories can be constructed.
7. Assess leakage risks and appropriate train/validation/test strategies.
8. Evaluate hardware, memory, storage, software, and execution requirements.
9. Define the primary research question, operational hypothesis, experiment configurations, and evaluation metrics.
10. Define fair comparison rules, threshold-selection procedures, and reporting conventions.
11. Document datasets or approaches that were rejected and the reason for rejection.
12. Obtain the required project or supervisor approval for the finalized research protocol.

### Proposed experimental progression

- **A:** XGBoost baseline.
- **B:** XGBoost + Random Forest.
- **C:** Supervised ensemble + Isolation Forest.
- **D:** An appropriate Transformer-based temporal model.
- **E:** A combined approach justified by prior results.

The final experiment list depends on the literature review and dataset suitability. Experiments must not be implemented merely to complete the table.

### Exit criteria

- The research gap and hypothesis are supported by literature.
- The dataset selection and permitted use are documented.
- Available features support the planned experiments.
- Split strategy and leakage controls are defined.
- Metrics and threshold-selection rules are specified.
- Compute requirements are assessed.
- Unsupported or infeasible experiments are removed, redesigned, or explicitly marked blocked.

**Blocker rule:** If no appropriate dataset has been approved, data-dependent training must not begin.

## 8. Phase 3 — Frontend Technical Design Finalization

**Priority:** P1  
**Status:** Proposed design recorded; repository-specific decisions pending

### Tasks

- Confirm the shared application shell using the actual routing architecture.
- Finalize the left sidebar's expanded, collapsed, and mobile behavior.
- Define dark/light semantic color tokens and typography.
- Decide how theme selection is initialized and persisted.
- Define shared component patterns for cards, tables, forms, charts, badges, dialogs, and feedback.
- Set responsive breakpoints based on existing conventions and testing.
- Define motion conventions, reduced-motion fallbacks, and interaction states.
- Identify accessible patterns for sidebar navigation, menus, dialogs, chart descriptions, and forms.
- Map current APIs and data models to the pages using them.
- Define performance budgets after recording the current baseline.
- Specify tests for each critical requirement.

### Exit criteria

- Every critical design decision is documented.
- No primary navigation ambiguity remains.
- Theme behavior and persistence are specified.
- Accessibility and reduced-motion behavior are testable.
- Existing services, interfaces, and data contracts have identified regression checks.
- New dependencies, if needed, have a documented justification.

## 9. Phase 4 — Shared Frontend Foundations

**Priority:** P1  
**Status:** Not started; implementation gate required

**Prerequisite:** Phase 1 is complete, Phase 3 is approved, and implementation authorization has been given.

### Tasks

1. Establish or refine centralized design tokens.
2. Implement the shared application shell using existing architecture.
3. Implement left-side sidebar navigation.
4. Add accessible expanded/collapsed states where appropriate.
5. Implement the mobile navigation pattern.
6. Implement dark/light theme switching and preference persistence.
7. Establish shared typography, surface, button, input, status, and feedback patterns.
8. Implement reduced-motion-aware transitions.
9. Validate the shell and shared components before migrating every page.

### Exit criteria

- The left sidebar remains the primary navigation.
- Every verified route remains accessible.
- The theme toggle works in both directions.
- Theme changes do not break forms, charts, dialogs, or active routes.
- Keyboard focus and navigation remain usable.
- Mobile navigation opens, closes, and navigates correctly.
- Relevant component tests and build/type checks pass.

## 10. Phase 5 — Complete Page Redesign

**Priority:** P1  
**Status:** Not started

Each page must be redesigned using the approved shared components. Do not remove or invent functionality to make the layout easier.

### 5A — Dashboard

Tasks:
- Establish a clear information hierarchy.
- Update KPI cards and transaction summaries using valid data.
- Improve charts, legends, status labels, and responsive behavior.
- Add appropriate loading, empty, and error states.
- Apply purposeful animations without distracting from risk information.

Exit criteria:
- Displayed values have identified sources.
- Missing metrics are not fabricated.
- Cards and charts remain readable in both themes.
- Main dashboard tasks work at supported viewport widths.

### 5B — Transaction Analysis

Tasks:
- Refine input layout and validation feedback.
- Improve submission, loading, result, and error states.
- Present scores and supporting evidence clearly.
- Preserve existing API contracts and scoring behavior.

Exit criteria:
- Valid and invalid inputs are handled correctly.
- Duplicate or repeated submissions behave safely.
- Scores are not mislabelled.
- Evidence is not invented.
- Existing scoring behavior passes regression checks.

### 5C — Analytics

Tasks:
- Improve chart layout, labels, legends, and filters where supported.
- Adapt chart styling to both themes.
- Define empty and unavailable-data states.

Exit criteria:
- Metric definitions remain intact.
- Filters use actual available data.
- Labels and scales remain understandable.
- No mock results are represented as empirical findings.

### 5D — Transaction History

Tasks:
- Improve search, filtering, row layout, and details presentation where existing behavior supports them.
- Preserve transaction records and investigation status semantics.
- Provide responsive handling for wider datasets.

Exit criteria:
- Existing records remain unchanged.
- Previously supported controls continue to work.
- Empty results, missing values, and long identifiers are handled clearly.
- Status changes do not introduce unapproved business logic.

### 5E — AI Chat

Tasks:
- Improve message hierarchy, spacing, scrolling, and responsive behavior.
- Refine loading, streaming, retry, and failure feedback according to actual integration behavior.
- Preserve the existing AI provider and service contracts.

Exit criteria:
- Existing supported chat interactions remain functional.
- Failed and incomplete responses are handled clearly.
- No claim of completed analysis is made when the relevant operation did not complete.
- Secrets remain protected.

### 5F — Health and Settings

Tasks:
- Apply shared layouts and component patterns.
- Improve status indicators and feedback.
- Preserve existing settings behavior and persistence semantics.
- Avoid presenting unsupported controls as functional.

Exit criteria:
- Displayed health results reflect actual available information.
- Settings controls perform their documented actions.
- Unavailable checks are not represented as successful.

### Overall page-redesign exit criteria

- Every verified existing page has been reviewed.
- Both themes work across every redesigned page.
- Shared components are used consistently.
- Responsive and accessible interaction behavior passes applicable checks.
- Core workflows and protected interfaces remain intact.

## 11. Phase 6 — Regression, Accessibility, and Performance

**Priority:** P0/P1  
**Status:** Not started

### Functional testing

Verify:
- Navigation and direct route access.
- Sidebar expanded/collapsed and mobile states.
- Theme toggling and preference persistence.
- Transaction analysis and existing validation.
- History behavior and status transitions.
- Analytics filters and chart states.
- AI Chat error/loading handling.
- Health and Settings behavior.

### Automated checks

Confirm the actual project scripts before execution. Depending on the verified configuration, run the applicable:

- Type checks.
- Lint checks.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Production build.

Historical project reports previously recorded `npm run typecheck`, `npm run test:vitest`, and `npm run build` as passing. These are candidate commands to verify against the current package scripts, not guaranteed current results.

### Accessibility validation

- Test keyboard-only workflows.
- Check focus visibility and focus handling in menus and dialogs.
- Check contrast in dark and light themes.
- Verify labels and accessible names.
- Verify risk information is not conveyed by color alone.
- Verify reduced-motion behavior.
- Run automated accessibility checks and manually review key flows.

### Responsive validation

Test representative mobile, tablet, and desktop viewport widths selected during the audit. Record the viewports used so results can be reproduced.

### Performance validation

- Compare measurements to the Phase 1 baseline.
- Inspect significant changes in loading, interaction, and layout stability.
- Investigate excessive rendering or animation overhead.
- Record the environment and measurement method.
- Do not claim an improvement unless measurements support it.

### Exit criteria

- Required checks pass or an explicitly approved limitation is recorded.
- New regressions are resolved.
- Existing unrelated failures are documented rather than hidden.
- Performance comparison is recorded.
- Accessibility and responsive checks are complete for the approved scope.

## 12. Phase 7 — Research Pipeline and Experiments

**Priority:** P0 for research validity  
**Status:** Blocked until data, environment, and research protocol are ready

### Tasks

1. Confirm dataset availability and permitted use.
2. Establish and verify the documented ML environment.
3. Validate data files against the approved dataset and schema contracts.
4. Implement or verify the approved leakage-resistant preprocessing and split strategy.
5. Train the approved baseline.
6. Verify saved artifacts, metadata, and reproducibility.
7. Evaluate the baseline using the approved metrics.
8. Add subsequent models incrementally according to the approved experiment plan.
9. Normalize score direction before ensemble comparisons where appropriate.
10. Record configurations, seeds, logs, metrics, artifacts, limitations, and execution evidence.
11. Compare experiments using the same documented evaluation protocol where methodologically appropriate.
12. Document failed runs and negative or inconclusive findings.

### Exit criteria

- Each claimed experiment has actual execution evidence.
- Preprocessing and model selection follow the approved protocol.
- The final test set has not been used for fitting or model selection.
- Metric definitions and score direction are documented.
- Results can be reproduced from recorded inputs and configurations.
- Conclusions are limited to the evaluated data.

If a model or dataset is unsuitable, record that finding. Do not manufacture a replacement metric or silently change the research question.

## 13. Phase 8 — Research-to-Product Integration

**Priority:** P1  
**Status:** Pending valid research outputs and verified interfaces

### Tasks

- Identify which validated research outputs are suitable for application integration.
- Confirm the interface and schema between ML outputs and the application.
- Map output types to clear, accurately labelled UI elements.
- Preserve score semantics and evidence provenance.
- Keep unavailable experiments and demonstrations visibly distinct from validated model outputs.
- Add appropriate error handling for unavailable models or artifacts.
- Test the integration without changing the underlying experiment results.

### Exit criteria

- Integrated outputs correspond to actual validated artifacts or services.
- UI labels match the actual meaning of each output.
- The application does not imply an unavailable model ran.
- Regression tests confirm that protected behavior remains intact.

This phase does not guarantee that every experimental model will be integrated. Only justified, usable, and adequately validated outputs should be considered.

## 14. Phase 9 — Final Acceptance and Research Reporting

**Priority:** P0  
**Status:** Pending completion of applicable phases

### Product acceptance

- All approved frontend scope is implemented.
- All required routes remain accessible.
- Both themes and responsive navigation work.
- Animations respect reduced-motion settings.
- Core workflows and protected contracts remain intact.
- Applicable tests and build checks pass.
- Performance and accessibility outcomes are recorded.
- Known defects and limitations are disclosed.

### Research acceptance

- Research question and hypothesis are documented.
- Literature and dataset choices have supporting evidence.
- The experiment protocol is reproducible.
- Model comparisons follow the approved evaluation rules.
- Results are traceable to real outputs.
- Limitations and threats to validity are documented.
- Negative or inconclusive findings are reported honestly.
- No unsupported claim of novelty or Pakistan-specific effectiveness is made.

### Delivery package

The final project package should contain the five project documents, relevant source code, reproducibility instructions, experiment artifacts that are permitted to be retained, evaluation results, and a record of verification commands and outcomes.

No test, performance, research, or deployment claim may be marked complete without its supporting evidence.

## 15. Blocker Management

When a task cannot proceed:

1. Mark it **Blocked**.
2. State the exact missing dependency or decision.
3. Record any relevant evidence.
4. Identify the next action required to unblock it.
5. Continue only with work that is independent of the blocker and within approved scope.

Examples of legitimate blockers include missing datasets, unverified usage terms, unavailable compute resources, unresolved API contracts, and absent approval for a material design change.

Do not bypass blockers by replacing missing evidence with fabricated data or silently reducing the approved scope.

## 16. Change Control and Rollback

Every substantial implementation phase must record:

- What changed.
- Which requirements it addresses.
- Which files and interfaces were affected.
- What tests were executed.
- Actual test outcomes.
- Remaining defects or limitations.
- Whether rollback is needed.

Use small, reviewable commits or equivalent version-controlled checkpoints. Preserve a known-good state before risky changes.

If a change modifies a protected interface or causes an unexplained regression, stop the affected work, investigate, and restore a safe state when necessary.

Do not delete existing tests, relax validation, or suppress errors merely to achieve a passing build.

## 17. Agent Handoff Protocol

Every coding-agent task must include:

- Current phase and approved objective.
- Exact scope and files or subsystems to inspect.
- Protected interfaces and prohibited changes.
- Prerequisites and known blockers.
- Explicit acceptance criteria.
- Required verification commands, after confirming they exist.
- Expected completion report format.

The completion report must distinguish:

**Completed:** Work supported by inspected changes or execution evidence.

**Not completed:** Planned or partially implemented work.

**Validation:** Commands actually executed with actual outcomes.

**Blocked:** Missing dependencies and next unblocking action.

**Risks:** Remaining issues and affected requirements.

Agents must not start the next phase automatically when the current phase fails its exit criteria.

## 18. Current Execution Status

| Phase | Current status |
|---|---|
| 0 — Document baseline | Drafts prepared; consistency review pending |
| 1 — Repository audit | Not started |
| 2 — Research design and dataset feasibility | Not finalized |
| 3 — Frontend technical design | Proposed baseline prepared; repository verification pending |
| 4 — Shared frontend foundations | Not started |
| 5 — Page redesign | Not started |
| 6 — Regression and quality verification | Baseline pending |
| 7 — Research experiments | Blocked until prerequisites are verified |
| 8 — Research integration | Pending validated outputs |
| 9 — Final acceptance | Not started |

A document being drafted is not equivalent to it being saved into the repository, reviewed, or approved for implementation.

## 19. Immediate Next Actions

1. Ensure all five documents exist as repository files and are mutually consistent.
2. Review and approve the five-document baseline.
3. Perform the Phase 1 repository audit.
4. Update `SOURCE_OF_TRUTH.md` with actual findings.
5. Finalize the frontend design decisions and dataset feasibility assessment.
6. Approve the relevant implementation gate before editing application code.

**Final status:** The implementation sequence and acceptance gates are defined. Implementation remains unauthorized until the document baseline is reviewed, the repository audit is completed, and the applicable phase is explicitly approved.
