# -*- coding: utf-8 -*-
"""Analyze potential ID conflicts when splitting merged readings.
For each merged single-char row, compute the stableUUIDs of the split readings
and check whether any already exists in the DB. READ-ONLY.
"""
import json
import re
import hashlib
import psycopg2

conn = psycopg2.connect(host="localhost", port=5432, user="cantonese", password="cantonese", dbname="cantonese")
cur = conn.cursor()

def norm_reading(s):
    return re.sub(r"\s+", "", s or "").lower()

def stable_uuid(trad, simp, py, jp):
    key = f"{trad or ''}|{simp or ''}|{norm_reading(py)}|{norm_reading(jp)}"
    h = hashlib.md5(key.encode("utf-8")).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

# all existing ids
cur.execute("SELECT id FROM vocabularies")
existing_ids = {r[0] for r in cur.fetchall()}

# merged rows
cur.execute(
    "SELECT id, han_traditional, han_simplified, pinyin, jyutping FROM vocabularies "
    "WHERE LENGTH(han_traditional)=1 AND (pinyin ~ ',' OR pinyin ~ ' ' OR jyutping ~ ' ')"
)
merged = cur.fetchall()
cur.close()
conn.close()

def split_py(s):
    return [t for t in re.split(r"[,\s]+", (s or "").strip()) if t]

def split_jp(s):
    return [t for t in re.split(r"[\s,]+", (s or "").strip()) if t]

conflicts = []
no_conflict = 0
for rid, trad, simp, py, jp in merged:
    pys = split_py(py)
    jps = split_jp(jp)
    count = max(len(pys), len(jps))
    for i in range(1, count):
        p = pys[i] if i < len(pys) else None
        j = jps[i] if i < len(jps) else None
        if j == "#":
            j = None
        uid = stable_uuid(trad, simp, p, j)
        if uid in existing_ids:
            conflicts.append({"trad": trad, "py": p, "jp": j, "existing_id": True, "conflict_id": uid})

print(json.dumps({"total_merged": len(merged), "conflicts": len(conflicts), "samples": conflicts[:15]}, ensure_ascii=True))
