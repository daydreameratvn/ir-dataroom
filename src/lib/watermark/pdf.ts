import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import fs from "fs/promises";

export async function watermarkPdf(
  filePath: string,
  email: string
): Promise<Buffer> {
  const fileBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(fileBytes);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const fontSize = Math.min(width, height) * 0.06;
    const textWidth = helveticaFont.widthOfTextAtSize(email, fontSize);

    // Draw email diagonally across the page — multiple times for coverage
    const positions = [
      { x: width / 2, y: height / 2 },
      { x: width / 4, y: height / 4 },
      { x: (width * 3) / 4, y: (height * 3) / 4 },
      { x: width / 4, y: (height * 3) / 4 },
      { x: (width * 3) / 4, y: height / 4 },
    ];

    for (const pos of positions) {
      page.drawText(email, {
        x: pos.x - textWidth / 2,
        y: pos.y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.7, 0.7, 0.7),
        opacity: 0.15,
        rotate: degrees(45),
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
