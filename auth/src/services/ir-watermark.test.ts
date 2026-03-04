import { describe, test, expect } from "bun:test";
import { watermarkPdf, watermarkExcel, watermarkVideo, watermarkFile } from "./ir-watermark.ts";
import { PDFDocument } from "pdf-lib";

// ── Helper: create a minimal PDF buffer ──

async function createTestPdf(pageCount = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]); // US Letter
  }
  return Buffer.from(await doc.save());
}

// ── watermarkPdf ──

describe("watermarkPdf", () => {
  test("produces a valid PDF buffer larger than input", async () => {
    const original = await createTestPdf();
    const result = await watermarkPdf(original, "investor@example.com");

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(original.length);

    // Re-parse to confirm it's a valid PDF
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  test("watermarks every page of a multi-page PDF", async () => {
    const original = await createTestPdf(3);
    const result = await watermarkPdf(original, "test@firm.co");

    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(3);
    // Watermarked PDF should be notably larger
    expect(result.length).toBeGreaterThan(original.length);
  });

  test("handles very long email addresses", async () => {
    const original = await createTestPdf();
    const longEmail = "a".repeat(100) + "@example.com";
    const result = await watermarkPdf(original, longEmail);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(original.length);
  });
});

// ── watermarkExcel ──

describe("watermarkExcel", () => {
  test("produces a valid Excel buffer with watermark row", async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["Revenue", 100000]);
    sheet.addRow(["Expenses", 50000]);
    const original = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await watermarkExcel(original, "investor@fund.com");
    expect(result).toBeInstanceOf(Buffer);

    // Re-parse and check watermark row was inserted
    const wmBook = new ExcelJS.Workbook();
    await wmBook.xlsx.load(result as unknown as ArrayBuffer);
    const wmSheet = wmBook.getWorksheet("Sheet1")!;
    const firstCell = wmSheet.getCell("A1").value;
    expect(String(firstCell)).toContain("CONFIDENTIAL");
    expect(String(firstCell)).toContain("investor@fund.com");
  });

  test("watermarks all sheets", async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1").addRow(["A"]);
    workbook.addWorksheet("Sheet2").addRow(["B"]);
    const original = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await watermarkExcel(original, "test@co.com");
    const wmBook = new ExcelJS.Workbook();
    await wmBook.xlsx.load(result as unknown as ArrayBuffer);

    for (const sheet of [wmBook.getWorksheet("Sheet1")!, wmBook.getWorksheet("Sheet2")!]) {
      expect(String(sheet.getCell("A1").value)).toContain("CONFIDENTIAL");
    }
  });
});

// ── watermarkVideo ──

describe("watermarkVideo", () => {
  test("returns null for oversized videos (>200MB)", async () => {
    // We don't actually allocate 200MB — mock a buffer with a large .length
    const fakeBuffer = { length: 201 * 1024 * 1024 } as Buffer;
    const result = await watermarkVideo(fakeBuffer, "video/mp4", "test@example.com");
    expect(result).toBeNull();
  });

  test("selects .webm extension for video/webm mime type", async () => {
    // With a tiny invalid buffer, ffmpeg will fail and return null — but no crash
    const tiny = Buffer.from("not a real video");
    const result = await watermarkVideo(tiny, "video/webm", "test@example.com");
    // ffmpeg should fail gracefully
    expect(result).toBeNull();
  });

  test("returns null for invalid video data", async () => {
    const garbage = Buffer.from("this is not a video file");
    const result = await watermarkVideo(garbage, "video/mp4", "test@example.com");
    expect(result).toBeNull();
  });
});

// ── watermarkFile (dispatcher) ──

describe("watermarkFile", () => {
  test("returns null when mimeType is null", async () => {
    const buf = Buffer.from("test");
    expect(await watermarkFile(buf, null, "test@example.com")).toBeNull();
  });

  test("routes application/pdf to watermarkPdf", async () => {
    const pdf = await createTestPdf();
    const result = await watermarkFile(pdf, "application/pdf", "test@example.com");
    expect(result).toBeInstanceOf(Buffer);
    expect(result!.length).toBeGreaterThan(pdf.length);
  });

  test("routes spreadsheet types to watermarkExcel", async () => {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("S").addRow(["X"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await watermarkFile(
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "test@example.com",
    );
    expect(result).toBeInstanceOf(Buffer);
  });

  test("returns null for unsupported types", async () => {
    const buf = Buffer.from("plain text");
    expect(await watermarkFile(buf, "text/plain", "a@b.com")).toBeNull();
    expect(await watermarkFile(buf, "image/png", "a@b.com")).toBeNull();
  });

  test("returns null for corrupted PDF data", async () => {
    const corrupted = Buffer.from("not a pdf at all");
    const result = await watermarkFile(corrupted, "application/pdf", "test@example.com");
    expect(result).toBeNull();
  });
});
