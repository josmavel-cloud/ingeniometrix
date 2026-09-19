"""Synthetic in-memory PDF, never a production evidence source."""
import unittest
import fitz
from step5_pdf_layout_inventory import page_candidates
from pdf_citation_links import bibliography_dois


class NativeGeometryTest(unittest.TestCase):
    def test_bibliography_links_are_discovery_not_body_links(self):
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 50), "Body")
        page.insert_text((50, 300), "References")
        page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(50, 60, 130, 80), "uri": "https://doi.org/10.1234/body"})
        page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(50, 320, 130, 340), "uri": "https://doi.org/10.1234/cited"})
        doc = fitz.open(stream=doc.tobytes(), filetype="pdf")
        self.assertEqual([item["doi"] for item in bibliography_dois(doc)], ["10.1234/cited"])

    def test_captioned_vector_and_labels(self):
        doc = fitz.open()
        page = doc.new_page(width=600, height=800)
        page.draw_rect(fitz.Rect(90, 150, 410, 330), color=(0, 0, 0))
        page.draw_line(fitz.Point(100, 310), fitz.Point(390, 170))
        page.insert_text((100, 185), "Synthetic label")
        page.insert_text((90, 350), "Figure 1. Synthetic conceptual relationship")
        candidates, _ = page_candidates(doc, 0, "synthetic-source")
        native = [c for c in candidates if c["detection_method"] == "pymupdf_vector_cluster"]
        self.assertTrue(native)
        self.assertEqual(native[0]["source_id"], "synthetic-source")
        self.assertEqual(native[0]["page_number"], 1)
        self.assertIn("Figure 1", native[0]["caption_text"])
        self.assertGreaterEqual(native[0]["bbox_pdf_points"]["width"], 320)
        self.assertLess(native[0]["bbox_pdf_points"]["height"], 250)

    def test_uncaptioned_vector_not_accepted_as_figure(self):
        doc = fitz.open()
        page = doc.new_page(width=600, height=800)
        page.draw_rect(fitz.Rect(40, 20, 550, 45))
        self.assertFalse(any(c["detection_method"] == "pymupdf_vector_cluster"
                             for c in page_candidates(doc, 0, "synthetic-source")[0]))


if __name__ == "__main__":
    unittest.main()
