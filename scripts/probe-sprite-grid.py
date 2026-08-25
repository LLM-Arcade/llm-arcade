#!/usr/bin/env python3
"""Validate an exact magenta sprite grid without altering the image."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from PIL import Image


def is_magenta(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha == 0 or (red >= 245 and green <= 12 and blue >= 245)


def probe(
    path: Path, columns: int, rows: int, margin: int
) -> tuple[list[str], list[tuple[str, int, int, tuple[int, int, int, int]]]]:
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    errors: list[str] = []
    measurements: list[tuple[str, int, int, tuple[int, int, int, int]]] = []

    if width % columns:
        errors.append(f"width {width} is not divisible by {columns} columns")
    if height % rows:
        errors.append(f"height {height} is not divisible by {rows} rows")
    if errors:
        return errors, measurements

    cell_width = width // columns
    cell_height = height // rows
    pixels = image.load()

    for row in range(rows):
        for column in range(columns):
            x0 = column * cell_width
            y0 = row * cell_height
            x1 = x0 + cell_width
            y1 = y0 + cell_height
            points = [
                (x, y)
                for y in range(y0, y1)
                for x in range(x0, x1)
                if not is_magenta(pixels[x, y])
            ]
            label = f"cell r{row + 1}c{column + 1}"
            if not points:
                errors.append(f"{label} is blank")
                continue

            min_x = min(x for x, _ in points)
            max_x = max(x for x, _ in points)
            min_y = min(y for _, y in points)
            max_y = max(y for _, y in points)
            margins = (
                min_x - x0,
                x1 - 1 - max_x,
                min_y - y0,
                y1 - 1 - max_y,
            )
            measurements.append(
                (label, max_x - min_x + 1, max_y - min_y + 1, margins)
            )
            if min(margins) < margin:
                errors.append(
                    f"{label} margins L/R/T/B={margins}; minimum is {margin}"
                )

    return errors, measurements


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail on blank, clipped, or ambiguously sized magenta-grid frames."
    )
    parser.add_argument("image", type=Path)
    parser.add_argument("columns", type=int)
    parser.add_argument("rows", type=int)
    parser.add_argument("--margin", type=int, default=4)
    parser.add_argument(
        "--report",
        action="store_true",
        help="print visible bounding-box dimensions and margins for every cell",
    )
    args = parser.parse_args()

    if args.columns < 1 or args.rows < 1 or args.margin < 0:
        parser.error("columns and rows must be positive; margin cannot be negative")
    if not args.image.is_file():
        parser.error(f"image not found: {args.image}")

    errors, measurements = probe(args.image, args.columns, args.rows, args.margin)
    if errors:
        print(f"FAIL {args.image} ({args.columns}x{args.rows})")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"PASS {args.image} ({args.columns}x{args.rows}, "
        f"margin >= {args.margin}px)"
    )
    if args.report:
        for label, visible_width, visible_height, margins in measurements:
            print(
                f"{label}: visible={visible_width}x{visible_height} "
                f"margins={margins}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
