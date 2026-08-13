#!/usr/bin/env python3
"""
Translate a single text between an arbitrary source/target language pair,
used by the generic /api/translate endpoint (e.g. vi <-> en meaning sync).

Usage:
    python translate_pair.py --single "Hello" --source en --target vi
"""
import argparse
import logging
import sys

from translate_utils import translate_with_fallback

logging.basicConfig(level=logging.WARNING)
log = logging.getLogger(__name__)


def translate_pair(text, source, target):
    try:
        return translate_with_fallback(text, source=source, target=target, logger=log)
    except Exception as exc:  # pragma: no cover - defensive
        log.error("Failed to translate %r (%s -> %s): %s", text, source, target, exc)
        return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Translate a single text between two languages")
    parser.add_argument("--single", type=str, required=True, help="Text to translate")
    parser.add_argument("--source", type=str, default="en", help="Source language code (e.g. en, vi)")
    parser.add_argument("--target", type=str, default="vi", help="Target language code (e.g. vi, en)")
    args = parser.parse_args()

    result = translate_pair(args.single, args.source, args.target)
    if result is not None:
        print(result)
    else:
        print("")
        sys.exit(1)
