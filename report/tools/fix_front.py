# One-off front-page fixes approved by the group: title, degree, name case, roll numbers, certificate overflow.
# Usage: python -I fix_front.py <user_front.docx> <out.docx>
import sys
from docx import Document
W="{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
d=Document(sys.argv[1]); k=list(d.element.body)
log=[]
for x in k[:75]:
    for p in x.iter(W+"p"):
        ts=list(p.iter(W+"t"))
        for i,t in enumerate(ts):
            if t.text=="LAYERNET- ": t.text="LAYERNET 2.0 "; log.append("title")
            if t.text=="BS Computer Science": t.text="BS Software Engineering"; log.append("degree")
            if t.text and "Hoor Ul Ain" in t.text: t.text=t.text.replace("Hoor Ul Ain","Hoor ul Ain"); log.append("name")
            if t.text=="MTN-FL-0000" and i+3<len(ts) and ts[i+1].text==" ":
                t.text="MTN-FL-000"+ts[i+2].text+ts[i+3].text
                for j in (1,2,3): ts[i+j].text=""
                log.append("roll:"+t.text)
# certificate committee table: drop empty trailing paragraphs in name cells
for x in k[18:26]:
    if x.tag==W+"tbl":
        for tc in x.iter(W+"tc"):
            ps=tc.findall(W+"p")
            for p in ps[1:]:
                if not "".join(t.text or "" for t in p.iter(W+"t")).strip() and not list(p.iter(W+"drawing")):
                    tc.remove(p); log.append("emptyline")
d.save(sys.argv[2]); print(log)
