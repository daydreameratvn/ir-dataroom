import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------------------------------------------------------------------------
// S3 client & bucket config
// ---------------------------------------------------------------------------

const REGION = process.env.AWS_REGION || "ap-southeast-1";
const BUCKET = process.env.IR_S3_BUCKET || "papaya-ir-dataroom";

let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region: REGION });
  return _s3;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Build an S3 key for a document file.
 * Pattern: ir/{tenantId}/{roundId}/{docId}/{originalFileName}
 */
export function buildS3Key(
  tenantId: string,
  roundId: string,
  docId: string,
  fileName: string
): string {
  return `ir/${tenantId}/${roundId}/${docId}/${fileName}`;
}

// ---------------------------------------------------------------------------
// Presigned URLs
// ---------------------------------------------------------------------------

/**
 * Generate a presigned PUT URL for direct browser upload.
 * Returns { uploadUrl, s3Key, s3Bucket }.
 */
export async function generateUploadUrl(params: {
  tenantId: string;
  roundId: string;
  docId: string;
  fileName: string;
  mimeType: string;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; s3Key: string; s3Bucket: string }> {
  const s3Key = buildS3Key(params.tenantId, params.roundId, params.docId, params.fileName);
  const expiresIn = params.expiresIn ?? 3600; // 1 hour default

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: params.mimeType,
  });

  const uploadUrl = await getSignedUrl(getS3(), command, { expiresIn });

  return { uploadUrl, s3Key, s3Bucket: BUCKET };
}

/**
 * Upload a file buffer directly to S3 (server-side proxy upload).
 * Used to avoid CORS issues with direct browser-to-S3 presigned PUT.
 */
export async function uploadToS3(params: {
  tenantId: string;
  roundId: string;
  docId: string;
  fileName: string;
  mimeType: string;
  body: Buffer | Uint8Array;
}): Promise<{ s3Key: string; s3Bucket: string }> {
  const s3Key = buildS3Key(params.tenantId, params.roundId, params.docId, params.fileName);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: params.mimeType,
    Body: params.body,
  });

  await getS3().send(command);

  return { s3Key, s3Bucket: BUCKET };
}

/**
 * Generate a presigned GET URL for viewing / downloading a file.
 * Optional: set Content-Disposition for forced download.
 */
export async function generateViewUrl(params: {
  s3Key: string;
  s3Bucket?: string;
  expiresIn?: number;
  downloadAs?: string;
  contentType?: string;
}): Promise<string> {
  const bucket = params.s3Bucket || BUCKET;
  const expiresIn = params.expiresIn ?? 3600;

  const commandInput: Record<string, unknown> = {
    Bucket: bucket,
    Key: params.s3Key,
  };

  if (params.downloadAs) {
    commandInput.ResponseContentDisposition = `attachment; filename="${params.downloadAs}"`;
  }

  if (params.contentType) {
    commandInput.ResponseContentType = params.contentType;
  }

  const command = new GetObjectCommand(commandInput as any);
  return getSignedUrl(getS3(), command, { expiresIn });
}

/**
 * Download a file from S3 as a Buffer (used for watermarking).
 */
export async function downloadFileBuffer(params: {
  s3Key: string;
  s3Bucket?: string;
}): Promise<{ buffer: Buffer; contentType: string | undefined }> {
  const bucket = params.s3Bucket || BUCKET;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: params.s3Key,
  });

  const response = await getS3().send(command);
  const bodyBytes = await response.Body!.transformToByteArray();

  return {
    buffer: Buffer.from(bodyBytes),
    contentType: response.ContentType ?? undefined,
  };
}

/**
 * Delete a file from S3.
 */
export async function deleteS3File(params: {
  s3Key: string;
  s3Bucket?: string;
}): Promise<void> {
  const bucket = params.s3Bucket || BUCKET;

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: params.s3Key,
  });

  await getS3().send(command);
}
