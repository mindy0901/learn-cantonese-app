#!/usr/bin/env python3
"""Set-coverage audit for wordshk.json (egs nested per def)."""
import importlib.util
import json
import os
import sqlite3

_spec = importlib.util.spec_from_file_location(
    "convert_wordshk",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "convert-wordshk.py"),
)
cv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cv)

DB = os.environ.get("WORDHK_DB", cv.DEFAULT_DB)
OUT = cv.OUT

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("SELECT id, entry FROM rich_dict")

src_defs = set()
src_egs = set()
count = 0
for eid, raw in cur.fetchall():
    try:
        entry = json.loads(raw)
    except Exception:
        continue
    count += 1
    for d in entry.get("d") or []:
        yue = cv.clause_to_text(d.get("y"))
        en = cv.clause_to_text(d.get("e"))
        if yue or en:
            src_defs.add((yue, en))
        for eg in d.get("eg") or []:
            yue_eg, jp_eg = cv.example_yue(eg)
            en_eg = cv.clause_to_text(eg.get("e"))
            if yue_eg or en_eg:
                src_egs.add((yue_eg, jp_eg, en_eg))
conn.close()

data = json.load(open(OUT, encoding="utf-8"))
out_defs = set()
out_egs = set()
for r in data:
    for d in r["defs"]:
        out_defs.add((d["yue"], d["en"]))
        for e in d.get("egs", []):
            out_egs.add((e["yue"], e["jp"], e["en"]))

print(f"source entries : {count}")
print(f"src defs={len(src_defs)} egs={len(src_egs)}")
print(f"out defs={len(out_defs)} egs={len(out_egs)}")
print(f"MISSING defs: {len(src_defs - out_defs)}  MISSING egs: {len(src_egs - out_egs)}")
