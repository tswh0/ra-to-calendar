#!/usr/bin/env python3
"""Render icons/icon-{16,32,48,128}.png from the mark defined below.

Needs Pillow: python3 -m pip install pillow
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK = (226, 19, 85, 255)
PAPER = (240, 229, 225, 255)
SCALE = 100
SIZE = 24 * SCALE

SIZES = {
    16: {"radius": 4.0, "band": 7.5, "dot": 2.9},
    32: {"radius": 5.5, "band": 7.0, "dot": 2.35},
    48: {"radius": 5.5, "band": 7.0, "dot": 2.35},
    128: {"radius": 5.5, "band": 7.0, "dot": 2.35},
}


def render(radius, band, dot):
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    corner = int(SIZE * radius / 24)
    band_bottom = int(SIZE * band / 24)

    draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=corner, fill=INK)
    draw.rounded_rectangle([0, 0, SIZE - 1, band_bottom], radius=corner, fill=PAPER)
    draw.rectangle([0, corner, SIZE - 1, band_bottom], fill=PAPER)

    r = SIZE * dot / 24
    cx, cy = SIZE * 15.2 / 24, SIZE * 15.8 / 24
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PAPER)
    return image


def main():
    out = Path(__file__).resolve().parent.parent / "icons"
    source = render(**SIZES[128])
    for size, geometry in SIZES.items():
        icon = render(**geometry).resize((size, size), Image.Resampling.LANCZOS)
        icon.save(out / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
