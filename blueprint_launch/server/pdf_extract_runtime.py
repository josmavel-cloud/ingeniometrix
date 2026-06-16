import argparse
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops
from pypdf import PdfReader

MIN_IMAGE_WIDTH = 120
MIN_IMAGE_HEIGHT = 120
MIN_IMAGE_AREA = 25000
FULL_PAGE_ASPECT_MIN = 1.18
FULL_PAGE_MIN_AREA = 1_800_000


def crop_dense_region(image: Image.Image) -> Image.Image:
    width, height = image.size
    if (width * height) < FULL_PAGE_MIN_AREA or (height / max(width, 1)) < FULL_PAGE_ASPECT_MIN:
        return image

    gray = image.convert("L")
    sample_scale = 8
    small = gray.resize((max(1, width // sample_scale), max(1, height // sample_scale)))
    small_width, small_height = small.size
    pixels = small.load()
    row_density = []

    for y in range(small_height):
        non_white = 0
        for x in range(small_width):
            if pixels[x, y] < 245:
                non_white += 1
        row_density.append(non_white / max(small_width, 1))

    bands = []
    start = None
    gap = 0
    threshold = 0.035
    max_gap = 6

    for index, density in enumerate(row_density):
        if density > threshold:
            if start is None:
                start = index
            gap = 0
            continue
        if start is None:
            continue
        gap += 1
        if gap <= max_gap:
            continue
        end = index - gap
        if end > start:
            bands.append((start, end))
        start = None
        gap = 0

    if start is not None:
        bands.append((start, small_height - 1))

    best = None
    best_score = 0
    for start, end in bands:
        band_height = (end - start + 1) * sample_scale
        if band_height < 140:
            continue
        if band_height > height * 0.72:
            continue
        density = sum(row_density[start : end + 1]) / max((end - start + 1), 1)
        score = density * band_height
        if score > best_score:
            best_score = score
            best = (start * sample_scale, min(height, (end + 1) * sample_scale))

    if not best:
        return image

    top, bottom = best
    margin = max(20, int(height * 0.015))
    top = max(0, top - margin)
    bottom = min(height, bottom + margin)
    crop = image.crop((0, top, width, bottom))

    # Trim horizontal whitespace after choosing the vertical asset band.
    gray_crop = crop.convert("L")
    bbox = gray_crop.point(lambda value: 0 if value > 245 else 255).getbbox()
    if bbox:
        left, upper, right, lower = bbox
        horizontal_margin = max(18, int(width * 0.015))
        crop = crop.crop(
            (
                max(0, left - horizontal_margin),
                max(0, upper - margin),
                min(crop.size[0], right + horizontal_margin),
                min(crop.size[1], lower + margin),
            )
        )

    return crop


def normalize_image(image: Image.Image) -> Image.Image:
    working = image.convert("RGB")
    background = Image.new("RGB", working.size, working.getpixel((0, 0)))
    diff = ImageChops.difference(working, background)
    bbox = diff.getbbox()
    if bbox:
        working = working.crop(bbox)
    working = crop_dense_region(working)
    return working


def detect_equation_lines(text: str):
    results = []
    seen = set()
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if len(line) < 8 or len(line) > 180:
            continue
        if line in seen:
            continue
        if "=" not in line:
            continue
        if not re.search(r"[A-Za-z].*[=].*[A-Za-z0-9]", line):
            continue
        if re.search(r"(doi|http|copyright|license|received|accepted|published)", line, re.I):
            continue
        seen.add(line)
        results.append(line)
        if len(results) >= 8:
            break
    return results


def detect_caption_lines(text: str, prefix: str):
    matches = []
    pattern = re.compile(rf"^\s*{prefix}\s*[\dA-Za-z\.\-:]*\s+(.+)$", re.I)
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if len(line) < 8 or len(line) > 220:
            continue
        match = pattern.match(line)
        if match:
            matches.append(line)
        if len(matches) >= 8:
            break
    return matches


def detect_caption_entries(text: str, prefix: str):
    entries = []
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    pattern = re.compile(rf"^\s*{prefix}\s*[\dA-Za-z\.\-:]*\s+(.+)$", re.I)
    stopper = re.compile(
        r"^\s*(fig(?:ure)?|table|references|acknowledg|appendix|chapter|section)\b",
        re.I,
    )

    for index, line in enumerate(lines):
        if len(line) < 8 or len(line) > 260:
            continue
        if not pattern.match(line):
            continue

        context = [line]
        for cursor in range(index + 1, min(len(lines), index + 18)):
            value = lines[cursor]
            if not value:
                continue
            if cursor > index + 1 and stopper.match(value):
                break
            if len(value) > 320:
                continue
            context.append(value)
            if len(" | ".join(context)) > 1800:
                break

        if len(context) <= 2:
            for cursor in range(max(0, index - 10), index):
                value = lines[cursor]
                if value and len(value) <= 260:
                    context.insert(0, value)

        entries.append(
            {
                "caption": line,
                "text_content": "\n".join(context[:18]),
            }
        )
        if len(entries) >= 10:
            break

    return entries


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf")
    parser.add_argument("--output-dir")
    parser.add_argument("--base-name")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(pdf_path))
    page_texts = []
    assets = []
    equation_candidates = []
    table_captions = []
    figure_captions = []

    image_counter = 0
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        page_texts.append({"page_number": index, "text": text})
        equation_candidates.extend(
            {"page_number": index, "raw_text": line} for line in detect_equation_lines(text)
        )
        table_captions.extend(
            {"page_number": index, **entry} for entry in detect_caption_entries(text, "table")
        )
        figure_captions.extend(
            {"page_number": index, "caption": line} for line in detect_caption_lines(text, "fig(?:ure)?")
        )

        images = getattr(page, "images", None)
        if images is None:
            continue

        for subindex, image_file in enumerate(list(images), start=1):
            image_counter += 1
            asset_key = f"page-{index:03d}-img-{subindex:02d}"
            suffix = Path(getattr(image_file, "name", "")).suffix.lower() or ".png"
            normalized_path = output_dir / f"{args.base_name}-{asset_key}.png"
            raw_path = output_dir / f"{args.base_name}-{asset_key}{suffix}"

            try:
                raw_bytes = image_file.data
                raw_path.write_bytes(raw_bytes)
                image = Image.open(io.BytesIO(raw_bytes))
                normalized = normalize_image(image)
                width, height = normalized.size
                if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT or (width * height) < MIN_IMAGE_AREA:
                    continue
                normalized.save(normalized_path, format="PNG")
                mime_type = Image.MIME.get(normalized.format or "PNG", "image/png")
                assets.append(
                    {
                        "asset_key": asset_key,
                        "title": f"Imagen extraida pagina {index}",
                        "kind": "image",
                        "caption": None,
                        "page_number": index,
                        "file_path": str(normalized_path),
                        "mime_type": mime_type,
                        "width_px": width,
                        "height_px": height,
                        "text_content": None,
                        "extraction_origin": "pdf_native",
                        "extracted": True,
                    }
                )
            except Exception:
                assets.append(
                    {
                        "asset_key": asset_key,
                        "title": f"Imagen extraida pagina {index}",
                        "kind": "image",
                        "caption": None,
                        "page_number": index,
                        "file_path": str(raw_path) if raw_path.exists() else None,
                        "mime_type": None,
                        "width_px": None,
                        "height_px": None,
                        "text_content": None,
                        "extraction_origin": "pdf_native",
                        "extracted": raw_path.exists(),
                    }
                )

    result = {
        "page_count": len(reader.pages),
        "page_texts": page_texts,
        "equation_candidates": equation_candidates,
        "table_captions": table_captions,
        "figure_captions": figure_captions,
        "assets": assets,
        "full_text": "\n\n".join(page["text"] for page in page_texts if page["text"]),
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
