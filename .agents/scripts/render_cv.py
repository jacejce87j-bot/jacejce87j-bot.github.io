from pathlib import Path

import fitz


pdf_path = Path("attached_assets/Lance_Benito_CV_Senior_Solutions_Architect_1_1785928095125.pdf")
output_dir = Path(".agents/outputs/lance-benito-cv")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
print(f"pages={document.page_count}")
print(f"metadata={document.metadata}")

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output_path = output_dir / f"page-{index + 1}.png"
    pixmap.save(output_path)
    print(f"rendered={output_path}")
    print(f"page_{index + 1}_text_start")
    print(page.get_text())
    print(f"page_{index + 1}_text_end")