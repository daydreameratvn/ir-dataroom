import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import * as mupdf from "mupdf";
import { gqlQuery } from "../shared/graphql-client.ts";
import { mergeExtractedData, parseExtractedData, getExtractedField } from "../portal-extraction/tools/claims.ts";
import { callForensicsApi, type ForensicsApiResponse } from "./tools/image-forensics.ts";
import type { DocumentForensicsResult } from "../document-forensics/types.ts";

// ─── S3 Client ───────────────────────────────────────────────────────────────

let _s3: S3Client;
function getS3() {
  if (!_s3) _s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-southeast-1" });
  return _s3;
}

const S3_BUCKET = process.env.PORTAL_S3_BUCKET ?? "banyan-portal-documents";

// ─── GraphQL ─────────────────────────────────────────────────────────────────

const FETCH_CLAIM_QUERY = `
  query FetchClaimForImageForensics($id: Uuid!) {
    claimsById(id: $id) {
      id
      claimNumber
      aiSummary
      claimDocuments {
        id
        documentType
        fileName
        fileUrl
      }
    }
  }
`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClaimDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
}

interface ClassifiedDocument {
  type: string;
  pageNumbers: number[];
  summary: string | null;
}

type ImageForensicsVerdict = "AUTHENTIC" | "SUSPICIOUS" | "TAMPERED";

interface ImageForensicsAnomaly {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  location?: string;
}

interface RiskyField {
  type: string;
  text: string;
  anomalyScore: number;
}

interface DocumentFinding {
  documentType: string;
  pageNumbers: number[];
  verdict: ImageForensicsVerdict;
  anomalies: ImageForensicsAnomaly[];
  overallScore: number;
  riskLevel: string;
  truforGlobalScore: number;
  fieldsAnalyzed: number;
  topRiskyFields: RiskyField[];
  heatmapBase64: string | null;
}

// ─── Verdict Mapping ─────────────────────────────────────────────────────────

function mapVerdict(apiVerdict: DocumentForensicsResult["verdict"]): ImageForensicsVerdict {
  if (apiVerdict === "NORMAL") return "AUTHENTIC";
  if (apiVerdict === "SUSPICIOUS") return "SUSPICIOUS";
  return "TAMPERED"; // TAMPERED or ERROR → TAMPERED
}

function mapSeverity(anomalyScore: number): "LOW" | "MEDIUM" | "HIGH" {
  if (anomalyScore >= 0.7) return "HIGH";
  if (anomalyScore >= 0.4) return "MEDIUM";
  return "LOW";
}

// ─── S3 Helpers ──────────────────────────────────────────────────────────────

async function downloadDocument(fileUrl: string): Promise<{ buffer: Buffer; base64: string; mimeType: string } | null> {
  try {
    const url = new URL(fileUrl);
    const key = decodeURIComponent(url.pathname.slice(1));
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const response = await getS3().send(command);
    const body = await response.Body?.transformToByteArray();
    if (!body) return null;

    const contentType = response.ContentType ?? "image/jpeg";
    const buffer = Buffer.from(body);
    const base64 = buffer.toString("base64");
    return { buffer, base64, mimeType: contentType };
  } catch (err) {
    console.error(`[image-forensics] Failed to download document from S3: ${fileUrl}`, err);
    return null;
  }
}

function isImageFile(fileName: string): boolean {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ["jpg", "jpeg", "png", "bmp", "tiff", "tif", "webp"].includes(ext);
}

function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".pdf");
}

function isAnalyzableFile(fileName: string): boolean {
  return isImageFile(fileName) || isPdfFile(fileName);
}

/** Render PDF pages to PNG base64 images using MuPDF WASM. */
const PDF_RENDER_SCALE = 2; // 2x for decent OCR quality
const MAX_PDF_PAGES = 10;

function renderPdfToImages(pdfBuffer: Buffer): Array<{ base64: string; pageNumber: number }> {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const pageCount = Math.min(doc.countPages(), MAX_PDF_PAGES);
  const pages: Array<{ base64: string; pageNumber: number }> = [];

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(PDF_RENDER_SCALE, PDF_RENDER_SCALE),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    const png = pixmap.asPNG();
    pages.push({
      base64: Buffer.from(png).toString("base64"),
      pageNumber: i + 1,
    });
  }

  return pages;
}

// ─── Result Mapping ──────────────────────────────────────────────────────────

function mapApiResultToFinding(
  apiResult: DocumentForensicsResult,
  documentType: string,
  pageNumbers: number[],
): DocumentFinding {
  const verdict = mapVerdict(apiResult.verdict);

  // Extract anomalies from fields with high anomaly scores
  const anomalies: ImageForensicsAnomaly[] = [];

  for (const field of apiResult.fields) {
    if (field.scores.anomaly >= 0.3) {
      anomalies.push({
        type: field.type,
        severity: mapSeverity(field.scores.anomaly),
        description: `Field "${field.text}" has anomaly score ${(field.scores.anomaly * 100).toFixed(0)}% (heatmap max: ${(field.scores.heatmap_max * 100).toFixed(0)}%)`,
        location: field.bbox
          ? `Region (${field.bbox.x}, ${field.bbox.y}) ${field.bbox.width}×${field.bbox.height}`
          : undefined,
      });
    }
  }

  // Add highest risk field as anomaly if not already included
  if (apiResult.highest_risk_field && apiResult.highest_risk_field.scores.anomaly >= 0.3) {
    const alreadyIncluded = anomalies.some(a => a.type === apiResult.highest_risk_field!.type);
    if (!alreadyIncluded) {
      anomalies.push({
        type: apiResult.highest_risk_field.type,
        severity: mapSeverity(apiResult.highest_risk_field.scores.anomaly),
        description: `Highest risk field "${apiResult.highest_risk_field.text}" — anomaly score ${(apiResult.highest_risk_field.scores.anomaly * 100).toFixed(0)}%`,
        location: apiResult.highest_risk_field.bbox
          ? `Region (${apiResult.highest_risk_field.bbox.x}, ${apiResult.highest_risk_field.bbox.y})`
          : undefined,
      });
    }
  }

  // Top risky fields — sorted by anomaly score desc, take top 5
  const topRiskyFields: RiskyField[] = [...apiResult.fields]
    .sort((a, b) => b.scores.anomaly - a.scores.anomaly)
    .filter((f) => f.scores.anomaly > 0.15)
    .slice(0, 5)
    .map((f) => ({
      type: f.type,
      text: f.text.slice(0, 80),
      anomalyScore: Math.round(f.scores.anomaly * 100) / 100,
    }));

  return {
    documentType,
    pageNumbers,
    verdict,
    anomalies,
    overallScore: Math.round(apiResult.overall_score * 1000) / 1000,
    riskLevel: apiResult.risk_level,
    truforGlobalScore: Math.round(apiResult.trufor.global_score * 1000) / 1000,
    fieldsAnalyzed: apiResult.ocr_analysis.total_fields,
    topRiskyFields,
    heatmapBase64: apiResult.heatmap_b64 ?? null,
  };
}

function buildReportMarkdown(
  findings: DocumentFinding[],
  apiResults: Array<{ docType: string; result: DocumentForensicsResult }>,
): string {
  const lines: string[] = ["## Document Forensics Report\n"];

  for (const { docType, result } of apiResults) {
    lines.push(`### ${docType}\n`);
    lines.push(`- **Verdict**: ${result.verdict}`);
    lines.push(`- **Overall Score**: ${(result.overall_score * 100).toFixed(1)}%`);
    lines.push(`- **Risk Level**: ${result.risk_level}`);
    lines.push(`- **Method**: ${result.method}`);
    lines.push(`- **OCR Engine**: ${result.ocr_engine}`);
    lines.push(`- **Fields Analyzed**: ${result.ocr_analysis.total_fields}`);

    if (result.highest_risk_field) {
      lines.push(`- **Highest Risk Field**: ${result.highest_risk_field.type} (anomaly: ${(result.highest_risk_field.scores.anomaly * 100).toFixed(0)}%)`);
    }

    if (result.notes.length > 0) {
      lines.push(`\n**Notes**: ${result.notes.join("; ")}`);
    }

    // Embed heatmap if available
    if (result.heatmap_b64) {
      lines.push(`\n#### Forensics Heatmap\n`);
      lines.push(`![Forensics Heatmap](data:image/jpeg;base64,${result.heatmap_b64})`);
    }

    lines.push(""); // blank line between documents
  }

  return lines.join("\n");
}

function computeOverallVerdict(findings: DocumentFinding[]): ImageForensicsVerdict {
  if (findings.some(f => f.verdict === "TAMPERED")) return "TAMPERED";
  if (findings.some(f => f.verdict === "SUSPICIOUS")) return "SUSPICIOUS";
  return "AUTHENTIC";
}

function computeConfidenceScore(apiResults: DocumentForensicsResult[]): number {
  if (apiResults.length === 0) return 100;
  // Average confidence: invert overall_score (0 = authentic, 1 = tampered)
  const avgScore = apiResults.reduce((sum, r) => sum + r.overall_score, 0) / apiResults.length;
  return Math.round(Math.max(0, Math.min(100, (1 - avgScore) * 100)));
}

// ─── Main Agent Function ─────────────────────────────────────────────────────

/**
 * Direct function agent for image forensics — no LLM needed.
 * The forensics backend (TruFor + OCR) does all the heavy lifting.
 *
 * This exports the same interface as an LLM agent (createPortalAgent returning
 * an object with prompt/waitForIdle/subscribe) so the pipeline orchestrator
 * can invoke it identically.
 */
export async function createPortalAgent(claimId: string) {
  let isRunning = false;
  let isDone = false;
  let aborted = false;
  let error: Error | null = null;
  const listeners: Array<(event: any) => void> = [];

  function emit(event: any) {
    for (const listener of listeners) {
      try { listener(event); } catch { /* ignore listener errors */ }
    }
  }

  async function run() {
    isRunning = true;
    emit({ type: "agent_start", agentId: "image-forensics" });

    try {
      // 1. Fetch claim data (documents + classified documents from extraction)
      emit({ type: "tool_execution_start", toolName: "fetch_documents_for_analysis" });

      const data = await gqlQuery<{ claimsById: any }>(FETCH_CLAIM_QUERY, { id: claimId });
      const claim = data.claimsById;
      if (!claim) throw new Error(`Claim ${claimId} not found`);

      const extractedData = parseExtractedData(claim.aiSummary);
      const classifiedDocuments: ClassifiedDocument[] =
        (getExtractedField(extractedData, "extraction", "classifiedDocuments") as ClassifiedDocument[] | null) ?? [];
      const claimDocuments: ClaimDocument[] = claim.claimDocuments ?? [];

      emit({ type: "tool_execution_end", toolName: "fetch_documents_for_analysis" });

      // 2. Match classified documents with their file URLs and filter to images
      const documentsToAnalyze: Array<{
        classified: ClassifiedDocument;
        claimDoc: ClaimDocument;
      }> = [];

      for (const classified of classifiedDocuments) {
        // Find matching claim document — match by documentType or by proximity
        const matchingDoc = claimDocuments.find(
          cd => cd.documentType === classified.type || cd.fileName?.includes(classified.type),
        );
        if (matchingDoc && isAnalyzableFile(matchingDoc.fileName)) {
          documentsToAnalyze.push({ classified, claimDoc: matchingDoc });
        }
      }

      // If no classified docs match, try analyzing all analyzable documents directly
      if (documentsToAnalyze.length === 0) {
        for (const doc of claimDocuments) {
          if (isAnalyzableFile(doc.fileName)) {
            documentsToAnalyze.push({
              classified: { type: doc.documentType ?? "Unknown", pageNumbers: [1], summary: null },
              claimDoc: doc,
            });
          }
        }
      }

      // 3. Call forensics API for each document image
      const findings: DocumentFinding[] = [];
      const apiResults: Array<{ docType: string; result: DocumentForensicsResult }> = [];
      const market = process.env.MARKET ?? "TH";

      for (const { classified, claimDoc } of documentsToAnalyze) {
        emit({ type: "tool_execution_start", toolName: "analyze_document" });

        try {
          const downloaded = await downloadDocument(claimDoc.fileUrl);
          if (!downloaded) {
            console.warn(`[image-forensics] Skipping ${claimDoc.fileName} — failed to download`);
            continue;
          }

          // For PDFs, render each page to an image and analyze separately
          const imagesToAnalyze: Array<{ base64: string; pageNumber: number }> = [];

          if (isPdfFile(claimDoc.fileName)) {
            try {
              const pdfPages = renderPdfToImages(downloaded.buffer);
              console.log(`[image-forensics] Rendered ${pdfPages.length} page(s) from PDF ${claimDoc.fileName}`);
              imagesToAnalyze.push(...pdfPages);
            } catch (err) {
              console.error(`[image-forensics] Failed to render PDF ${claimDoc.fileName}:`, err);
              continue;
            }
          } else {
            imagesToAnalyze.push({ base64: downloaded.base64, pageNumber: 1 });
          }

          // Analyze each image (page)
          for (const { base64, pageNumber } of imagesToAnalyze) {
            try {
              const apiResult = await callForensicsApi(base64, market);

              if (apiResult.success) {
                const pageNumbers = isPdfFile(claimDoc.fileName) ? [pageNumber] : classified.pageNumbers;
                const docLabel = isPdfFile(claimDoc.fileName) && imagesToAnalyze.length > 1
                  ? `${classified.type} (p${pageNumber})`
                  : classified.type;
                const finding = mapApiResultToFinding(apiResult, docLabel, pageNumbers);
                findings.push(finding);
                apiResults.push({ docType: docLabel, result: apiResult });
              } else {
                console.warn(`[image-forensics] Forensics API error for ${claimDoc.fileName} page ${pageNumber}: ${apiResult.error}`);
              }
            } catch (err) {
              console.error(`[image-forensics] Error analyzing ${claimDoc.fileName} page ${pageNumber}:`, err);
            }
          }
        } catch (err) {
          console.error(`[image-forensics] Error processing ${claimDoc.fileName}:`, err);
        }

        emit({ type: "tool_execution_end", toolName: "analyze_document" });
      }

      // 4. Compute overall result and save
      emit({ type: "tool_execution_start", toolName: "save_image_forensics_result" });

      const overallVerdict = computeOverallVerdict(findings);
      const confidenceScore = computeConfidenceScore(apiResults.map(r => r.result));
      const totalAnomaliesFound = findings.reduce((sum, f) => sum + f.anomalies.length, 0);

      const reportMarkdown = apiResults.length > 0
        ? buildReportMarkdown(findings, apiResults)
        : null;

      const summaryParts: string[] = [];
      summaryParts.push(`Analyzed ${findings.length} document(s).`);
      if (totalAnomaliesFound > 0) {
        summaryParts.push(`Found ${totalAnomaliesFound} anomaly/anomalies.`);
      }
      summaryParts.push(`Overall verdict: ${overallVerdict} (confidence: ${confidenceScore}%).`);

      const result = {
        overallVerdict,
        confidenceScore,
        documentFindings: findings,
        summary: summaryParts.join(" "),
        reportMarkdown,
        totalDocumentsAnalyzed: findings.length,
        totalAnomaliesFound,
        completedAt: new Date().toISOString(),
      };

      await mergeExtractedData(claimId, result, "imageForensics");

      emit({ type: "tool_execution_end", toolName: "save_image_forensics_result" });
      emit({ type: "agent_end", stopReason: "end_turn" });
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      console.error(`[image-forensics] Agent failed for claim ${claimId}:`, error);

      // Save a fallback result so the pipeline doesn't lose partial data
      try {
        await mergeExtractedData(claimId, {
          overallVerdict: "AUTHENTIC",
          confidenceScore: 0,
          documentFindings: [],
          summary: `Forensics analysis failed: ${error.message}`,
          reportMarkdown: null,
          totalDocumentsAnalyzed: 0,
          totalAnomaliesFound: 0,
          completedAt: new Date().toISOString(),
        }, "imageForensics");
      } catch { /* best-effort fallback save */ }

      emit({ type: "agent_end", stopReason: "error", error: error.message });
    } finally {
      isRunning = false;
      isDone = true;
    }
  }

  // ─── Agent-compatible interface ──────────────────────────────────────────
  // The pipeline orchestrator calls: agent.prompt(...), agent.waitForIdle(), agent.subscribe(...)

  return {
    subscribe(listener: (event: any) => void) {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },

    async prompt(_message: string) {
      // Start the analysis — runs without LLM
      run(); // intentionally not awaited — pipeline uses waitForIdle()
    },

    async waitForIdle() {
      // Wait for run() to finish
      while (!isDone) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (error) throw error;
    },

    abort() {
      aborted = true;
    },

    get state() {
      return {
        messages: [],
        get lastStopReason() {
          return error ? "error" : isDone ? "end_turn" : undefined;
        },
      };
    },
  };
}
