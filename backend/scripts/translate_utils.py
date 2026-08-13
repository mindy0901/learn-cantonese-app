"""
translate_utils.py
Shared helpers for the translate scripts — a fallback chain across multiple
deep-translator backends so we don't get stuck on the Google free rate limit.

Chain order (no API key needed):
    GoogleTranslator → MyMemoryTranslator → PonsTranslator → LingueeTranslator
The first backend that returns a non-empty translation wins.
"""

from deep_translator import GoogleTranslator, MyMemoryTranslator, PonsTranslator, LingueeTranslator


def _build_backends(source, target):
    backends = []
    for name, cls, args in (
        ("google", GoogleTranslator, {"source": source, "target": target}),
        ("mymemory", MyMemoryTranslator, {"source": source, "target": target}),
        ("pons", PonsTranslator, {"source": source[:2], "target": target[:2]}),
        ("linguee", LingueeTranslator, {"source": source[:2], "target": target[:2]}),
    ):
        try:
            backends.append((name, cls(**args)))
        except Exception:
            continue
    return backends


def translate_with_fallback(text, source, target, logger=None):
    """Translate `text` trying each backend in order. Returns str or None."""
    for name, translator in _build_backends(source, target):
        try:
            result = translator.translate(text)
            if result:
                if logger:
                    logger.info("translate[%s] OK for %r → %r", name, text, result)
                return result
        except Exception as exc:  # rate limit / network / missing result
            if logger:
                logger.warning("translate[%s] failed for %r: %s", name, text, exc)
            continue
    return None
