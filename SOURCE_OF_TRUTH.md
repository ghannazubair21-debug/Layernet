# LayerNet — Source of Truth

**Document:** `SOURCE_OF_TRUTH.md`  
**Version:** 1.0  
**Project:** LayerNet — Multi-Layered Transformer-Based Fraud Detection, Analysis & Investigation Intelligence System  
**Status:** Evidence registry established; repository audit pending  
**Last external-reference review:** 2026-10-14

## 1. Purpose

This document is LayerNet's central evidence registry.

It records:

- Facts supported by project history or direct evidence.
- Decisions explicitly approved by the project owner.
- External technical and dataset references.
- Assumptions that must not be treated as facts.
- Unknowns requiring investigation.
- Verification evidence supporting implementation and research claims.

Its purpose is to prevent outdated information, unsupported claims, and AI-generated guesses from becoming project requirements or implementation instructions.

A statement does not become verified simply because it appears in another project document, an AI-generated summary, or a coding agent's report.

## 2. Evidence Classification

Every material statement must be classified using one of the following categories.

| Code | Category | Meaning |
|---|---|---|
| U | User-approved decision | Explicitly confirmed by the project owner |
| R | Repository/runtime evidence | Directly established from the current code, environment, or executed checks |
| E | External authoritative evidence | Supported by an official technical source or applicable primary data source |
| H | Historical report | Reported in prior project work but not necessarily verified against the current state |
| A | Assumption | A provisional belief requiring verification |
| O | Open question | Unknown or unresolved matter requiring evidence or a decision |

When evidence conflicts, the conflict must be recorded and resolved rather than silently choosing a convenient answer.

### Evidence precedence

1. Current repository state and reproducible execution evidence for claims about the implementation.
2. Official technical documentation and primary sources for external technical or dataset facts.
3. Explicitly approved project decisions for product direction and agreed scope.
4. Historical reports for context only.
5. Assumptions for planning only, never as verified claims.

The precedence depends on the claim. Repository inspection cannot determine dataset licensing, and official framework documentation cannot establish which framework version is installed locally.

## 3. Approved Project Decisions

The following decisions have been explicitly approved.

| ID | Decision | Status |
|---|---|---|
| D-001 | Preserve the existing application while finalizing research design before further research implementation. | Approved |
| D-002 | Balance research contribution and product quality. | Approved |
| D-003 | Assess dataset suitability, permitted use, temporal support, compute requirements, and research fit before selecting a dataset. | Approved |
| D-004 | Support both dark and light themes with a user-accessible toggle. | Approved |
| D-005 | Use a left-side vertical sidebar as the primary navigation; a top horizontal navbar must not replace it. | Approved |
| D-006 | Use balanced premium animations, page transitions, animated cards/charts, and purposeful micro-interactions. | Approved |
| D-007 | Redesign every verified existing application page consistently. | Approved |
| D-008 | Preserve fraud-scoring logic, APIs, research contracts, data integrity, accessibility, responsiveness, and performance. | Approved |
| D-009 | Do not begin implementation merely because these design documents have been drafted. Complete the required audit and planning gates first. | Approved |

These decisions are authoritative for the current project scope. A future change must be recorded with its rationale, supporting evidence, and approval.

## 4. Project Identity and Purpose

### 4.1 Canonical project title

**LayerNet — Multi-Layered Transformer-Based Fraud Detection, Analysis & Investigation Intelligence System**

### 4.2 Research question

Can combining personalized behavioral intelligence and temporal Transformer modeling with traditional machine-learning fraud detectors improve the detection and explainability of suspicious financial transactions?

**Classification:** U — approved research direction.

The question remains subject to literature review and operational refinement. It does not prove novelty, feasibility, or improved performance.

### 4.3 Product purpose

LayerNet is intended to support human analysts investigating potentially suspicious financial transactions.

The product must distinguish research evidence from demonstration data, unavailable experiment outputs, and actual application data.

The system must not be described as an autonomous financial authority or as proven effective for Pakistani banks without appropriate evidence.

**Classification:** U — approved project direction.

## 5. Repository and Deployment Identity

The following identifiers come from project history and must be rechecked before making changes.

| Item | Historical record | Current verification |
|---|---|---|
| GitHub repository | `ghannazubair21-debug/Layernet` | Recheck remote URL and repository state |
| Local project path | `C:\Users\ghann\Documents\Desktop\Layernet folder` | Confirm the working directory |
| Deployment URL | `https://layernet.vercel.app/` | Confirm current deployment and functionality |
| Primary branch | `main` | Confirm current branch and remote tracking |
| Current HEAD | Not established in this document | Record actual commit hash during audit |
| Working tree | Previously reported clean after a push | Recheck before implementation |

No agent may infer the current branch, commit, clean status, or deployment health from this table.

The current repository and deployment should be inspected separately because a successful local build does not prove the deployed application is up to date or healthy.

## 6. Historical Implementation Evidence

Prior project reports described the following.

### 6.1 Web application

- A Next.js App Router application using React and TypeScript.
- Tailwind CSS styling.
- A Gemini integration through the AI SDK.
- Dashboard, transaction analysis, analytics, health, history, and settings areas.
- An AI Chat interface.
- Supporting transaction and model-related service modules.

**Classification:** H — historical implementation reports.

These are not yet a current inventory of routes, dependencies, or working features. Verify them against the repository.

### 6.2 Research pipeline

Previous reports described:

- An XGBoost-oriented research pipeline.
- Dataset validation and schema contracts.
- Feature-engineering and transaction-metric modules.
- Model or experiment interface contracts.
- IEEE-CIS dataset intake validation.
- Research documentation and scripts.

**Classification:** H — historical implementation reports.

The presence of contracts, scripts, or documentation does not prove that training completed successfully or that a model artifact is usable.

### 6.3 Previously reported test status

Previous project reports stated that:

- `npm run typecheck` passed.
- `npm run test:vitest` passed with two files and nine tests.
- `npm run build` passed.
- A merged branch was pushed to `main`.

**Classification:** H — historical validation claims.

The recorded test results must be treated as historical until the actual commands are run against the current checkout. They must not be copied into a new release or research report as current test results.

## 7. Research Data and Experiment Status

Earlier research reports indicated that the following prerequisites were missing at the time of those checks:

- The expected ULB dataset file at `ml/data/raw/creditcard.csv`.
- Required IEEE-CIS transaction and identity dataset files.
- The configured `ml/.venv` environment.
- Required installed ML packages, including scikit-learn, XGBoost, and joblib in that environment.
- Evidence that applicable dataset terms had been accepted.

Those reports also indicated that real model training and final research metrics had not been established.

**Classification:** H — historical blockers, not a statement of their current state.

The repository and environment must be checked again before these conditions are reported as current.

### Mandatory research evidence rules

- A model is not considered trained merely because training code exists.
- A result is not considered measured merely because a report template or metric schema exists.
- A dataset is not considered approved merely because a download link exists.
- A research experiment is not considered complete without recorded inputs, configuration, execution evidence, and outputs.
- Mock or synthetic data must not be reported as real-world or empirical fraud evidence.
- Failed, blocked, and inconclusive experiments must be documented honestly.

## 8. Dataset Evidence Register

**Current decision: No primary dataset selected.**

Candidate sources may be investigated, but none is approved by this document.

### DS-01 — ULB Credit Card Fraud Detection

**Reference:** [Kaggle — Credit Card Fraud Detection](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud)

The dataset description identifies anonymized credit-card transactions from European cardholders in September 2013. It reports 284,807 transactions across two days, including 492 fraudulent transactions. Its feature description includes transformed numerical components and the `Time` and `Amount` fields.

**Permitted conclusion:** The published dataset description establishes that this is a highly imbalanced, historical transaction dataset with a limited period of observation.

**Not established:** Current local availability, current applicable license/terms, suitability for LayerNet's final hypothesis, and whether its fields support defensible personalized behavioral and temporal experiments.

**Source classification:** E — published dataset description; local availability remains O.

### DS-02 — IEEE-CIS Fraud Detection

**References:**

- [Kaggle — Competition data](https://www.kaggle.com/competitions/ieee-fraud-detection/data)
- [Kaggle — Competition rules](https://www.kaggle.com/competitions/ieee-fraud-detection/rules)

The competition materials describe transaction and identity files joined by `TransactionID`. The `TransactionDT` feature is described as a timedelta from a reference point, not an actual calendar timestamp. The data page also states that access is subject to the competition rules.

**Permitted conclusion:** The dataset has richer transaction and identity feature groups than the ULB dataset's described feature set, but its time representation and missing identity information must be handled explicitly.

**Not established:** Current local availability, accepted terms, a valid entity history suitable for behavioral modeling, and feasibility within the available compute environment.

**Source classification:** E — published dataset description and rules; local access and suitability remain O.

### Dataset selection requirements

Before selecting any dataset, record:

1. The exact source and version.
2. Applicable license, terms, and usage restrictions.
3. Whether any required agreement or acceptance has been completed and documented.
4. Target label and definition of a positive example.
5. Available timestamps, identifiers, entity histories, and feature descriptions.
6. Missingness, class balance, duplicate handling, and known dataset limitations.
7. Valid split strategies and leakage risks.
8. Hardware, memory, storage, and runtime feasibility.
9. Fit to the research question and intended experiments.
10. Limitations on generalization to real banking environments.

The final decision must identify rejected alternatives and explain the reason for the selection.

## 9. External Technical Sources

These sources guide technical decisions. They do not prove that LayerNet follows those practices today.

### EXT-01 — Next.js App Router

**Source:** [Next.js App Router documentation](https://nextjs.org/docs/app)

Supports guidance on routing, layouts, navigation, and server/client component boundaries.

**Use in LayerNet:** Verify the installed framework version and its corresponding documentation before changing the application shell or shared layout.

### EXT-02 — Next.js layouts and pages

**Source:** [Next.js — Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)

Describes file-system routing and shared layouts.

**Use in LayerNet:** Inform the shared sidebar and page-shell design without assuming exact route file locations before inspecting the repository.

### EXT-03 — Tailwind CSS theme variables

**Source:** [Tailwind CSS — Theme Variables](https://tailwindcss.com/docs/theme)

Describes design tokens implemented through Tailwind's theme-variable system.

**Use in LayerNet:** Guide centralized visual tokens, subject to the installed Tailwind version and current CSS architecture.

### EXT-04 — Tailwind CSS dark mode

**Source:** [Tailwind CSS — Dark Mode](https://tailwindcss.com/docs/dark-mode)

Describes system-preference and manually controlled dark-mode styling.

**Use in LayerNet:** Inform the dark/light theme toggle and theme-aware component styling.

### EXT-05 — W3C motion guidance

**Source:** [W3C — Animation from Interactions, WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)

Explains the accessibility rationale for disabling non-essential interaction-triggered motion.

**Use in LayerNet:** Support reduced-motion behavior and non-essential animation controls.

### EXT-06 — AI SDK

**Source:** [AI SDK documentation](https://ai-sdk.dev/docs/getting-started)

Provides official guidance for the SDK's supported integrations and application patterns.

**Use in LayerNet:** Verify the actual SDK and provider versions before changing AI Chat behavior or provider configuration.

### EXT-07 — scikit-learn metrics

**Sources:**

- [Precision, Recall, F-score and Support](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_recall_fscore_support.html)
- [Average Precision](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.average_precision_score.html)
- [ROC-AUC](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.roc_auc_score.html)

These references document standard classification metrics and their calculation conventions. Average precision must not be silently relabelled as trapezoidal area under a precision-recall curve because the calculations differ.

**Use in LayerNet:** Establish metric definitions before comparing experiments.

### External-source usage rules

- Prefer official documentation and primary dataset materials.
- Check version-specific guidance before implementation.
- Record the access or review date when a source is added or materially rechecked.
- Do not treat a third-party tutorial as authoritative where an official source is available.
- Follow dataset terms rather than assuming that public visibility grants unrestricted use.

## 10. Research Methodology Invariants

The following constraints must hold throughout the research pipeline.

### R-01 — Leakage prevention

Training, validation, and final testing must be separated according to a documented strategy that fits the dataset and intended deployment scenario.

Learned preprocessing must be fitted only on the allowed training data. The final test set must not influence model fitting, feature decisions, hyperparameter selection, or threshold selection.

### R-02 — Comparable evaluation

Models must be compared on appropriate data splits, with consistent evaluation definitions and documented differences where model requirements prevent identical handling.

Record at least the applicable precision, recall, F1, average precision or PR-AUC using an explicitly defined convention, ROC-AUC, and confusion-matrix counts.

The evaluation protocol must explain threshold selection and class imbalance.

### R-03 — Score direction

Every model adapter must document whether a higher output means greater fraud risk or greater anomaly. Score direction must be normalized before ensemble operations or cross-model comparisons.

### R-04 — Evidence-grounded explanations

Explanations must cite available transaction information, model outputs, or calculated evidence. The system must not invent causal explanations or feature importance.

### R-05 — Honest results

No result should be reported until the experiment has actually run and its outputs have been captured and validated.

An empty artifact directory, a passing unit test, or a valid experiment contract is not empirical evidence of model performance.

## 11. Frontend Source-of-Truth Rules

The approved frontend design is a product decision, while its current implementation is still subject to inspection.

### Fixed requirements

- Primary navigation: left-side vertical sidebar.
- Themes: dark and light, with a user-accessible toggle.
- Motion: balanced, purposeful animations and micro-interactions.
- Scope: all existing application pages.
- Accessibility, responsiveness, and performance must be protected.
- Fraud scoring, APIs, model behavior, research contracts, and data integrity must remain intact.

### Visual details still to be decided

- Exact light and dark color palettes.
- Typography and font scale.
- Sidebar width and responsive breakpoints.
- Card, table, chart, and input styling.
- Animation durations and easing conventions.
- Theme preference implementation and persistence details.
- Numerical performance targets after the baseline is measured.

The UI must use real application data or clearly labelled demonstration data. It must not introduce decorative metrics that imply unsupported fraud-detection performance.

## 12. Open Questions Register

| ID | Unknown | Evidence needed | Status |
|---|---|---|---|
| O-01 | What is the current Git HEAD and working-tree state? | `git status` and commit information | Open |
| O-02 | What routes and components currently exist? | Repository inventory | Open |
| O-03 | Which dependency versions are actually installed? | Package manifest and lockfile | Open |
| O-04 | Which tests and scripts are available now? | Package scripts and test configuration | Open |
| O-05 | Are required datasets present? | Inspect expected data paths | Open |
| O-06 | Which dataset terms apply and have been satisfied? | Primary terms/rules and documented acceptance evidence | Open |
| O-07 | Does the selected data support valid temporal sequences and entity histories? | Schema, data profiling, and documented feasibility analysis | Open |
| O-08 | Is the ML environment usable? | Environment check and dependency/import tests | Open |
| O-09 | Has any real experiment completed? | Logs, configurations, metrics, and artifacts | Open |
| O-10 | What is the current frontend performance baseline? | Recorded and repeatable performance measurements | Open |
| O-11 | What is the final research gap and hypothesis? | Literature review and supervisor/project approval | Open |
| O-12 | What exact design tokens and breakpoints will be used? | Approved technical design | Open |

An open item must not be described as completed merely because it has an entry in a plan.

## 13. Audit Evidence Log

During the repository audit, maintain a dated evidence log.

| Field | Required content |
|---|---|
| Evidence ID | Unique identifier |
| Date | Actual date checked |
| Claim | Exact claim under investigation |
| Source | File path, command, official URL, or dataset record |
| Method | Inspection or command executed |
| Result | Observed outcome |
| Classification | R, E, H, A, or O |
| Limitation | Conditions or gaps affecting the conclusion |
| Owner/action | Next required action |

Example entries must contain actual observed results. Do not prefill anticipated results as if they had been obtained.

## 14. AI Coding Agent Rules

Any coding agent working on LayerNet must:

1. Read this document and the approved project brief, requirements, technical design, and implementation plan before making changes.
2. Inspect the actual repository instead of assuming that historical project descriptions remain accurate.
3. Treat unknown facts as unknown until direct evidence is available.
4. Ask for an explicit decision when an unresolved matter blocks safe implementation; otherwise preserve scope and document the blocker.
5. Avoid unrelated refactoring and unapproved scope expansion.
6. Preserve protected model, API, schema, data, and experiment contracts.
7. Never fabricate test results, model metrics, dataset availability, citations, or implementation status.
8. Report the exact validation commands executed and their actual outcomes.
9. Record changes to approved decisions with evidence and rationale.
10. Distinguish completed work, partial work, blocked work, and proposed future work.

If source evidence conflicts, stop the affected decision from being treated as verified until the discrepancy is resolved.

## 15. Maintenance Policy

Update this document whenever a material fact, source, research prerequisite, or approved project decision changes.

An update must:

- Identify what changed.
- Record the evidence or approving decision.
- Explain the impact on related documents.
- Identify any remaining uncertainty.
- Avoid silently deleting historical evidence needed to understand earlier decisions.

Document owners should keep all five project documents consistent. Where an implementation discovery invalidates an earlier assumption, update the relevant documents instead of forcing the implementation to match the incorrect assumption.

## 16. Current Status

**Verified decisions:** Project direction, hybrid foundation, dataset-assessment-first strategy, complete frontend redesign, left sidebar, dark/light themes, balanced animation, and protected research/product behavior.

**External technical sources:** Official references have been identified for the current architectural direction and evaluation methodology.

**Pending verification:** Current repository state, routes, dependency versions, actual datasets, ML environment, current test results, and trained research artifacts.

**Next step:** Create `IMPLEMENTATION_PLAN.md` with explicit phases, dependencies, exit criteria, real test commands, evidence requirements, and blocker handling. Before implementation begins, execute the repository audit and update this evidence register with observed results.

**Final status:** Source-of-truth structure established. Current implementation and research readiness remain unverified until the required audit is performed.