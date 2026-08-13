#!/usr/bin/env python3
"""
RapidOCR (PP-OCRv6, ONNX) — high-accuracy offline Chinese OCR for the
vocabulary scanner. Reads a base64-encoded image from stdin and prints JSON:
    { "text": "<all lines joined by \\n>", "lines": [ { "text", "box": [x0,y0,x1,y1] } ] }

Supports simplified + traditional Chinese (PP-OCRv6 multilingual `ch` model,
bundled in the wheel — no network needed).
"""
import base64
import json
import sys

import cv2
from rapidocr import RapidOCR

# Load the engine once per process. First call downloads/validates bundled
# models (PP-OCRv6 det/rec + cls) from site-packages; no internet required.
_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = RapidOCR()
    return _engine


def main():
    raw = sys.stdin.buffer.read()
    if not raw:
        print(json.dumps({"error": "empty input"}, ensure_ascii=False))
        return 1

    try:
        img_bytes = base64.b64decode(raw)
    except Exception as exc:
        print(json.dumps({"error": f"bad base64: {exc}"}, ensure_ascii=False))
        return 1

    img = cv2.imdecode(np_frombuffer(img_bytes), cv2.IMREAD_COLOR)
    if img is None:
        print(json.dumps({"error": "cannot decode image"}, ensure_ascii=False))
        return 1

    try:
        result = get_engine()(img)
    except Exception as exc:
        print(json.dumps({"error": f"rapidocr failed: {exc}"}, ensure_ascii=False))
        return 1

    # v3 result object exposes .txts / .boxes; older style is a list of
    # [box(4pts), text, score]. Both may be numpy arrays.
    import numpy as np

    txts = getattr(result, "txts", None)
    boxes = getattr(result, "boxes", None)
    if txts is None and isinstance(result, (list, tuple)):
        txts = [r[1] for r in result]
        boxes = [r[0] for r in result]

    if txts is not None and isinstance(txts, np.ndarray):
        txts = txts.tolist()
    if boxes is not None and isinstance(boxes, np.ndarray):
        boxes = boxes.tolist()

    if not txts:
        print(json.dumps({"text": "", "lines": []}, ensure_ascii=False))
        return 0

    lines = []
    for i, text in enumerate(txts):
        text = str(text).strip()
        if not text:
            continue
        box = boxes[i] if boxes is not None and i < len(boxes) else None
        bbox = None
        if box is not None:
            xs = [float(p[0]) for p in box]
            ys = [float(p[1]) for p in box]
            bbox = [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]
        lines.append({"text": text, "box": bbox})

    payload = {"text": "\n".join(l["text"] for l in lines), "lines": lines}
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def np_frombuffer(data):
    import numpy as np

    return np.frombuffer(data, np.uint8)


if __name__ == "__main__":
    sys.exit(main())
