#!/usr/bin/env python3
"""
Translate text between an arbitrary source/target pair using the raw Google
Translate "gtx" endpoint (the same one Google's web UI uses). Bypasses
deep_translator (which validates language codes and uses a fallback chain).

Usage:
    python translate_google.py --single "Hello" --source en --target vi
"""
import argparse
import sys

import requests

GTX_URL = "https://translate.googleapis.com/translate_a/single"

# Browser UA giúp tránh bị Google chặn sớm (free gtx endpoint hay 429 khi thiếu UA). (2026-08-24)
GTX_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Referer": "https://translate.google.com/",
}


def translate_google(text, source, target):
    params = {"client": "gtx", "sl": source, "tl": target, "dt": "t", "q": text}
    resp = requests.get(GTX_URL, params=params, headers=GTX_HEADERS, timeout=20)
    if resp.status_code == 429:
        raise RateLimitedError("Google rate limit")
    resp.raise_for_status()
    data = resp.json()
    return "".join(seg[0] for seg in data[0] if seg and seg[0])


class RateLimitedError(Exception):
    """Google rate-limit (429) — route trả lỗi "Google limit"."""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Translate via Google Translate gtx endpoint")
    parser.add_argument("--single", type=str, required=True, help="Text to translate")
    parser.add_argument("--source", type=str, default="en", help="Source language code")
    parser.add_argument("--target", type=str, default="vi", help="Target language code")
    args = parser.parse_args()

    try:
        print(translate_google(args.single, args.source, args.target))
    except RateLimitedError:
        # exit 2 = Google rate limit → route trả 429.
        sys.stderr.write("GOOGLE_RATE_LIMIT\n")
        sys.exit(2)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"translate-google error: {exc}", file=sys.stderr)
        print("")
        sys.exit(1)
