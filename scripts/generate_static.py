#!/usr/bin/env python3
"""
TypeForge Pro — Generate static glyph data for demo
Optional step in CI: generates sample SVG/PNG data for the demo page.
"""

import os

def main():
    print("No sample font provided, skipping static glyph generation.")
    print("To generate sample data, place a .ttf file at scripts/sample.ttf")

    sample = os.path.join(os.path.dirname(__file__), 'sample.ttf')
    if not os.path.exists(sample):
        return

    # Future: generate sample glyph SVGs/PNGs for the demo page
    # from fontTools.ttLib import TTFont
    # font = TTFont(sample)
    # ...


if __name__ == '__main__':
    main()
