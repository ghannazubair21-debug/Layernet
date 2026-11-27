# REPORT_STRUCTURE_AND_WORDCOUNT — blueprint (DRAFT, pending approval)

## 1. Sample report length analysis

Words are counted from `pdftotext` per physical page (headers and page numbers included, so counts are approximate). The DOCX reports 12,006 words for the whole file, including front matter.

| Component | Sample pages | Sample words (approx.) | Notes |
|---|---:|---:|---|
| Front matter (i–xiii) | 13 | 1,506 | Abstract 352 w |
| Ch 1 Introduction | 5 (incl. opener) | 1,154 | 0 figures, 0 tables |
| Ch 2 Background | 4 | 649 | 1 table; 5 studies (unverifiable) |
| Ch 3 Requirements | 8 | 2,275 | 2 tables |
| Ch 4 Modelling | 16 | 3,205 | ~12 diagrams, 2 tables |
| Ch 5 Testing | 6 | 554 | 3 screenshots, 4 tables |
| Ch 6 Conclusion | 3 | 398 | — |
| References | 2 | 214 | 12 entries |
| **Total** | **57** | **≈ 9,950** | Ch 1–4 = 33 pp / ≈ 7,280 w |

The sample's Ch 2 (649 words, 5 studies) is too thin for LayerNet's research question. NUML Appendix H also requires domain constructs, existing studies and a comparison, so Ch 2 is deliberately larger.

## 2. LayerNet targets (Chapters 1–4 + front/back matter)

| Component | Target pages | Target words | Figures | Tables |
|---|---:|---:|---:|---:|
| Front matter (cover → abbreviations) | 13–14 | ~1,100 | 0 | 0 |
| Ch 1 Introduction | 7 | 1,900 | 1 (process model) | 3 |
| Ch 2 Background and Existing Work | 11 | 3,200 | 2 | 4 |
| Ch 3 Requirements Specification | 12 | 2,900 | 1 (use case) | 8 |
| Ch 4 System Modelling | 20 | 3,000 | 12–14 (diagrams + 6 screenshots) | 4 |
| References | 2–3 | — (~25–35 entries) | — | — |
| Appendices (data dictionary, evidence index) | 3–4 | ~600 | 0 | 2 |
| **Total** | **≈ 68–71** | **≈ 12,700** | **16–18** | **21** |

Ch 1–4 then come to ≈ 50 pages, against the sample's 33. The difference comes from the larger literature chapter, the NUML-mandated sections the sample skipped (interfaces, use cases, feasibility, 4+1 views, ERD), and the diagrams. It is **not padding**. If the supervisor sets a page cap, the first cuts are Ch 2 depth and screenshot count.

## 3. Section-level targets

### Chapter 1 — Introduction (1,900 w)
| § | Title | Words | Items |
|---|---|---:|---|
| 1.1 | Introduction | 350 | — |
| 1.2 | Motivation | 250 | — |
| 1.3 | Problem Statement | 200 | — |
| 1.4 | Goals and Objectives | 250 | Table 1.1 Objectives and evidence |
| 1.5 | Scope of Study | 300 | Table 1.2 In/out of scope |
| 1.6 | Process Model (iterative and incremental) | 300 | Figure 1.1, Table 1.3 Development phases |
| 1.7 | Nature of the Project | 150 | — |
| 1.8 | Organization of the Report | 100 | — |

### Chapter 2 — Background and Existing Work (3,200 w)
| § | Title | Words | Items |
|---|---|---:|---|
| 2.1 | Introduction | 150 | — |
| 2.2 | Important Constructs (2.2.1 Financial transactions · 2.2.2 Fraud detection · 2.2.3 Transaction features · 2.2.4 Historical recipient behaviour · 2.2.5 Class imbalance · 2.2.6 ML approaches · 2.2.7 Temporal leakage · 2.2.8 Evaluation metrics) | 1,500 | Figure 2.1 Fraud-detection approach taxonomy, Figure 2.2 As-of history window, Table 2.1 Concepts, Table 2.2 ML approaches |
| 2.3 | Existing Studies/Systems (8–12 verified papers + datasets) | 1,100 | — |
| 2.4 | Comparison of Existing Systems + research gap | 300 | Table 2.3 Literature comparison, Table 2.4 Gap → contribution |
| 2.5 | Summary | 150 | — |

### Chapter 3 — Requirements Specification (2,900 w)
| § | Title | Words | Items |
|---|---|---:|---|
| 3.1 | Introduction | 120 | — |
| 3.2 | Interface Requirements (3.2.1 HW, 3.2.2 SW) | 400 | Table 3.1, Table 3.2 |
| 3.3 | Functional Requirements (app FR + research RFR) | 450 | Table 3.3, Table 3.4 |
| 3.4 | Use Case Model | 200 | Figure 3.1 Use case diagram |
| 3.5 | Use Cases (6 detailed: Analyse Transaction, View Dashboard, Review History, View Analytics, Run Benchmark Replay, Manage Settings; + Ask Assistant short) | 600 | Tables 3.5–3.10 (fully dressed) |
| 3.6 | Non-Functional (Performance, Reliability, Security, Consistency, Usability/Accessibility) | 450 | Table 3.11 |
| 3.7 | Resource Requirements (equipment, funds, human effort) | 250 | Table 3.12 |
| 3.8 | Database Requirements (browser localStorage records + research datasets) | 250 | Table 3.13 |
| 3.9 | Project Feasibility (technical, operational, legal and ethical) | 300 | — |
| 3.10 | Summary | 100 | — |

The table count in Ch 3 is high. Consider merging the 6 use-case tables into one table per use case only for the 3 primary use cases, and summarising the rest in one table.

### Chapter 4 — System Modelling (3,000 w)
| § | Title | Words | Items |
|---|---|---:|---|
| 4.1 | Introduction | 120 | — |
| 4.2 | System Design | 450 | Fig 4.1 System context, Fig 4.2 Layered architecture, Fig 4.3 Research pipeline (offline), Table 4.1 Components |
| 4.3 | Design Approach (top-down, with reasons) | 200 | — |
| 4.4 | Interface Design + 4.4.1 High Fidelity Prototype | 550 | Figs 4.4–4.9 real screenshots (Dashboard, Analysis result, History + drawer, Analytics, Benchmark results, Settings or Health), Table 4.2 Screens ↔ use cases |
| 4.5 | 4+1 View Model: 4.5.1 Logical (class), 4.5.2 Process (activity, state, sequence), 4.5.3 Development (component), 4.5.4 Physical (deployment), 4.5.5 Scenario | 1,300 | Figs 4.10–4.16, Table 4.3 Views summary |
| 4.6 | Entity Relationship Diagram (logical model of stored records) | 250 | Fig 4.17, Table 4.4 Entities |
| 4.7 | Summary | 130 | — |
