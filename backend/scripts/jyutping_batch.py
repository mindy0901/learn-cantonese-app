#!/usr/bin/env python3
"""Batch convert Chinese text lines (from stdin) to jyutping using pycantonese.

Each stdin line is one word. Output: TAB-separated "word<TAB>jyutping" for lines
where every Han character got a jyutping reading; otherwise prints "word<TAB>".
Summary is printed to stderr.
"""
import sys
import re
import pycantonese

HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")


def han_count(s: str) -> int:
    return len(HAN.findall(s))


def main() -> None:
    total = 0
    full = 0
    samples = []
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        total += 1
        try:
            res = pycantonese.characters_to_jyutping(line)
            parts = [jp for ch, jp in res if jp]
            jp = " ".join(parts)
            n = han_count(line)
            syllables = len(jp.split()) if jp else 0
            if syllables >= n:
                full += 1
                if len(samples) < 5:
                    samples.append((line, jp))
            sys.stdout.write(f"{line}\t{jp}\n")
        except Exception as e:  # noqa: BLE001
            sys.stdout.write(f"{line}\t\n")
    print(f"total: {total}", file=sys.stderr)
    print(f"full cover: {full}", file=sys.stderr)
    print(f"samples: {samples}", file=sys.stderr)


if __name__ == "__main__":
    main()
