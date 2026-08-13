# -*- coding: utf-8 -*-
"""Classify single-char rows with multi-token SV: are all tokens the same (→ dedupe)
or different (→ need pinyin-based selection)?
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

def split_sv(s):
    return [t for t in re.split(r"[,\s]+", (s or "").strip()) if t and t != "|"]

def split_py(s):
    return [t for t in re.split(r"[,\s]+", (s or "").strip()) if t]

all_same = []   # all SV tokens identical → dedupe
has_diff = []   # SV tokens differ → needs per-pinyin selection
for trad, py, sv in rows:
    svs = split_sv(sv)
    if len(set(svs)) == 1:
        all_same.append({"trad": trad, "py": split_py(py), "sv": svs})
    else:
        has_diff.append({"trad": trad, "py": split_py(py), "sv": svs})

print(json.dumps({
    "total": len(rows),
    "all_same_tokens (dedupe)": len(all_same),
    "different_tokens (need selection)": len(has_diff),
    "samples_all_same": all_same[:6],
    "samples_diff": has_diff[:12],
}, ensure_ascii=True))
