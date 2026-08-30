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

from translate_utils import (
    translate_google_only,
    GoogleRateLimitError,
    GoogleBlockedError,
    GoogleError,
)

logging.basicConfig(level=logging.WARNING)
log = logging.getLogger(__name__)


def translate_pair(text, source, target):
    """Trả (result, code): result = bản dịch hoặc chuỗi lý do lỗi; code = exit code.
    - 0: dịch thành công (result = bản dịch)
    - 2: Google rate limit (HTTP 429 thật)
    - 3: Google chặn (trả rỗng/HTML challenge — KHÔNG phải 429)
    - 4: lỗi Google khác (network/timeout)
    - 1: lỗi generic (defensive)
    stderr chứa message gốc (prefix GOOGLE_*) để route/UI phân biệt lý do. (2026-08-26)"""
    try:
        return translate_google_only(text, source=source, target=target, logger=log), 0
    except GoogleRateLimitError as exc:
        log.error("Google rate limit: %s", exc)
        return f"GOOGLE_RATE_LIMIT: {exc}", 2
    except GoogleBlockedError as exc:
        log.error("Google blocked: %s", exc)
        return f"GOOGLE_BLOCKED: {exc}", 3
    except GoogleError as exc:
        log.error("Google error: %s", exc)
        return f"GOOGLE_ERROR: {exc}", 4
    except Exception as exc:  # pragma: no cover - defensive
        log.error("Failed to translate %r (%s -> %s): %s", text, source, target, exc)
        return None, 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Translate a single text between two languages")
    parser.add_argument("--single", type=str, required=True, help="Text to translate")
    parser.add_argument("--source", type=str, default="en", help="Source language code (e.g. en, vi)")
    parser.add_argument("--target", type=str, default="vi", help="Target language code (e.g. vi, en)")
    args = parser.parse_args()

    result, code = translate_pair(args.single, args.source, args.target)
    if code:
        # exit 2 = Google rate limit (429 thật); 3 = Google chặn (trả rỗng); 4 = lỗi khác
        # (network/timeout); 1 = lỗi generic. stderr chứa message gốc (prefix GOOGLE_*). (2026-08-26)
        sys.stderr.write(f"{result}\n")
        sys.exit(code)
    print(result)
