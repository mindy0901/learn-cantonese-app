# -*- coding: utf-8 -*-
"""Analyze SV coverage: compare ph0ngp/hanviet-pinyin-wordlist CSV vs current sino-vietnamese.json."""
import json
import re

DATA = "backend/data/"

# 1. Parse hanviet-pinyin.csv (UTF-8)
rows = []
csv_map = {}  # char -> set of readings
with open(DATA + "_hanviet-pinyin.csv", encoding="utf-8") as f:
    lines = [l.rstrip("\n") for l in f if l.strip()]
for l in lines[1:]:
    m = re.match(r"^([^,]+),\[(.*?)\],(.+)$", l)
    if not m:
        continue
    ch = m.group(1).strip()
    readings_raw = m.group(2)
    try:
        readings = json.loads("[" + readings_raw + "]")
    except Exception:
        readings = [x for x in re.split(r"[',]", readings_raw) if x and x.strip()]
    if ch not in csv_map:
        csv_map[ch] = set()
    for r in readings or []:
        if r and str(r).strip():
            csv_map[ch].add(str(r).strip())
    rows.append(l)

csv_chars = list(csv_map.keys())
csv_read_count = sum(len(s) for s in csv_map.values())
print("=== hanviet-pinyin.csv (ph0ngp repo) ===")
print(f"  rows: {len(rows)} | unique chars: {len(csv_chars)} | readings: {csv_read_count}")

# 2. Our current map
with open(DATA + "sino-vietnamese.json", encoding="utf-8") as f:
    our = json.load(f)
our_chars = list(our.keys())
our_read_count = 0
for c in our_chars:
    e = our[c]
    our_read_count += len(e["readings"]) if isinstance(e, dict) and isinstance(e.get("readings"), list) else 1
print("\n=== sino-vietnamese.json (current map) ===")
print(f"  chars: {len(our_chars)} | readings: {our_read_count}")

# 3. Overlap
our_set = set(our_chars)
csv_set = set(csv_chars)
in_both = sum(1 for c in csv_chars if c in our_set)
new_only = [c for c in csv_chars if c not in our_set]
missing_from_repo = sum(1 for c in our_chars if c not in csv_set)
print("\n=== Map overlap ===")
print(f"  in both: {in_both}")
print(f"  NEW chars from repo (not in current map): {len(new_only)}")
print(f"  chars in current map missing from repo: {missing_from_repo}")
print(f"  sample new-only: {', '.join(new_only[:25]) if new_only else 'none'}")
