"""Replace the front pages (cover .. Acknowledgment) of a built report with the
front pages of a user-edited copy, unchanged, so the user's names and edits are kept.

Usage: python splice_front.py <built.docx> <user_edited.docx> <out.docx>
Everything from the "Table of Contents" page onward comes from <built.docx>.
"""
import copy
import sys

from docx import Document
from docx.oxml.ns import qn

built_path, user_path, out_path = sys.argv[1:4]
B, U = Document(built_path), Document(user_path)


def toc_index(doc):
    kids = list(doc.element.body)
    for i, k in enumerate(kids):
        if "".join(k.itertext()).strip().upper().startswith("TABLE OF CONTENTS"):
            # include the page-break paragraph that precedes the title in the front part
            return i - 1 if "".join(kids[i - 1].itertext()).strip() == "" else i
    raise SystemExit("Table of Contents heading not found")


bi, ui = toc_index(B), toc_index(U)
bbody = B.element.body
bkids, ukids = list(bbody), list(U.element.body)

# Styles used by the user's front pages must exist in the built document.
bstyles = {s.style_id for s in B.styles}
missing = set()
for k in ukids[:ui]:
    for tag in ("w:pStyle", "w:rStyle", "w:tblStyle"):
        for el in k.iter(qn(tag)):
            if el.get(qn("w:val")) not in bstyles:
                missing.add(el.get(qn("w:val")))
if missing:
    raise SystemExit(f"styles missing in built document: {missing}")

# Remove the built front pages and insert deep copies of the user's.
for k in bkids[:bi]:
    bbody.remove(k)
anchor = list(bbody)[0]
for k in ukids[:ui]:
    new = copy.deepcopy(k)
    # Re-home relationship ids (images) into the built document's package.
    for el in new.iter():
        for attr in (qn("r:embed"), qn("r:id"), qn("r:link")):
            rid = el.get(attr)
            if rid is None:
                continue
            rel = U.part.rels[rid]
            if rel.reltype.endswith("/image"):
                new_rid, _ = B.part.get_or_add_image(__import__("io").BytesIO(rel.target_part.blob))
                el.set(attr, new_rid)
            elif rel.reltype.endswith("/hyperlink"):
                el.set(attr, B.part.relate_to(rel.target_ref, rel.reltype, is_external=True))
            else:
                raise SystemExit(f"unsupported relationship in front pages: {rel.reltype}")
    anchor.addprevious(new)

# Paper size: the whole report is A4 portrait (11906 x 16838 twips), 1-inch margins.
A4_W, A4_H, MARGIN = 11906, 16838, 1440
TEXT_TW = A4_W - 2 * MARGIN
for sp in bbody.iter(qn("w:sectPr")):
    sz = sp.find(qn("w:pgSz"))
    if sz is None:
        sz = sp.makeelement(qn("w:pgSz"), {}); sp.insert(0, sz)
    for a in list(sz.attrib):
        del sz.attrib[a]
    sz.set(qn("w:w"), str(A4_W)); sz.set(qn("w:h"), str(A4_H))
    mar = sp.find(qn("w:pgMar"))
    if mar is not None:
        for side in ("top", "right", "bottom", "left"):
            mar.set(qn(f"w:{side}"), str(MARGIN))

# The user's front-page tables were sized for the 6.5-inch Letter text width;
# scale any wider table (grid and cell widths) to the A4 text width.
for tbl in [t for k in list(bbody)[:ui] for t in k.iter(qn("w:tbl"))]:
    cols = tbl.findall(f"{qn('w:tblGrid')}/{qn('w:gridCol')}")
    total = sum(int(c.get(qn("w:w"))) for c in cols)
    if total <= TEXT_TW:
        continue
    f = TEXT_TW / total
    for c in cols:
        c.set(qn("w:w"), str(int(int(c.get(qn("w:w"))) * f)))
    for tcw in tbl.iter(qn("w:tcW")):
        if tcw.get(qn("w:type")) in (None, "dxa"):
            tcw.set(qn("w:w"), str(int(int(tcw.get(qn("w:w"))) * f)))
    print(f"front table scaled {total} -> {int(total * f)} twips")

# One font everywhere: Times New Roman in the default font, every style, every run, the
# headers and footers and the numbering definitions (theme font references removed).
FONT = "Times New Roman"
THEME_ATTRS = [qn(f"w:{a}") for a in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme")]
rpr_default = B.styles.element.find(qn("w:docDefaults"))
if rpr_default is not None:
    rpr = rpr_default.find(f"{qn('w:rPrDefault')}/{qn('w:rPr')}")
    if rpr is not None and rpr.find(qn("w:rFonts")) is None:
        rpr.insert(0, rpr.makeelement(qn("w:rFonts"), {}))
fixed = 0
for part in B.part.package.iter_parts():
    el = getattr(part, "_element", None)
    if el is None:
        continue
    for rf in el.iter(qn("w:rFonts")):
        for a in THEME_ATTRS:
            rf.attrib.pop(a, None)
        for a in ("ascii", "hAnsi", "eastAsia", "cs"):
            rf.set(qn(f"w:{a}"), FONT)
        fixed += 1
print(f"fonts: {fixed} font settings set to {FONT}")

# Word's TOC update adds theme-font references to the entries; make the theme's own
# heading and body fonts Times New Roman so every such reference resolves to it.
import re as _re
for part in B.part.package.iter_parts():
    if str(part.partname).startswith("/word/theme/"):
        xml = part.blob.decode("utf-8")
        xml = _re.sub(r'(<a:(?:majorFont|minorFont)>\s*<a:latin typeface=")[^"]*(")', rf"\g<1>{FONT}\g<2>", xml)
        part._blob = xml.encode("utf-8")
        print(f"theme fonts set to {FONT} in {part.partname}")

B.save(out_path)
print(f"front pages: user elements={ui}, replaced built elements={bi}; saved {out_path}")
