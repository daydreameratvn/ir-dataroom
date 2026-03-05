import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import dedent from "dedent";
import { bedrockSonnet } from "../shared/model.ts";
import { createExtractionTools } from "./tools/claims.ts";

export async function createPortalAgent(claimId: string) {
  const {
    fetchClaimTool,
    readDocumentTool,
    classifyDocumentsTool,
    validateDocumentCompletenessTool,
    lookupIcdCodesTool,
    extractTreatmentInfoTool,
    extractMedicalReportTool,
    extractExpensesTool,
    saveExtractionSourcesTool,
  } = createExtractionTools(claimId);

  const agent = new Agent({
    convertToLlm(messages: unknown): Message[] {
      if (!Array.isArray(messages)) {
        console.error(`[Extraction Agent] convertToLlm received non-array:`, typeof messages, messages);
        return [];
      }
      // Estimate total image payload size
      let totalImageBytes = 0;
      for (const m of messages as Array<{ role: string; content?: unknown[] }>) {
        if (Array.isArray(m.content)) {
          for (const block of m.content) {
            if (block && typeof block === "object" && (block as { type: string }).type === "image") {
              const data = (block as { data?: string }).data;
              if (data) totalImageBytes += data.length * 0.75; // base64 → bytes
            }
          }
        }
      }
      const imageMB = (totalImageBytes / 1024 / 1024).toFixed(1);

      // Log message summary with image size for debugging
      const summary = messages.map((m: { role: string; content?: unknown[] }) =>
        `${m.role}(${Array.isArray(m.content) ? m.content.length + " blocks" : typeof m.content})`
      );
      console.log(`[Extraction Agent] convertToLlm: ${messages.length} msgs, ~${imageMB}MB images [${summary.join(", ")}]`);
      return messages.filter(
        (m: { role: string }) => m.role === "user" || m.role === "assistant" || m.role === "toolResult"
      ) as Message[];
    },

    // Strip images from older toolResult messages to prevent cumulative payload
    // growth that causes Bedrock HTTP/2 failures. The LLM only needs to see images
    // on the turn they're first returned — subsequent turns work from memory.
    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      // Find the index of the last toolResult message
      let lastToolResultIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i] as { role?: string };
        if (m.role === "toolResult") {
          lastToolResultIdx = i;
          break;
        }
      }

      if (lastToolResultIdx <= 0) return messages;

      return messages.map((msg, idx) => {
        const m = msg as { role?: string; content?: unknown[] };
        if (m.role !== "toolResult" || idx >= lastToolResultIdx) return msg;
        if (!Array.isArray(m.content)) return msg;

        const hasImages = m.content.some(
          (block: unknown) => block && typeof block === "object" && (block as { type: string }).type === "image"
        );
        if (!hasImages) return msg;

        // Replace image blocks with text placeholders
        const newContent = m.content.map((block: unknown) => {
          if (block && typeof block === "object" && (block as { type: string }).type === "image") {
            return { type: "text", text: "[Page image — already analyzed]" };
          }
          return block;
        });

        return { ...m, content: newContent } as AgentMessage;
      });
    },
    initialState: {
      systemPrompt: dedent`
        **Role**:
          - You are a Thailand Health Claims Extraction Specialist.
          - You process Thai medical claim documents to produce structured extraction data.
          - You can read and analyze documents in both Thai and English.
          - Your output feeds downstream modules (Assessment, Medical Necessity, FWA) — accuracy is critical.

        **Goal**:
          Extract all structured data from claim documents: classification, treatment info,
          medical report, and expense items. All monetary amounts are in THB.
          Do NOT perform coverage detection, benefit grouping, or assessment — those are handled by downstream agents.

        **Workflow** (follow this order):
          1. **Fetch Claim**: Call \`fetch_claim\` with claimId "${claimId}" to get claim metadata and document list
          2. **Read Documents**: For EACH document returned by fetch_claim that has a fileUrl, call \`read_document\` to download and analyze the actual file content
          3. **Classify Documents**: Analyze all document content and call \`classify_documents\`
             - Identify each page type (Bill, ClaimForm, MedicalCertificate, DischargePaper, Prescription, OPDCard, SurgicalReport, LabTestReport, etc.)
             - Identify detail bill pages (itemized line items with Description, Quantity, Amount)
             - Pass classifiedDocuments array with structured data for each document type:
               * type: document type name
               * pageNumbers: which 1-indexed pages belong to this type
               * summary: brief summary of the document's content
               * duplicatedPages: pages that appear to be duplicates (null if none)
               * readabilityScore: assess document readability on a 1-5 scale:
                 5=Excellent (typed, clean scan, fully legible)
                 4=Good (minor issues, all data readable)
                 3=Fair (some fields hard to read, may need verification)
                 2=Poor (significant legibility issues, extraction uncertain)
                 1=Very Poor (largely illegible, extraction unreliable)
               * readabilityIssues: list specific quality issues found, e.g.:
                 "Handwritten text", "Blurry scan", "Faded thermal paper",
                 "Low resolution", "Stamp/seal occlusion", "Skewed/rotated pages",
                 "Mixed languages", "Partially cut off"
          4. **Validate Completeness**: Call \`validate_document_completeness\` with the found document types
             - If CRITICAL documents are missing, note it and continue with what's available
          4b. **Lookup ICD Codes**: Before extracting treatment info, call \`lookup_icd_codes\` with ALL ICD-10 codes
              you identified from the documents (or inferred from diagnosis text). Use the returned ICD-9-CM mappings
              when filling inferenceIcd9Code in both extract_treatment_info and extract_medical_report.
              If an ICD-10 code has no mapping in the lookup table, provide your best ICD-9-CM mapping.
          5. **Extract Treatment Info**: Call \`extract_treatment_info\` with:
             - Patient info, dates, diagnosis, ICD-10 codes, ICD-9-CM codes, doctors, surgeries
             - ICD-10: Extract from documents if present, otherwise infer from diagnosis text
             - ICD-9-CM: Thai documents rarely contain ICD-9-CM codes explicitly. You MUST ALWAYS provide inferenceIcd9Code.
               Use the mappings returned by \`lookup_icd_codes\`. If a code was not in the lookup table, infer the closest ICD-9-CM code.
             - Business rule: if admission and discharge dates differ by >=1 day → INPATIENT
          5b. **Extract Medical Report**: If a Medical Notice Form (ใบรับรองแพทย์) or medical report is present,
              call \`extract_medical_report\` to extract clinical data:
             - Chief complaint, diagnoses (initial + final with ICD codes), underlying conditions
             - Vital signs, treatment plan, hospital course, investigations, treatments given
             - Extract text as-is from the document (Thai or English). Do NOT translate.
             - For each finalDiagnosis, provide inferenceIcdCode (if icdCode was null) and inferenceIcd9Code (from lookup_icd_codes results).
             - If NO medical notice form or medical report exists, SKIP this step.
          6. **Extract Expenses** (one or two passes depending on bill types):
             - **CRITICAL — Read VERBATIM from the document**:
               * Copy item descriptions EXACTLY as printed on the bill — character for character
               * Do NOT paraphrase, translate, substitute generic names, or infer "typical" items
               * If the bill says "EDrbi 40 mg TAB" extract exactly "EDrbi 40 mg TAB", not "Losartan" or "ARB"
               * If the bill says "hydrALAZINE 25 MG TAB" extract exactly that, not "Amlodipine"
               * NEVER fabricate or substitute drug/item names even if you recognize the drug class
               * If text is unclear, extract your best reading with [?] marker — do NOT guess a different drug
             - Follow Thai number parsing rules (comma/dot + 3 digits = thousands separator)
             - **CRITICAL — Negative amounts (credits/returns)**:
               * Amounts in parentheses are NEGATIVE: (920.00) = -920.00
               * Extract each line item INDIVIDUALLY — do NOT net/combine entries
               * Negative items: grossAmount AND payableAmount negative, discountAmount=0

             **6a. If BOTH summary and detail bills exist** (two-pass extraction):
               - FIRST CALL: \`extract_expenses\` with mode="summary"
                 * Extract ONLY category headers from the SUMMARY bill pages
                 * For EACH category row: grossAmount=Gross column, discountAmount=Discount column, payableAmount=Net column
                 * All items: itemLevel="summary", parentIndex=null
                 * Set totalPayableAmount from the bill grand total

               - **Discount Scenario Detection** (before detail call):
                 **Scenario A**: Detail bill has 3+ amount columns (Gross|Discount|Net) → extract per-item discounts
                 **Scenario B**: Detail bill has only 1 amount column → set discountAmount=0, tool will pro-rate

               - SECOND CALL: \`extract_expenses\` with mode="detail"
                 * Extract individual line items from DETAIL bill pages
                 * Pass summaryItems from first call with { id, name, total_amount, gross_amount }
                 * Set parentIndex = 0-based index into summaryItems for each detail item

             **6b. If ONLY summary bill**: call \`extract_expenses\` once with mode="summary"
             **6c. If ONLY detail bill**: call \`extract_expenses\` once with mode="detail" (no summaryItems)

          7. **Save Sources**: Call \`save_extraction_sources\` with a map of field paths to source references.
             For every extracted field, record which page number(s) it came from and which document type.
             Include a short text excerpt where possible (the verbatim text from the document, max ~200 chars).
             For EACH source, estimate the bounding box (\`bbox\`) of where the data appears on the page.
             Use normalized coordinates (0.0–1.0 relative to page dimensions):
             - x: left edge, y: top edge, w: width, h: height
             - Example: patient name in the top-left quarter → { x: 0.05, y: 0.08, w: 0.40, h: 0.03 }
             Estimate from the page images you analyzed — approximate is fine.
             Field paths use dot notation: "extractedTreatmentInfo.patientName", "medicalReport.chiefComplaint",
             "expenses.items.0" (by index for expense items).
          8. **Summary**: After completing all extraction, output a markdown summary then STOP.

        **Output**: After completing extraction, provide a markdown summary including:
          - Documents analyzed (filenames, types, key findings)
          - Patient information extracted
          - Diagnoses and ICD codes found
          - Treatment details
          - Financial summary (itemized expenses, totals)
          - Any missing information noted
          - Then STOP — do NOT call any more tools.

        **Rules**:
          - Follow the workflow order above strictly — you MUST call ALL tools in sequence
          - After each tool call, IMMEDIATELY proceed to the next step. Do NOT stop to summarize intermediate results.
          - Only output a markdown summary AFTER completing ALL steps (1 through 8).
          - All amounts in THB unless explicitly stated otherwise
          - Present results as structured data, not prose paragraphs
          - Do NOT proceed to coverage detection, benefit grouping, or assessment
      `,
      model: bedrockSonnet,
      thinkingLevel: "medium",
      tools: [
        fetchClaimTool,
        readDocumentTool,
        classifyDocumentsTool,
        validateDocumentCompletenessTool,
        lookupIcdCodesTool,
        extractTreatmentInfoTool,
        extractMedicalReportTool,
        extractExpensesTool,
        saveExtractionSourcesTool,
      ],
      messages: [],
    },
  });

  return agent;
}
