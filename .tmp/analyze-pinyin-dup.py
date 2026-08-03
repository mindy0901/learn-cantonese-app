import os
import unicodedata

def strip_tone(p):
    # remove combining tone marks + lowercase + remove spaces
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

# index: (han, stripped_pinyin) -> rows
from collections import defaultdict
by_key = defaultdict(list)
for r in rows:
    by_key[(r["han"], strip_tone(r["pinyin"]))].append(r)

# Find duplicates: a today-row that shares (han, stripped pinyin) with an old row
today_dups = []
for (han, key), group in by_key.items():
    if not key:
        continue
    olds = [r for r in group if r["date"] != "2026-08-03"]
    news = [r for r in group if r["date"] == "2026-08-03"]
    if olds and news:
        for n in news:
            today_dups.append((n, olds))

print("TOTAL today-rows duplicating an old reading (by stripped pinyin):", len(today_dups))
print()
# categorize: new has tone marks vs new lacks tone marks
no_tone_new = 0
tone_new = 0
def has_tone(p):
    nf = unicodedata.normalize("NFD", p or "")
    return any(unicodedata.combining(c) for c in nf)
for n, olds in today_dups:
    if has_tone(n["pinyin"]):
        tone_new += 1
    else:
        no_tone_new += 1
print("  new pinyin LACKS tone marks:", no_tone_new)
print("  new pinyin HAS tone marks:", tone_new)
print()
print("-- samples (new vs old) --")
for n, olds in today_dups[:25]:
    o = olds[0]
    print(f"  {n['han']}: NEW py='{n['pinyin']}' (hsk {n['hsk']}, {n['date']}) vs OLD py='{o['pinyin']}' (hsk {o['hsk']}, {o['date']})")
