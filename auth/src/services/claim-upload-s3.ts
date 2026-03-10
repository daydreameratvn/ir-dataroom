import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ─── Config ──────────────────────────────────────────────────────────────────

const REGION = process.env.AWS_REGION || "ap-southeast-1";
const BUCKET = process.env.CLAIM_UPLOAD_S3_BUCKET || "papaya-sweetpotato-healthcare-prod";
const CDN_BASE = process.env.CLAIM_UPLOAD_CDN_BASE || "https://care.cdn.services.papaya.asia";
const UPLOAD_EXPIRES_IN = 3600; // 1 hour

let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region: REGION });
  return _s3;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadRequest {
  fileName: string;
  fileType: string;
  documentType?: string;
}

export interface UploadResponse {
  uploadUrl: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  documentType: string;
  bucket: string;
  key: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const MAX_FILES = 20;

/**
 * Sanitize filename: keep only alphanumeric, dash, underscore, dot.
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

// ─── Generate Upload URLs ────────────────────────────────────────────────────

/**
 * Generate pre-signed PUT URLs for direct client-to-S3 upload.
 * Files are stored under docs/uploads/{batchId}/{sanitizedFileName}.
 *
 * Returns everything the client needs to:
 * 1. Upload directly to S3 (uploadUrl)
 * 2. Reference the file in the claim submission session (fileUrl, bucket, key)
 */
export async function generateUploadUrls(
  files: UploadRequest[],
): Promise<{ batchId: string; uploads: UploadResponse[] }> {
  if (files.length === 0) throw new Error("At least one file is required");
  if (files.length > MAX_FILES) throw new Error(`Maximum ${MAX_FILES} files per upload`);

  // Validate MIME types
  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.has(file.fileType)) {
      throw new Error(`Unsupported file type: ${file.fileType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`);
    }
  }

  const batchId = crypto.randomUUID();
  const uploads: UploadResponse[] = [];

  for (const file of files) {
    const safeName = sanitizeFileName(file.fileName);
    const key = `docs/uploads/${batchId}/${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: file.fileType,
    });

    const uploadUrl = await getSignedUrl(getS3(), command, { expiresIn: UPLOAD_EXPIRES_IN });

    uploads.push({
      uploadUrl,
      fileUrl: `${CDN_BASE}/${key}`,
      fileName: safeName,
      fileType: file.fileType,
      documentType: file.documentType || "OtherPaper",
      bucket: BUCKET,
      key,
    });
  }

  return { batchId, uploads };
}
