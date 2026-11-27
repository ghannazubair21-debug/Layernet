# Report audit and v3 changes (2026-11-24)

**Input:** `Downloads/LayerNet_FYP_Report_v2.docx`, the group's edited copy: 56 PDF pages, 27 figures and 28 tables.
**Current output:** `output/LayerNet_FYP_Report_Chapter1-4.{docx,doc,pdf}`. The .docx and .pdf are also in `Downloads/`. The report has **50 A4 pages**, 17 figures, 12 tables and 39 references. The earlier `LayerNet_FYP_Report_v3_A4.*` (47 pages) and `LayerNet_FYP_Report_v3.*` (US Letter) are superseded.

## Chapter 1–4 update (third update, group's instructions)
1. **Chapter 2 replaced with the v2 Chapter 2.** The text was taken from the v2 source. The group's two edits in their v2 Word file ("summarises" → "summarize", in two places) were kept and written grammatically as "summarizes". The UK spellings in that chapter were changed to US spelling to match the rest of the report.
   - **Page limit.** v2's Chapter 2 is 10 A4 pages, which made the report 54 pages. The group chose to shorten Chapter 2 so the report stays within 50 pages:
     - The tables "Key constructs", "Analysis of key studies" and "Research and practice gaps" were removed.
     - The content of the "Machine-learning approaches" table and of the gaps table was turned into prose.
     - The as-of history figure was removed; §2.2.4 already describes it in words.
     - The taxonomy figure was reduced in size.
     - The comparison table, now Table 2.1, keeps 7 rows; the review by Bolton & Hand and the studies by Bahnsen and Carcillo are covered in the text.
   - **Paragraphs.** Short paragraphs were merged, and over-long ones were split, so that every body paragraph has 5–10 lines. No new claims were added.
2. **Headings follow the template list exactly.**
   - Chapter 1: 1.7 is "Nature of the Project: Web Application and Machine Learning", and 1.8 is "Overview/Organization of the Report".
   - Chapter 2: 2.2 is "Explanation of Important Constructs of the Application Domain", and 2.3 is "Existing Studies/Systems".
   - Chapter 3, interfaces and use cases: 3.2.1 is "Hardware Interface Requirements", and 3.2.2 is "Software Interface Requirements". Section 3.5 now has 3.5.1 (UC-01), 3.5.2 (UC-05) and 3.5.3 (the other six use cases).
   - Chapter 3, non-functional requirements: Section 3.6 now has 3.6.1 Performance, 3.6.2 Reliability, 3.6.3 Security, 3.6.4 Consistency, 3.6.5 Usability and Accessibility, and 3.6.6 Maintainability. The NFR table became these subsections.
   - Chapter 3, resources: Section 3.7 covers Equipment (with justification), Funds and Human effort.
   - Chapter 3, feasibility: Section 3.9 has an introduction, followed by 3.9.1 Technical, 3.9.2 Operational and 3.9.3 Legal & Ethical. Economic feasibility moved to Funds in §3.7.
   - Chapter 4: 4.5 is "4+1 View Model of Architecture" with 4.5.1–4.5.4. The scenario view is now part of the §4.5 introduction.
3. **Human effort (§3.7).** The figures come only from the git history: 12 Aug – 23 Nov 2026, about 3.4 months, three members, so at most about ten person-months. Hours were not logged. The work of each individual member is not stated, because no record of it exists.
4. **One font, no body italics.**
   - Everything is Times New Roman: the default font, every style, every run, the theme fonts, the headers and footers, and the TOC entries. Code names were changed from Courier New to Times New Roman.
   - The PDF contains only Times New Roman regular, bold and italic.
   - Italics remain only in two places: the cover lines from the group's own front page, and the journal and conference titles in the IEEE references, where the IEEE style requires them.
5. **Checks.**
   - All 50 pages are A4, and nothing goes past a margin.
   - All 74 body paragraphs are between 5 and 10 lines.
   - Word's proofing shows no new spelling flags. The one grammar flag is the known IEEE reference false positive.
   - No "Error!" or "??" strings remain.

## A4 paper size (second update)
The earlier v3 was on US Letter (8.5 × 11 in). Every page is now **A4 portrait (210 × 297 mm, 595.3 × 841.9 pt)** with 1-inch margins, giving a 6.27-inch text width. A4 is set in three places so it cannot fall back to Letter: `tools/build_report.py`, `tools/splice_front.py` (which also covers the group's front pages) and `tools/finalize_with_word.ps1`.
- **Front pages.** Only the page size changed. The Committee and Group Members tables were 6.5 in wide; they were scaled to the A4 text width. The text was not changed.
- **Tables.** Every body table uses a fixed layout at the A4 text width, so Word cannot widen it past the margin. The column widths of Tables 3.8, 4.1 and A.1 were reset so that no word or file path breaks inside a cell. Every cell word was measured against its column.
- **Page flow.** Table A.1 now fits on a single page, and Chapter 4 ends on its own page. To achieve this, the deployment and ERD diagrams were reduced slightly, to 4.4 in and 4.6 in.
- **Variables.** The variables *R* and *t* in §2.2.3 are now set in italics.
- **Checks on the final PDF.**
  - All 47 pages are A4.
  - No text, table or figure goes past a margin.
  - No page is left nearly empty, apart from the four chapter title pages, which the template requires.
  - No "Error!" or "??" strings remain.
  - All 59 body paragraphs are between 5 and 10 lines.
  - Spelling and grammar flags are only names, code identifiers and the one IEEE reference false positive.

## Rules applied
1. **No changes to the starting pages.** The pages from the cover to the Acknowledgment were copied unchanged from the group's file by `tools/splice_front.py`. A check found the visible text identical, element for element (75 elements, 0 differences). All work starts at the Table of Contents.
2. **Maximum 50 pages.** The PDF now has 47 A4 pages: 12 front pages, then Chapters 1–4, the appendix and the references, which run to p. 35.
3. **Paragraphs of 5–10 lines.** Word counted the lines of every body paragraph: all 59 are between 5 and 10 lines on A4. References and table cells are not paragraphs and were excluded.
4. **No unnecessary tables or diagrams.** The tables and figures that were removed are listed below.
5. **Spelling and grammar.** Word 2013's proofing was run on everything from the Table of Contents onward.
   - Spelling: 0 real errors remain. Word still underlines product names, author names, file names and code identifiers (for example LayerNet, PaySim, Pozzolo and `route.ts`); these are correct.
   - Grammar: 1 flag remains, on a reference line (Kaufman et al.). It is a false positive caused by the IEEE format.
   - Spelling was standardized to US English. This matches the group's own edit ("summarize"), the application's interface ("Analyze Transaction") and the template's heading "Organization of the Report".

## Removed tables (13)
| Table | Reason |
| --- | --- |
| 1.3 Development increments | Now one sentence in §1.6 |
| 2.1 Key constructs | Repeated the subsections of §2.2 |
| 2.2 ML approaches | Turned into a paragraph (§2.2.5) |
| 2.3 Analysis of key studies | Merged into the single comparison table, now Table 2.1 |
| 2.5 Gaps | Turned into a paragraph (§2.4) |
| 3.6 UC-03 | Moved into the summary of the remaining use cases (Table 3.7) |
| 3.10 Resources | Turned into a paragraph (§3.7) |
| 3.11 Data stores | Turned into a paragraph (§3.8) |
| 4.1 Components | Turned into a paragraph (§4.2) |
| 4.4 Screens | Turned into a sentence (§4.4) |
| 4.5 4+1 mapping | Turned into a paragraph (§4.5) |
| 4.6 ERD entities | The ERD figure and §4.6 already describe them |
| A.2 Data dictionary, A.3 Evidence index | Repeated §3.8 and §4.6 |

The Requirement column of Table A.1 was also dropped, because each ID already refers to Tables 3.3, 3.4 and 3.8.

**Kept because required:**
- Objectives and scope (Chapter 1).
- Comparison of existing studies (Chapter 2).
- Hardware and software interfaces, functional requirements, use cases and non-functional requirements (Chapter 3).
- The two result tables (Chapter 4).
- The traceability matrix (Appendix I).

## Removed figures (9)
| Figure | Reason |
| --- | --- |
| Scoring flowchart | Repeated the activity diagram; the formula is now in §4.5.2 |
| State diagram of the Analysis form | Not needed for the 4+1 process view |
| AI chat sequence diagram | Not a core workflow |
| Validation screenshot | Duplicated the Analysis page |
| Analytics, Health, Settings and AI-panel screenshots | Same layout as the pages shown; listed in text |
| Mobile screenshot | Stated in text instead |

**Kept:**
- Process model, taxonomy, as-of history window and use case diagram.
- Context, layered architecture and research pipeline diagrams.
- Four screenshots: Dashboard, Analysis, History and Benchmark.
- Class, activity, two sequence, component, deployment and ERD diagrams.

## Problems in the starting pages: fixed on the group's instruction ("Yes, fix them")
The fixes were made on a copy of the group's file by `tools/fix_front.py`; the group's own Downloads file was not touched. The report is now **49 PDF pages**.
1. **Fixed:** the Certificate overflowed onto a page of its own. Three empty lines were removed from the committee table, so "Supervisor" now stays on p. iii.
2. **Fixed:** the cover title now reads "LAYERNET 2.0 MULTI-LAYERED …", which matches the official title. The stray hyphen was removed.
3. **Fixed:** the cover degree now reads "BS Software Engineering", the group's choice.
4. **Fixed:** the name is now "Hoor ul Ain" on the Certificate, Plagiarism and Turnitin pages.
5. **Fixed:** the roll numbers now read MTN-FL-000106, MTN-FL-000100 and MTN-FL-000095 (six digits, no space), the group's choice.
6. **Still pending:** the Turnitin values are blank. They must come from the department's official report; none were invented.
