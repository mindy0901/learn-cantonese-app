# -*- coding: utf-8 -*-
"""Analyze sino_vietnamese mapping for single-char words to design the fix.
Determine: for each single-char row with multi-token SV, how many SV tokens
vs pinyin tokens, so we can pick the right SV token per row.
READ-ONLY.
"""
import json
import re
import psycopg2

conn = psycopg2.connect(host="localhost", port=5432, user="cantonese", password="cantonese", dbname="cantonese")
cur = conn.cursor()
cur.execute(
    "SELECT han_traditional, pinyin, sino_vietnamese FROM vocabularies "
    "WHERE LENGTH(han_traditional)=1 AND (sino_vietnamese ~ ',' OR sino_vietnamese ~ ' ')"
)
rows = cur.fetchall()
cur.close()
conn.close()

def split_py(s):
    return [t for t in re.split(r"[,\s]+", (s or "").strip()) if t]

def split_sv(s):
    # split by comma or whitespace (also handle | separator groups)
    return [t for t in re.split(r"[,\s]+", (s or "").strip()) if t and t != "|"]

stats = {"total": 0, "sv_eq_py": 0, "sv_gt_py": 0, "sv_lt_py": 0, "sv_1_py_multi": 0}
examples = []
for trad, py, sv in rows:
    pys = split_py(py)
    svs = split_sv(sv)
    stats["total"] += 1
    if len(svs) == len(pys):
        stats["sv_eq_py"] += 1
    elif len(svs) > len(pys):
        stats["sv_gt_py"] += 1
    elif len(svs) == 1:
        stats["sv_1_py_multi"] += 1
    else:
        stats["sv_lt_py"] += 1
    if len(examples) < 18:
        examples.append({"trad": trad, "py": pys, "sv": svs, "n_py": len(pys), "n_sv": len(svs)})

print(json.dumps({"stats": stats, "examples": examples}, ensure_ascii=True))
