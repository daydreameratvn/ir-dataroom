import type { ScourgeJobResult, ProcessingStatus } from "./pipeline.ts";
import { processClaimDocuments } from "./pipeline.ts";

/**
 * Handler for the Scourge PII replacement pipeline.
 *
 * Note: The extractPII and editDocumentImage functions must be provided
 * by the caller, as they depend on the available LLM models.
 */
export async function handleScourge(request: {
  claimCode: string;
  extractPII: (imageUrl: string) => Promise<any>;
  editDocumentImage: (imageSource: string, originalValue: string, newValue: string, fieldName: string) => Promise<string | null>;
  onProgress?: (status: ProcessingStatus) => void;
}): Promise<ScourgeJobResult> {
  return processClaimDocuments(
    request.claimCode,
    request.extractPII,
    request.editDocumentImage,
    request.onProgress,
  );
}
