"""Render and validate the generated Forge user-guide PDF."""

from __future__ import annotations

from pathlib import Path

import fitz


def validate_pdf(pdf_path: Path, *, minimum_links: int = 20) -> None:
    document = fitz.open(pdf_path)
    try:
        if document.page_count < 1:
            raise ValueError("User-guide PDF has no pages.")

        links = 0
        for index, page in enumerate(document):
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
            if pixmap.width < 100 or pixmap.height < 100:
                raise ValueError(f"User-guide PDF page {index + 1} did not render at a usable size.")
            if all(component == 255 for component in pixmap.samples):
                raise ValueError(f"User-guide PDF page {index + 1} rendered blank.")
            links += len(page.get_links())

        if links < minimum_links:
            raise ValueError(f"User-guide PDF has {links} links; expected at least {minimum_links}.")
    finally:
        document.close()


def main() -> None:
    repository_root = Path(__file__).resolve().parents[1]
    pdf_path = repository_root / "docs" / "user-guide" / "generated" / "Forge-User-Guide.es.pdf"
    validate_pdf(pdf_path)
    print(f"Rendered and validated user-guide PDF: {pdf_path}")


if __name__ == "__main__":
    main()
