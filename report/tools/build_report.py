"""Builds the LayerNet FYP report (Chapters 1-4) as DOCX from report/source/chapters_1_4.txt.

Usage: python build_report.py <report_dir> <out_docx>
Formatting follows report/REPORT_FORMAT_SPEC.md (NUML Appendix G/H precedence).
Captions use SEQ fields; TOC / List of Figures / List of Tables are Word fields.
"""
import os
import re
import sys
from pathlib import Path

import pymupdf
from docx import Document
from docx.enum.section import WD_SECTION, WD_ORIENT
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor

REPORT = Path(sys.argv[1])
OUT = Path(sys.argv[2])
FONT = "Times New Roman"
MAX_FIG_H = 7.9  # inches
# A4 portrait (210 x 297 mm) with 1-inch margins gives a 6.27-inch text width.
PAGE_W_MM, PAGE_H_MM, MARGIN_IN = 210, 297, 1.0
TEXT_W = PAGE_W_MM / 25.4 - 2 * MARGIN_IN

REFS = {
    "bolton": 'R. J. Bolton and D. J. Hand, "Statistical fraud detection: A review," <i>Statistical Science</i>, vol. 17, no. 3, pp. 235–255, 2002, doi: 10.1214/ss/1042727940.',
    "abdallah": 'A. Abdallah, M. A. Maarof, and A. Zainal, "Fraud detection system: A survey," <i>Journal of Network and Computer Applications</i>, vol. 68, pp. 90–113, Jun. 2016.',
    "nextjs": 'Vercel, "Next.js documentation." [Online]. Available: https://nextjs.org/docs (accessed Nov. 23, 2026).',
    "react": 'Meta Open Source, "React documentation." [Online]. Available: https://react.dev (accessed Nov. 23, 2026).',
    "dalpozzolo15": 'A. Dal Pozzolo, O. Caelen, R. A. Johnson, and G. Bontempi, "Calibrating probability with undersampling for unbalanced classification," in <i>Proc. IEEE Symp. Series on Computational Intelligence (SSCI)</i>, Cape Town, South Africa, 2015, pp. 159–166, doi: 10.1109/SSCI.2015.33.',
    "ulbkaggle": 'Machine Learning Group, Université Libre de Bruxelles, "Credit card fraud detection," Kaggle dataset. [Online]. Available: https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud (accessed Nov. 23, 2026).',
    "paysim": 'E. A. Lopez-Rojas, A. Elmir, and S. Axelsson, "PaySim: A financial mobile money simulator for fraud detection," in <i>Proc. 28th European Modeling and Simulation Symp. (EMSS)</i>, Larnaca, Cyprus, 2016. [Online]. Available: https://msc-les.org/proceedings/emss/emss2016/emss2016_249.html',
    "saito": 'T. Saito and M. Rehmsmeier, "The precision-recall plot is more informative than the ROC plot when evaluating binary classifiers on imbalanced datasets," <i>PLoS ONE</i>, vol. 10, no. 3, Art. no. e0118432, 2015, doi: 10.1371/journal.pone.0118432.',
    "davis": 'J. Davis and M. Goadrich, "The relationship between precision-recall and ROC curves," in <i>Proc. 23rd Int. Conf. Machine Learning (ICML)</i>, Pittsburgh, PA, USA, 2006, pp. 233–240.',
    "whitrow": 'C. Whitrow, D. J. Hand, P. Juszczak, D. Weston, and N. M. Adams, "Transaction aggregation as a strategy for credit card fraud detection," <i>Data Mining and Knowledge Discovery</i>, vol. 18, no. 1, pp. 30–55, 2009, doi: 10.1007/s10618-008-0116-z.',
    "bahnsen": 'A. Correa Bahnsen, D. Aouada, A. Stojanovic, and B. Ottersten, "Feature engineering strategies for credit card fraud detection," <i>Expert Systems with Applications</i>, vol. 51, pp. 134–142, 2016, doi: 10.1016/j.eswa.2015.12.030.',
    "jurgovsky": 'J. Jurgovsky, M. Granitzer, K. Ziegler, S. Calabretto, P.-E. Portier, L. He-Guelton, and O. Caelen, "Sequence classification for credit-card fraud detection," <i>Expert Systems with Applications</i>, vol. 100, pp. 234–245, 2018, doi: 10.1016/j.eswa.2018.01.037.',
    "kaufman": 'S. Kaufman, S. Rosset, C. Perlich, and O. Stitelman, "Leakage in data mining: Formulation, detection, and avoidance," <i>ACM Trans. Knowledge Discovery from Data</i>, vol. 6, no. 4, Art. no. 15, Dec. 2012, doi: 10.1145/2382577.2382579.',
    "gemini": 'Google, "Gemini API documentation." [Online]. Available: https://ai.google.dev/gemini-api/docs (accessed Nov. 23, 2026).',
    "larman": 'C. Larman and V. R. Basili, "Iterative and incremental development: A brief history," <i>Computer</i>, vol. 36, no. 6, pp. 47–56, Jun. 2003, doi: 10.1109/MC.2003.1204375.',
    "dalpozzolo14": 'A. Dal Pozzolo, O. Caelen, Y.-A. Le Borgne, S. Waterschoot, and G. Bontempi, "Learned lessons in credit card fraud detection from a practitioner perspective," <i>Expert Systems with Applications</i>, vol. 41, no. 10, pp. 4915–4928, 2014, doi: 10.1016/j.eswa.2014.02.026.',
    "breiman": 'L. Breiman, "Random forests," <i>Machine Learning</i>, vol. 45, no. 1, pp. 5–32, 2001, doi: 10.1023/A:1010933404324.',
    "xgboost": 'T. Chen and C. Guestrin, "XGBoost: A scalable tree boosting system," in <i>Proc. 22nd ACM SIGKDD Int. Conf. Knowledge Discovery and Data Mining</i>, San Francisco, CA, USA, 2016, pp. 785–794, doi: 10.1145/2939672.2939785.',
    "iforest": 'F. T. Liu, K. M. Ting, and Z.-H. Zhou, "Isolation forest," in <i>Proc. 8th IEEE Int. Conf. Data Mining (ICDM)</i>, Pisa, Italy, 2008, pp. 413–422, doi: 10.1109/ICDM.2008.17.',
    "vaswani": 'A. Vaswani, N. Shazeer, N. Parmar, J. Uszkoreit, L. Jones, A. N. Gomez, Ł. Kaiser, and I. Polosukhin, "Attention is all you need," in <i>Advances in Neural Information Processing Systems 30 (NIPS 2017)</i>, 2017, pp. 5998–6008.',
    "sklearn": 'F. Pedregosa <i>et al.</i>, "Scikit-learn: Machine learning in Python," <i>Journal of Machine Learning Research</i>, vol. 12, pp. 2825–2830, 2011.',
    "paysimkaggle": 'E. A. Lopez-Rojas, "Synthetic financial datasets for fraud detection," Kaggle dataset. [Online]. Available: https://www.kaggle.com/datasets/ealaxi/paysim1 (accessed Nov. 23, 2026).',
    "iso29148": '<i>Systems and Software Engineering—Life Cycle Processes—Requirements Engineering</i>, ISO/IEC/IEEE 29148:2018, Nov. 2018.',
    "tailwind": 'Tailwind Labs, "Tailwind CSS documentation." [Online]. Available: https://tailwindcss.com/docs (accessed Nov. 23, 2026).',
    "aisdk": 'Vercel, "AI SDK documentation." [Online]. Available: https://ai-sdk.dev/docs (accessed Nov. 23, 2026).',
    "vitest": 'Vitest, "Vitest guide." [Online]. Available: https://vitest.dev/guide/ (accessed Nov. 23, 2026).',
    "playwright": 'Microsoft, "Playwright documentation." [Online]. Available: https://playwright.dev/docs/intro (accessed Nov. 23, 2026).',
    "wcag": 'W3C, "Web Content Accessibility Guidelines (WCAG) 2.2," W3C Recommendation, Oct. 5, 2023. [Online]. Available: https://www.w3.org/TR/2023/REC-WCAG22-20231005/',
    "kruchten": 'P. B. Kruchten, "The 4+1 view model of architecture," <i>IEEE Software</i>, vol. 12, no. 6, pp. 42–50, Nov. 1995, doi: 10.1109/52.469759.',
    "gama": 'J. Gama, I. Žliobaitė, A. Bifet, M. Pechenizkiy, and A. Bouchachia, "A survey on concept drift adaptation," <i>ACM Computing Surveys</i>, vol. 46, no. 4, pp. 1–37, Apr. 2014, doi: 10.1145/2523813.',
    "dalpozzolo18": 'A. Dal Pozzolo, G. Boracchi, O. Caelen, C. Alippi, and G. Bontempi, "Credit card fraud detection: A realistic modeling and a novel learning strategy," <i>IEEE Trans. Neural Networks and Learning Systems</i>, vol. 29, no. 8, pp. 3784–3797, Aug. 2018, doi: 10.1109/TNNLS.2017.2736643.',
    "chawla": 'N. V. Chawla, K. W. Bowyer, L. O. Hall, and W. P. Kegelmeyer, "SMOTE: Synthetic minority over-sampling technique," <i>Journal of Artificial Intelligence Research</i>, vol. 16, pp. 321–357, 2002, doi: 10.1613/jair.953.',
    "niculescu": 'A. Niculescu-Mizil and R. Caruana, "Predicting good probabilities with supervised learning," in <i>Proc. 22nd Int. Conf. Machine Learning (ICML)</i>, Bonn, Germany, 2005, pp. 625–632, doi: 10.1145/1102351.1102430.',
    "guo": 'C. Guo, G. Pleiss, Y. Sun, and K. Q. Weinberger, "On calibration of modern neural networks," in <i>Proc. 34th Int. Conf. Machine Learning (ICML)</i>, PMLR vol. 70, 2017, pp. 1321–1330.',
    "ribeiro": 'M. T. Ribeiro, S. Singh, and C. Guestrin, "‘Why should I trust you?’: Explaining the predictions of any classifier," in <i>Proc. 22nd ACM SIGKDD Int. Conf. Knowledge Discovery and Data Mining</i>, San Francisco, CA, USA, 2016, pp. 1135–1144, doi: 10.1145/2939672.2939778.',
    "lundberg": 'S. M. Lundberg and S.-I. Lee, "A unified approach to interpreting model predictions," in <i>Advances in Neural Information Processing Systems 30 (NIPS 2017)</i>, 2017.',
    "weber": 'M. Weber, G. Domeniconi, J. Chen, D. K. I. Weidele, C. Bellei, T. Robinson, and C. E. Leiserson, "Anti-money laundering in Bitcoin: Experimenting with graph convolutional networks for financial forensics," presented at the KDD Workshop on Anomaly Detection in Finance, Anchorage, AK, USA, 2019. [Online]. Available: https://arxiv.org/abs/1908.02591',
    "liu21": 'Y. Liu, X. Ao, Z. Qin, J. Chi, J. Feng, H. Yang, and Q. He, "Pick and choose: A GNN-based imbalanced learning approach for fraud detection," in <i>Proc. Web Conf. 2021 (WWW \'21)</i>, Ljubljana, Slovenia, 2021, pp. 3168–3177, doi: 10.1145/3442381.3449989.',
    "carcillo": 'F. Carcillo, Y.-A. Le Borgne, O. Caelen, Y. Kessaci, F. Oblé, and G. Bontempi, "Combining unsupervised and supervised learning in credit card fraud detection," <i>Information Sciences</i>, vol. 557, pp. 317–331, May 2021, doi: 10.1016/j.ins.2019.05.042.',
}

ABBREVIATIONS = [
    ("AI", "Artificial Intelligence"), ("API", "Application Programming Interface"),
    ("AP", "Average Precision"), ("CSV", "Comma-Separated Values"), ("ERD", "Entity Relationship Diagram"),
    ("F1", "Harmonic mean of precision and recall"), ("FN / FP", "False Negative / False Positive"),
    ("FR / NFR", "Functional / Non-Functional Requirement"), ("HTTPS", "Hypertext Transfer Protocol Secure"),
    ("JSON", "JavaScript Object Notation"), ("LIME", "Local Interpretable Model-agnostic Explanations"), ("LSTM", "Long Short-Term Memory"), ("ML", "Machine Learning"),
    ("PC-GNN", "Pick and Choose Graph Neural Network"), ("SHAP", "SHapley Additive exPlanations"), ("SMOTE", "Synthetic Minority Over-sampling Technique"),
    ("PR-AUC", "Area Under the Precision-Recall Curve"), ("RF", "Random Forest"),
    ("RFR", "Research Functional Requirement"), ("ROC-AUC", "Area Under the Receiver Operating Characteristic Curve"),
    ("SGD", "Stochastic Gradient Descent"), ("SHA-256", "Secure Hash Algorithm, 256-bit"),
    ("TN / TP", "True Negative / True Positive"), ("UC", "Use Case"), ("UI", "User Interface"),
    ("ULB", "Université Libre de Bruxelles"), ("UML", "Unified Modeling Language"), ("UTC", "Coordinated Universal Time"),
    ("WCAG", "Web Content Accessibility Guidelines"), ("XGBoost", "Extreme Gradient Boosting"),
]

# ---------------------------------------------------------------- helpers

def set_cell_shading(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def add_field(paragraph, instr, placeholder="", bold=None, size=None):
    def r(el):
        run = paragraph.add_run()
        if bold is not None:
            run.bold = bold
        if size:
            run.font.size = Pt(size)
        run._r.append(el)
        return run
    b = OxmlElement("w:fldChar"); b.set(qn("w:fldCharType"), "begin"); b.set(qn("w:dirty"), "true")
    r(b)
    it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = f" {instr} "
    r(it)
    s = OxmlElement("w:fldChar"); s.set(qn("w:fldCharType"), "separate")
    r(s)
    run = paragraph.add_run(placeholder)
    if bold is not None:
        run.bold = bold
    if size:
        run.font.size = Pt(size)
    e = OxmlElement("w:fldChar"); e.set(qn("w:fldCharType"), "end")
    r(e)


def para_fmt(p, align=None, before=None, after=None, keep_next=None, line=None, indent_first=None):
    pf = p.paragraph_format
    if align is not None:
        pf.alignment = align
    if before is not None:
        pf.space_before = Pt(before)
    if after is not None:
        pf.space_after = Pt(after)
    if keep_next is not None:
        pf.keep_with_next = keep_next
    if line is not None:
        pf.line_spacing = line
    if indent_first is not None:
        pf.first_line_indent = Inches(indent_first)


CITE_RE = re.compile(r"\{([a-z0-9]+)\}")
cite_order: list[str] = []


def cite_num(key):
    if key not in REFS:
        raise KeyError(f"Unknown citation {key}")
    if key not in cite_order:
        cite_order.append(key)
    return cite_order.index(key) + 1


def resolve_citations(text):
    # Merge runs like "{a} {b}" into "[1], [2]".
    def group(m):
        keys = CITE_RE.findall(m.group(0))
        return ", ".join(f"[{cite_num(k)}]" for k in keys)
    return re.sub(r"\{[a-z0-9]+\}(?:\s+\{[a-z0-9]+\})*", group, text)


INLINE_RE = re.compile(r"(\*\*.+?\*\*|`.+?`|(?<![\w*])\*[^*\s][^*]*?\*(?![\w*])|<i>.+?</i>)")


def add_inline(p, text, size=None, base_bold=False, italic_ok=False):
    """Body text is upright Times New Roman throughout: code names are set in the body
    font, and italics are used only where italic_ok is set (IEEE reference titles)."""
    text = resolve_citations(text)
    for part in INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = p.add_run(part[2:-2]); run.bold = True
        elif part.startswith("`") and part.endswith("`"):
            run = p.add_run(part[1:-1])
        elif part.startswith("<i>"):
            run = p.add_run(part[3:-4]); run.italic = italic_ok or None
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            run = p.add_run(part[1:-1]); run.italic = italic_ok or None
        else:
            run = p.add_run(part)
        if base_bold:
            run.bold = True
        if size:
            run.font.size = Pt(size)


def set_repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:tblHeader"); el.set(qn("w:val"), "true"); trPr.append(el)


def set_cant_split(row):
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit"); el.set(qn("w:val"), "true"); trPr.append(el)


def set_section_props(section, *, fmt=None, start=None, valign=None, title_pg=False):
    sectPr = section._sectPr
    for tag in ("w:pgNumType", "w:vAlign"):
        for old in sectPr.findall(qn(tag)):
            sectPr.remove(old)
    if fmt:
        pg = OxmlElement("w:pgNumType"); pg.set(qn("w:fmt"), fmt)
        if start is not None:
            pg.set(qn("w:start"), str(start))
        sectPr.append(pg)
    if valign:
        va = OxmlElement("w:vAlign"); va.set(qn("w:val"), valign); sectPr.append(va)
    section.page_width, section.page_height = Mm(PAGE_W_MM), Mm(PAGE_H_MM)
    section.orientation = WD_ORIENT.PORTRAIT
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(section, side, Inches(MARGIN_IN))
    section.header_distance = Inches(0.5)
    section.footer_distance = Inches(0.5)


# ---------------------------------------------------------------- document setup

doc = Document()
styles = doc.styles
normal = styles["Normal"]
normal.font.name = FONT
normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
normal.font.size = Pt(12)
normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
normal.paragraph_format.line_spacing = 1.15
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.widow_control = True

def heading_style(name, size, align, before, after, italic=False):
    st = styles[name]
    st.font.name = FONT; st.font.size = Pt(size); st.font.bold = True; st.font.italic = italic
    st.font.color.rgb = RGBColor(0, 0, 0)
    rpr = st.element.get_or_add_rPr(); rf = rpr.get_or_add_rFonts()
    for a in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rf.set(qn(a), FONT)
    for a in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if rf.get(qn(a)) is not None:
            del rf.attrib[qn(a)]
    pf = st.paragraph_format
    pf.alignment = align; pf.space_before = Pt(before); pf.space_after = Pt(after)
    pf.keep_with_next = True; pf.line_spacing = 1.15
    return st

heading_style("Heading 1", 22, WD_ALIGN_PARAGRAPH.CENTER, 0, 0)
heading_style("Heading 2", 14, WD_ALIGN_PARAGRAPH.LEFT, 18, 6)
heading_style("Heading 3", 13, WD_ALIGN_PARAGRAPH.LEFT, 12, 6)

cap = styles["Caption"]
cap.font.name = FONT; cap.font.size = Pt(11); cap.font.bold = True; cap.font.italic = False
cap.font.color.rgb = RGBColor(0, 0, 0)
cap.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
cap.paragraph_format.space_before = Pt(6); cap.paragraph_format.space_after = Pt(12)

front = styles.add_style("FrontTitle", WD_STYLE_TYPE.PARAGRAPH)
front.base_style = normal; front.font.size = Pt(16); front.font.bold = True; front.font.all_caps = True
front.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
front.paragraph_format.space_after = Pt(18)

tbltext = styles.add_style("TableText", WD_STYLE_TYPE.PARAGRAPH)
tbltext.base_style = normal; tbltext.font.size = Pt(10.5)
tbltext.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
tbltext.paragraph_format.space_after = Pt(0); tbltext.paragraph_format.line_spacing = 1.0

for i in (1, 2, 3):
    try:
        st = styles[f"TOC {i}"]
    except KeyError:
        st = styles.add_style(f"TOC {i}", WD_STYLE_TYPE.PARAGRAPH)
    st.base_style = normal; st.font.name = FONT; st.font.size = Pt(12)
    st.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    st.paragraph_format.left_indent = Inches(0.3 * (i - 1)); st.paragraph_format.space_after = Pt(3)
try:
    tof = styles["Table of Figures"]
except KeyError:
    tof = styles.add_style("Table of Figures", WD_STYLE_TYPE.PARAGRAPH)
tof.base_style = normal; tof.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
tof.paragraph_format.space_after = Pt(3)

# Section 1: cover
sec = doc.sections[0]
set_section_props(sec, valign="center")

def cover_line(text, size, bold=True, italic=False, after=6, highlight=False):
    p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.CENTER, after=after)
    run = p.add_run(text); run.font.size = Pt(size); run.bold = bold; run.italic = italic
    if highlight:
        from docx.enum.text import WD_COLOR_INDEX
        run.font.highlight_color = WD_COLOR_INDEX.YELLOW
    return p

from docx.enum.text import WD_COLOR_INDEX, WD_TAB_ALIGNMENT

TITLE = "LAYERNET 2.0 MULTI-LAYERED TRANSFORMER-BASED FRAUD DETECTION, ANALYSIS & INVESTIGATION INTELLIGENCE SYSTEM"
TITLE_TEXT = "LayerNet 2.0 Multi-Layered Transformer-Based Fraud Detection, Analysis & Investigation Intelligence System"
STUDENTS = ["[Student Name 1]", "[Student Name 2]", "[Student Name 3]"]
SUPERVISOR = "[Supervisor Name]"
DEGREE = "[Bachelors Degree in Computer Science]"


def rich(p, parts, size=12):
    """parts: list of (text, bold, highlight)."""
    for text, bold, hl in parts:
        r = p.add_run(text); r.bold = bold; r.font.size = Pt(size)
        if hl:
            r.font.highlight_color = WD_COLOR_INDEX.YELLOW


def names_parts(bold=True):
    parts = []
    for i, n in enumerate(STUDENTS):
        if i:
            parts.append((", " if i < len(STUDENTS) - 1 else ", and ", False, False))
        parts.append((n, bold, True))
    return parts


# Cover: NUML Appendix G template, page 1.
cover_line(TITLE, 18, after=14)
lp = doc.add_paragraph(); para_fmt(lp, align=WD_ALIGN_PARAGRAPH.CENTER, after=18, line=1.0)
lp.add_run().add_picture(str(REPORT / "figures" / "numl_logo.jpeg"), width=Inches(1.88))
for n in STUDENTS:
    p = cover_line("", 16, after=4)
    rich(p, [(n, True, True), (" ", True, False), ("([Roll No])", False, True)], size=16)
cover_line("Supervised By", 14, bold=False, italic=True, after=4).paragraph_format.space_before = Pt(18)
cover_line(SUPERVISOR, 16, highlight=True, after=22)
p = cover_line("", 14, after=22)
r = p.add_run("Submitted for the partial fulfillment of "); r.italic = True; r.font.size = Pt(14)
r = p.add_run("[BS Computer Science]"); r.italic = True; r.font.size = Pt(14); r.font.highlight_color = WD_COLOR_INDEX.YELLOW
r = p.add_run(" degree to the Faculty of Engineering & CS"); r.italic = True; r.font.size = Pt(14)
cover_line("NATIONAL UNIVERSITY OF MODERN LANGUAGES", 14, after=4)
cover_line("[MULTAN CAMPUS]", 14, highlight=True, after=4)
cover_line("[Month, Year]", 14, highlight=True, after=0)

# Section 2: front matter (lower-roman; the cover is counted as i but not printed)
sec = doc.add_section(WD_SECTION.NEW_PAGE)
set_section_props(sec, fmt="lowerRoman", start=2)
sec.footer.is_linked_to_previous = False
fp = sec.footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
add_field(fp, "PAGE", "ii")
doc.sections[0].footer.is_linked_to_previous = False  # cover has empty footer


def new_page():
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def body_para(parts, after=10, align=WD_ALIGN_PARAGRAPH.JUSTIFY, line=1.5, size=12):
    p = doc.add_paragraph(); para_fmt(p, align=align, after=after, line=line)
    if isinstance(parts, str):
        add_inline(p, parts, size=size)
    else:
        rich(p, parts, size=size)
    return p


def sig_table(rows, col_w=(3.4, 3.1), label="Signature:"):
    t = doc.add_table(rows=0, cols=2); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for left in rows:
        cells = t.add_row().cells
        cells[0].width = Inches(col_w[0]); cells[1].width = Inches(col_w[1])
        p = cells[0].paragraphs[0]; para_fmt(p, align=WD_ALIGN_PARAGRAPH.LEFT, after=2, line=1.15)
        for i, (text, hl) in enumerate(left):
            if i:
                p.add_run().add_break(WD_BREAK.LINE)
            r = p.add_run(text)
            if hl:
                r.font.highlight_color = WD_COLOR_INDEX.YELLOW
        q = cells[1].paragraphs[0]; para_fmt(q, align=WD_ALIGN_PARAGRAPH.LEFT, after=2)
        q.add_run(f"{label} ______________________")
        for c in cells:
            c.paragraphs[0].paragraph_format.space_after = Pt(22)
    return t


def turnitin_block():
    for line in ["Processed on: ____________________", "ID: ____________________", "Word Count: ____________________", ""]:
        body_para(line, after=2, align=WD_ALIGN_PARAGRAPH.LEFT, line=1.15)
    for line in ["Similarity Index", "____ %", "Similarity by Source", "Internet Sources:\t____ %", "Publications:\t____ %", "Student Papers:\t____ %"]:
        p = body_para(line, after=2, align=WD_ALIGN_PARAGRAPH.LEFT, line=1.15)
        p.paragraph_format.tab_stops.add_tab_stop(Inches(1.6))


# ABSTRACT (template p. 2)
doc.add_paragraph("Abstract", style="FrontTitle")
ABSTRACT = (REPORT / "source" / "front_matter.txt").read_text(encoding="utf-8")
blocks = {}
cur = None
for ln in ABSTRACT.splitlines():
    if ln.startswith("@@"):
        cur = ln[2:].strip(); blocks[cur] = []
    elif ln.strip() and cur:
        blocks[cur].append(ln.strip())
for para in blocks["ABSTRACT"]:
    body_para(para, after=8, line=1.15, size=12)

# CERTIFICATE (template p. 3)
new_page()
doc.add_paragraph("Certificate", style="FrontTitle")
p = body_para("Dated: ____________________", after=18, align=WD_ALIGN_PARAGRAPH.RIGHT, line=1.15)
p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.CENTER, after=14)
r = p.add_run("Final Approval"); r.bold = True; r.font.size = Pt(14)
body_para([("It is certified that the project report titled ‘", False, False), (TITLE_TEXT, True, False),
           ("’ submitted by ", False, False)] + names_parts() +
          [(" for the partial fulfillment of the requirement of “", False, False), (DEGREE, True, True), ("” is approved.", False, False)],
          after=24)
p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.CENTER, after=18)
r = p.add_run("COMMITTEE"); r.bold = True; r.font.size = Pt(14)
sig_table([[("[Name]", True), ("[HoD, Department]", True)],
           [("[Name]", True), ("Program Coordinator [Programme]", True)],
           [("[Name]", True), ("FYP Coordinator [Programme]", True)],
           [(SUPERVISOR, True), ("Supervisor", False)]])

# DECLARATION (template p. 4: heading placed lower on the page)
new_page()
h = doc.add_paragraph("Declaration", style="FrontTitle"); h.paragraph_format.space_before = Pt(110)
body_para("We hereby declare that our dissertation is entirely our work and genuine/original. We understand that in case of discovery of any PLAGIARISM at any stage, our group will be assigned an F (FAIL) grade and it may result in withdrawal of our Bachelor's degree.", after=30)
p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.LEFT, after=18)
p.paragraph_format.tab_stops.add_tab_stop(Inches(3.6))
rich(p, [("Group Members\tSignature", True, False)])
sig_table([[(f"{i}. {n}", True)] for i, n in enumerate(STUDENTS, 1)], label="")

# PLAGIARISM CERTIFICATE (template p. 5; template spelling "PLAIGRISM" corrected)
new_page()
doc.add_paragraph("Plagiarism Certificate", style="FrontTitle")
body_para([("This is to certify that the project entitled “", False, False), (TITLE_TEXT, True, False),
           ("”, is being submitted here for the award of the “", False, False), ("Degree of Bachelor", True, False),
           ("” in “", False, False), ("[Software Engineering/Computer Science/Information Technology/Artificial Intelligence]", True, True),
           ("”. This is the result of the original work by ", False, False)] + names_parts() +
          [(" under my supervision and guidance. The work embodied in this project has not been done earlier for the basis of the award of any degree or compatible certificate or similar title of this for any other diploma/examining body or university to the best of my knowledge and belief.", False, False)],
          after=18)
p = body_para([("Turnitin Originality Report", True, False)], after=2, align=WD_ALIGN_PARAGRAPH.LEFT, line=1.15)
turnitin_block()
p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.LEFT, before=30, after=0)
p.paragraph_format.tab_stops.add_tab_stop(Inches(3.6))
p.add_run("Date: ____________\t______________________")
p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.LEFT, after=0)
p.paragraph_format.tab_stops.add_tab_stop(Inches(3.9))
p.add_run("\t"); r = p.add_run(SUPERVISOR); r.font.highlight_color = WD_COLOR_INDEX.YELLOW

# TURNITIN ORIGINALITY REPORT (template p. 6)
new_page()
doc.add_paragraph("Turnitin Originality Report", style="FrontTitle")
body_para([("“" + TITLE_TEXT + "”", True, False), (" by ", False, False)] + names_parts(), after=2, align=WD_ALIGN_PARAGRAPH.LEFT, line=1.15)
body_para([("From ", False, False), (SUPERVISOR, True, True)], after=14, align=WD_ALIGN_PARAGRAPH.LEFT, line=1.15)
turnitin_block()
p = body_para([("SOURCES:", True, False)], after=8, align=WD_ALIGN_PARAGRAPH.LEFT)
p.paragraph_format.space_before = Pt(14)
body_para([("[Pending: attach the official Turnitin originality report issued by the department for the final submitted version. No similarity check has been run on this draft, so no values are shown.]", False, True)], after=0, align=WD_ALIGN_PARAGRAPH.LEFT)

# ACKNOWLEDGMENT (template p. 7, optional)
new_page()
doc.add_paragraph("Acknowledgment", style="FrontTitle")
for para in blocks["ACKNOWLEDGMENT"]:
    body_para([(para, False, True)], after=8)


def front_page(title, instr, header=None):
    new_page()
    doc.add_paragraph(title, style="FrontTitle")
    if header:
        p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.LEFT, after=8)
        for pos, al in header[1]:
            p.paragraph_format.tab_stops.add_tab_stop(Inches(pos), al)
        r = p.add_run(header[0]); r.bold = True
    p2 = doc.add_paragraph(); para_fmt(p2, align=WD_ALIGN_PARAGRAPH.LEFT)
    add_field(p2, instr, "Right-click and choose Update Field to build this list.")


front_page("Table of Contents", 'TOC \\o "1-3" \\h \\z \\u', ("Chapter\tPage", [(TEXT_W, WD_TAB_ALIGNMENT.RIGHT)]))
front_page("List of Figures", 'TOC \\h \\z \\c "Figure"', ("Figure\tCaption\tPage", [(TEXT_W / 2, WD_TAB_ALIGNMENT.CENTER), (TEXT_W, WD_TAB_ALIGNMENT.RIGHT)]))
front_page("List of Tables", 'TOC \\h \\z \\c "Table"', ("Table\tCaption\tPage", [(TEXT_W / 2, WD_TAB_ALIGNMENT.CENTER), (TEXT_W, WD_TAB_ALIGNMENT.RIGHT)]))
INCLUDE_ABBREVIATIONS = os.environ.get("LAYERNET_ABBREV", "1") == "1"
if INCLUDE_ABBREVIATIONS:
    new_page()
    doc.add_paragraph("List of Abbreviations", style="FrontTitle")
    t = doc.add_table(rows=0, cols=2); t.alignment = WD_TABLE_ALIGNMENT.CENTER
for a, b in (sorted(ABBREVIATIONS, key=lambda x: x[0].lower()) if INCLUDE_ABBREVIATIONS else []):
    row = t.add_row().cells
    row[0].width = Inches(1.6); row[1].width = Inches(4.6)
    p = row[0].paragraphs[0]; p.style = styles["TableText"]; r = p.add_run(a); r.bold = True; r.font.size = Pt(11.5)
    p = row[1].paragraphs[0]; p.style = styles["TableText"]; r = p.add_run(b); r.font.size = Pt(11.5)
    for c in row:
        c.paragraphs[0].paragraph_format.space_after = Pt(4)

# ---------------------------------------------------------------- body

src = (REPORT / "source" / "chapters_1_4.txt").read_text(encoding="utf-8").splitlines()
src += (REPORT / "source" / "appendices.txt").read_text(encoding="utf-8").splitlines()
first_appendix = True
chapter = 0
fig_n = tab_n = 0
first_chapter = True
pending_table = None
figures_log, tables_log = [], []


def add_caption(kind, num_in_ch, text):
    p = doc.add_paragraph(style="Caption")
    run = p.add_run(f"{kind} {chapter}."); run.bold = True
    add_field(p, f"SEQ {kind} \\* ARABIC \\s 1", str(num_in_ch), bold=True)
    add_inline(p, f": {text}", base_bold=True)
    return p


def flush_table(tbl):
    global tab_n
    caption, widths, rows = tbl
    # Source column widths were planned for Letter; scale any table wider than the A4 text block.
    if widths and sum(widths) > TEXT_W:
        widths = [w * TEXT_W / sum(widths) for w in widths]
    tab_n += 1
    cp = add_caption("Table", tab_n, caption)
    para_fmt(cp, keep_next=True, before=10, after=4)
    tables_log.append(f"Table {chapter}.{tab_n}: {caption}")
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    ncols = len(cells[0])
    table = doc.add_table(rows=0, cols=ncols)
    table.style = styles["Table Grid"]; table.alignment = WD_TABLE_ALIGNMENT.CENTER
    if widths:
        # Fixed layout: Word must not auto-widen a table past the A4 margins.
        table.autofit = False
        tw = OxmlElement("w:tblW"); tw.set(qn("w:w"), str(round(sum(widths) * 1440))); tw.set(qn("w:type"), "dxa")
        tblPr = table._tbl.tblPr
        for old in tblPr.findall(qn("w:tblW")):
            tblPr.remove(old)
        tblPr.append(tw)
    for ri, r in enumerate(cells):
        if len(r) != ncols:
            raise ValueError(f"Row width mismatch in table '{caption}': {r}")
        row = table.add_row()
        set_cant_split(row)
        if ri == 0:
            set_repeat_header(row)
        for ci, val in enumerate(r):
            cell = row.cells[ci]
            if widths:
                cell.width = Inches(widths[ci])
            p = cell.paragraphs[0]; p.style = styles["TableText"]
            para_fmt(p, before=2, after=2)
            # Keep caption, header and first data row together; small tables stay whole.
            if ri == 0 or (len(cells) <= 6 and ri < len(cells) - 1):
                p.paragraph_format.keep_with_next = True
            add_inline(p, val, size=10.5, base_bold=(ri == 0))
            if ri == 0:
                set_cell_shading(cell, "F2DCE2")
    sp = doc.add_paragraph(); para_fmt(sp, after=4)


for raw in src + [""]:
    line = raw.rstrip()
    if pending_table is not None:
        if line.startswith("!WIDTHS"):
            pending_table[1] = [float(x) for x in line.split(None, 1)[1].split(",")]
            continue
        if line.startswith("|"):
            pending_table[2].append(line); continue
        flush_table(pending_table); pending_table = None
    if not line:
        continue
    if line.startswith("@CHAPTER"):
        num, title = line[len("@CHAPTER"):].strip().split("|")
        chapter = int(num); fig_n = tab_n = 0
        sec = doc.add_section(WD_SECTION.NEW_PAGE)
        set_section_props(sec, fmt="decimal", start=1 if first_chapter else None, valign="center")
        first_chapter = False
        h = doc.add_paragraph(style="Heading 1")
        r = h.add_run(f"CHAPTER {chapter}"); r.font.size = Pt(18)
        r.add_break(WD_BREAK.LINE)
        r2 = h.add_run(title.upper()); r2.font.size = Pt(22)
        sec = doc.add_section(WD_SECTION.NEW_PAGE)
        set_section_props(sec, fmt="decimal", valign="top")
        continue
    if line.startswith("@APPENDICES"):
        chapter = "A"; fig_n = tab_n = 0
        sec = doc.add_section(WD_SECTION.NEW_PAGE)
        set_section_props(sec, fmt="decimal", valign="top")
        h = doc.add_paragraph(style="Heading 1"); r = h.add_run("APPENDICES"); r.font.size = Pt(16)
        para_fmt(h, after=12)
        first_appendix = True
        continue
    if line.startswith("@APPENDIX "):
        label, title = line[len("@APPENDIX "):].split("|", 1)
        if not first_appendix:
            doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        first_appendix = False
        doc.add_paragraph(f"Appendix – {label}: {title}", style="Heading 2")
        continue
    if line.startswith("### "):
        doc.add_paragraph(line[4:], style="Heading 3"); continue
    if line.startswith("## "):
        doc.add_paragraph(line[3:], style="Heading 2"); continue
    if line.startswith("!TABLE "):
        pending_table = [line[7:].strip(), None, []]; continue
    if line.startswith("!FIG "):
        path, width, caption = line[5:].split("|", 2)
        img = REPORT / path
        pix = pymupdf.Pixmap(str(img))
        w = min(float(width), TEXT_W); h_in = w * pix.height / pix.width
        if h_in > MAX_FIG_H:
            w = MAX_FIG_H * pix.width / pix.height
        p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.CENTER, before=6, after=0, keep_next=True, line=1.0)
        p.add_run().add_picture(str(img), width=Inches(w))
        fig_n += 1
        add_caption("Figure", fig_n, caption)
        figures_log.append(f"Figure {chapter}.{fig_n}: {caption} ({img.name}, {w:.2f} in)")
        continue
    if line.startswith("- "):
        p = doc.add_paragraph(style="List Bullet"); add_inline(p, line[2:]); continue
    p = doc.add_paragraph(); add_inline(p, line)

# References
sec = doc.add_section(WD_SECTION.NEW_PAGE)
set_section_props(sec, fmt="decimal", valign="top")
h = doc.add_paragraph(style="Heading 1"); r = h.add_run("REFERENCES"); r.font.size = Pt(16)
para_fmt(h, after=18)
for i, key in enumerate(cite_order, 1):
    p = doc.add_paragraph(); para_fmt(p, align=WD_ALIGN_PARAGRAPH.LEFT, after=2, line=1.0)
    p.paragraph_format.left_indent = Inches(0.45); p.paragraph_format.first_line_indent = Inches(-0.45)
    p.add_run(f"[{i}]\t").font.size = Pt(10.5)
    add_inline(p, REFS[key], size=10.5, italic_ok=True)
    p.paragraph_format.tab_stops.add_tab_stop(Inches(0.45))

unused = [k for k in REFS if k not in cite_order]
props = doc.core_properties
props.title = TITLE_TEXT
props.subject = "Final Year Project report (NUML format)"
props.author = "LayerNet project team"
props.keywords = "fraud detection; Next.js; XGBoost; PaySim; ULB"
props.comments = "Generated from report/source/chapters_1_4.txt by report/tools/build_report.py"

OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(OUT)
log = OUT.with_suffix(".build-log.txt")
log.write_text("\n".join(["FIGURES"] + figures_log + ["", "TABLES"] + tables_log + ["", "CITATION ORDER"]
                         + [f"[{i}] {k}" for i, k in enumerate(cite_order, 1)] + ["", f"UNUSED REFS: {unused}"]), encoding="utf-8")
print(f"saved {OUT}; figures={len(figures_log)} tables={len(tables_log)} refs={len(cite_order)} unused={unused}")
