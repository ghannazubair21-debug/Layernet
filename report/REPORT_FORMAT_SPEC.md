# REPORT_FORMAT_SPEC — LayerNet FYP Report

Status: updated 2026-11-23. **All 17 template pages and the sample's front pages (i–viii) were rendered and visually inspected**, and font names and sizes were extracted per text span with PyMuPDF. Section 9 records the verified per-page specification. In section 9, V means verified from the template's annotations or span data. E means estimated, because the template does not establish the value.

## 1. Sources and precedence

| Priority | Source | What it governs |
|---|---|---|
| 1 | `Final Report Format.pdf` (NUML Appendix G template + Appendix H organisation, 17 pp.) | Front-matter order, title-page fonts, chapter-opener fonts, chapter/section structure, IEEE references |
| 2 | `COMPLETE 40^1 PROJECT REPORT.docx` / `.pdf` (sample, 57 PDF pp.; DOCX metadata says 58 pp., 12,006 words) | Page geometry, body typography, heading sizes, page-number style, length and figure density |
| 3 | General academic conventions | Anything neither source specifies |

**Recorded conflicts (NUML wins):**
- Chapter structure: the sample uses its own headings (e.g. "Project Domain", "System Modules", DFD, "Architectural Diagrams") and omits NUML items (Process Model, Nature of Project, Interface Requirements, Use Cases section, Resource/Database requirements, Feasibility, Design Approach, 4+1 views, ERD). LayerNet follows **NUML Appendix H**.
- Chapter-opener fonts: the sample's heading 1 is 16 pt; NUML requires chapter number 18 pt and title 22 pt (TNR, bold, caps, centred). LayerNet follows **NUML**.
- Captions: the sample types captions and lists by hand (0 caption-styled paragraphs; numbering errors such as "Table 1.2" inside Ch.3 and "Figure 2.4" inside Ch.4). LayerNet uses **automatic captions** and automatic lists.
- References: the sample mixes author-date and IEEE and contains unverifiable entries. LayerNet uses **strict IEEE** with verified sources only.
- Margins: the sample's body section has a 0.32 in right margin (a conversion artefact). LayerNet uses **1.0 in on all sides**.

## 2. Page geometry (verified from sample DOCX `sectPr`)

| Property | Sample value | LayerNet spec |
|---|---|---|
| Paper | Letter 8.5 × 11 in, portrait | Letter 8.5 × 11 in, portrait (confirm with supervisor whether A4 is required) |
| Margins | Front matter T 0.99 / B 1.05 / L 0.99 / R 1.00 in; body T 1.00 / B 1.05 / L 1.00 / R 0.32 in | 1.0 in on all sides; no gutter |
| Header / footer distance | 0.50 in / 0.50 in | 0.50 in / 0.50 in |
| Sections | 2 (front matter, then body) | Same, plus a section break before each chapter opener |

## 3. Page numbering (verified)

- Front matter: lower-case Roman (`pgNumType fmt=lowerRoman`). The cover counts as page i, and its number is printed in the PDF.
- Body: Arabic numbering restarting at 1 (`start=1`) on the Chapter 1 opener page.
- Footer: a `PAGE` field, **right-aligned**, in every footer variant. There is no header text.
- Numbering continues through References, which run on from p. 43.
- LayerNet: same scheme. The cover should be counted but **not show a number** (NUML convention; the sample prints "i", which looks unintended). Record this as a decision to confirm.

## 4. Typography

| Element | Sample (verified) | NUML template | LayerNet spec |
|---|---|---|---|
| Body text | TNR 12 pt, justified, line 1.04 (249/240), 11.3 pt after | — | TNR 12 pt, justified, 1.15 line spacing, 6 pt after (Normal style) |
| Cover project name | — | TNR 18, bold, caps, centred | Same |
| Cover student names | — | TNR 16, bold, centred | Same |
| Cover supervisor / university / date | — | TNR 14 (supervisor italic); date bold on the last line | Same |
| Front-matter titles (ABSTRACT, CERTIFICATE, …) | Heading 1, 16 pt bold, centred | TNR 16, bold, caps, centred | Same (style `FrontTitle`) |
| Chapter opener | Separate page "CHAPTER n:" + title; Heading 1 16 pt | Number TNR 18 bold caps; title TNR 22 bold caps; centred | NUML: a separate opener page vertically centred, "CHAPTER n" 18 pt + TITLE 22 pt |
| Heading 2 (n.n) | TNR 13 bold | — | TNR 14 bold, numbered via a multilevel list |
| Heading 3 (n.n.n) | TNR 13 bold | — | TNR 13 bold |
| Heading 4 | TNR 13 bold | — | TNR 12 bold italic (use sparingly) |
| TOC entries | Calibri (toc 1–3 styles) | — | TNR 12 (Calibri in the sample is inconsistent) |
| Table text | TNR ~11, Table Grid | — | TNR 11, Table Grid, bold header row with light rose shading, repeat header row, no row splitting |
| Captions | Plain bold text | "Captions should be exactly same as in text" | Word `Caption` style, TNR 11 bold, centred; **table caption above, figure caption below**; `SEQ` fields numbered by chapter (Table 3.1, Figure 4.2) |

## 5. Front matter order (NUML Appendix G; the sample follows it)

1. Title/cover page (i)
2. Abstract (ii): 3–4 paragraphs covering overview + existing systems, methodology, testing/validation/achievements. Sample length 352 words.
3. Certificate / Final Approval (iii): committee table. Names come from the official NUML list; **do not invent names**.
4. Declaration (iv)
5. Plagiarism Certificate (v): Turnitin values are **left blank for the supervisor**. Do not fabricate similarity percentages (the sample's are inconsistent: 12 % vs 14 %, with sources summing to more than 100 %).
6. Turnitin Originality Report (vi): placeholder page to be replaced by the real report.
7. Acknowledgment (optional, brief)
8. Table of Contents (TOC field, levels 1–3)
9. List of Figures (TOC \c "Figure")
10. List of Tables (TOC \c "Table")
11. List of Abbreviations (added; not in the sample, but useful for AP, ROC-AUC, PR-AUC, ULB, ML, UI, API, CSV, …)

The order of the lists of figures and tables differs: NUML puts Figures before Tables, while the sample puts Tables before Figures. Follow **NUML**.

## 6. Figures, tables and diagrams (sample practice)

- The sample has 9 tables, all Table Grid, with a bold header row and no shading.
- It has 23 drawings: about 15 real figures (architecture, 2 use-case diagrams, activity, 2 DFDs, system sequence, sequence, class, interface, component, deployment, 3 testing screenshots); the rest are separator lines.
- Typical figure widths are 5.6–7.1 in. LayerNet caps figure width at 6.5 in (text width) and keeps diagrams vector-sharp (SVG → high-DPI PNG).
- The sample's figures sit after the related paragraph; the text does not always cite them. LayerNet: **every figure and table is cited in the text before it appears**.
- NUML: "Screen shots and photographs should be avoided" in lists, but Appendix H 4.4.1 asks for UI screenshots/mock-ups. Decision: include **actual LayerNet screenshots only in §4.4.1**, limited to the main screens.

## 7. References (NUML)

- IEEE numeric style, `[n]` in order of first citation. Every reference must be cited, and every citation must have a reference.
- Formats follow the NUML examples (book, book chapter, journal, conference). Online sources add "[Online]. Available: URL (accessed Mon. DD, YYYY)."

## 8. Page-flow rules (LayerNet)

- Headings use "keep with next". Captions stay with their figure or table. Table rows do not break across pages, and header rows repeat.
- Each chapter starts on a new page, after its opener page, as in the sample.
- No blank pages unless intended. No manual page numbers anywhere.

## 9. Verified template page-by-page specification (`Final Report Format.pdf`, 17 pp., US Letter 612 × 792 pt)

The template is pages 22–36 of a handbook (Appendix G, pp. 1–13; Appendix H, pp. 14–16; p. 17 is blank). Its printed page numbers (22, 23, …, bottom centre) are **the handbook's own numbering, not a prescription**. Page numbering for the report is therefore E, taken from the sample: roman front matter, Arabic from Chapter 1, bottom right.

| # | Page | Verified layout (V) | Fonts (V from annotations) |
|---|---|---|---|
| 1 | Cover | PROJECT NAME; **NUML crest logo** centred below it; students "Name (Roll No)", one per line; "Supervised By"; Supervisor Name; "Submitted for the partial fulfillment of BS Computer Science degree to the Faculty of Engineering & CS"; NATIONAL UNIVERSITY OF MODERN LANGUAGES; **MULTAN CAMPUS**; Month, Year on the last line | Title TNR 18 bold caps centred. Names TNR 16 bold centred; no Mr/Ms/Sir (Dr./Prof./Engr. allowed). "Supervised By" and the submission line TNR 14 italic centred. Date TNR 14 bold, last line |
| 2 | ABSTRACT | Heading at top, then 3–4 paragraphs | Heading TNR 16 bold caps centred |
| 3 | CERTIFICATE | "Dated: ____" right; "Final Approval" centred; certification sentence with project name, students and degree in bold; "COMMITTEE" centred; four rows: name and designation (HoD, Program Coordinator, FYP Coordinator, Supervisor) on the left, "Signature: ______" on the right | Heading 16 bold caps; "Final Approval" and "COMMITTEE" TNR 14 bold centred |
| 4 | DECLARATION | Heading lower on the page (about y = 214 pt); fixed two-sentence text; "Group Members" and "Signature" column headers; numbered names with signature lines | Heading 16 bold caps |
| 5 | PLAGIARISM CERTIFICATE (template spells it "PLAIGRISM") | Certification paragraph (degree options: SE/CS/IT/AI); "Turnitin Originality Report" block: Processed on, ID, Word Count, Similarity Index, Similarity by Source (Internet Sources, Publications, Student Papers); "Date:" at left; signature line with Supervisor Name at right | Heading 16 bold caps |
| 6 | TURNITIN ORIGINALITY REPORT | "Project Title" by students; From Supervisor; the same Processed/ID/Word Count/Similarity block; "SOURCES:" | Heading TNR or Arial 16 bold caps |
| 7 | ACKNOWLEDGMENT | "(Optional)" under the heading; brief | Heading 16 bold caps |
| 8 | TABLE OF CONTENTS | Column labels "Chapter" and "Page"; chapter rows bold; section numbers bold; dot leaders | Heading 16 bold caps; entries about 12 pt |
| 9 | LIST OF FIGURES | Column header row "Figure · Caption · Page"; entries "1.5 Caption ……… 5" with the number in bold. "Captions should be exactly same as in text"; "Screen shots and photographs should be avoided" (in the list) | Heading 16 bold caps |
| 10 | LIST OF TABLES | Header row "Table · Caption · Page"; same entry style | Heading 16 bold caps |
| 11 | Chapter opener | "CHAPTER NUMBER (e.g. 1)" and "CHAPTER TITLE" centred, mid-page | Number TNR 18 bold caps; title TNR 22 bold caps |
| 12 | APPENDICES | Heading, then text: label as Appendix – I, Appendix – II; include data collected, extra info (data dictionary, etc.) and the user manual | Heading 16 bold caps |
| 13 | REFERENCES | "listed on the last page of the report": **References come after Appendices**; IEEE examples (book, chapter, journal, conference) | Heading 16 bold caps |
| 14–16 | Appendix H | Chapter 1–7 headings (already mapped) | — |

Not established by the template (E): margins, body font size and line spacing, heading 2/3 sizes, caption style, page-number position. These are taken from the sample DOCX (section 2) or general convention.

## 10. Current-build compliance gaps (found 2026-11-23)
1. Cover: the NUML logo is missing; the submission/degree line is missing; the campus shows "Islamabad" (**unverified**: template and sample say Multan Campus); the line "Final Year Project Report — Chapters 1 to 4" is not in the template; the title is not the proposal's title.
2. Missing pages: Abstract, Certificate, Declaration, Plagiarism Certificate, Turnitin Originality Report, Acknowledgment.
3. TOC/LOF/LOT lack the template's column header rows ("Chapter/Page", "Figure/Caption/Page"). The LOF/LOT entries print "Figure 1.1: Caption"; the template prints "1.1 Caption". This is achievable with a caption label-free TOC (``) plus a separate number field; to be tested.
4. List of Abbreviations is **not in the template**. Keep it (helpful) or drop it for strict compliance: a decision for you.
5. Appendices are missing; References must come after them.
