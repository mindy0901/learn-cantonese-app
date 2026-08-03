import os
import unicodedata

def has_tone(p):
    nf = unicodedata.normalize("NFD", p or "")
    return any(unicodedata.combining(c) for c in nf)

def strip_tone(p):
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

# True problems: a today-row whose pinyin is MISSING tone marks on a syllable,
# while an old row with same (han, strip-tone pinyin) HAS tone marks.
# (i.e. xue-hanzi wrote pinyin without tone → duplicates the correct old reading)
problems = []
for r in rows:
    if r["date"] != "2026-08-03":
        continue
    if has_tone(r["pinyin"]):
        continue  # has tone marks — either a legit different reading or fine
    # find old row same han + same stripped pinyin that HAS tone
    for o in rows:
        if o["date"] == "2026-08-03":
            continue
        if o["han"] == r["han"] and strip_tone(o["pinyin"]) == strip_tone(r["pinyin"]):
            problems.append((r, o))
            break

print("today-rows with NO tone marks duplicating an old row:", len(problems))
for r, o in problems:
    print(f"  {r['han']}: NEW '{r['pinyin']}' (hsk {r['hsk']}) vs OLD '{o['pinyin']}' (hsk {o['hsk']})")
