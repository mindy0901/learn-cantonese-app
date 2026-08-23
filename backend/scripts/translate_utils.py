"""
translate_utils.py
Translate qua GoogleTranslator (deep_translator) — CHỈ Google, KHÔNG dùng fallback từ
trang khác (MyMemory/Pons/Linguee) vì kết quả không chính xác. (2026-08-24 — user yêu cầu)

Khi Google rate-limit/block (TranslationNotFound / TooManyRequests / 429) → ném
GoogleRateLimitError để route trả lỗi "Google limit" rõ ràng cho user biết thử lại sau.
"""

from deep_translator import GoogleTranslator
from deep_translator.exceptions import TranslationNotFound, TooManyRequests


class GoogleRateLimitError(Exception):
    """Google Translate rate-limited / blocked — thử lại sau."""


def translate_google_only(text, source, target, logger=None):
    """Google translate CHỈ (không fallback). Trả str, hoặc ném GoogleRateLimitError."""
    try:
        translator = GoogleTranslator(source=source, target=target)
        result = translator.translate(text)
        if result:
            if logger:
                logger.info("translate[google] OK for %r → %r", text, result)
            return result
        # Google trả rỗng → thường là bị block/rate-limit.
        raise GoogleRateLimitError("Google: no translation found (rate limit?)")
    except (TranslationNotFound, TooManyRequests) as exc:
        raise GoogleRateLimitError(f"Google rate limit: {exc}") from exc
    except GoogleRateLimitError:
        raise
    except Exception as exc:
        # Lỗi Google khác (network...) — vẫn là lỗi Google, dựng lên để báo rõ.
        raise GoogleRateLimitError(f"Google error: {exc}") from exc
