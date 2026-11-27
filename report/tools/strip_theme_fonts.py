"""After Word has saved the final .docx, replace any theme-font references that Word added
(for example on Table of Contents entries) with explicit Times New Roman.
Usage: python strip_theme_fonts.py <final.docx>"""
import re
import sys
import zipfile
import shutil

path = sys.argv[1]
tmp = path + ".tmp"
pat = re.compile(r'<w:rFonts\b[^>]*/>')
fixed = 0


def fix(m):
    global fixed
    tag = m.group(0)
    if "Theme" not in tag and "theme" not in tag:
        return tag
    fixed += 1
    return ('<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" '
            'w:eastAsia="Times New Roman" w:cs="Times New Roman"/>')


with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename.startswith("word/") and item.filename.endswith(".xml"):
            data = pat.sub(fix, data.decode("utf-8")).encode("utf-8")
        zout.writestr(item, data)
shutil.move(tmp, path)
print(f"theme font references replaced: {fixed}")
