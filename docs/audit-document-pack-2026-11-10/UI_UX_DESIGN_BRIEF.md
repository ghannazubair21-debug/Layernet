# LayerNet UI/UX Design Brief

**Current interface baseline:** Rose Quartz redesign at commit ca7d595cfd19fe307f7c5fc5e479c101931748e6. This document records the current system first and then proposes improvements. It does not authorize a redesign.

## 1. Product UI direction

LayerNet uses a professional financial-intelligence workspace with an editorial fintech tone. The desktop shell pairs a dark plum navigation rail with a pale rose canvas. The hierarchy combines result surfaces, compact metrics, data-oriented typography and restrained motion.

## 2. Design principles

1. Label every score by method and meaning.
2. Place evidence contributions next to the score.
3. Keep source, provenance and uncertainty visible.
4. Treat risk as investigation priority, not confirmed fraud.
5. Preserve keyboard use, visible focus, responsive layout and reduced motion.
6. Reuse semantic tokens and existing components; avoid unverified aesthetic rewrites.
7. Separate research benchmark output from local transaction analysis.

## 3. Visual identity and color system

Rose Quartz tokens are defined in app/globals.css. Brand colors remain separate from semantic risk colors.

| Token | Light | Dark | Use |
|---|---|---|---|
| Page background | #FBF7F9 | #151017 | Main canvas |
| Surface | #FFFFFF | #211923 | Cards and panels |
| Strong surface | #F5EAF0 | #2B202B | Secondary surfaces |
| Primary | #A94F77 | #D98BAE | Main action and links |
| Primary hover | #913F65 | #E6A6C1 | Hover/active |
| Text | #2B2028 | #F7EFF4 | Main foreground |
| Muted text | #6E5B66 | #C3AEBB | Supporting content |
| Sidebar | #281B27 | #100B11 | Navigation chassis |
| Success | #27845A | #55C98A | Positive/system state |
| Warning | #A66B16 | #F0BB55 | Caution |
| Danger | #C43D52 | #F17D8D | High-priority/destructive state |
| Info | #426DB5 | #83A9ED | Informational state |

Risk-band thresholds are an application rule, not a statistical calibration. Color must not imply the evidence is more certain than it is.

## 4. Typography, spacing and layout

- Geist is the primary sans family; Geist Mono is used for data values; Fraunces provides editorial display emphasis. They are loaded by next/font/google in app/layout.tsx.
- Tailwind utilities provide responsive spacing/layout; CSS variables provide shared visual tokens and a 0.625rem base radius.
- Cards use subtle elevation and rounded surfaces; values should retain alignment and readable units.
- Desktop uses a persistent left sidebar and flexible main content.
- Tablet/mobile classes adapt layouts; this audit did not perform live viewport/accessibility testing.

## 5. Component and navigation architecture

components/AppShell.tsx hosts global navigation and layout. components/ui/ contains reusable controls. Pages compose forms, score cards, charts, empty/loading states, tables and dialogs. Keep form state controlled and errors associated with labeled controls; announce async changes to assistive technology.

Primary destinations are Dashboard, Analysis, Analytics, Health, History, Settings and Benchmark. /micro-interactions and /playground are utility/development areas, not core fraud capabilities.

## 6. Page specifications

| Page | Current interface / behavior | Status and UX notes |
|---|---|---|
| Dashboard | Time-range control, summaries and recent heuristic trends from browser history | IMPLEMENTED; label as local rule outputs, not fraud rates |
| Analysis | Controlled transaction form, result, score, risk band, decision, factors and recommendation | IMPLEMENTED; keep score meaning/limitations near result |
| Analytics | Charts and category breakdowns from saved heuristic records | IMPLEMENTED; no model accuracy claim |
| Health | Browser storage, key-configured state, benchmark runtime/model availability | IMPLEMENTED; availability is not quality or production health |
| History | Search/filter/sort table, transaction detail dialog and clear action | IMPLEMENTED; local-only; dialog has source focus handling |
| Settings | Light/Dark/System and local history controls, Gemini model/config state | IMPLEMENTED; secret is server-side |
| Benchmark | CSV upload, ULB validation, output/metric tables | IMPLEMENTED as research-only; state schema, label use, size cap and uncalibrated scores |
| Landing | Product entry screen | IMPLEMENTED |
| Micro-interactions / Playground | Utility demonstrations and UI experimentation | IMPLEMENTED routes; not core workflow |

## 7. Forms and interactions

- Controlled state and field-level error feedback are used in transaction/settings flows.
- Save is separate from analyze; history changes only on user save.
- Theme preference persists under layernet-settings.
- Detail dialog should remain keyboard-operable, support Escape, trap focus and restore prior focus; current history dialog source implements these behaviors.
- Clear-history action includes confirmation/status feedback.
- Benchmark selection reads file text client-side then sends one server request. Keep progress, validation and timeout errors visible.
- AI chat streams. Label generated text as advisory and explain provider failure without exposing secrets.

## 8. Risk and status presentation

Place a label such as “Heuristic priority score · not a fraud probability” next to the score. Show contributing input factors and signed point changes, not only a color badge. Keep analyst decisions separate from risk band. Benchmark scores are uncalibrated and specific to the ULB dataset; do not imply they scored the submitted application transaction.

## 9. Loading, empty and error states

Current pages include loading/empty/error handling and tests cover selected failure paths. Continue to use:

- Skeletons or concise progress status for async page data.
- Clear first-use instructions for empty history.
- Inline field errors and aria-invalid for invalid controls.
- Accessible status/live feedback for save, clear, upload and streamed assistant state.
- Retry guidance without exposing stack traces or secrets.
- No fabricated charts or synthetic fraud activity in empty states.

AI chat accessibility is a follow-up concern: source showed listitem semantics under a live region without an enclosing list role. Confirm with browser/screen reader before treating it as a reproduced defect.

## 10. Responsive behavior

- **Desktop:** persistent navigation, multi-column dashboard/analytics, wide tables/cards.
- **Tablet:** reduce columns and chart density without losing score hierarchy or actions.
- **Mobile:** use a labeled navigation drawer/compact control; stack forms and cards; fit dialogs to viewport; prevent horizontal overflow.

Responsive classes exist and repository screenshots include mobile examples. Fresh Playwright viewport testing was not possible because a usable browser executable was unavailable. Mobile quality is source-supported, not freshly interaction-verified.

## 11. Accessibility

### Verified in source

- Semantic labels and visible focus styling.
- Reduced-motion media query disables major animations.
- History dialog has dialog/modal semantics, Escape handling, focus trap and restoration.
- Theme settings expose named options.

### Risks / follow-up

- Audit chart descriptions, keyboard interactions and accessible names in a browser.
- Test AI message semantics with screen readers.
- Check contrast of muted text and semantic tints in both themes.
- Verify mobile drawer focus lifecycle and name.
- Verify async status announcements and association of field errors.
- Do not infer accessibility conformance from TypeScript/component tests alone.

## 12. Usability concerns and improvements

1. **High impact:** keep heuristic score semantics visible in dashboard, history, analytics and exports.
2. **High impact:** distinguish Health artifact-existence checks from model integrity/readiness.
3. **Medium:** bound browser history and communicate local-only retention and browser-profile scope.
4. **Medium:** show benchmark schema and label policy before upload; explain genuine ULB features are required.
5. **Medium:** align configuration help with GOOGLE_GENERATIVE_AI_API_KEY; .env.example currently names a different variable.
6. **Medium:** explain that explicit chat messages are sent to Google.
7. **Low pending verification:** verify chat live-region/list structure and chart alternatives in a real browser.

## 13. Proposed UX work — PLANNED

After security and backend decisions, add provenance panels, case workflow state, an evidence timeline and accessible report review. These depend on data/API contracts and do not exist in current screens.

## Evidence references

app/globals.css (tokens, focus and reduced motion); app/layout.tsx (fonts/theme bootstrap); components/AppShell.tsx; components/ThemeProvider.tsx; pages under app/; lib/fraudAnalysis.ts; app/history/page.tsx; app/settings/page.tsx; app/benchmark/page.tsx.
