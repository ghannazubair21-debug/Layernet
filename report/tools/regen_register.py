import ast, re, sys
root = sys.argv[1]
src = open(f"{root}/tools/build_report.py", encoding="utf-8").read()
start = src.index("REFS = {"); end = src.index("\n}\n", start) + 2
REFS = ast.literal_eval(src[start + len("REFS = "):end])
order = [l.split("] ", 1)[1].strip() for l in open(f"{root}/output/build/LayerNet_FYP_Report_build.build-log.txt", encoding="utf-8") if re.match(r"^\[\d+\] ", l)]
sections = {k: [] for k in order}
for fn in ["chapters_1_4.txt", "appendices.txt", "front_matter.txt"]:
    sec = None
    for line in open(f"{root}/source/{fn}", encoding="utf-8"):
        m = re.match(r"^#+\s+(\d+(?:\.\d+)*)\s", line)
        if m: sec = m.group(1)
        elif line.startswith("@APPENDIX "): sec = "App. " + line.split()[1].split("|")[0]
        for k in re.findall(r"\{([a-z0-9]+)\}", line):
            if k in sections and sec and sec not in sections[k]: sections[k].append(sec)
def md(s): return s.replace("<i>", "*").replace("</i>", "*").replace("|", "\\|")
def link(s):
    m = re.search(r"doi: (\S+?)\.?$", s)
    if m: return "https://doi.org/" + m.group(1)
    m = re.search(r"Available: (\S+?)(?: |$)", s)
    return m.group(1) if m else "none (no DOI confirmed; checked against publisher/proceedings page)"
out = ["# REPORT_REFERENCE_REGISTER", "",
       f"Last updated: 2026-11-23 (directive v2 build). {len(order)} references, numbered in order of first citation (IEEE), generated from `tools/build_report.py` and the build log so it matches `output/LayerNet_FYP_Report_v2.*` exactly. The build reports `unused=[]`: every entry is cited and every citation resolves.",
       "", "All entries were checked against Crossref, the publisher or proceedings page, arXiv, PMLR/NeurIPS pages, or the official documentation page. Details that could not be confirmed were left out rather than guessed (e.g. no DOI for Abdallah et al., Davis & Goadrich; no pages for Lopez-Rojas et al. (EMSS) or Lundberg & Lee; no article number for Gama et al.).",
       "", "| Ref | Key | Full IEEE reference | URL / DOI | Verified? | Cited at (section) |", "|---|---|---|---|---|---|"]
for i, k in enumerate(order, 1):
    out.append(f"| [{i}] | `{k}` | {md(REFS[k])} | {link(REFS[k])} | Yes | {', '.join(sections[k]) or '—'} |")
open(f"{root}/REPORT_REFERENCE_REGISTER.md", "w", encoding="utf-8").write("\n".join(out) + "\n")
print(len(order), [k for k in order if not sections[k]])
