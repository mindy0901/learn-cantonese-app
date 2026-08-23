#!/usr/bin/env python3
"""
Translate written Cantonese (粵文) → Vietnamese using the raw Google Translate
endpoint. deep_translator blocks 'yue' as a source code (only zh-CN / zh-TW are
accepted), so we call the same gtx endpoint Google's web UI uses directly, which
does support sl=yue.

Usage:
    python translate_cantonese.py --single "就算有若干例外嘅慣用語…"
"""
import argparse
import sys

import requests

GTX_URL = "https://translate.googleapis.com/translate_a/single"


def translate_yue_vi(text):
    params = {"client": "gtx", "sl": "yue", "tl": "vi", "dt": "t", "q": text}
    resp = requests.get(GTX_URL, params=params, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    return "".join(seg[0] for seg in data[0] if seg and seg[0])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Translate Cantonese to Vietnamese via Google")
    parser.add_argument("--single", type=str, required=True, help="Cantonese text to translate")
    args = parser.parse_args()

    try:
        print(translate_yue_vi(args.single))
    except Exception as exc:  # pragma: no cover - defensive
        print(f"translate-cantonese error: {exc}", file=sys.stderr)
        print("")
        sys.exit(1)
