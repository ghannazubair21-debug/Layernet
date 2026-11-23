# LayerNet — Project Brief Addendum

**Document:** `PROJECT_BRIEF.md`\
**Revision:** 1.1\
**Change:** Frontend redesign scope approved\
**Implementation status:** Not started; requirements and design decisions must be finalized first

## 1. Updated Project Overview

LayerNet is a research-oriented fraud detection, analysis, and investigation intelligence system with a modern, responsive web interface.

The project has two coordinated objectives:

1. **Research objective:** Investigate whether justified combinations of traditional fraud detection, behavioral intelligence, and suitable temporal modeling improve fraud detection and evidence-grounded explanations.
2. **Product objective:** Deliver a consistent, interactive, accessible, and professional user experience across the existing LayerNet application.

The product redesign must not be treated as evidence of research novelty or model effectiveness.

## 2. Approved Frontend Direction

### Theme system

- Support both dark and light themes.
- Provide a clear theme toggle.
- Use consistent design tokens for backgrounds, surfaces, text, borders, charts, forms, focus states, and semantic risk statuses.
- Ensure both themes maintain readable text, accessible contrast, and distinguishable risk states.
- Avoid introducing incompatible colors or independent styling systems on individual pages.

The exact color palette, typography, component styling, and persistence behavior will be documented in the technical design and requirements before implementation.

### Animation and interaction

Use balanced premium animations, including appropriate:

- Card entrances and hover/focus interactions.
- Chart transitions and data-state changes.
- Page transitions where compatible with the existing routing architecture.
- Button, form, filter, tab, menu, and toggle feedback.
- Loading skeletons and progress indicators.
- Success, warning, error, empty, and disabled states.

Motion must communicate state or improve usability. Decorative effects must not obstruct analysis, delay essential actions, or make financial risk indicators harder to interpret.

Respect reduced-motion preferences. Provide usable fallbacks where animation is reduced or unavailable.

### Redesign scope

Redesign all existing application areas as one coherent product:

- Dashboard
- Transaction Analysis
- Analytics
- System Health
- Transaction History
- Settings
- AI Chat interface

Shared navigation, page layouts, typography, design tokens, cards, forms, tables, charts, status indicators, and feedback patterns should be consistent.

The requirements must first establish the actual current route and component inventory. No route or existing capability should be silently removed during redesign.

## 3. Updated Product Goals

- Create a professional fraud-intelligence interface across all existing pages.
- Provide both dark and light themes with a usable toggle.
- Deliver purposeful, balanced animations and responsive micro-interactions.
- Improve information hierarchy, readability, navigation, and transaction review.
- Support desktop, tablet, and mobile layouts.
- Maintain accessibility, including keyboard navigation, visible focus, appropriate contrast, semantic controls, and reduced-motion support.
- Preserve fraud-scoring behavior, APIs, research contracts, data integrity, and investigation workflows.
- Avoid regressions in reliability, performance, automated tests, and research reproducibility.

## 4. Updated Scope

### In scope

- Full visual redesign of all existing pages.
- Shared design system and reusable UI components.
- Dark/light theme support and toggle.
- Balanced animation and interaction system.
- Responsive layouts and accessible interactions.
- Improved chart, table, filter, form, loading, empty, error, and success states.
- Visual regression and interaction testing where appropriate.
- Performance checks before and after significant changes.
- Documentation of design decisions and acceptance criteria.

### Explicitly protected

Unless separately approved, the redesign must not change:

- Fraud-scoring formulas or model behavior.
- Model interfaces, experiment contracts, feature schemas, or dataset contracts.
- Existing API request/response contracts.
- Transaction persistence and investigation status semantics.
- Research evaluation procedures or reported research results.
- Security controls, secrets handling, or access boundaries.

Any necessary functional change must be identified, justified, reviewed, and tested separately rather than hidden inside a visual redesign.

## 5. Updated Product Success Criteria

The redesign is accepted only when:

1. Every existing page has been reviewed and updated consistently.
2. Both themes work across shared components, pages, charts, forms, dialogs, and status indicators.
3. Theme switching does not break layout or leave incompatible text and surface colors.
4. Animations and interactions provide appropriate feedback without obstructing essential workflows.
5. Reduced-motion preferences are respected.
6. Core workflows remain usable on supported mobile, tablet, and desktop layouts.
7. Keyboard operation, focus visibility, and relevant accessibility checks pass.
8. Existing fraud-scoring, API, research-contract, and data-integrity behavior remains intact.
9. Relevant automated tests, type checks, lint checks, and production builds pass in the verified environment.
10. Performance is measured and compared against a recorded baseline; regressions are investigated rather than ignored.
11. No visual demonstration or mock chart is presented as real model output.

Numerical visual-performance targets will be defined after the current production baseline and test environment are verified. No unmeasured performance improvement will be claimed.

## 6. Updated Delivery Order

1. Audit the current repository, routes, components, design tokens, tests, and performance baseline.
2. Finalize functional and non-functional requirements in `REQUIREMENTS.md`.
3. Document architecture, theme implementation, animation strategy, and protected interfaces in `TECHNICAL_DESIGN.md`.
4. Record verified technical facts, official references, assumptions, and unknowns in `SOURCE_OF_TRUTH.md`.
5. Create an implementation plan with phase gates, test commands, acceptance criteria, and rollback conditions in `IMPLEMENTATION_PLAN.md`.
6. Begin implementation only after the relevant design and requirements decisions are approved.\
   \
   **Navigation Layout — Approved Requirement**

   LayerNet will use a left-side vertical sidebar as its primary navigation on desktop and tablet layouts where space permits. A top horizontal navigation bar must not replace the primary sidebar.

   The sidebar will provide access to all existing application routes, clearly identify the active route, support accessible expanded and collapsed states where appropriate, and remain visually consistent in dark and light themes.

   On narrow mobile screens, the sidebar will adapt to an accessible drawer or equivalent compact navigation pattern. Navigation must remain keyboard-operable, responsive, and compatible with reduced-motion preferences.

   Any existing top-bar controls that remain necessary, such as page-specific actions, notifications, or the theme toggle, may be placed in a compact contextual header. This does not change the left sidebar as the primary navigation.

   **Acceptance criteria:** All existing routes remain accessible; active navigation is distinguishable; collapsed and mobile navigation work correctly; theme switching does not break the sidebar; and no existing application or research functionality is lost.

**Status:** Frontend redesign scope and interaction direction approved. Implementation has not started.
