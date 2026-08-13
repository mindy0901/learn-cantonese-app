# -*- coding: utf-8 -*-
"""Analyze merged-reading vocab rows (single-char words with multiple readings).
Find the separators/patterns used so the split script handles them correctly.
READ-ONLY.
"""
import json
import re
import psycopg2

conn = psycopg2.connect(host="localhost", port=5432, user="cantonese", password="cantonese", dbname="cantonese")
cur = conn.cursor()
cur.execute(
    "SELECT han_traditional, han_simplified, pinyin, jyutping, viet_meanings, eng_meanings, hsk_level FROM vocabularies "
    "WHERE LENGTH(han_traditional)=1 AND (pinyin ~ ' +' OR pinyin ~ ',' OR jyutping ~ ' +' OR jyutping ~ ',')"
)
rows = cur.fetchall()
cur.close()
conn.close()

print("total single-char merged rows:", len(rows))

# detect separators in pinyin and jyutping
py_seps = {}
jp_seps = {}
samples = []
for trad, simp, py, jp, vi, en, hsk in rows:
    for sep in [",", "，", ";", "/", "、", "|"]:
        if py and sep in py:
            py_seps.setdefault(sep, 0)
            py_seps[sep] += 1
        if jp and sep in jp:
            jp_seps.setdefault(sep, 0)
            jp_seps[sep] += 1
    if len(samples) < 12:
        samples.append({"trad": trad, "py": py, "jp": jp, "vi": (vi or "")[:20], "en": (en or "")[:20], "hsk": hsk})

print("pinyin separator counts:", json.dumps(py_seps))
print("jyutping separator counts:", json.dumps(jp_seps))
print("samples:", json.dumps(samples, ensure_ascii=True))
