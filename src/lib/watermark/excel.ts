import ExcelJS from "exceljs";
import fs from "fs/promises";

export async function watermarkExcel(
  filePath: string,
  email: string
): Promise<Buffer> {
  const fileBytes = await fs.readFile(filePath);
  const workbook = new ExcelJS.Workbook();
  // @ts-expect-error - Node.js Buffer version mismatch with exceljs types
  await workbook.xlsx.load(fileBytes);

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
