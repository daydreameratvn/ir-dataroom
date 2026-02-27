import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from "pdf-lib";

const MARGIN = 60;
const LINE_HEIGHT = 16;
const FONT_SIZE = 11;
const TITLE_FONT_SIZE = 18;
const HEADING_FONT_SIZE = 13;

interface SignOffData {
  email: string;
  name?: string | null;
  firm?: string | null;
  ndaAcceptedAt: Date | null;
  ndaIpAddress?: string | null;
}

/**
 * Generates a signed NDA as a PDF document.
 * Renders the NDA text content across pages, then appends a sign-off record.
 */
export async function generateSignedNdaPdf(
  ndaContent: string,
  signOff: SignOffData
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const usableWidth = pageWidth - MARGIN * 2;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - MARGIN;

  /** Add a new page and reset cursor */
  function newPage(): PDFPage {
    currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    cursorY = pageHeight - MARGIN;
    return currentPage;
  }

  /** Check if we need a new page, add one if so */
  function ensureSpace(needed: number) {
    if (cursorY - needed < MARGIN) {
      newPage();
    }
  }

  /** Draw a line of text */
  function drawText(
    text: string,
    options?: {
      font?: PDFFont;
      size?: number;
      color?: { r: number; g: number; b: number };
      indent?: number;
    }
  ) {
    const f = options?.font || font;
    const size = options?.size || FONT_SIZE;
    const color = options?.color || { r: 0.1, g: 0.1, b: 0.1 };
    const indent = options?.indent || 0;

    ensureSpace(size + 4);
    currentPage.drawText(text, {
      x: MARGIN + indent,
      y: cursorY,
      size,
      font: f,
      color: rgb(color.r, color.g, color.b),
    });
    cursorY -= LINE_HEIGHT;
  }

  /** Word-wrap text to fit within usable width and draw each line */
  function drawWrappedText(
    text: string,
    options?: {
      font?: PDFFont;
      size?: number;
      color?: { r: number; g: number; b: number };
    }
  ) {
    const f = options?.font || font;
    const size = options?.size || FONT_SIZE;
    const words = text.split(/\s+/);
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = f.widthOfTextAtSize(testLine, size);

      if (testWidth > usableWidth && line) {
        drawText(line, options);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      drawText(line, options);
    }
  }

  // ──── Title ────
  ensureSpace(TITLE_FONT_SIZE + 30);
  currentPage.drawText("NON-DISCLOSURE AGREEMENT", {
    x: MARGIN,
    y: cursorY,
    size: TITLE_FONT_SIZE,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursorY -= TITLE_FONT_SIZE + 20;

  // ──── NDA Content ────
  const paragraphs = ndaContent.split(/\n/);
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed === "") {
      cursorY -= LINE_HEIGHT * 0.5; // blank line spacing
      ensureSpace(LINE_HEIGHT);
    } else {
      drawWrappedText(trimmed);
    }
  }

  // ──── Sign-Off Record ────
  cursorY -= LINE_HEIGHT * 2;
  ensureSpace(HEADING_FONT_SIZE + LINE_HEIGHT * 8);

  // Divider line
  currentPage.drawLine({
    start: { x: MARGIN, y: cursorY + 8 },
    end: { x: pageWidth - MARGIN, y: cursorY + 8 },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  cursorY -= 8;

  drawText("SIGN-OFF RECORD", {
    font: boldFont,
    size: HEADING_FONT_SIZE,
  });
  cursorY -= 8;

  // Sign-off fields
  const fields: [string, string][] = [
    ["Signed by:", signOff.email],
  ];
  if (signOff.name) {
    fields.push(["Name:", signOff.name]);
  }
  if (signOff.firm) {
    fields.push(["Firm:", signOff.firm]);
  }
  fields.push([
    "Date & Time:",
    signOff.ndaAcceptedAt
      ? new Date(signOff.ndaAcceptedAt).toLocaleString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        })
      : "N/A",
  ]);
  fields.push(["IP Address:", signOff.ndaIpAddress || "N/A"]);

  for (const [label, value] of fields) {
    ensureSpace(LINE_HEIGHT * 1.5);
    // Label (bold)
    currentPage.drawText(label, {
      x: MARGIN,
      y: cursorY,
      size: FONT_SIZE,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    // Value
    const labelWidth = boldFont.widthOfTextAtSize(label, FONT_SIZE);
    currentPage.drawText(value, {
      x: MARGIN + labelWidth + 8,
      y: cursorY,
      size: FONT_SIZE,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= LINE_HEIGHT * 1.4;
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
