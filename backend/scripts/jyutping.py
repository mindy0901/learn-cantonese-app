#!/usr/bin/env python3
"""Convert Chinese text to jyutping using pycantonese."""
import sys
import pycantonese

def to_jyutping(text: str) -> str:
    """Convert Chinese text to jyutping."""
    if not text or not text.strip():
        return ""
    
    text = text.strip()
    
    # Use pycantonese to convert characters to jyutping
    # When passed a string, it does word segmentation automatically
    result = pycantonese.characters_to_jyutping(text)
    
    # result is a list of (characters, jyutping) tuples
    # jyutping is None for punctuation/unknown chars
    jyutping_parts = []
    for chars, jp in result:
        if jp:
            jyutping_parts.append(jp)
        # Skip punctuation (jp is None)
    
    return " ".join(jyutping_parts)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python jyutping.py <chinese_text>")
        sys.exit(1)
    
    text = sys.argv[1]
    result = to_jyutping(text)
    print(result)
