#!/usr/bin/env python3
import argparse
import json
import math
import os
import re
import sys
from pathlib import Path

import fitz


ASSET_LABEL_RE = re.compile(
    r"(?i)\b(fig(?:ure)?|figura|table|tabla|eq(?:uation)?|ecuaci[oó]n|formula|f[oó]rmula)\s*\.?\s*(\d+[a-z]?)"
)
EQUATION_RE = re.compile(
    r"(?i)(?:[A-Za-zξΣ∑αβγλϕΦπ][A-Za-z0-9_ξΣ∑αβγλϕΦπ]*(?:\s*\([^)]*\))?\s*=|[Σ∑∫√≤≥±×÷≈≠ξαβγλϕΦπ])"
)
STRONG_EQUATION_RE = re.compile(r"[=Σ∑∫√≤≥±÷≈≠]")
GREEK_OR_SYMBOL_RE = re.compile(r"[ξΣ∑αβγλϕΦπ휙ΓΔμ]")
DIMENSION_ROW_RE = re.compile(r"^\s*(?:[A-Z]?\d+\s+)?(?:\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*){2,}")
GRAPH_AXIS_OR_LEGEND_RE = re.compile(
    r"(?i)\b(time period|period\s*\(s\)|target spectrum|mean spectrum|individual earthquake|acceleration\s*\(g\))\b"
)


def clean_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def rect_to_obj(rect):
    return {
        "x": round(float(rect.x0), 3),
        "y": round(float(rect.y0), 3),
        "width": round(float(rect.width), 3),
        "height": round(float(rect.height), 3),
    }


def expand_rect(rect, page_rect, pad=8):
    expanded = fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad)
    return expanded & page_rect


def expand_candidate_rect(rect, page_rect, kind, method):
    if kind == "equation":
        # Equation text is often split into tight span boxes. Wider padding keeps
        # fractions, equation numbers and right-hand definitions from being cut.
        expanded = fitz.Rect(rect.x0 - 28, rect.y0 - 16, rect.x1 + 36, rect.y1 + 18)
        return expanded & page_rect
    if kind == "table":
        expanded = fitz.Rect(rect.x0 - 4, rect.y0 - 3, rect.x1 + 4, rect.y1 + 4)
        return expanded & page_rect
    if kind == "figure":
        expanded = fitz.Rect(rect.x0 - 3, rect.y0 - 3, rect.x1 + 3, rect.y1 + 3)
        return expanded & page_rect
    return expand_rect(rect, page_rect, 4)


def union_rect(rects):
    if not rects:
        return None
    result = fitz.Rect(rects[0])
    for rect in rects[1:]:
        result |= fitz.Rect(rect)
    return result


def rect_area(rect):
    return max(0.0, float(rect.width)) * max(0.0, float(rect.height))


def iou(left, right):
    intersection = fitz.Rect(left) & fitz.Rect(right)
    inter_area = rect_area(intersection)
    if inter_area <= 0:
        return 0.0
    return inter_area / max(1.0, rect_area(left) + rect_area(right) - inter_area)


def line_records(page):
    data = page.get_text("dict")
    lines = []
    image_blocks = []
    text_blocks = []

    for block in data.get("blocks", []):
        bbox = fitz.Rect(block.get("bbox", (0, 0, 0, 0)))
        if block.get("type") == 1:
            image_blocks.append(
                {
                    "bbox": bbox,
                    "width": block.get("width"),
                    "height": block.get("height"),
                    "ext": block.get("ext"),
                    "size": block.get("size"),
                }
            )
            continue
        if block.get("type") != 0:
            continue
        block_text_parts = []
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            text = clean_text(" ".join(span.get("text", "") for span in spans))
            if not text:
                continue
            line_bbox = fitz.Rect(line.get("bbox", block.get("bbox", (0, 0, 0, 0))))
            lines.append({"text": text, "bbox": line_bbox})
            block_text_parts.append(text)
        block_text = clean_text(" ".join(block_text_parts))
        if block_text:
            text_blocks.append({"text": block_text, "bbox": bbox})

    return lines, image_blocks, text_blocks


def asset_kind_from_label(label):
    lowered = label.lower()
    if lowered.startswith("tab"):
        return "table"
    if lowered.startswith("eq") or "ecu" in lowered or "form" in lowered:
        return "equation"
    return "figure"


def nearest_caption(lines, rect, kind=None):
    candidates = []
    for line in lines:
        match = ASSET_LABEL_RE.search(line["text"])
        if not match:
            continue
        label_kind = asset_kind_from_label(match.group(1))
        if kind and label_kind != kind:
            continue
        line_rect = line["bbox"]
        vertical_gap = min(abs(line_rect.y0 - rect.y1), abs(rect.y0 - line_rect.y1))
        horizontal_overlap = max(0.0, min(line_rect.x1, rect.x1) - max(line_rect.x0, rect.x0))
        overlap_ratio = horizontal_overlap / max(1.0, min(line_rect.width, rect.width))
        if vertical_gap <= 140 and overlap_ratio >= 0.2:
            starts_with_label = 0 if ASSET_LABEL_RE.match(line["text"].strip()) else 1
            candidates.append((starts_with_label, vertical_gap, -overlap_ratio, line))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1], item[2]))
    return candidates[0][3]


def next_label_line(lines, caption_line):
    labels = [
        line
        for line in lines
        if line["bbox"].y0 > caption_line["bbox"].y0 + 8 and ASSET_LABEL_RE.match(line["text"].strip())
    ]
    labels.sort(key=lambda line: line["bbox"].y0)
    return labels[0] if labels else None


def caption_region(lines, page, caption_line, kind):
    caption_rect = caption_line["bbox"]
    following_label = next_label_line(lines, caption_line)
    if kind == "table":
        bottom = following_label["bbox"].y0 - 6 if following_label else min(page.rect.y1 - 24, caption_rect.y1 + 420)
        bottom = max(caption_rect.y1 + 60, min(page.rect.y1 - 24, bottom))
        table_lines = [
            line
            for line in lines
            if caption_rect.y1 + 3 <= line["bbox"].y0 <= bottom and line["bbox"].x1 > 24 and line["bbox"].x0 < page.rect.x1 - 24
        ]
        table_lines.sort(key=lambda line: (line["bbox"].y0, line["bbox"].x0))
        trimmed_lines = []
        previous_bottom = None
        for line in table_lines:
            text = clean_text(line["text"])
            y = line["bbox"].y0
            gap = 0 if previous_bottom is None else y - previous_bottom
            far_from_caption = y > caption_rect.y1 + 95
            looks_like_graph = bool(GRAPH_AXIS_OR_LEGEND_RE.search(text)) or (
                far_from_caption and re.match(r"(?i)^mode\s+\d(?:\s+mode\s+\d)+", text)
            ) or (
                far_from_caption and gap > 16 and re.match(r"(?i)^mode\s+\d\b", text)
            ) or (
                far_from_caption and gap > 16 and re.match(r"^\d+(?:\.\d+)?$", text)
            )
            if trimmed_lines and looks_like_graph:
                break
            trimmed_lines.append(line)
            previous_bottom = max(previous_bottom or line["bbox"].y1, line["bbox"].y1)
        region_lines = [line["bbox"] for line in trimmed_lines]
        rect = union_rect(region_lines) or fitz.Rect(caption_rect.x0, caption_rect.y1 + 4, page.rect.x1 - 36, bottom)
        return fitz.Rect(max(18, rect.x0 - 4), max(18, rect.y0 - 3), min(page.rect.x1 - 18, rect.x1 + 4), min(page.rect.y1 - 18, rect.y1 + 4))

    top = max(24, caption_rect.y0 - 260)
    candidate = fitz.Rect(max(24, caption_rect.x0 - 18), top, min(page.rect.x1 - 24, max(caption_rect.x1 + 120, page.rect.x1 - 70)), max(40, caption_rect.y0 - 8))
    return candidate


def remove_caption_from_body(rect, caption_line, page_rect):
    if not caption_line:
        return rect & page_rect
    caption = caption_line["bbox"]
    result = fitz.Rect(rect)
    horizontal_overlap = max(0.0, min(caption.x1, result.x1) - max(caption.x0, result.x0))
    overlap_ratio = horizontal_overlap / max(1.0, min(caption.width, result.width))
    if overlap_ratio < 0.18:
        return result & page_rect
    caption_center_y = (caption.y0 + caption.y1) / 2
    rect_center_y = (result.y0 + result.y1) / 2
    if caption_center_y >= rect_center_y and caption.y0 <= result.y1 + 14:
        result.y1 = min(result.y1, caption.y0 - 3)
    elif caption_center_y < rect_center_y and caption.y1 >= result.y0 - 14:
        result.y0 = max(result.y0, caption.y1 + 3)
    if result.width < 18 or result.height < 10:
        return rect & page_rect
    return result & page_rect


def is_dimension_like_row(clean):
    if DIMENSION_ROW_RE.search(clean):
        return True
    dimension_pairs = len(re.findall(r"\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?", clean))
    if dimension_pairs >= 3 and "=" not in clean and not re.search(r"[Σ∑∫√≤≥±÷≈≠]", clean):
        return True
    return False


def equation_signal_score(text):
    clean = clean_text(text)
    if not clean or len(clean) > 170:
        return 0
    if is_dimension_like_row(clean):
        return 0
    if re.match(r"(?i)^(and|where|whereas|while|thus|therefore)\b", clean) and re.search(r"[A-Za-z]{4,}", clean):
        return 0
    if len(clean) > 70 and len(re.findall(r"[;:]", clean)) >= 2:
        return 0
    long_words = re.findall(r"[A-Za-z]{4,}", clean)
    if len(long_words) > 4:
        return 0
    if len(clean) > 115 and len(long_words) > 2:
        return 0
    if re.search(r"(?i)\b(equation|formula|ecuaci[oó]n|f[oó]rmula)\b", clean) and not re.search(r"[=Σ∑∫√≤≥±×÷≈≠ξαβγλϕΦπ]", clean):
        return 0
    if clean.count(" ") > 18:
        return 0

    score = 0
    if "=" in clean:
        score += 40
    if STRONG_EQUATION_RE.search(clean):
        score += 24
    if GREEK_OR_SYMBOL_RE.search(clean):
        score += 18
    if re.search(r"[*/∕^_]|[(){}\[\]]", clean):
        score += 10
    if re.search(r"\(\s*\d+[a-z]?\s*\)\s*$", clean):
        score += 8
    if re.search(r"\b(?:where|donde|eq\.?|equation)\b", clean, re.I):
        score -= 10
    if len(re.findall(r"\d", clean)) >= 10 and "=" not in clean:
        score -= 14
    return max(0, min(100, score))


def is_equation_line(text):
    return equation_signal_score(text) >= 34 and bool(EQUATION_RE.search(clean_text(text)))


def is_formula_fragment(text):
    clean = clean_text(text)
    if not clean or len(clean) > 95 or clean.count(" ") > 14:
        return False
    if is_dimension_like_row(clean):
        return False
    long_words = re.findall(r"[A-Za-z]{4,}", clean)
    if len(long_words) > 3:
        return False
    if equation_signal_score(clean) >= 24:
        return True
    if re.search(r"^[0-9+\-−*/∕⋅(){}\[\]\s.,]+[A-Za-zξαβγλϕΦπ휙ΓΔμ]", clean):
        return True
    if GREEK_OR_SYMBOL_RE.search(clean) and re.search(r"\d|[*/∕⋅^_]", clean):
        return True
    return False


def expand_equation_group(group, lines):
    selected = list(group)
    selected_ids = {id(line) for line in selected}
    changed = True
    while changed:
        changed = False
        rect = union_rect([line["bbox"] for line in selected])
        if rect is None:
            break
        for line in lines:
            if id(line) in selected_ids or not is_formula_fragment(line["text"]):
                continue
            candidate = line["bbox"]
            vertical_gap = max(0.0, max(candidate.y0 - rect.y1, rect.y0 - candidate.y1))
            horizontal_overlap = max(0.0, min(candidate.x1, rect.x1) - max(candidate.x0, rect.x0))
            center_delta = abs((candidate.x0 + candidate.x1) / 2 - (rect.x0 + rect.x1) / 2)
            likely_same_formula = vertical_gap <= 24 and (horizontal_overlap > 0 or center_delta <= max(110, rect.width * 0.75))
            if likely_same_formula:
                selected.append(line)
                selected_ids.add(id(line))
                changed = True
    selected.sort(key=lambda line: (line["bbox"].y0, line["bbox"].x0))
    return selected


def equation_groups(lines):
    equation_lines = [line for line in lines if is_equation_line(line["text"])]
    equation_lines.sort(key=lambda line: (line["bbox"].y0, line["bbox"].x0))
    groups = []
    current = []
    for line in equation_lines:
        if not current:
            current = [line]
            continue
        previous = current[-1]["bbox"]
        gap = line["bbox"].y0 - previous.y1
        same_band = gap <= 18 and abs(line["bbox"].x0 - current[0]["bbox"].x0) <= 80
        if same_band:
            current.append(line)
        else:
            groups.append(current)
            current = [line]
    if current:
        groups.append(current)
    return groups


def text_near_rect(text_blocks, rect, max_items=4):
    scored = []
    for block in text_blocks:
        b = block["bbox"]
        distance = max(0, max(rect.y0 - b.y1, b.y0 - rect.y1)) + max(0, max(rect.x0 - b.x1, b.x0 - rect.x1))
        if distance <= 180:
            scored.append((distance, block["text"]))
    scored.sort(key=lambda item: item[0])
    return clean_text(" ".join(text for _, text in scored[:max_items]))[:1400]


def render_png(page, output_path, clip=None, dpi=180):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pix = page.get_pixmap(dpi=dpi, clip=clip, annots=False)
    pix.save(str(output_path))
    return {
        "path": str(output_path),
        "width": pix.width,
        "height": pix.height,
        "dpi": dpi,
    }


def add_candidate(candidates, source_id, page_index, page, kind, method, bbox, caption, nearby_text, score, warnings, caption_line=None):
    if bbox.width < 18 or bbox.height < 10:
        return
    page_area = max(1.0, page.rect.width * page.rect.height)
    if rect_area(bbox) / page_area > 0.75:
        warnings = [*warnings, "Candidate bbox is large; kept but should be treated as fallback-like."]

    body_rect = remove_caption_from_body(bbox, caption_line, page.rect) if kind != "equation" else bbox & page.rect
    expanded = expand_candidate_rect(body_rect, page.rect, kind, method)
    for existing in candidates:
        if existing["asset_kind"] == kind and existing["page_number"] == page_index + 1:
            ex = fitz.Rect(
                existing["bbox_pdf_points"]["x"],
                existing["bbox_pdf_points"]["y"],
                existing["bbox_pdf_points"]["x"] + existing["bbox_pdf_points"]["width"],
                existing["bbox_pdf_points"]["y"] + existing["bbox_pdf_points"]["height"],
            )
            if iou(ex, expanded) > 0.72:
                if score > existing["score_100"]:
                    existing.update(
                        {
                            "detection_method": method,
                            "bbox_pdf_points": rect_to_obj(expanded),
                            "body_bbox_pdf_points": rect_to_obj(expanded),
                            "caption_bbox_pdf_points": rect_to_obj(caption_line["bbox"]) if caption_line else None,
                            "caption_text": caption,
                            "nearby_text": nearby_text,
                            "score_100": score,
                            "warnings": warnings,
                        }
                    )
                return

    candidates.append(
        {
            "candidate_id": f"{source_id}-L{len(candidates) + 1:03d}",
            "source_id": source_id,
            "page_number": page_index + 1,
            "asset_kind": kind,
            "detection_method": method,
            "bbox_pdf_points": rect_to_obj(expanded),
            "body_bbox_pdf_points": rect_to_obj(expanded),
            "caption_bbox_pdf_points": rect_to_obj(caption_line["bbox"]) if caption_line else None,
            "page_width_points": round(float(page.rect.width), 3),
            "page_height_points": round(float(page.rect.height), 3),
            "caption_text": caption,
            "nearby_text": nearby_text,
            "score_100": int(max(0, min(100, score))),
            "warnings": warnings,
            "errors": [],
            "crop_path": None,
            "body_crop_path": None,
            "page_image_path": None,
            "crop_pixels": None,
            "body_crop_pixels": None,
        }
    )


def caption_inferred_candidates(lines, text_blocks, page, page_index, source_id, candidates):
    for line in lines:
        match = ASSET_LABEL_RE.search(line["text"])
        if not match:
            continue
        kind = asset_kind_from_label(match.group(1))
        if kind == "equation":
            continue
        bbox = caption_region(lines, page, line, kind)
        if ASSET_LABEL_RE.match(line["text"].strip()) and kind == "table":
            score = 80
        elif ASSET_LABEL_RE.match(line["text"].strip()):
            score = 76
        else:
            score = 58
        add_candidate(
            candidates,
            source_id,
            page_index,
            page,
            kind,
            "caption_inferred_region",
            bbox,
            line["text"],
            text_near_rect(text_blocks, bbox),
            score,
            ["Region inferred from caption because no native object bbox was available."],
            line,
        )


def page_candidates(doc, page_index, source_id):
    page = doc[page_index]
    lines, image_blocks, text_blocks = line_records(page)
    candidates = []

    # Native image blocks are precise for raster figures. Scholarly figures are often
    # stored as multiple image blocks, so merge blocks that share the same caption.
    captioned_image_groups = {}
    uncaptioned_images = []
    for image in image_blocks:
        rect = image["bbox"]
        if rect_area(rect) < 1200:
            continue
        caption = nearest_caption(lines, rect, "figure")
        if caption:
            captioned_image_groups.setdefault(caption["text"], []).append(rect)
        else:
            uncaptioned_images.append(rect)

    for caption_text, rects in captioned_image_groups.items():
        rect = union_rect(rects)
        if rect is None:
            continue
        add_candidate(
            candidates,
            source_id,
            page_index,
            page,
            "figure",
            "pymupdf_image_block",
            rect,
            caption_text,
            text_near_rect(text_blocks, rect),
            90,
            [],
            next((line for line in lines if line["text"] == caption_text), None),
        )

    for rect in uncaptioned_images:
        add_candidate(
            candidates,
            source_id,
            page_index,
            page,
            "figure",
            "pymupdf_image_block",
            rect,
            None,
            text_near_rect(text_blocks, rect),
            74,
            [],
        )

    # Table finder is more reliable than text signals when tables have ruled geometry.
    try:
        tables = page.find_tables()
        for table in getattr(tables, "tables", []):
            extracted_rows = table.extract()
            row_count = len(extracted_rows)
            column_count = max((len(row) for row in extracted_rows), default=0)
            non_empty_cells = sum(
                1
                for row in extracted_rows
                for cell in row
                if clean_text(str(cell or ""))
            )
            if row_count < 2 or column_count < 2 or non_empty_cells < 4:
                continue
            rect = fitz.Rect(table.bbox)
            caption = nearest_caption(lines, rect, "table")
            add_candidate(
                candidates,
                source_id,
                page_index,
                page,
                "table",
                "pymupdf_find_tables",
                rect,
                caption["text"] if caption else None,
                text_near_rect(text_blocks, rect),
            90 if caption else 68,
            [],
            caption,
        )
    except Exception as exc:
        # Keep extraction resilient; the caller records top-level errors if the whole page fails.
        pass

    # Equation-like lines are text objects. Group adjacent formula fragments so
    # fractions, denominators and equation numbers are not lost as tiny partial crops.
    for group in equation_groups(lines)[:16]:
        group = expand_equation_group(group, lines)
        rect = union_rect([line["bbox"] for line in group])
        if rect is None:
            continue
        text = clean_text(" ".join(line["text"] for line in group))
        signal_score = equation_signal_score(text)
        if signal_score < 34:
            continue
        warnings = []
        if signal_score < 52:
            warnings.append("Weak equation signal; candidate may be inline math or a table fragment.")
        add_candidate(
            candidates,
            source_id,
            page_index,
            page,
            "equation",
            "pymupdf_equation_text_line",
            rect,
            text,
            text_near_rect(text_blocks, rect),
            max(58, min(94, 54 + signal_score // 2)),
            warnings,
        )

    caption_inferred_candidates(lines, text_blocks, page, page_index, source_id, candidates)

    candidates.sort(key=lambda item: (-item["score_100"], item["page_number"], item["candidate_id"]))
    return candidates, {
        "page_number": page_index + 1,
        "width_points": round(float(page.rect.width), 3),
        "height_points": round(float(page.rect.height), 3),
        "text_line_count": len(lines),
        "image_block_count": len(image_blocks),
        "candidate_count": len(candidates),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--max-candidates", type=int, default=30)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    crop_dir = output_dir / "layout-crops"
    page_dir = output_dir / "layout-pages"
    output_dir.mkdir(parents=True, exist_ok=True)

    result = {
        "source_id": args.source_id,
        "status": "completed",
        "extractor": "pymupdf",
        "extractor_version": getattr(fitz, "__doc__", "PyMuPDF").splitlines()[0],
        "pdf_path": str(Path(args.pdf).resolve()),
        "page_count": 0,
        "pages": [],
        "candidates": [],
        "warnings": [],
        "errors": [],
    }

    try:
        doc = fitz.open(args.pdf)
        result["page_count"] = doc.page_count
        for page_index in range(doc.page_count):
            try:
                candidates, page_summary = page_candidates(doc, page_index, args.source_id)
                result["pages"].append(page_summary)
                result["candidates"].extend(candidates)
            except Exception as exc:
                result["warnings"].append(f"Page {page_index + 1} layout extraction failed: {exc}")

        def balanced_candidates(candidates, cap):
            sorted_candidates = sorted(candidates, key=lambda item: (-item["score_100"], item["page_number"], item["candidate_id"]))
            selected = []
            seen = set()
            floor = max(3, min(10, cap // 4))
            for kind in ["equation", "table", "figure"]:
                for candidate in [item for item in sorted_candidates if item["asset_kind"] == kind][:floor]:
                    if len(selected) >= cap:
                        break
                    selected.append(candidate)
                    seen.add(id(candidate))
            for candidate in sorted_candidates:
                if len(selected) >= cap:
                    break
                if id(candidate) in seen:
                    continue
                selected.append(candidate)
            return selected

        result["candidates"] = balanced_candidates(result["candidates"], max(0, args.max_candidates))
        for index, candidate in enumerate(result["candidates"], start=1):
            candidate["candidate_id"] = f"{args.source_id}-L{index:03d}"

        pages_to_render = sorted({candidate["page_number"] for candidate in result["candidates"]})
        page_images = {}
        for page_number in pages_to_render:
            page = doc[page_number - 1]
            page_images[page_number] = render_png(
                page,
                page_dir / f"{args.source_id}-page-{page_number:03d}.png",
                clip=None,
                dpi=144,
            )

        for candidate in result["candidates"]:
            page = doc[candidate["page_number"] - 1]
            bbox = candidate.get("body_bbox_pdf_points") or candidate["bbox_pdf_points"]
            rect = fitz.Rect(bbox["x"], bbox["y"], bbox["x"] + bbox["width"], bbox["y"] + bbox["height"])
            crop_info = render_png(
                page,
                crop_dir / f"{candidate['candidate_id']}.png",
                clip=rect,
                dpi=300 if candidate["asset_kind"] != "equation" else 260,
            )
            candidate["crop_path"] = crop_info["path"]
            candidate["body_crop_path"] = crop_info["path"]
            candidate["crop_pixels"] = {
                "width": crop_info["width"],
                "height": crop_info["height"],
                "dpi": crop_info["dpi"],
            }
            candidate["body_crop_pixels"] = candidate["crop_pixels"]
            candidate["page_image_path"] = page_images.get(candidate["page_number"], {}).get("path")

        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        result["status"] = "failed"
        result["errors"].append(str(exc))
        print(json.dumps(result, ensure_ascii=False))
        return 0


if __name__ == "__main__":
    main()
