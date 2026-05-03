import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from PIL import Image
from docx import Document
from pypdf import PdfReader


def detect_mime_type(file_path: str) -> str | None:
    suffix = Path(file_path).suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".gif":
        return "image/gif"
    if suffix == ".svg":
        return "image/svg+xml"
    if suffix == ".pdf":
        return "application/pdf"
    if suffix == ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return None


def build_asset_record(asset_path: str, asset_key: str, asset_kind: str) -> dict[str, Any]:
    width_px = None
    height_px = None
    has_transparency = None

    if os.path.exists(asset_path):
        with Image.open(asset_path) as image:
            width_px, height_px = image.size
            has_transparency = image.mode in {"RGBA", "LA"} or "transparency" in image.info

    return {
        "asset_key": asset_key,
        "kind": asset_kind,
        "source_path": asset_path,
        "mime_type": detect_mime_type(asset_path),
        "width_px": width_px,
        "height_px": height_px,
        "has_transparency": has_transparency,
    }


def extract_pdf_source(document_path: str, source_id: str, language: str) -> dict[str, Any]:
    reader = PdfReader(document_path)
    pages: list[dict[str, Any]] = []

    for index, page in enumerate(reader.pages, start=1):
        pages.append(
            {
                "page_number": index,
                "raw_text": (page.extract_text() or "").strip(),
            }
        )

    return {
        "source_id": source_id,
        "document_path": document_path,
        "language": language,
        "pages": pages,
    }


def paragraph_numbering(paragraph: Any) -> tuple[str | None, str | None]:
    p_pr = getattr(paragraph._p, "pPr", None)
    if p_pr is None or p_pr.numPr is None:
        return None, None

    num_id = p_pr.numPr.numId.val if p_pr.numPr.numId is not None else None
    ilvl = p_pr.numPr.ilvl.val if p_pr.numPr.ilvl is not None else None
    return str(num_id) if num_id is not None else None, str(ilvl) if ilvl is not None else None


def extract_docx_source(document_path: str, source_id: str, language: str) -> dict[str, Any]:
    document = Document(document_path)
    paragraphs: list[dict[str, Any]] = []

    for index, paragraph in enumerate(document.paragraphs, start=1):
        text = paragraph.text.strip()
        if not text:
            continue

        style = paragraph.style
        num_id, ilvl = paragraph_numbering(paragraph)
        paragraphs.append(
            {
                "paragraph_index": index,
                "text": text,
                "style_id": getattr(style, "style_id", None),
                "style_name": getattr(style, "name", None),
                "num_id": num_id,
                "ilvl": ilvl,
            }
        )

    return {
        "source_id": source_id,
        "document_path": document_path,
        "language": language,
        "paragraphs": paragraphs,
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser()
    parser.add_argument("--source-type", choices=["docx", "pdf_native_text"], required=True)
    parser.add_argument("--document-path", required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--language", default="es-PE")
    parser.add_argument("--asset-path")
    parser.add_argument("--asset-key", default="provided-logo")
    parser.add_argument("--asset-kind", default="logo")
    args = parser.parse_args()

    if args.source_type == "docx":
        payload = extract_docx_source(args.document_path, args.source_id, args.language)
    else:
        payload = extract_pdf_source(args.document_path, args.source_id, args.language)

    if args.asset_path:
        payload["provided_assets"] = [
            build_asset_record(args.asset_path, args.asset_key, args.asset_kind)
        ]

    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
