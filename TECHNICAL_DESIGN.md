# LayerNet — Technical Design

**Document:** `TECHNICAL_DESIGN.md`  
**Version:** 1.0 — Proposed technical baseline  
**Status:** Design direction defined; implementation details require repository verification

## 1. Purpose

Describe the proposed application architecture, design system, theme management, navigation, animations, API boundaries, security considerations, and verification strategy. The design must improve the existing application without compromising fraud-detection research integrity.

Approved direction: left vertical sidebar; dark and light themes with a user-controlled toggle; balanced premium animations; all verified existing pages redesigned; responsive/accessibility support; no implementation until repository and design gates are satisfied.

## 2. Current Technical Context

Project history describes Next.js App Router, React, TypeScript, Tailwind CSS, Gemini integration through the AI SDK, and Python ML components. It reports Dashboard, Analysis, Analytics, Health, History, Settings, and AI Chat areas.

**Verification boundary:** These are historical reports, not a current repository audit. Verify installed versions, routes, configuration, dependencies, API contracts, ML components, tests, and environment before changing code.

## 3. Architecture Principles

### 3.1 Preserve existing implementation

Inspect route/layout files, shared and page components, styles/Tailwind configuration, theme behavior, chart/icon/animation libraries, API routes/services, transaction schemas, model adapters, data persistence, tests, scripts, and environment requirements. Reuse sound architecture. Replace components/dependencies only with a documented reason and regression checks.

### 3.2 Separate responsibilities

Maintain clear boundaries between:

1. **Presentation:** layout, cards, forms, tables, charts, sidebar, dialogs, visual feedback.
2. **Interaction:** theme selection, navigation state, filters, menus, form interaction.
3. **Application/service:** current transaction operations and API integrations.
4. **ML/research:** feature engineering, behavioral baselines, training, inference contracts, evaluation, artifacts.

These are responsibilities, not a mandate to create new directories or duplicate existing modules.

### 3.3 Rendering model

Prefer server-rendered components where appropriate. Use client components only where browser APIs or interactive state require them, such as theme toggles, sidebar state, filters, or interactive charts. Do not turn the entire app tree into client-rendered code to support a small control. Use the framework's established routing patterns.

### 3.4 Incremental changes

Each phase must have a narrow scope, acceptance criteria, and regression checks. Do not combine visual work with unapproved changes to transaction processing, API contracts, model logic, or experiment methodology.

## 4. Application Shell and Navigation

### Desktop

Use a persistent left vertical sidebar and a main content region. A compact contextual header may provide the page title, breadcrumbs, page-specific actions, or theme toggle. It must not duplicate or replace primary navigation.

### Sidebar

The sidebar must:
- Expose all verified primary destinations.
- Indicate the active route visually and accessibly.
- Support expanded/collapsed states where appropriate.
- Keep icon-only labels accessible; tooltips may supplement them.
- Work in both themes and not cause layout overflow.
- Preserve all existing navigation destinations.

### Mobile

Use an accessible drawer or compact equivalent on narrow screens. Provide a labelled open/close control, logical focus handling, dismissal, route selection, and no unintended horizontal overflow. Choose breakpoints based on existing conventions and tests rather than guessing.

## 5. Design System and Themes

### 5.1 Semantic tokens

Centralize semantic tokens for:
- Page backgrounds and surfaces.
- Elevated surfaces and overlays.
- Primary and secondary text.
- Borders and dividers.
- Accent/primary actions.
- Focus indicators.
- Success, warning, and danger states.
- Chart palettes.
- Shadows, radius, and spacing.

Risk/status meaning must not rely on color alone. Avoid scattered page-specific hardcoded colors where a shared semantic token is appropriate.

### 5.2 Visual direction

The palette is proposed, not locked to exact hex values:
- **Dark:** deep navy/charcoal surfaces, readable light text, restrained teal/emerald accents.
- **Light:** light neutral surfaces, dark text, subtle borders, compatible accent colors.
- **Both:** consistent component structure, clear risk labels, chart readability, adequate contrast.

Avoid excessive glow, glass effects, gradients, or decoration that reduce readability in a financial investigation product. Approve exact colors, typography, spacing, shadows, and radii before implementation.

### 5.3 Theme architecture

Proposed approach: root theme attribute such as `data-theme="dark"` or `data-theme="light"`, with CSS variables controlling semantic colors. Use the installed Tailwind version's compatible dark-mode mechanism rather than assuming current configuration.

Proposed preference behavior:
1. On first visit, follow the operating-system theme preference.
2. Apply an explicit user selection immediately.
3. Persist explicit preference locally.
4. Restore it on later visits.
5. Fall back safely if storage is unavailable/invalid.

Avoid theme flash and hydration errors. Confirm the approach against the actual rendering setup and content security policy. Theme selection must not alter transactions, model behavior, or API responses.

## 6. Component Design

Reuse/extend existing components where sensible. Expected responsibilities include:

- **Application shell:** shared layout and content region.
- **Sidebar:** destinations, active state, collapse, mobile drawer.
- **Theme toggle:** accessible selection and persistence.
- **Page header:** title, supporting text, breadcrumbs, contextual actions.
- **Stat card:** metric label/value, supported trend, loading/error states.
- **Chart container:** chart, labels, legends, accessible description.
- **Data table:** supported search/filter/sort/pagination and responsive treatment.
- **Form controls:** accessible inputs and validation.
- **Status indicator:** semantic label and visual treatment.
- **Feedback components:** loading, skeleton, success, warning, error, empty states.
- **Dialog/drawer:** consistent overlay and focus handling.

These describe responsibilities, not confirmed filenames. Repository inspection determines what exists and should be reused, extended, or replaced. Avoid one-off components for trivial variations of shared patterns.

## 7. Page-Level Design

### Dashboard
Use verified data for metrics, transaction summaries, and charts. Every displayed metric must have an identified source and defined calculation. Do not invent KPIs or trends.

### Transaction Analysis
Clearly separate input, validation, submission, model result, evidence, and human-review guidance. Preserve existing API/scoring behavior. Do not label an anomaly score as calibrated fraud probability unless supported by calibration evidence.

### Analytics
Use understandable chart titles, axes, units, legends, filters, and loading/empty/error states. Keep metric definitions intact unless a reviewed change is approved.

### History
Preserve records and status semantics. Keep transaction details readable. Responsive adaptations must not hide essential information or actions.

### Health
Display only supported status information. Unavailable checks must not appear successful.

### Settings
Preserve existing control behavior and persistence. Do not show unsupported controls as functional.

### AI Chat
Preserve current integration/contracts. Improve message hierarchy and feedback without inventing evidence or claiming an operation ran when it did not.

## 8. Animation and Interaction Architecture

### Motion principles

Use balanced, purposeful feedback for controls, sidebar movement, menus, dialogs, card-state changes, chart updates, page transitions where compatible, and loading/submission states. Motion must not delay actions, obscure risk indicators, or distract from investigation.

### Implementation strategy

Inspect existing dependencies first. Prefer CSS transitions/keyframes for simple effects; reuse an existing library where appropriate. Add a new animation dependency only if a clear need justifies maintenance and performance cost. Prefer simple opacity/transforms when suitable. Use chart library capabilities rather than replacing a library solely for decoration.

### Reduced motion

Respect the system/browser reduced-motion preference. Remove or minimize non-essential movement, preserve final states and essential feedback, and avoid relying on animation alone to communicate status changes. A separate in-app motion setting is optional and not required unless approved later.

## 9. APIs and Data Boundaries

### API compatibility

Preserve verified endpoint paths, methods, request fields, validation, response schemas, error structures, authentication/authorization, and model interfaces. A contract change requires explicit review, documentation, and tests.

### Presentation data

UI components may format values for display but must not redefine authoritative transaction/model schemas. Do not create duplicate sources of truth for transaction state.

### Research integration

Do not recalculate research metrics independently, change datasets/splits, fabricate explanations, present demo data as empirical outputs, or claim an unavailable experiment completed. Show model outputs only when supplied by a verified service or artifact.

## 10. Data Models and Semantic Types

Identify existing authoritative types for transactions, analysis/scoring results, investigation statuses, analytics metrics, health results, AI messages, and experiment results. Presentation-specific types should derive from or adapt authoritative schemas rather than duplicate them. Exact fields must be based on repository evidence, not guessed.

## 11. Security and Privacy

- Preserve existing access and security boundaries.
- Keep secrets and privileged operations out of client-side code.
- Avoid unnecessary logging or collection of transaction data.
- Render untrusted transaction and AI content safely.
- Keep privileged operations on the appropriate server boundary.
- Preserve validation and authorization checks.
- Review any third-party service that could receive transaction data.

## 12. Responsive and Accessibility Architecture

Require semantic page structure, meaningful headings, keyboard-operable controls, visible/unobscured focus, accessible names, proper form labels, theme-aware contrast, statuses not conveyed by color alone, accessible dialog/drawer behavior, reduced-motion support, readable charts with appropriate textual context, and no unintended horizontal overflow.

Automated accessibility checks must be supplemented by manual keyboard and responsive testing.

## 13. Performance and Reliability

Record a repeatable baseline before major changes. Avoid unnecessary dependencies/client JavaScript, unnecessary repeated rendering, expensive motion effects, avoidable layout shifts, and regressions in route navigation. Handle missing data and service failures clearly. Set numerical budgets only after the environment and baseline are known.

## 14. Coding Conventions

- Follow verified repository conventions unless a documented reason supports a change.
- Keep TypeScript safety and lint rules.
- Use actual installed dependencies and package scripts.
- Prefer reusable components and centralized tokens.
- Keep presentation apart from model/service behavior.
- Add tests for affected critical behavior.
- Avoid unrelated refactoring.
- Document dependencies and architecture changes.
- Do not remove or weaken tests to make the build pass.
- Record actual commands and outcomes.

## 15. Verification Strategy

### Stage A — Baseline audit
Inspect routes, layouts, dependencies, theme handling, components, service boundaries, tests, and failures. **Exit:** current implementation and protected interfaces are documented.

### Stage B — Design validation
Confirm tokens, typography, sidebar behavior, theme persistence, motion rules, breakpoints, and component patterns. **Exit:** decisions are specific enough to implement.

### Stage C — Incremental changes
Implement shared foundations before page refinements; test workflows after relevant changes. **Exit:** each phase meets acceptance criteria.

### Stage D — Regression validation
Run actual configured type/lint/unit/integration/e2e/build checks; test both themes, representative viewports, keyboard/reduced motion, protected interfaces, and performance against baseline. **Exit:** critical defects are resolved or explicitly documented and approved.

## 16. Decisions and Unknowns

**Approved:** left sidebar; dark/light themes; theme toggle and persistence; all verified pages in scope; balanced motion; reduced-motion support; protected APIs/model/research behavior.

**Proposed:** semantic CSS variables, root theme attribute, existing Next.js/Tailwind architecture where verified, CSS-native motion for simple interactions, and separate presentation/application/ML responsibilities.

**Unknown pending audit:** installed versions, routes/layout structure, existing themes, chart/icon/animation libraries, current API/model contracts, test commands/coverage, exact tokens, breakpoints, sidebar dimensions, performance baseline.

## 17. Technical References

Use documentation corresponding to the versions actually installed:

- Next.js App Router: https://nextjs.org/docs/app
- Next.js layouts and pages: https://nextjs.org/docs/app/getting-started/layouts-and-pages
- Tailwind theme variables: https://tailwindcss.com/docs/theme
- Tailwind dark mode: https://tailwindcss.com/docs/dark-mode
- React Hooks: https://react.dev/reference/react/hooks
- W3C animation from interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
- AI SDK: https://ai-sdk.dev/docs/getting-started

Check version-specific guidance before implementation. These references do not prove that the current repository already follows the practices described.

## 18. Status

Architecture direction is defined, including navigation, themes, components, API protections, accessibility, and performance principles. Repository-specific details and exact visual tokens remain pending verification.

**No implementation has started.** Begin only after the repository audit, requirements review, and phase-gated implementation plan are satisfied.
