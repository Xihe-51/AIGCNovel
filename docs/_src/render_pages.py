# -*- coding: utf-8 -*-
import re, zlib, os
from PIL import Image

src = r"D:\AIGC视觉小说系统文档\代码信息1.pdf"
out_dir = r"D:\AIGCNovel\docs\_src\pages"
os.makedirs(out_dir, exist_ok=True)
d = open(src, "rb").read()

imgs = []
for mm in re.finditer(rb'(\d+) 0 obj\r?\n<</Type/XObject/Subtype/Image([^>]*?)>>stream\r?\n', d, re.S):
    obj = mm.group(1).decode()
    meta = mm.group(2)
    wm = re.search(rb'/Width (\d+)', meta)
    hm = re.search(rb'/Height (\d+)', meta)
    lm = re.search(rb'/Length (\d+)', meta)
    if not (wm and hm and lm):
        continue
    w, h, ln = int(wm.group(1)), int(hm.group(1)), int(lm.group(1))
    raw = d[mm.end():mm.end()+ln]
    try:
        dec = zlib.decompress(raw)
    except Exception:
        continue
    if len(dec) != w*h*3:
        continue
    imgs.append((obj, w, h, dec))

# keep order of page appearance: sort by object number numeric
imgs.sort(key=lambda x: int(x[0]))
print("images:", len(imgs))

for i, (obj, w, h, dec) in enumerate(imgs):
    im = Image.frombytes("RGB", (w, h), dec)
    # downscale to width 1400 for readability/size
    if w > 1400:
        ratio = 1400 / w
        im = im.resize((1400, int(h*ratio)))
    p = os.path.join(out_dir, f"p{i+1:02d}.jpg")
    im.save(p, "JPEG", quality=85)
print("done ->", out_dir)
