import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";

// ---------------------------------------------------------------------------
// PDF Watermark
// ---------------------------------------------------------------------------

/**
 * Watermark a PDF buffer with the investor's email.
 * Draws semi-transparent diagonal text at 5 positions per page.
 */
export async function watermarkPdf(
  pdfBuffer: Buffer,
  email: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const fontSize = Math.min(width, height) * 0.06;
    const textWidth = helveticaFont.widthOfTextAtSize(email, fontSize);

    // Draw email diagonally across the page — multiple positions for coverage
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

// ---------------------------------------------------------------------------
// Excel Watermark
// ---------------------------------------------------------------------------

/**
 * Watermark an Excel buffer with the investor's email.
 * Adds header/footer and a watermark row at the top of each worksheet.
 */
export async function watermarkExcel(
  excelBuffer: Buffer,
  email: string
): Promise<Buffer> {
  // Dynamic import because exceljs is heavy
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await (workbook.xlsx as any).load(excelBuffer);

  workbook.eachSheet((worksheet) => {
    // Add header and footer with email watermark
    worksheet.headerFooter = {
      oddHeader: `&C&14&K808080CONFIDENTIAL - ${email}`,
      oddFooter: `&C&10&K808080${email} - Downloaded from Investor Dataroom`,
      evenHeader: `&C&14&K808080CONFIDENTIAL - ${email}`,
      evenFooter: `&C&10&K808080${email} - Downloaded from Investor Dataroom`,
    };

    // Add a watermark-style row at the very top
    worksheet.insertRow(1, [`CONFIDENTIAL - ${email}`]);
    const watermarkRow = worksheet.getRow(1);
    watermarkRow.font = {
      size: 14,
      color: { argb: "40808080" }, // Semi-transparent gray
      bold: true,
      italic: true,
    };
    watermarkRow.alignment = { horizontal: "center" };

    // Merge cells across the used range for the watermark row
    const lastCol = Math.max(worksheet.columnCount, 5);
    worksheet.mergeCells(1, 1, 1, lastCol);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Watermark dispatcher
// ---------------------------------------------------------------------------

/**
 * Detect file type and apply the appropriate watermark.
 * Returns the watermarked buffer or null if no watermark was applied.
 */
export async function watermarkFile(
  fileBuffer: Buffer,
  mimeType: string | null,
  email: string
): Promise<Buffer | null> {
  if (!mimeType) return null;

  // PDF
  if (mimeType === "application/pdf") {
    try {
      return await watermarkPdf(fileBuffer, email);
    } catch (err) {
      console.error("[IR Watermark] PDF watermark failed:", err);
      return null;
    }
  }

  // Excel
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    try {
      return await watermarkExcel(fileBuffer, email);
    } catch (err) {
      console.error("[IR Watermark] Excel watermark failed:", err);
      return null;
    }
  }

  // Video watermarking would require ffmpeg; skip for now in the auth service
  // (the prototype handled video via a local ffmpeg process which isn't suitable
  // for serverless / ECS — consider a separate Lambda for video watermarking)

  return null;
}
