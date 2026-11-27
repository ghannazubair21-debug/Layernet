# REPORT_DIAGRAM_PLAN (final, 2026-11-23)

Sources are in `report/diagrams/src/`; renders are in `report/diagrams/out/`. Most diagrams are Mermaid 11.4.1, rendered in headless Chromium at 3× scale. The use case and deployment diagrams were drawn as hand-written UML SVG, because Mermaid cannot draw include arrows or 3-D nodes correctly. Every diagram was checked against the code listed in its source column, and every rendered page was inspected in the final PDF.

| Final fig | File | Diagram | § | Source of truth | Status |
|---|---|---|---|---|---|
| 1.1 | fig1_1_process | Iterative and incremental process model | 1.6 | git history | Done |
| 2.1 | fig2_1_taxonomy | Fraud-detection approach taxonomy | 2.2.2 | literature | Done |
| 2.2 | fig2_2_asof | As-of recipient-history window | 2.2.4 | `ml/src/layernet_ml/paysim_*` | Done |
| 3.1 | fig3_1_usecase.svg | UML use case diagram, with «include» | 3.4 | app routes | Done (hand-drawn UML) |
| 4.1 | fig4_1_context | System context | 4.2 | `app/api/*`, `lib/*` | Done |
| 4.2 | fig4_2_layers | Layered architecture | 4.2 | code | Done |
| 4.3 | fig4_3_research | Offline research pipeline (ULB, PaySim) | 4.2 | `ml/src`, manifests | Done |
| 4.12 | fig4_10_class | Class diagram (simplified; noted in the text) | 4.5.1 | `lib/types.ts`, services | Done |
| 4.13 | fig4_11_activity | Activity: analyse transaction | 4.5.2 | `app/analysis/page.tsx` | Done |
| 4.14 | fig4_12_state | State diagram of the Analysis form | 4.5.2 | component state | Done |
| 4.15 | fig4_13_seq_analyse | Sequence: analyse and save | 4.5.2 | code | Done |
| 4.16 | fig4_14_seq_benchmark | Sequence: benchmark replay | 4.5.2 | `app/api/benchmark/route.ts` | Done |
| 4.17 | fig4_15_component | Component diagram | 4.5.3 | repo tree | Done |
| 4.18 | fig4_16_deployment.svg | Deployment diagram (local PC, external Gemini) | 4.5.4 | verified local runtime | Done (hand-drawn UML) |
| 4.19 | fig4_17_erd | Logical data model (browser storage; no DBMS) | 4.6 | `lib/types.ts`, storage keys | Done |

## Candidate additions (directive v2 inventory, 2026-11-23)
| Diagram | § | Evidence | Actual/proposed | Decision |
|---|---|---|---|---|
| Sequence: AI assistant chat | 4.5.2 | `components/AIChat.tsx`, `app/api/chat/route.ts` (streamText, system prompt, 503 without key) | Actual | **Add** |
| DFD level 0/1 (transaction data flow) | 4.2 | Same flows as Figs 4.1 and 4.15 | Actual | Optional. NUML Appendix H does not ask for it; add only if the supervisor expects DFDs (the sample has two) |
| Data preparation pipeline (ULB dedupe → split; PaySim → as-of buckets) | 4.2 | `ml/src/layernet_ml/data.py`, `paysim_*` | Actual (offline) | Partly covered by Fig 4.3; expand it into a separate figure only if Ch 4 needs the depth |
| Fraud-scoring workflow (rules baseline v1 contributions) | 4.5.2 | `lib/fraudAnalysis.ts` | Actual | **Add** (small flowchart: amount → type → channel → hour → clamp → band → decision) |
| System context, architecture, use case, activity, sequence, class, state, component, deployment, ERD | — | — | Actual | Already present (Figs 3.1–4.19) |
| Proposed cloud deployment | 7 / future | none | Proposed | Not drawn. Mentioned as future work only |


## Final figure numbers (v2 build)
1.1 Process model; 2.1 Taxonomy; 2.2 As-of history; 3.1 Use case (UML SVG); 4.1 Context; 4.2 Layers; 4.3 Research pipeline; 4.14 Class; 4.15 Activity; 4.16 Scoring flowchart (new); 4.17 State; 4.18 Sequence analyse; 4.19 Sequence benchmark; 4.20 Sequence AI chat (new); 4.21 Component; 4.22 Deployment (UML SVG); 4.23 Logical data model. Both candidate additions were built.
