import argparse
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def detect_equation_lines(text: str):
    results = []
    seen = set()
    for raw_line in text.splitlines():
        line = normalize_text(raw_line)
        if len(line) < 8 or len(line) > 180:
            continue
        if line in seen or "=" not in line:
            continue
        if not re.search(r"[A-Za-z].*[=].*[A-Za-z0-9]", line):
            continue
        if re.search(r"(doi|http|copyright|license|received|accepted|published)", line, re.I):
            continue
        seen.add(line)
        results.append(line)
        if len(results) >= 12:
            break
    return results


def detect_caption_lines(text: str, prefix: str):
    matches = []
    pattern = re.compile(rf"^\s*{prefix}\s*[\dA-Za-z\.\-:]*\s+(.+)$", re.I)
    for raw_line in text.splitlines():
        line = normalize_text(raw_line)
        if len(line) < 8 or len(line) > 240:
            continue
        if pattern.match(line):
            matches.append(line)
        if len(matches) >= 12:
            break
    return matches


def split_references(text: str):
    match = re.search(r"\b(references|bibliography|referencias)\b", text, re.I)
    if not match:
        return []

    section = text[match.end() :]
    entries = []
    current = []
    for raw_line in section.splitlines():
        line = normalize_text(raw_line)
        if not line:
            if current:
                entries.append(" ".join(current))
                current = []
            continue
        if re.match(r"^(\[\d+\]|\d+\.|\w[\w\-]+,\s+[A-Z])", line) and current:
            entries.append(" ".join(current))
            current = [line]
            continue
        current.append(line)
        if len(" ".join(current)) > 900:
            entries.append(" ".join(current))
            current = []
        if len(entries) >= 40:
            break
    if current and len(entries) < 40:
        entries.append(" ".join(current))
    return [entry[:900] for entry in entries if len(entry) >= 24][:40]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    reader = PdfReader(str(pdf_path))
    page_texts = []
    full_text_parts = []
    equation_candidates = []
    table_captions = []
    figure_captions = []

    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        page_texts.append({"page_number": index, "text": text})
        if text:
            full_text_parts.append(text)
            equation_candidates.extend(
                {"page_number": index, "raw_text": line} for line in detect_equation_lines(text)
            )
            table_captions.extend(
                {"page_number": index, "caption": line} for line in detect_caption_lines(text, "table")
            )
            figure_captions.extend(
                {"page_number": index, "caption": line} for line in detect_caption_lines(text, "fig(?:ure)?")
            )

    full_text = "\n\n".join(full_text_parts)
    result = {
        "page_count": len(reader.pages),
        "page_texts": page_texts,
        "equation_candidates": equation_candidates[:24],
        "table_captions": table_captions[:24],
        "figure_captions": figure_captions[:24],
        "secondary_reference_candidates": split_references(full_text),
        "full_text": full_text,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
