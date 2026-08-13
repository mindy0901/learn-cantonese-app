# -*- coding: utf-8 -*-
"""Analyze cloud dump vocabularies COPY block: how to split pinyin+SV on import.
READ-ONLY (reads backend/_cloud_dump_local.sql).
"""
import re, json

path = r"e:\Code\learn-cantonese-app\backend\_cloud_dump_local.sql"
with open(path, encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

# find vocabularies COPY block
start = None
for i, ln in enumerate(lines):
    if ln.startswith("COPY public.vocabularies"):
        start = i + 1
        break
rows = []
for ln in lines[start:]:
    if ln.strip() == "\\.":
        break
    rows.append(ln.rstrip("\n"))

def tokens(s):
    return [t for t in re.split(r"[,\s]+", (s or "").strip()) if t and t != "|"]

# columns: 0 id,1 sv,2 simp,3 py,4 trad,5 jy,6 hsk,...
single = []
merged = []
for ln in rows:
    c = ln.split("\t")
    trad = c[4]
    if len(trad) != 1:
        continue
    py = c[3]
    sv = c[1]
    n_py = len(tokens(py))
    n_sv = len(tokens(sv))
    if n_py > 1:
        merged.append({"trad": trad, "py": tokens(py), "sv": tokens(sv), "n_py": n_py, "n_sv": n_sv, "match": n_py == n_sv})
    else:
        single.append({"trad": trad, "py": tokens(py), "sv": tokens(sv)})

sv_bad_single = [r for r in single if len(r["sv"]) != len(r["py"])]
merged_match = [r for r in merged if r["match"]]
merged_mismatch = [r for r in merged if not r["match"]]

print(json.dumps({
  "cloud_vocab_total_rows": len(rows),
  "single_char_total": len(single),
  "single_char_sv_mismatch": len(sv_bad_single),
  "single_char_sv_mismatch_samples": sv_bad_single[:8],
  "merged_rows (py>1)": len(merged),
  "merged_sv_token_count_matches_py": len(merged_match),
  "merged_sv_token_count_mismatch": len(merged_mismatch),
  "merged_mismatch_samples": merged_mismatch[:10],
}, ensure_ascii=True, indent=1))
