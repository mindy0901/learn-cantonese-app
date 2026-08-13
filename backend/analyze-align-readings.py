# -*- coding: utf-8 -*-
"""Analyze pinyin/jyutping alignment for merged single-char rows to design the split.
READ-ONLY.
"""
import json
import re
import psycopg2

conn = psycopg2.connect(host="localhost", port=5432, user="cantonese", password="cantonese", dbname="cantonese")
cur = conn.cursor()
cur.execute(
    "SELECT han_traditional, pinyin, jyutping FROM vocabularies "
    "WHERE LENGTH(han_traditional)=1 AND (pinyin ~ ' +' OR pinyin ~ ',' OR jyutping ~ ' +')"
)
rows = cur.fetchall()
cur.close()
conn.close()

def split_py(s):
    # split by comma or whitespace
    return [t for t in re.split(r"[,\s]+", (s or "").strip()) if t]

def split_jp(s):
    return [t for t in re.split(r"[\s,]+", (s or "").strip()) if t]

stats = {"has_jp": 0, "no_jp": 0, "jp_count_eq_py": 0, "jp_count_diff": 0, "jp_has_hash": 0, "multi_word_jp": 0}
examples = []
for trad, py, jp in rows:
    pys = split_py(py)
    if jp:
        stats["has_jp"] += 1
        jps = split_jp(jp)
        if len(jps) == len(pys):
            stats["jp_count_eq_py"] += 1
        else:
            stats["jp_count_diff"] += 1
            if len(jps) > 1:
                stats["multi_word_jp"] += 1
        if "#" in jp:
            stats["jp_has_hash"] += 1
        if len(examples) < 15:
            examples.append({"trad": trad, "py_tokens": pys, "jp_tokens": jps})
    else:
        stats["no_jp"] += 1

print(json.dumps({"stats": stats, "examples": examples}, ensure_ascii=True))
