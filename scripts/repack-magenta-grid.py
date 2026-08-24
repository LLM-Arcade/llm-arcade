#!/usr/bin/env python3
"""Normalize and repack an existing magenta sprite grid into exact cells."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


MAGENTA = (255, 0, 255, 255)


def is_key_family(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha == 0 or (
        red > 150
        and blue > 130
        and green < 120
        and red > green * 1.65
        and blue > green * 1.65
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Repack a magenta sheet without redrawing its sprites."
    )
    parser.add_argument("image", type=Path)
    parser.add_argument("columns", type=int)
    parser.add_argument("rows", type=int)
    parser.add_argument("--margin", type=int, default=8)
    args = parser.parse_args()

    if args.columns < 1 or args.rows < 1 or args.margin < 1:
        parser.error("columns, rows, and margin must be positive")

    source = Image.open(args.image).convert("RGBA")
    width, height = source.size
    pixels = source.load()
    for y in range(height):
        for x in range(width):
            if is_key_family(pixels[x, y]):
                pixels[x, y] = MAGENTA

    frames: list[Image.Image] = []
    for row in range(args.rows):
        for column in range(args.columns):
            x0 = column * width // args.columns
            x1 = (column + 1) * width // args.columns
            y0 = row * height // args.rows
            y1 = (row + 1) * height // args.rows
            cell = source.crop((x0, y0, x1, y1))
            content = Image.new("1", cell.size)
            content_pixels = content.load()
            cell_pixels = cell.load()
            for y in range(cell.height):
                for x in range(cell.width):
                    content_pixels[x, y] = not is_key_family(cell_pixels[x, y])
            box = content.getbbox()
            if box is None:
                parser.error(f"blank cell at row {row + 1}, column {column + 1}")
            frames.append(cell.crop(box))

    cell_width = max(frame.width for frame in frames) + args.margin * 2
    cell_height = max(frame.height for frame in frames) + args.margin * 2
    output = Image.new(
        "RGBA",
        (cell_width * args.columns, cell_height * args.rows),
        MAGENTA,
    )
    for index, frame in enumerate(frames):
        row = index // args.columns
        column = index % args.columns
        x = column * cell_width + (cell_width - frame.width) // 2
        y = row * cell_height + cell_height - args.margin - frame.height
        output.alpha_composite(frame, (x, y))

    output.convert("RGB").save(args.image, optimize=True)
    print(
        f"Repacked {args.image}: {args.columns}x{args.rows}, "
        f"cell {cell_width}x{cell_height}, margin {args.margin}px"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
