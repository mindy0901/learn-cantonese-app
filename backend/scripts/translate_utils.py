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
    """Google Translate rate-limited — HTTP 429 THẬT (quota). Thử lại sau."""


class GoogleBlockedError(Exception):
    """Google chặn truy cập nhưng KHÔNG phải 429 — trả response rỗng / HTML challenge
    (deep_translator TranslationNotFound) hoặc kết quả rỗng."""


class GoogleError(Exception):
    """Lỗi Google khác (network / timeout / SSL / parse...) — KHÔNG liên quan rate-limit."""


def translate_google_only(text, source, target, logger=None):
    """Google translate CHỈ (không fallback). Trả str, hoặc ném:
    - GoogleRateLimitError: HTTP 429 thật (quota)
    - GoogleBlockedError:   Google chặn, trả rỗng/HTML challenge (KHÔNG phải 429)
    - GoogleError:          lỗi khác (network/timeout...)
    (2026-08-26 — tách nhãn "rate limit" gộp trước đây vì mọi lỗi đều bị gán sai.)"""
    try:
        translator = GoogleTranslator(source=source, target=target)
        result = translator.translate(text)
        if result:
            if logger:
                logger.info("translate[google] OK for %r → %r", text, result)
            return result
        # Google trả rỗng → bị block/challenge (KHÔNG phải 429).
        raise GoogleBlockedError("Google: empty response (blocked)")
    except (TooManyRequests,) as exc:
        # HTTP 429 thật → rate limit thật.
        raise GoogleRateLimitError(f"Google rate limit: {exc}") from exc
    except TranslationNotFound as exc:
        # deep_translator không parse được response → thường Google chặn/challenge.
        raise GoogleBlockedError(f"Google blocked: {exc}") from exc
    except GoogleRateLimitError:
        raise
    except GoogleBlockedError:
        raise
    except Exception as exc:
        # Lỗi khác (network/timeout...) — KHÔNG phải rate-limit.
        raise GoogleError(f"Google error: {exc}") from exc
