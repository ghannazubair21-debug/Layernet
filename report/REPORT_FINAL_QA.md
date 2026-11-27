# REPORT_FINAL_QA (directive v2, executed 2026-11-23)

Final build: `output/LayerNet_FYP_Report_v2.{docx,doc,pdf}`. Word counts 75 pages and 13,368 words. Raw build: `output/build/LayerNet_FYP_Report_build.docx` (log: `.build-log.txt`). The evidence for this checklist is the build log, the Word finalize output, a text scan of the PDF, and contact sheets of all 75 pages, each inspected visually. The older `LayerNet_FYP_Report_Chapters_1-4.*` files are superseded but were left in place because the `.docx` is open in Word.

## Structure (against `Final Report Format.pdf`, see REPORT_FORMAT_SPEC §9)
- [x] Order: Cover → Abstract → Certificate → Declaration → Plagiarism Certificate → Turnitin Originality Report → Acknowledgment → Table of Contents → List of Figures → List of Tables → List of Abbreviations → Chapters 1–4 → Appendices I–IV → References.
- [x] The List of Abbreviations is not in the template; it is kept as an addition (decision 4 in REPORT_PROGRESS).
- [x] The cover follows the template layout: title in caps at 18 pt; NUML crest taken from the template; students as "Name (Roll No)"; "Supervised By"; the submission statement; university and campus; month and year.
- [x] The Certificate has the Final Approval text and a COMMITTEE block with four signature rows. The Declaration uses the template's two sentences. The plagiarism page has a Turnitin block. The Turnitin page has a SOURCES block.
- [x] The TOC has a "Chapter / Page" header and the lists have "Figure|Table / Caption / Page" headers. All three are Word fields, updated by Word.
- [x] Appendices come before References, as in the template.
## Formatting
- [x] US Letter, 1 in margins, page number in the footer. The cover is unnumbered; roman ii–xiii; Arabic from 1 at the Chapter 1 opener (references end on p. 62).
- [x] Chapter openers: "CHAPTER n" at 18 pt and title at 22 pt, Times New Roman bold. Front-page headings are 16 pt bold caps.
- [x] Body text: TNR 12, justified, 1.15 spacing. Table header rows repeat and rows do not split. No blank pages were seen.
- [x] PDF text scan: no "Error!", "not found" or "??" strings.
## Integrity (directive §integrity)
- [x] No signatures, stamps, approvals, committee names or Turnitin values were produced. Those fields are blank lines or yellow placeholders. The Turnitin page states that no similarity check has been run.
- [x] Student, supervisor, roll-number, degree, campus, department and month fields are yellow placeholders.
- [x] The Acknowledgment is a highlighted draft for the group to edit.
- [x] The live score is always described as the rules baseline (uncalibrated priority). The Transformer and the trained models are described as offline or benchmark-only.
- [x] The PaySim ablation is reported with its interval [−0.0138, 0.1100] and PARTIAL status. The planned layers (mobile app, roles, Transformer in the app) are named as not implemented (§1.5 "Relation to the registered project title"; Table 1.2).
## Diagrams and screenshots
- [x] 27 figures: 17 diagrams and 10 screenshots. The use case and deployment diagrams are hand-drawn UML. The scoring flowchart and the AI chat sequence diagram are new. All are legible on the contact sheets.
- [x] The screenshots are genuine captures of the running app. The AI panel shot shows no request (no key value is visible). The benchmark shot uses real ULB rows, and the page labels them as uploaded-rows-only metrics.
- [x] Every figure and table is referenced in the text. Figure captions are below the figure and table captions are above the table.
## References
- [x] 39 IEEE references, numbered by first citation, with `unused=[]`. REPORT_REFERENCE_REGISTER is regenerated from the build. The 10 new entries were verified (Crossref, arXiv, PMLR, NeurIPS).
- [x] Fixed during QA: the nested quotes in Ribeiro et al. [24].
## Traceability
- [x] Appendix I (Table A.1) maps FR-01…12, RFR-01…07 and the NFRs to existing files and tests. REPORT_REQUIREMENT_TRACEABILITY.md holds the full version.
## Not done / not verified
- [ ] Chapters 5–7 (implementation, testing, conclusion) are not written. This release covers Chapters 1–4 only.
- [ ] Python ML tests (`ml/tests`, 11 files) were not re-run. The report says so and claims no pass.
- [ ] Turnitin report, similarity values, signatures and committee names are pending from the department.
- [ ] The `.doc` file was tested only in Word 2013.
## Length
- [x] REPORT_LENGTH_BLUEPRINT targets about 75–80 pages and about 12,800 words for front matter, Ch 1–4 and appendices. The build has 75 pages (13 front-matter and 62 numbered) and 13,368 words, so it is at the lower edge of the page range.
