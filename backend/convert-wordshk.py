#!/usr/bin/env python3
"""
convert-wordshk.py — Convert the words.hk dictionary (from
alienkevin/wordshk_app assets/dict.db.gz) into backend/data/wordshk.json.

Lossless rules:
  - Every definition (Cantonese + English) from every entry is kept.
  - Every example sentence is kept (including punctuation).
  - Records with the same (trad, jyutping) are MERGED (defs + examples
    concatenated, deduped only on exact duplicates), never dropped.

Format (one record per (trad, jyutping)):
    {
      "t":   "冧把",                 # traditional written form
      "s":   "冧巴",                 # simplified written form
      "jp":  "lam4 baa2",            # jyutping (decoded from rich-dict encoding)
      "pos": ["名詞"],                # parts of speech (union)
      "defs": [ {"yue": "...", "en": "..."} ],
      "egs":  [ {"yue": "...", "jp": "...", "en": "..."} ]
    }

Usage:
    python convert-wordshk.py
    WORDHK_DB=<path> python convert-wordshk.py
"""
import gzip
import json
import os
import shutil
import sqlite3
import urllib.request

URL = "https://raw.githubusercontent.com/AlienKevin/wordshk_app/main/assets/dict.db.gz"
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB = os.path.join(HERE, "_wordshk_dict.db")
OUT = os.path.join(HERE, "data", "wordshk.json")


def ensure_db():
    db = os.environ.get("WORDHK_DB", DEFAULT_DB)
    if not os.path.exists(db):
        gz = db + ".gz"
        print(f"downloading {URL} -> {gz}")
        urllib.request.urlretrieve(URL, gz)
        with gzip.open(gz, "rb") as f, open(db, "wb") as out:
            shutil.copyfileobj(f, out)
        os.remove(gz)
    print(f"using db: {db} ({os.path.getsize(db) / 1e6:.1f} MB)")
    return db


def _token_text(tok):
    """Return text for a rich-dict token, recursing into nested structures."""
    if isinstance(tok, str):
        return tok
    if not isinstance(tok, list) or len(tok) < 2:
        return ""
    val = tok[1]
    if isinstance(val, str):
        return val
    if isinstance(val, list):
        return "".join(_token_text(t) for t in val)
    return ""


def _is_token(node):
    return isinstance(node, list) and len(node) == 2 and isinstance(node[0], str)


def _token_value(node):
    val = node[1]
    return _token_text(val) if isinstance(val, list) else (val or "")


def clause_to_text(clause):
    """rich-dict clause -> plain text. Handles both def-style
    [[token,...], ...] and example-style [token, ...] nesting, and never
    leaks token-type strings (T/B/L/N/P)."""
    if not clause or not isinstance(clause, list):
        return ""

    def walk_seg(seg):
        parts = []
        for tok in seg:
            if _is_token(tok):
                parts.append(_token_value(tok))
            else:
                parts.append(walk_seg(tok))
        return "".join(parts)

    parts = []
    for item in clause:
        if _is_token(item):
            parts.append(_token_value(item))
        else:
            parts.append(walk_seg(item))
    return " ".join(p for p in parts if p).strip()


def decode_variant(v):
    """Decode rich-dict pronunciation segments -> LIST of jyutping strings.
    A variant can have MULTIPLE pronunciation groups (alternative full-word
    readings, e.g. 一個人 → jan4 / jan2 / jan1). Each group becomes its own
    jyutping (and thus its own vocabulary row)."""
    p = v.get("p")
    if not p:
        return []
    result = []
    for group in p:
        syls = []
        for seg in group:
            s = seg.get("S") or {}
            syls.append(
                ((s.get("i") or "") + (s.get("n") or "") + (s.get("c") or "")).lower()
                + (s.get("t") or "T0").replace("T", "")
            )
        result.append(" ".join(syls))
    return result


def example_yue(eg):
    """Extract Cantonese example text (+ jyutping) from eg.y R segments."""
    y = eg.get("y") or {}
    r = y.get("R") or []
    chars, prs = [], []
    for w in r:
        if "P" in w:
            chars.append(w["P"])
            continue
        wseg = w.get("W")
        if not wseg:
            continue
        if wseg and wseg[0]:
            chars.append("".join(_token_text(t) for t in wseg[0]))
        if len(wseg) > 1 and isinstance(wseg[1], list):
            prs.extend(wseg[1])
    return "".join(chars).strip(), " ".join(prs).strip()


def main():
    db = ensure_db()
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    cur.execute("SELECT id, entry FROM rich_dict")

    merged = {}
    count = 0
    for eid, raw in cur.fetchall():
        try:
            entry = json.loads(raw)
        except Exception:
            continue
        pos = entry.get("p") or []
        defs_out = []
        for d in entry.get("d") or []:
            yue = clause_to_text(d.get("y"))
            en = clause_to_text(d.get("e"))
            if not (yue or en):
                continue
            egs = []
            for eg in d.get("eg") or []:
                yue_eg, jp_eg = example_yue(eg)
                en_eg = clause_to_text(eg.get("e"))
                if yue_eg or en_eg:
                    egs.append({"yue": yue_eg, "jp": jp_eg, "en": en_eg})
            defs_out.append({"yue": yue, "en": en, "egs": egs})
        for v in entry.get("v") or []:
            t = v.get("w", "")
            if not t:
                continue
            # one record per pronunciation group (each group = one reading)
            for jp in decode_variant(v):
                if not jp:
                    continue
                key = (t, jp)
                rec = merged.get(key)
                if rec is None:
                    rec = {
                        "t": t,
                        "s": v.get("ws", ""),
                        "jp": jp,
                        "pos": list(pos),
                        "defs": [],
                    }
                    merged[key] = rec
                else:
                    for p in pos:
                        if p not in rec["pos"]:
                            rec["pos"].append(p)
                    if not rec["s"] and v.get("ws"):
                        rec["s"] = v.get("ws", "")
                for d in defs_out:
                    if d not in rec["defs"]:
                        rec["defs"].append(d)
        count += 1

    records = list(merged.values())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=1)
    total_defs = sum(len(r["defs"]) for r in records)
    total_egs = sum(len(d.get("egs", [])) for r in records for d in r["defs"])
    size = os.path.getsize(OUT) / 1e6
    print(f"entries: {count}, records: {len(records)}, defs: {total_defs}, egs: {total_egs}")
    print(f"wrote {OUT} ({size:.1f} MB)")
    conn.close()


if __name__ == "__main__":
    main()
