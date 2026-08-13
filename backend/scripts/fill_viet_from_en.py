#!/usr/bin/env python3
"""
Fill empty/placeholder viet_meanings for pure-Cantonese vocabularies by
translating their eng_meanings (recently imported from CC-Canto) EN -> VI.

Usage:
    python fill_viet_from_en.py [--dry-run]
"""
import os
import sys
import time
import argparse
import logging

import re

import psycopg2
from translate_utils import translate_with_fallback

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stdout)
log = logging.getLogger(__name__)


def capitalize_sentences(value):
    """Match backend capitalizeSentences: uppercase after start or [.!?;/]."""
    s = (value or "").strip()
    if not s:
        return s
    return re.sub(r"(^|[.!?;/]\s*)([^\W\d_])", lambda m: m.group(1) + m.group(2).upper(), s)

DB_URL = os.environ.get("DATABASE_URL", "postgresql://cantonese:cantonese@db:5432/cantonese")
DELAY = float(os.environ.get("TRANSLATE_DELAY", "1.5"))


def main(dry_run):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, han_traditional, viet_meanings, eng_meanings
        FROM vocabularies
        WHERE pure_cantonese = true
          AND (viet_meanings = han_traditional
               OR viet_meanings = han_simplified
               OR viet_meanings IS NULL OR viet_meanings = '')
          AND eng_meanings IS NOT NULL AND eng_meanings != ''
        """
    )
    rows = cur.fetchall()
    print(f"Need fill: {len(rows)}")
    ok = 0
    for (vid, han, vv, en) in rows:
        text = (en or "").strip()
        if not text:
            continue
        try:
            vi = translate_with_fallback(text, source="en", target="vi", logger=log)
        except Exception as e:
            log.error(f"translate failed for {han}: {e}")
            vi = ""
        if vi:
            vi = capitalize_sentences(vi)
            print(f"{han}\t{vv!r} -> {vi!r}\t(en: {text[:70]})")
            ok += 1
            if not dry_run:
                cur.execute(
                    "UPDATE vocabularies SET viet_meanings=%s, updated_at=now() WHERE id=%s",
                    (vi, vid),
                )
        else:
            print(f"{han}: TRANSLATE FAILED")
        time.sleep(DELAY)
    if not dry_run:
        conn.commit()
        print(f"Committed {ok} updates.")
    else:
        print(f"(dry-run) would update {ok}.")
    cur.close()
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fill viet_meanings from eng_meanings (EN->VI)")
    parser.add_argument("--dry-run", action="store_true", help="Preview translations, no DB write")
    args = parser.parse_args()
    main(args.dry_run)
