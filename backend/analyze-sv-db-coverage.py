# -*- coding: utf-8 -*-
"""Analyze how the ph0ngp/hanviet-pinyin-wordlist repo helps real data in DB.
Coverage of unique Han chars used in vocabularies by each SV source.
"""
import json
import re
import sys
import psycopg2

DATA = "backend/data/"

# 1. Load current map
with open(DATA + "sino-vietnamese.json", encoding="utf-8") as f:
    our = json.load(f)
our_chars = set(our.keys())

# 2. Load repo csv (char -> list of readings)
repo = {}
with open(DATA + "_hanviet-pinyin.csv", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("char,"):
            continue
        m = re.match(r"^([^,]+),\[(.*?)\],(.+)$", line)
        if m:
            ch = m.group(1).strip()
            try:
                readings = json.loads("[" + m.group(2) + "]")
            except Exception:
                readings = [x for x in re.split(r"[',]", m.group(2)) if x and x.strip()]
            repo.setdefault(ch, set())
            for r in readings or []:
                if str(r).strip():
                    repo[ch].add(str(r).strip())
repo_chars = set(repo.keys())
print("Repo chars:", len(repo_chars), "| current map chars:", len(our_chars))

# 3. Connect DB and collect all han chars used
conn = psycopg2.connect(host="localhost", port=5432, user="cantonese", password="cantonese", dbname="cantonese")
cur = conn.cursor()
cur.execute("SELECT han_traditional, han_simplified, han_characters FROM vocabularies")
rows = cur.fetchall()
cur.close()
conn.close()

all_chars = set()
for trad, simp, han_chars in rows:
    for ch in (trad or "") + (simp or ""):
        if re.match(r"[\u3400-\u4dbf\u4e00-\u9fff]", ch):
            all_chars.add(ch)
    # also from han_characters JSON breakdown if present
    if han_chars:
        try:
            for item in json.loads(han_chars) if isinstance(han_chars, str) else han_chars:
                c = item.get("character")
                if c:
                    all_chars.add(c)
        except Exception:
            pass

print("Unique Han chars used in vocabularies (DB):", len(all_chars))

covered_our = sum(1 for c in all_chars if c in our_chars)
covered_repo = sum(1 for c in all_chars if c in repo_chars)
new_from_repo = sum(1 for c in all_chars if c not in our_chars and c in repo_chars)
covered_any = sum(1 for c in all_chars if c in our_chars or c in repo_chars)
not_covered = sum(1 for c in all_chars if c not in our_chars and c not in repo_chars)

print(f"\nCovered by current map  : {covered_our} ({covered_our/len(all_chars)*100:.1f}%)")
print(f"Covered by repo ONLY    : {new_from_repo} (would be NEW additions)")
print(f"Covered by either source: {covered_any} ({covered_any/len(all_chars)*100:.1f}%)")
print(f"Still not covered       : {not_covered}")

# 4. Show sample chars that repo would newly cover
sample = [c for c in all_chars if c not in our_chars and c in repo_chars]
print(f"\nSample chars repo can NEWLY add SV for ({len(sample)} total):")
print(", ".join(sample[:40]))
print("\nSample readings from repo for those:")
for c in sample[:8]:
    print(f"  {c} -> {', '.join(sorted(repo[c]))}")
