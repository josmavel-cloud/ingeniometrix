"""Read DOI hyperlinks in the bibliography; output discovery only, never evidence."""
import json
import re
import sys
import fitz


def bibliography_dois(doc, limit=10):
    started = False
    found = []
    seen = set()
    for index, page in enumerate(doc):
        top = 0
        if not started:
            for block in page.get_text("blocks"):
                if re.search(r"(?:^|\n)\s*(?:\d+[.)]?\s*)?(?:references|referencias|bibliograf[ií]a)\s*(?:\n|$)", block[4], re.I):
                    started = True
                    top = block[1]
                    break
        if not started:
            continue
        for link in page.get_links():
            uri = link.get("uri", "")
            if link.get("from", fitz.Rect()).y0 < top:
                continue
            match = re.match(r"https?://(?:dx\.)?doi\.org/(10\.\d{4,9}/[^\s]+)$", uri, re.I)
            if match and match[1].lower() not in seen:
                seen.add(match[1].lower())
                found.append({"doi": match[1].lower(), "url": uri, "page": index + 1})
            if len(found) >= limit:
                return found
    return found


if __name__ == "__main__":
    with fitz.open(sys.argv[1]) as document:
        print(json.dumps(bibliography_dois(document, min(10, int(sys.argv[2])))))
