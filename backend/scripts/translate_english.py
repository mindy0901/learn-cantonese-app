#!/usr/bin/env python3
"""
Batch translate Chinese (simplified) → English for vocabularies missing engMeanings.
Uses deep-translator (Google Translate).

Usage:
    python translate_english.py [--batch-size 50] [--delay 1.0] [--resume] [--dry-run]
    python translate_english.py --single "学习"
"""
import os
import sys
import json
import time
import argparse
import logging
from datetime import datetime

import psycopg2
from deep_translator import GoogleTranslator
from translate_utils import translate_with_fallback

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/app/scripts/translate_english.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
DB_URL = os.environ.get("DATABASE_URL", "postgresql://cantonese:cantonese@db:5432/cantonese")
PROGRESS_FILE = "/app/scripts/translate_english_progress.json"


def get_connection():
    """Create a new database connection."""
    return psycopg2.connect(DB_URL)


def load_progress():
    """Load progress from file for resume support."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"last_index": 0, "processed": 0, "updated": 0, "errors": 0}


def save_progress(progress):
    """Save progress to file."""
    progress["updated_at"] = datetime.now().isoformat()
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)


def fetch_vocabularies_needing_translation():
    """
    Fetch all unique simplified characters that need English translation.
    Returns list of (han_simplified, ids[]) grouped by character.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT han_simplified, array_agg(id::text) as ids
        FROM vocabularies
        WHERE hsk_level IS NOT NULL
          AND hsk_level != ''
          AND (eng_meanings IS NULL OR eng_meanings = '')
          AND han_simplified IS NOT NULL
          AND han_simplified != ''
        GROUP BY han_simplified
        ORDER BY han_simplified
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def translate_batch(translator, texts, max_retries=3):
    """
    Translate a batch of texts with retry logic.
    Returns dict {original_text: translated_text}.
    """
    results = {}
    for text in texts:
        for attempt in range(max_retries):
            try:
                translation = translator.translate(text)
                results[text] = translation
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 2
                    log.warning(f"Retry {attempt+1}/{max_retries} for '{text}': {e}. Waiting {wait}s...")
                    time.sleep(wait)
                else:
                    log.error(f"Failed to translate '{text}' after {max_retries} attempts: {e}")
                    results[text] = None
    return results


def update_vocabularies(ids, eng_meanings):
    """
    Update eng_meanings for all vocabularies with given IDs.
    Only updates if eng_meanings is still empty (don't overwrite user edits).
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE vocabularies
        SET eng_meanings = %s, updated_at = NOW()
        WHERE id = ANY(%s::uuid[])
          AND (eng_meanings IS NULL OR eng_meanings = '')
    """, (eng_meanings, ids))
    updated = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return updated


def run_batch_translation(batch_size=50, delay=1.0, resume=False, dry_run=False):
    """
    Main batch translation function.
    
    Args:
        batch_size: Number of unique characters to translate per batch
        delay: Delay in seconds between batches (rate limiting)
        resume: Whether to resume from last progress
        dry_run: If True, don't actually update the database
    """
    log.info("=" * 60)
    log.info("Starting batch English translation")
    log.info(f"Batch size: {batch_size}, Delay: {delay}s, Resume: {resume}, Dry run: {dry_run}")
    log.info("=" * 60)

    # Load vocabularies needing translation
    vocab_groups = fetch_vocabularies_needing_translation()
    total_unique = len(vocab_groups)
    log.info(f"Found {total_unique} unique characters needing translation")

    if total_unique == 0:
        log.info("No vocabularies need translation. Exiting.")
        return

    # Load progress for resume
    progress = load_progress() if resume else {"last_index": 0, "processed": 0, "updated": 0, "errors": 0}
    start_index = progress["last_index"]
    
    if start_index > 0:
        log.info(f"Resuming from index {start_index} ({progress['processed']} already processed)")

    # Initialize translator (deep-translator)
    translator = GoogleTranslator(source='zh-CN', target='en')

    # Process in batches
    total_updated = progress["updated"]
    total_errors = progress["errors"]
    
    for i in range(start_index, total_unique, batch_size):
        batch = vocab_groups[i:i + batch_size]
        batch_texts = [item[0] for item in batch]
        batch_ids_map = {item[0]: item[1] for item in batch}
        
        log.info(f"Processing batch {i//batch_size + 1}: items {i+1}-{min(i+batch_size, total_unique)} of {total_unique}")

        # Translate batch
        translations = translate_batch(translator, batch_texts)

        # Update database
        for char, translated in translations.items():
            if translated is None:
                total_errors += 1
                continue
            
            ids = batch_ids_map[char]
            if dry_run:
                log.info(f"  [DRY RUN] '{char}' → '{translated}' ({len(ids)} rows)")
            else:
                updated = update_vocabularies(ids, translated)
                total_updated += updated
                if updated > 0:
                    log.info(f"  ✓ '{char}' → '{translated}' ({updated} rows updated)")

        # Save progress
        progress["last_index"] = i + batch_size
        progress["processed"] += len(batch)
        progress["updated"] = total_updated
        progress["errors"] = total_errors
        save_progress(progress)

        # Rate limiting delay
        if i + batch_size < total_unique:
            log.info(f"  Waiting {delay}s before next batch...")
            time.sleep(delay)

    # Final summary
    log.info("=" * 60)
    log.info("Translation complete!")
    log.info(f"  Total processed: {progress['processed']}")
    log.info(f"  Total updated: {total_updated}")
    log.info(f"  Total errors: {total_errors}")
    log.info("=" * 60)


def translate_single(text):
    """
    Translate a single text from Chinese to English.
    Used by the API endpoint. Tries multiple deep-translator backends.
    """
    try:
        translation = translate_with_fallback(text, source="zh-CN", target="en", logger=log)
        return translation
    except Exception as e:
        log.error(f"Failed to translate '{text}': {e}")
        return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch translate Chinese → English")
    parser.add_argument("--batch-size", type=int, default=50, help="Number of characters per batch")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between batches (seconds)")
    parser.add_argument("--resume", action="store_true", help="Resume from last progress")
    parser.add_argument("--dry-run", action="store_true", help="Don't update database, just preview")
    parser.add_argument("--single", type=str, help="Translate a single text and print result (plain output)")
    
    args = parser.parse_args()
    
    if args.single:
        result = translate_single(args.single)
        if result is not None:
            print(result)
        else:
            print("")
            sys.exit(1)
    else:
        run_batch_translation(
            batch_size=args.batch_size,
            delay=args.delay,
            resume=args.resume,
            dry_run=args.dry_run,
        )
