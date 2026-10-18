from pathlib import Path

import fitz

from validate_user_guide_pdf import validate_pdf


def test_validate_pdf_accepts_renderable_document_with_links(tmp_path: Path) -> None:
    pdf_path = tmp_path / "guide.pdf"
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Forge guide")
    page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(72, 72, 160, 96), "uri": "https://example.test"})
    document.save(pdf_path)
    document.close()

    validate_pdf(pdf_path, minimum_links=1)


def test_validate_pdf_rejects_blank_document(tmp_path: Path) -> None:
    pdf_path = tmp_path / "blank.pdf"
    document = fitz.open()
    document.new_page()
    document.save(pdf_path)
    document.close()

    try:
        validate_pdf(pdf_path, minimum_links=0)
    except ValueError as error:
        assert "blank" in str(error)
    else:
        raise AssertionError("blank PDF was accepted")
