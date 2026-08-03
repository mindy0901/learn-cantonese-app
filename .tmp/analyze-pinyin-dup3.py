import os
import unicodedata

def tones(p):
    nf = unicodedata.normalize("NFD", p or "")
    return "".join(c for c in nf if unicodedata.combining(c))

def base(p):
    nf = unicodedata.normalize("NFD", p or "")
    out = "".join(c for c in nf if not unicodedata.combining(c))
    return "".join(out.lower().split())

rows = []
with open(os.path.join(os.environ["TEMP"], "dup.txt"), encoding="utf-8") as f:
    for line in f:
        parts = line.rstrip("\n").split("|")
        if len(parts) < 7:
            continue
        rows.append({
            "id": parts[0], "han": parts[1], "simp": parts[2], "pinyin": parts[3],
            "jyutping": parts[4], "hsk": parts[5], "date": parts[6],
        })

# A today-row is a PROBLEM duplicate iff:
#  - same han + same base (case/spaces/tone-insensitive) as an old row
#  - AND new row is MISSING tone marks compared to old (old has tones new lacks)
#    per-syllable, i.e. it's the SAME reading written without tone marks.
def syl_base(p):
    return [base(s) for s in (p or "").split()]

def syl_tones(p):
    return [tones(s) for s in (p or "").split()]

problems = []
for r in rows:
    if r["date"] != "2026-08-03":
        continue
    rb = syl_base(r["pinyin"])
    rt = syl_tones(r["pinyin"])
    for o in rows:
        if o["date"] == "2026-08-03":
            continue
        if o["han"] != r["han"]:
            continue
        ob = syl_base(o["pinyin"])
        if len(rb) != len(ob) or rb != ob:
            continue
        ot = syl_tones(o["pinyin"])
        # old must have a tone somewhere that new lacks (same syllable)
        missing = any(ot[i] and not rt[i] for i in range(len(ob)))
        if missing:
            problems.append((r, o))
            break

print("today-rows MISSING tone marks vs old same-reading:", len(problems))
for r, o in problems:
    print(f"  {r['han']}: NEW '{r['pinyin']}' (hsk {r['hsk']}) vs OLD '{o['pinyin']}' (hsk {o['hsk']})")
