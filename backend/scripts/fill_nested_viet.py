#!/usr/bin/env python3
"""
fill_nested_viet.py — Translate nested vocabulary_meanings.viet_meanings from
their eng_meanings (EN -> VI) via the app's translate pipeline.

Resumable: only processes rows whose viet_meanings is empty; commits in batches,
so re-running after a crash skips already-translated rows.

Usage:
    python fill_nested_viet.py [--dry-run] [--limit N] [--pure] [--overwrite]

Options:
    --pure       Only vocabularies flagged pure_cantonese = true.
    --overwrite  Also translate rows that already have a viet_meanings (overwrite).
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


def capitalize_sentences(s):
    s = (s or "").strip()
    if not s:
        return s
    return re.sub(r"(^|[.!?;/]\s*)([^\W\d_])", lambda m: m.group(1) + m.group(2).upper(), s)


def main(dry, limit, pure, overwrite):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    q = """
        SELECT vm.id, vm.eng_meanings
        FROM vocabulary_meanings vm
        JOIN vocabularies v ON v.id = vm.vocabulary_id
        WHERE vm.eng_meanings IS NOT NULL AND vm.eng_meanings <> ''
    """
    conds = []
    if pure:
        conds.append("v.pure_cantonese = true")
    if not overwrite:
        conds.append("(vm.viet_meanings IS NULL OR vm.viet_meanings = '')")
    if conds:
        q += " AND " + " AND ".join(conds)
    q += " ORDER BY vm.id"
    cur.execute(q)
    rows = cur.fetchall()
    if limit:
        rows = rows[:limit]
    print(f"to translate: {len(rows)}", flush=True)
    cache = {}
    updated = errors = skipped = 0
    for (mid, en) in rows:
        en = (en or "").strip()
        if not en:
            skipped += 1
            continue
        if en in cache:
            vi = cache[en]
        else:
            try:
                vi = translate_with_fallback(en, source="en", target="vi", logger=log)
            except Exception as e:
                log.error(f"failed {mid}: {e}")
                errors += 1
                continue
            vi = (vi or "").strip()
            cache[en] = vi
        if not vi:
            errors += 1
            continue
        vi = capitalize_sentences(vi)
        if not dry:
            cur.execute(
                "UPDATE vocabulary_meanings SET viet_meanings=%s, updated_at=now() WHERE id=%s",
                (vi, mid),
            )
        updated += 1
        if updated % 25 == 0:
            print(f"  ... {updated} translated (errors={errors})", flush=True)
            if not dry:
                conn.commit()
        time.sleep(DELAY)
    if not dry:
        conn.commit()
    cur.close()
    conn.close()
    print(f"DONE: updated={updated} errors={errors} skipped={skipped}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--pure", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    main(args.dry_run, args.limit, args.pure, args.overwrite)
