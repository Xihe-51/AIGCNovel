# -*- coding: utf-8 -*-
"""Final clean docx extraction - strip any残 tags."""
import zipfile, re, html

def extract(path, out):
    z = zipfile.ZipFile(path)
    xml = z.read("word/document.xml").decode("utf-8", "ignore")
    xml = re.sub(r'<w:br[^>]*/>', '</w:p><w:p>', xml)
    paras = xml.split("</w:p>")
    lines = []
    for p in paras:
        texts = re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S)
        t = html.unescape("".join(texts))
        # remove any leftover tags that leaked in
        t = re.sub(r"<[^>]{0,200}>", "", t)
        t = t.replace("\u00a0", " ")
        if t.strip():
            lines.append(t)
    txt = "\n".join(lines)
    with open(out, "w", encoding="utf-8") as f:
        f.write(txt)
    print(out, len(txt), "chars", len(lines), "lines")

extract(r"D:\AIGC视觉小说系统文档\import os.docx", r"D:\AIGCNovel\docs\_src\importos.txt")
extract(r"D:\AIGC视觉小说系统文档\解决方案.docx", r"D:\AIGCNovel\docs\_src\fangan.txt")
