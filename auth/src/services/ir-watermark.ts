import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import path from "path";
import os from "os";
import fs from "fs";

// ---------------------------------------------------------------------------
// PDF Watermark
// ---------------------------------------------------------------------------

/**
 * Watermark a PDF buffer with the investor's email.
 * Draws semi-transparent diagonal text at 3 well-spaced positions per page
 * along a single 45-degree direction (bottom-left → top-right).
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
    const fontSize = Math.min(width, height) * 0.05;
    const textWidth = helveticaFont.widthOfTextAtSize(email, fontSize);

    // 3 positions along the same diagonal — no overlapping, single direction
    const positions = [
      { x: width * 0.25, y: height * 0.25 },  // lower-left area
      { x: width * 0.50, y: height * 0.50 },  // center
      { x: width * 0.75, y: height * 0.75 },  // upper-right area
    ];

    for (const pos of positions) {
      page.drawText(email, {
        x: pos.x - textWidth / 2,
        y: pos.y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.7, 0.7, 0.7),
        opacity: 0.12,
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
  await workbook.xlsx.load(excelBuffer as unknown as ArrayBuffer);

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
// Video Watermark (ffmpeg)
// ---------------------------------------------------------------------------

/** Max video file size we'll attempt to watermark on-the-fly (200 MB) */
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

/**
 * Watermark a video buffer with the investor's email using ffmpeg drawtext.
 * Draws semi-transparent diagonal text at 3 positions across the frame.
 * Returns null if ffmpeg is unavailable or the file is too large.
 */
export async function watermarkVideo(
  videoBuffer: Buffer,
  mimeType: string,
  email: string
): Promise<Buffer | null> {
  // Skip very large files to avoid request timeout
  if (videoBuffer.length > MAX_VIDEO_SIZE) {
    console.warn(`[IR Watermark] Video too large (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB), skipping watermark`);
    return null;
  }

  // Require system ffmpeg (installed via Dockerfile)
  const ffmpegPath = "ffmpeg";
  try {
    const check = Bun.spawnSync(["which", "ffmpeg"]);
    if (check.exitCode !== 0) {
      console.warn("[IR Watermark] ffmpeg not installed, skipping video watermark");
      return null;
    }
  } catch {
    console.warn("[IR Watermark] ffmpeg not available, skipping video watermark");
    return null;
  }

  const tmpDir = os.tmpdir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = mimeType === "video/webm" ? ".webm" : ".mp4";
  const inputPath = path.join(tmpDir, `ir-wm-in-${id}${ext}`);
  const outputPath = path.join(tmpDir, `ir-wm-out-${id}${ext}`);

  try {
    fs.writeFileSync(inputPath, videoBuffer);

    // Escape special chars for ffmpeg drawtext filter
    const safeEmail = email.replace(/[':]/g, "\\$&");

    // Font size scales with video height (matches PDF watermark proportion of ~5% min dimension).
    // Three drawtext filters along a single diagonal direction — well-spaced, non-overlapping.
    const drawtext = [
      `drawtext=text='${safeEmail}':fontsize=h*0.04:fontcolor=white@0.12:x=(w-text_w)*0.20:y=(h-text_h)*0.20`,
      `drawtext=text='${safeEmail}':fontsize=h*0.04:fontcolor=white@0.12:x=(w-text_w)*0.50:y=(h-text_h)*0.50`,
      `drawtext=text='${safeEmail}':fontsize=h*0.04:fontcolor=white@0.12:x=(w-text_w)*0.80:y=(h-text_h)*0.80`,
    ].join(",");

    const proc = Bun.spawn(
      [ffmpegPath, "-i", inputPath, "-vf", drawtext, "-c:a", "copy", "-y", outputPath],
      { stdout: "ignore", stderr: "pipe" },
    );

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error("[IR Watermark] ffmpeg exited with code", exitCode, stderr.slice(-500));
      return null;
    }

    return Buffer.from(fs.readFileSync(outputPath));
  } catch (err) {
    console.error("[IR Watermark] Video watermark error:", err);
    return null;
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
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

  // Video
  if (mimeType.startsWith("video/")) {
    try {
      return await watermarkVideo(fileBuffer, mimeType, email);
    } catch (err) {
      console.error("[IR Watermark] Video watermark failed:", err);
      return null;
    }
  }

  return null;
}
