#!/usr/bin/env python3
"""
fill_garbage_viet.py — Replace placeholder viet_meanings that are ONLY Han
characters (OCR-mangled garbage, e.g. 㗎喎→"㗎厎", 啱啱→"山山") with a real
Vietnamese translation of the English meaning (EN -> VI via the app pipeline).

Usage:
    python fill_garbage_viet.py [--dry-run]
"""
import os
import re
import sys
import time
import argparse
import logging

import psycopg2
from translate_utils import translate_with_fallback

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stdout)
log = logging.getLogger(__name__)

DB_URL = os.environ.get("DATABASE_URL", "postgresql://cantonese:cantonese@db:5432/cantonese")
DELAY = float(os.environ.get("TRANSLATE_DELAY", "1.5"))

# Only CJK chars (no latin/digits/separators) => clearly a placeholder, not a real meaning
HAN_ONLY = re.compile(r"^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+$")


def capitalize_sentences(s):
    s = (s or "").strip()
    if not s:
        return s
    return re.sub(r"(^|[.!?;/]\s*)([^\W\d_])", lambda m: m.group(1) + m.group(2).upper(), s)


def main(dry):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, han_traditional, viet_meanings, eng_meanings
        FROM vocabularies
        WHERE eng_meanings IS NOT NULL AND eng_meanings <> ''
          AND viet_meanings IS NOT NULL AND viet_meanings <> ''
        """
    )
    rows = cur.fetchall()
    targets = [r for r in rows if HAN_ONLY.match(r[2].strip())]
    print(f"scanned: {len(rows)}, garbage viet (Han-only): {len(targets)}", flush=True)

    for (vid, han, vv, en) in targets:
        text = en.strip()
        try:
            vi = translate_with_fallback(text, source="en", target="vi", logger=log)
        except Exception as e:
            log.error(f"translate failed for {han}: {e}")
            continue
        vi = capitalize_sentences(vi) if vi else ""
        print(f"{han}\t{vv!r} -> {vi!r}", flush=True)
        if not dry and vi:
            cur.execute(
                "UPDATE vocabularies SET viet_meanings=%s, updated_at=now() WHERE id=%s",
                (vi, vid),
            )
        time.sleep(DELAY)
    if not dry:
        conn.commit()
        print(f"committed {len(targets)} updates", flush=True)
    cur.close()
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    main(args.dry_run)
