# -*- coding: utf-8 -*-
"""Refine analysis: among vocabularies where pinyin-based SV would change,
how many contain a MULTI-reading char (repo value-add) vs single-reading chars
(repo risk). READ-ONLY.
"""
import json
import re
import psycopg2

DATA = "backend/data/"

TONE_MAP = {
    "\u0101": "a1", "\u00e1": "a2", "\u01ce": "a3", "\u00e0": "a4",
    "\u0113": "e1", "\u00e9": "e2", "\u011b": "e3", "\u00e8": "e4",
    "\u012b": "i1", "\u00ed": "i2", "\u01d0": "i3", "\u00ec": "i4",
    "\u014d": "o1", "\u00f3": "o2", "\u01d2": "o3", "\u00f2": "o4",
    "\u016b": "u1", "\u00fa": "u2", "\u01d4": "u3", "\u00f9": "u4",
    "\u01d6": "u:1", "\u01d8": "u:2", "\u01da": "u:3", "\u01dc": "u:4",
    "\u00fc": "u:",
}

def py_marks_to_num(syl):
    s = syl.lower().strip()
    out, tone = [], None
    for ch in s:
        val = TONE_MAP.get(ch)
        if val:
            m = re.match(r"^([a-z])(\d)$", val)
            if m:
                out.append(m.group(1)); tone = m.group(2)
            else:
                out.append(val)
        else:
            out.append(ch)
    num = "".join(out)
    if tone and not re.search(r"\d$", num):
        num += tone
    return num

repo = {}
with open(DATA + "_hanviet-pinyin.csv", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("char,"):
            continue
        m = re.match(r"^([^,]+),\[(.*?)\],(.+)$", line)
        if not m:
            continue
        ch = m.group(1).strip()
        try:
            readings = json.loads("[" + m.group(2) + "]")
        except Exception:
            readings = [x for x in re.split(r"[',]", m.group(2)) if x and x.strip()]
        repo.setdefault(ch, {}).setdefault(m.group(3).strip(), [str(r).strip() for r in readings if str(r).strip()])

with open(DATA + "sino-vietnamese.json", encoding="utf-8") as f:
    our = json.load(f)

def our_reading(ch):
    e = our.get(ch)
    if not e:
        return None
    if isinstance(e, dict) and isinstance(e.get("readings"), list):
        return e["readings"][0]
    return str(e)

HAN_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")

conn = psycopg2.connect(host="localhost", port=5432, user="cantonese", password="cantonese", dbname="cantonese")
cur = conn.cursor()
cur.execute("SELECT han_traditional, pinyin, sino_vietnamese FROM vocabularies")
rows = cur.fetchall()
cur.close(); conn.close()

# classify each char: is it multi-reading in repo (different readings per pinyin)?
def char_is_multireading(ch):
    entry = repo.get(ch)
    if not entry:
        return False
    if "*" in entry and len(entry) == 1:
        return False
    # distinct reading sets across pinyins
    sets = set()
    for py, rs in entry.items():
        sets.add(tuple(sorted(rs)))
    return len(sets) > 1

changed_multi = 0   # word contains >=1 multi-reading char, SV would change
changed_single = 0  # word has NO multi-reading char but SV would change (repo overwrite risk)
examples_multi = []
examples_single = []

for trad, pinyin, current_sv in rows:
    trad = (trad or "").strip()
    pinyin = (pinyin or "").strip()
    if not trad or not pinyin:
        continue
    chars = [c for c in trad if HAN_RE.match(c)]
    syllables = [py_marks_to_num(s) for s in pinyin.split() if s]
    if len(chars) == 0 or len(syllables) != len(chars):
        continue

    has_multi = any(char_is_multireading(c) for c in chars)
    new_parts = []
    ok = True
    for ch, py in zip(chars, syllables):
        entry = repo.get(ch)
        rd = None
        if entry:
            if "*" in entry and entry["*"]:
                rd = entry["*"][0]
            elif py in entry and entry[py]:
                rd = entry[py][0]
            else:
                for rs in entry.values():
                    if rs:
                        rd = rs[0]
                        break
        if not rd:
            rd = our_reading(ch)
        if not rd:
            ok = False
            break
        new_parts.append(rd)
    if not ok:
        continue
    new_sv = " ".join(new_parts)
    norm = lambda s: re.sub(r"\s+", " ", (s or "").strip()).lower()
    if norm(new_sv) == norm(current_sv):
        continue  # unchanged

    ex = {"trad": trad, "pinyin": pinyin, "old": (current_sv or "").strip(), "new": new_sv}
    if has_multi:
        changed_multi += 1
        if len(examples_multi) < 10:
            examples_multi.append(ex)
    else:
        changed_single += 1
        if len(examples_single) < 10:
            examples_single.append(ex)

print(json.dumps({
    "would_change_TOTAL": changed_multi + changed_single,
    "contains_MULTI_reading_char (repo value)": changed_multi,
    "NO multi-reading char (repo overwrite risk)": changed_single,
    "examples_multi": examples_multi,
    "examples_single": examples_single,
}, ensure_ascii=True))
