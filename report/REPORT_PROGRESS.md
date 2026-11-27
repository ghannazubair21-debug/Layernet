# REPORT_PROGRESS

Last updated: 2026-11-23. **Directive v2** (full report reconstruction with strict template compliance) replaces the earlier "Chapters 1–4 only" pass.

## Current deliverable
`output/LayerNet_FYP_Report_v2.docx`, `.doc` and `.pdf`: 75 pages and 13,368 words. The raw build is `output/build/LayerNet_FYP_Report_build.docx`. The QA result is in `REPORT_FINAL_QA.md`.

The older `output/LayerNet_FYP_Report_Chapters_1-4.*` files are superseded. They were not overwritten because the `.docx` is open in Word. `output/LayerNet_FYP_Report_Ch1-4.docx` is a stale raw build that Word hangs on; do not build to that path.

## Phase status (directive v2)
| Phase | Status | Evidence |
|---|---|---|
| 1 Inventory | ✅ | Below |
| 2 Template analysis | ✅ | `REPORT_FORMAT_SPEC.md` §9–10 |
| 3 Sample analysis | ✅ | `REPORT_FORMAT_SPEC.md` §1–6, `REPORT_STRUCTURE_AND_WORDCOUNT.md` |
| 4 Source/doc audit | ✅ | `LAYERNET_SOURCE_AUDIT.md` |
| 5 Spec, facts, inventory | ✅ | `LAYERNET_FACT_VERIFICATION.md`, `LAYERNET_IMPLEMENTATION_INVENTORY.md` |
| 6 Length blueprint | ✅ applied (default; not explicitly approved) | `REPORT_LENGTH_BLUEPRINT.md` |
| 7 Diagram and screenshot plans | ✅ | `REPORT_DIAGRAM_PLAN.md`, `REPORT_SCREENSHOT_PLAN.md` |
| 8 Literature and references | ✅ 39 verified | `REPORT_REFERENCE_REGISTER.md` |
| 9 Drafting (front matter, Ch 1–4 expansion, appendices) | ✅ | `source/*.txt` |
| 10–12 Assembly and export | ✅ | `output/LayerNet_FYP_Report_v2.*` |
| 13 QA | ✅ with the open items listed in REPORT_FINAL_QA | `REPORT_FINAL_QA.md` |
| Traceability | ✅ | `REPORT_REQUIREMENT_TRACEABILITY.md`, Appendix I |

## Decisions
1. **Title**: the proposal title, as chosen by the user: "LayerNet 2.0 Multi-Layered Transformer-Based Fraud Detection, Analysis & Investigation Intelligence System". §1.5 explains how the registered title relates to what was built.
2. **Campus**: default; no answer was given. "[MULTAN CAMPUS]" is a highlighted placeholder, following the template.
3. **Scope**: default. Front matter, Ch 1–4, Appendices I–IV and References. Ch 5–7 are **not written**.
4. **List of Abbreviations**: default. Kept, although the template does not have one; it can be deleted without affecting anything else.
5. **Length blueprint**: applied as drafted.
6. **Names, roll numbers, supervisor, committee, degree, department, month**: default. Highlighted placeholders.
7. **AI screenshot**: default. Panel only, with no live Gemini request.

## Still needed from the group or department (cannot be produced by us)
- Official Turnitin report and similarity values.
- Signatures and committee names.
- Student and supervisor details. The Acknowledgment is a highlighted draft to finalize.

## Exact next step (on "CONTINUE")
1. If the group supplies names or details, change the `STUDENTS`, `SUPERVISOR` and `DEGREE` constants and the placeholders in `tools/build_report.py`.
2. If Chapters 5–7 are requested, add a `source/chapters_5_7.txt` source and plan it in `REPORT_LENGTH_BLUEPRINT.md`.
3. Then rebuild:
   - `python tools\build_report.py . output\build\LayerNet_FYP_Report_build.docx`
   - `tools\finalize_with_word.ps1 -InDocx <abs>\output\build\LayerNet_FYP_Report_build.docx -OutBase <abs>\output\LayerNet_FYP_Report_v2`
4. Regenerate the reference register: `python tools
egen_register.py .`

## File inventory
| File | Purpose | Analysed |
|---|---|---|
| `Downloads/Final Report Format.pdf` | NUML template (format authority) | ✅ |
| `Downloads/COMPLETE 40^1 PROJECT REPORT.pdf` / `.docx` | Sample report | ✅ |
| `Downloads/LayerNet_2.0_Professional_FYP_Master_Proposal.docx` | Proposal (title, planned layers) | ✅ |
| `Downloads/LayerNet_FYP_Master_Proposal_Roadmap_v2.docx` | Roadmap | ✅ |
| `Downloads/LayerNet_FYP_Chapters_1-4_Explained_Guide.docx` | Study guide | ✅ |
| `Downloads/LayerNet_Research_Documentation.zip`, `LayerNet_Project_Documentation.zip`, `LayerNet_Project_Documents_Download.zip` | Historical docs | ✅ |
| Repo `layernet-consolidation@ca7d595` | Source of truth | ✅ |
| Turnitin report | — | ❌ not supplied |

## v3 (2026-11-24): shortened to 50 pages
The group edited their copy at `Downloads/LayerNet_FYP_Report_v2.docx`, filling in names and the committee. That copy is now the authority for the starting pages, which are kept unchanged. To rebuild:
`toolsuild_v3.ps1 -Py <rvenv python> -UserDocx <copy of the group's edited docx>`
The script builds the report, splices in the group's starting pages with `splice_front.py`, and finalizes it in Word.
- The long sources were kept as `source/*.v2-long.txt`.
- The audit and the list of removed items are in `REPORT_AUDIT_v3.md`.
- Proofing can be repeated with `tools\proof_check.ps1`.
