# -*- coding: utf-8 -*-
"""Estimate impact of pinyin-based SV selection on all vocabularies (READ-ONLY).
Counts how many vocabularies would get a DIFFERENT SV reading when choosing
per-char reading by the word's pinyin (using ph0ngp/hanviet-pinyin-wordlist).
"""
import json
import re
import psycopg2

DATA = "backend/data/"

# --- tone mark -> number mapping (repo style: u: for u-umlaut) ---
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
    out = []
    tone = None
    for ch in s:
        if ch in TONE_MAP:
            val = TONE_MAP[ch]
            m = re.match(r"^([a-z])(\d)$", val)
            if m:
                out.append(m.group(1))
                tone = m.group(2)
            else:
                out.append(val)  # u: (maybe with tone handled below)
        else:
            out.append(ch)
    num = "".join(out)
    if tone and not re.search(r"\d$", num):
        num = num + tone
    return num

# --- Build repo map: char -> { pinyin_num -> [readings] } ---
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
        py = m.group(3).strip()
        if py == "*":
            # single reading regardless of pinyin
            repo.setdefault(ch, {})["*"] = [str(r).strip() for r in readings if str(r).strip()]
        else:
            repo.setdefault(ch, {})[py] = [str(r).strip() for r in readings if str(r).strip()]

def pick_reading(ch, py_num):
    entry = repo.get(ch)
    if not entry:
        return None, "no-char"
    if "*" in entry:
        return entry["*"], "single"
    if py_num in entry:
        return entry[py_num], "by-pinyin"
    # fallback: first pinyin entry
    for k, v in entry.items():
        return v, "fallback-first"
    return None, "empty"

# --- Current map (char -> single reading) ---
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
cur.execute("SELECT id, han_traditional, pinyin, sino_vietnamese FROM vocabularies")
rows = cur.fetchall()
cur.close()
conn.close()

changed = 0
same = 0
no_pinyin = 0
no_char_in_repo = 0
new_sv_from_repo = 0
examples = []

for vid, trad, pinyin, current_sv in rows:
    trad = (trad or "").strip()
    pinyin = (pinyin or "").strip()
    if not trad:
        continue
    chars = [c for c in trad if HAN_RE.match(c)]
    if not chars:
        continue
    if not pinyin:
        no_pinyin += 1
        continue

    # per-char pinyin
    syllables = [py_marks_to_num(s) for s in pinyin.split()]
    if len(syllables) != len(chars):
        # try aligning: sometimes pinyin has fewer/more; use first N
        if len(syllables) >= len(chars):
            syllables = syllables[: len(chars)]
        else:
            no_pinyin += 1
            continue

    # build new SV string from repo (per-char)
    new_parts = []
    resolved_all = True
    for ch, py in zip(chars, syllables):
        rd, src = pick_reading(ch, py)
        if rd is None:
            # fallback to current map
            cur = our_reading(ch)
            if cur:
                new_parts.append(cur)
                continue
            resolved_all = False
            new_parts.append("?")
            continue
        new_parts.append(rd[0] if rd else "?")

    new_sv = " ".join(new_parts)
    # normalize comparison (case-insensitive, space-normalized)
    norm = lambda s: re.sub(r"\s+", " ", (s or "").strip()).lower()
    if norm(new_sv) != norm(current_sv):
        changed += 1
        if len(examples) < 12:
            examples.append({"trad": trad, "pinyin": pinyin, "old": (current_sv or "").strip(), "new": new_sv})
    else:
        same += 1

print(json.dumps({
    "total_rows": len(rows),
    "would_change": changed,
    "would_stay_same": same,
    "skipped_no_pinyin": no_pinyin,
    "examples": examples,
}, ensure_ascii=True))
