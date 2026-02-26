import type { ExtractedPII, ProcessedDocument, ReplacementPII } from "./tools/scourge.ts";
import { fetchClaimDocuments, queryRandomInsured } from "./tools/scourge.ts";

export type ProcessingPhase = "fetching" | "querying" | "extracting" | "editing" | "completed" | "failed";

export type ProcessingStatus = {
  phase: ProcessingPhase;
  message: string;
  currentDoc?: number;
  totalDocs?: number;
  currentField?: string;
};

export type ScourgeJobResult = {
  claimCode: string;
  documents: ProcessedDocument[];
  replacementPII: ReplacementPII;
  status: "completed" | "failed";
  error?: string;
};

/**
 * Processes all documents in a claim case by replacing PII with data from a random insured person.
 *
 * Pipeline steps:
 * 1. Fetch all image documents from the claim case
 * 2. Query a random insured person from the database
 * 3. For each document:
 *    a. Extract PII (requires external LLM call — implementation depends on deployment)
 *    b. Multi-pass image editing (requires image generation model)
 *
 * Note: The extractPII and editDocumentImage functions from the original cherry implementation
 * used Gemini Flash and Gemini Pro Image models respectively. These need to be reimplemented
 * using available models in the new setup (e.g., via Bedrock or Vertex AI).
 */
export async function processClaimDocuments(
  claimCode: string,
  extractPII: (imageUrl: string) => Promise<ExtractedPII>,
  editDocumentImage: (imageSource: string, originalValue: string, newValue: string, fieldName: string) => Promise<string | null>,
  onProgress?: (status: ProcessingStatus) => void,
): Promise<ScourgeJobResult> {
  const progress = onProgress ?? (() => {});

  try {
    progress({ phase: "fetching", message: "Fetching claim documents..." });
    const documents = await fetchClaimDocuments(claimCode);

    if (documents.length === 0) {
      return { claimCode, documents: [], replacementPII: {}, status: "completed" };
    }

    progress({ phase: "querying", message: "Selecting random insured person..." });
    const replacementPII = await queryRandomInsured();

    const results: ProcessedDocument[] = [];

    for (const [index, doc] of documents.entries()) {
      progress({
        phase: "extracting",
        message: `Extracting PII from document ${index + 1}/${documents.length}`,
        currentDoc: index + 1,
        totalDocs: documents.length,
      });

      let extractedPII: ExtractedPII;
      try {
        extractedPII = await extractPII(doc.fileUrl);
      } catch (error) {
        results.push({
          original: doc, modified: null, skipped: true,
          reason: `PII extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
        continue;
      }

      const piiFields = Object.entries(extractedPII).filter(
        ([_, value]) => value != null && value.trim() !== "",
      ) as Array<[string, string]>;

      if (piiFields.length === 0) {
        results.push({ original: doc, modified: null, skipped: true, reason: "No PII found in document" });
        continue;
      }

      let currentImageSource = doc.fileUrl;
      let editSucceeded = false;

      for (const [fieldName, originalValue] of piiFields) {
        const newValue = replacementPII[fieldName as keyof ReplacementPII];
        if (!newValue) continue;

        progress({
          phase: "editing",
          message: `Editing ${fieldName} in document ${index + 1}/${documents.length}`,
          currentDoc: index + 1, totalDocs: documents.length, currentField: fieldName,
        });

        const editedImage = await editDocumentImage(currentImageSource, originalValue, newValue, fieldName);
        if (editedImage) {
          currentImageSource = editedImage;
          editSucceeded = true;
        }
      }

      results.push({
        original: doc,
        modified: editSucceeded ? currentImageSource : null,
        skipped: !editSucceeded,
        reason: editSucceeded ? undefined : "All image edit passes failed",
        replacedFields: piiFields.map(([k]) => k),
        replacementPII,
      });
    }

    progress({ phase: "completed", message: "Processing complete" });
    return { claimCode, documents: results, replacementPII, status: "completed" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    progress({ phase: "failed", message: `Processing failed: ${errorMessage}` });
    return { claimCode, documents: [], replacementPII: {}, status: "failed", error: errorMessage };
  }
}
