import { Hono } from "hono";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { requireAuth, getTenantId } from "../middleware.ts";
import { gqlQuery } from "../services/gql.ts";

// ---------------------------------------------------------------------------
// Lazy S3 Client
// ---------------------------------------------------------------------------

let _s3: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-southeast-1" });
  }
  return _s3;
}

const PORTAL_S3_BUCKET = process.env.PORTAL_S3_BUCKET ?? "banyan-portal-documents";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const portal = new Hono();

// All portal routes require authentication
portal.use("/portal/*", requireAuth);

// ── GET /portal/stats ─────────────────────────────────────────────────────

portal.get("/portal/stats", async (c) => {
  try {
    const data = await gqlQuery<{
      totalClaims: { _count: number };
      processing: { _count: number };
      awaitingApproval: { _count: number };
      approved: { _count: number };
      recentClaims: Array<{
        id: string;
        claimNumber: string;
        status: string;
        claimantName: string | null;
        amountClaimed: number | null;
        currency: string | null;
        createdAt: string;
      }>;
    }>(`
      query PortalDashboardStats {
        totalClaims: claimsAggregate(filter_input: { where: {} }) { _count }
        processing: claimsAggregate(filter_input: { where: { status: { _in: ["ai_processing", "submitted"] } } }) { _count }
        awaitingApproval: claimsAggregate(filter_input: { where: { status: { _in: ["under_review", "awaiting_approval"] } } }) { _count }
        approved: claimsAggregate(filter_input: { where: { status: { _in: ["approved", "partially_approved"] } } }) { _count }
        recentClaims: claims(limit: 10, order_by: { createdAt: Desc }) {
          id
          claimNumber
          status
          claimantName
          amountClaimed
          currency
          createdAt
        }
      }
    `);

    return c.json({
      totalClaims: data.totalClaims._count,
      processing: data.processing._count,
      awaitingApproval: data.awaitingApproval._count,
      approved: data.approved._count,
      recentClaims: data.recentClaims.map((c) => ({
        ...c,
        insuredName: c.claimantName,
        totalRequestedAmount: c.amountClaimed,
        type: null,
      })),
    });
  } catch (err) {
    console.error("[Portal API] Error fetching stats:", err);
    return c.json({ error: "Failed to fetch dashboard stats" }, 500);
  }
});

// ── GET /portal/claims ────────────────────────────────────────────────────

portal.get("/portal/claims", async (c) => {
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = parseInt(c.req.query("limit") || "30", 10);
  const status = c.req.query("status");
  const search = c.req.query("search");
  const offset = (page - 1) * limit;

  // Build where clause using proper GraphQL variables to prevent injection
  const hasStatus = !!status;
  const hasSearch = !!search;

  // Determine which query variant to use based on filters
  let queryStr: string;
  const variables: Record<string, unknown> = { limit, offset };

  const claimFields = `id claimNumber status claimantName amountClaimed currency createdAt aiSummary`;

  if (hasStatus && hasSearch) {
    variables.status = status;
    variables.search = `%${search}%`;
    queryStr = `
      query PortalClaimsList($limit: Int!, $offset: Int!, $status: String!, $search: String!) {
        claims(limit: $limit, offset: $offset, order_by: { createdAt: Desc }, where: { status: { _eq: $status }, claimNumber: { _ilike: $search } }) {
          ${claimFields}
        }
        total: claimsAggregate(filter_input: { where: { status: { _eq: $status }, claimNumber: { _ilike: $search } } }) { _count }
      }
    `;
  } else if (hasStatus) {
    variables.status = status;
    queryStr = `
      query PortalClaimsList($limit: Int!, $offset: Int!, $status: String!) {
        claims(limit: $limit, offset: $offset, order_by: { createdAt: Desc }, where: { status: { _eq: $status } }) {
          ${claimFields}
        }
        total: claimsAggregate(filter_input: { where: { status: { _eq: $status } } }) { _count }
      }
    `;
  } else if (hasSearch) {
    variables.search = `%${search}%`;
    queryStr = `
      query PortalClaimsList($limit: Int!, $offset: Int!, $search: String!) {
        claims(limit: $limit, offset: $offset, order_by: { createdAt: Desc }, where: { claimNumber: { _ilike: $search } }) {
          ${claimFields}
        }
        total: claimsAggregate(filter_input: { where: { claimNumber: { _ilike: $search } } }) { _count }
      }
    `;
  } else {
    queryStr = `
      query PortalClaimsList($limit: Int!, $offset: Int!) {
        claims(limit: $limit, offset: $offset, order_by: { createdAt: Desc }) {
          ${claimFields}
        }
        total: claimsAggregate(filter_input: { where: {} }) { _count }
      }
    `;
  }

  try {
    const data = await gqlQuery<{
      claims: Array<{
        id: string;
        claimNumber: string;
        status: string;
        claimantName: string | null;
        amountClaimed: number | null;
        currency: string | null;
        createdAt: string;
        aiSummary: string | null;
      }>;
      total: { _count: number };
    }>(queryStr, variables);

    return c.json({
      data: data.claims.map((c) => {
        let fwaRisk: { riskScore: number; riskLevel: string } | null = null;
        let type: string | null = null;
        let totalRequestedAmount: number | null = c.amountClaimed;
        if (c.aiSummary) {
          try {
            const parsed = JSON.parse(c.aiSummary);
            // FWA risk
            const fwa = parsed.fwa;
            if (fwa?.riskScore != null && fwa?.riskLevel) fwaRisk = { riskScore: fwa.riskScore, riskLevel: fwa.riskLevel };
            // Treatment type from extraction
            const treatmentInfo = parsed.extraction?.extractedTreatmentInfo ?? parsed.extractedTreatmentInfo;
            if (treatmentInfo?.treatmentType) type = treatmentInfo.treatmentType;
            // Amount: prefer assessment totalRequested, fallback to extraction totalPayableAmount
            const assessmentTotal = parsed.assessment?.coverageAnalysis?.totalRequested;
            const extractionTotal = treatmentInfo?.totalPayableAmount;
            if (assessmentTotal != null && assessmentTotal > 0) totalRequestedAmount = assessmentTotal;
            else if (extractionTotal != null && extractionTotal > 0) totalRequestedAmount = extractionTotal;
          } catch { /* ignore parse errors */ }
        }
        return { ...c, insuredName: c.claimantName, totalRequestedAmount, type, fwaRisk };
      }),
      total: data.total._count,
      page,
      pageSize: limit,
    });
  } catch (err) {
    console.error("[Portal API] Error listing claims:", err);
    return c.json({ error: "Failed to list claims" }, 500);
  }
});

// ── GET /portal/claims/:id ────────────────────────────────────────────────

portal.get("/portal/claims/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const data = await gqlQuery<{
      claimsById: {
        id: string;
        claimNumber: string;
        status: string;
        claimantName: string | null;
        currency: string | null;
        amountClaimed: number | null;
        amountApproved: number | null;
        amountPaid: number | null;
        providerName: string | null;
        dateOfService: string | null;
        denialReason: string | null;
        aiSummary: string | null;
        aiRecommendation: string | null;
        aiScore: number | null;
        documents: Array<{
          id: string;
          documentType: string | null;
          fileName: string | null;
          fileUrl: string | null;
        }>;
        processes: Array<{
          id: string;
          status: string;
          agentType: string | null;
          startedAt: string | null;
          completedAt: string | null;
        }>;
        createdAt: string;
        updatedAt: string;
        createdBy: string | null;
      } | null;
    }>(`
      query PortalClaimDetail($id: Uuid!) {
        claimsById(id: $id) {
          id
          claimNumber
          status
          claimantName
          currency
          amountClaimed
          amountApproved
          amountPaid
          providerName
          dateOfService
          denialReason
          aiSummary
          aiRecommendation
          aiScore
          documents: claimDocuments {
            id
            documentType
            fileName
            fileUrl
          }
          processes: agentSessions(order_by: { createdAt: Asc }) {
            id
            status
            agentType
            startedAt
            completedAt
          }
          createdAt
          updatedAt
          createdBy
        }
      }
    `, { id });

    if (!data.claimsById) {
      return c.json({ error: "Claim not found" }, 404);
    }

    const claim = data.claimsById;

    // Parse aiSummary for type, amounts, and diagnosis info
    let claimType: string | null = null;
    let totalRequestedAmount: number | null = claim.amountClaimed;
    let diagnosis: string | null = null;
    let icdCode: string | null = null;
    let admissionDate: string | null = null;
    let dischargeDate: string | null = null;
    if (claim.aiSummary) {
      try {
        const parsed = JSON.parse(claim.aiSummary);
        const treatmentInfo = parsed.extraction?.extractedTreatmentInfo ?? parsed.extractedTreatmentInfo;
        if (treatmentInfo?.treatmentType) claimType = treatmentInfo.treatmentType;
        if (treatmentInfo?.diagnosis) diagnosis = treatmentInfo.diagnosis;
        if (treatmentInfo?.icdCode) icdCode = treatmentInfo.icdCode;
        if (treatmentInfo?.admissionDate) admissionDate = treatmentInfo.admissionDate;
        if (treatmentInfo?.dischargeDate) dischargeDate = treatmentInfo.dischargeDate;
        // Amount: prefer assessment totalRequested, fallback to extraction totalPayableAmount
        const assessmentTotal = parsed.assessment?.coverageAnalysis?.totalRequested;
        const extractionTotal = treatmentInfo?.totalPayableAmount;
        if (assessmentTotal != null && assessmentTotal > 0) totalRequestedAmount = assessmentTotal;
        else if (extractionTotal != null && extractionTotal > 0) totalRequestedAmount = extractionTotal;
      } catch { /* ignore parse errors */ }
    }

    return c.json({
      id: claim.id,
      claimNumber: claim.claimNumber,
      status: claim.status,
      claimantName: claim.claimantName,
      currency: claim.currency,
      amountClaimed: claim.amountClaimed,
      amountApproved: claim.amountApproved,
      amountPaid: claim.amountPaid,
      providerName: claim.providerName,
      dateOfService: claim.dateOfService,
      denialReason: claim.denialReason,
      aiSummary: claim.aiSummary,
      aiRecommendation: claim.aiRecommendation,
      aiScore: claim.aiScore,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      createdBy: claim.createdBy,
      documents: claim.documents.map((d) => ({
        id: d.id,
        type: d.documentType ?? "UPLOADED",
        pageCount: null,
        file: d.fileUrl ? { name: d.fileName ?? "document", url: d.fileUrl } : null,
      })),
      processes: claim.processes.map((p) => ({
        id: p.id,
        status: p.status,
        startedAt: p.startedAt,
        endedAt: p.completedAt,
      })),
      insuredName: claim.claimantName,
      totalRequestedAmount,
      totalCoveredAmount: claim.amountApproved,
      totalPaidAmount: claim.amountPaid,
      type: claimType,
      diagnosis,
      icdCode,
      isDirectBilling: false,
      admissionDate,
      dischargeDate,
      hasSurgery: false,
      totalUncoveredAmount: null,
      totalShortfallAmount: null,
      insuredPerson: null,
      certificateCode: null,
      policyNumber: null,
      corporateName: null,
      extractedData: null,
    });
  } catch (err) {
    console.error("[Portal API] Error fetching claim:", err);
    return c.json({ error: "Failed to fetch claim" }, 500);
  }
});

// ── POST /portal/claims ──────────────────────────────────────────────────

portal.post("/portal/claims", async (c) => {
  const user = c.get("user");

  try {
    const contentType = c.req.header("content-type") ?? "";

    let claimCode: string | undefined;
    const files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      claimCode = formData.get("claimCode")?.toString();
      for (const [key, value] of formData.entries()) {
        if (key === "files" && (value as unknown) instanceof File) {
          files.push(value as unknown as File);
        }
      }
    } else {
      const body = await c.req.json<{ claimCode?: string }>();
      claimCode = body.claimCode;
    }

    if (!claimCode && files.length === 0) {
      return c.json({ error: "Provide a claim code or upload documents" }, 400);
    }

    // Insert claim record
    const tenantId = getTenantId(c);
    const insertData = await gqlQuery<{
      insertClaims: { returning: Array<{ id: string; claimNumber: string }> };
    }>(`
      mutation InsertPortalClaim($object: InsertClaimsObjectInput!) {
        insertClaims(objects: [$object]) {
          returning { id claimNumber }
        }
      }
    `, {
      object: {
        claimNumber: claimCode || `PORTAL-${Date.now()}`,
        claimantName: "Portal Submission",
        tenantId,
        status: "submitted",
        createdBy: user.sub,
      },
    });

    const newClaim = insertData.insertClaims.returning[0]!;

    // Upload files to S3 and create claim_documents records
    if (files.length > 0) {
      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const body = new Uint8Array(arrayBuffer);

          const s3 = getS3Client();
          const key = `portal/${tenantId}/${newClaim.id}/${file.name}`;
          const upload = new Upload({
            client: s3,
            params: {
              Bucket: PORTAL_S3_BUCKET,
              Key: key,
              Body: body,
              ContentType: file.type || "application/octet-stream",
            },
          });
          await upload.done();
          const fileUrl = `https://${PORTAL_S3_BUCKET}.s3.${process.env.AWS_REGION ?? "ap-southeast-1"}.amazonaws.com/${key}`;

          await gqlQuery(`
            mutation InsertClaimDocument($object: InsertClaimDocumentsObjectInput!) {
              insertClaimDocuments(objects: [$object]) {
                returning { id }
              }
            }
          `, {
            object: {
              claimId: newClaim.id,
              tenantId,
              documentType: "UPLOADED",
              fileName: file.name,
              fileUrl,
              fileType: file.type || "application/octet-stream",
              fileSizeBytes: file.size,
              createdBy: user.sub,
            },
          });
        } catch (fileErr) {
          console.error(`[Portal API] Failed to upload/record ${file.name}:`, (fileErr as Error).message);
        }
      }
    }

    // Fire-and-forget pipeline (extraction -> assessment + medical-necessity -> FWA)
    const pipelineSessionId = `pipeline-${newClaim.id}-${Date.now()}`;
    runPortalPipeline(newClaim.id, pipelineSessionId).catch((err) => {
      console.error(`[Portal API] Pipeline error for claim ${newClaim.id}:`, err);
    });

    return c.json({ id: newClaim.id, claimNumber: newClaim.claimNumber }, 201);
  } catch (err) {
    console.error("[Portal API] Error creating claim:", err);
    return c.json({ error: "Failed to create claim" }, 500);
  }
});

// ── POST /portal/claims/:id/reprocess ─────────────────────────────────────

portal.post("/portal/claims/:id/reprocess", async (c) => {
  const id = c.req.param("id");

  try {
    // Status guard — reject if already processing
    const check = await gqlQuery<{ claimsById: { status: string } | null }>(
      `query CheckClaimStatus($id: Uuid!) { claimsById(id: $id) { status } }`,
      { id },
    );
    if (!check.claimsById) return c.json({ error: "Claim not found" }, 404);
    if (check.claimsById.status === "ai_processing") {
      return c.json({ error: "Claim is already being processed" }, 409);
    }

    await gqlQuery(`
      mutation ReprocessPortalClaim($id: Uuid!) {
        updateClaimsById(keyId: $id, updateColumns: { status: { set: "ai_processing" } }) {
          affectedRows
        }
      }
    `, { id });

    // Fire-and-forget pipeline re-run
    const reprocessSessionId = `pipeline-${id}-${Date.now()}`;
    runPortalPipeline(id, reprocessSessionId).catch((err) => {
      console.error(`[Portal API] Reprocess pipeline error for claim ${id}:`, err);
    });

    return c.json({ success: true });
  } catch (err) {
    console.error("[Portal API] Error reprocessing claim:", err);
    return c.json({ error: "Failed to reprocess claim" }, 500);
  }
});

// ── POST /portal/claims/:id/reprocess-fwa ────────────────────────────────
// Debug endpoint: re-runs only image-forensics + FWA agents (skips extraction/assessment)

portal.post("/portal/claims/:id/reprocess-fwa", async (c) => {
  const id = c.req.param("id");

  try {
    const check = await gqlQuery<{ claimsById: { status: string } | null }>(
      `query CheckClaimStatus($id: Uuid!) { claimsById(id: $id) { status } }`,
      { id },
    );
    if (!check.claimsById) return c.json({ error: "Claim not found" }, 404);

    // Fire-and-forget: run image-forensics + FWA only
    (async () => {
      try {
        // Image forensics (parallel-safe, non-fatal)
        await updatePipelineStatus(id, "imageForensics", "running");
        try {
          await runPortalAgent("image-forensics", id);
          await updatePipelineStatus(id, "imageForensics", "completed");
        } catch (err) {
          console.warn(`[Portal API] Image forensics reprocess failed for ${id}:`, err);
          await updatePipelineStatus(id, "imageForensics", "error",
            err instanceof Error ? err.message : String(err));
        }

        // FWA
        await updatePipelineStatus(id, "fwa", "running");
        await runPortalAgent("fwa", id);
        await updatePipelineStatus(id, "fwa", "completed");

        // Auto-route
        try { await autoRouteFWAResults(id); }
        catch (err) { console.warn(`[Portal API] Auto-route failed (non-fatal):`, err); }
      } catch (err) {
        console.error(`[Portal API] Reprocess-FWA pipeline failed for claim ${id}:`, err);
        await updatePipelineStatus(id, "fwa", "error",
          err instanceof Error ? err.message : String(err));
      }
    })();

    return c.json({ success: true });
  } catch (err) {
    console.error("[Portal API] Error reprocessing FWA:", err);
    return c.json({ error: "Failed to reprocess FWA" }, 500);
  }
});

// ── POST /portal/claims/:id/approve ───────────────────────────────────────

portal.post("/portal/claims/:id/approve", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<{ notes?: string }>().catch(() => ({}));

  try {
    const check = await gqlQuery<{ claimsById: { status: string } | null }>(
      `query CheckClaimStatus($id: Uuid!) { claimsById(id: $id) { status } }`,
      { id },
    );
    if (!check.claimsById) return c.json({ error: "Claim not found" }, 404);
    if (check.claimsById.status !== "under_review") {
      return c.json({ error: `Cannot approve claim in status '${check.claimsById.status}'` }, 409);
    }

    await gqlQuery(`
      mutation ApprovePortalClaim($id: Uuid!, $updatedBy: Uuid!) {
        updateClaimsById(keyId: $id, updateColumns: {
          status: { set: "approved" },
          updatedBy: { set: $updatedBy }
        }) { affectedRows }
      }
    `, { id, updatedBy: user.sub });

    // Persist approval to pipeline status
    await updatePipelineStatus(id, "approval", "completed", undefined, (body as { notes?: string }).notes);

    return c.json({ success: true });
  } catch (err) {
    console.error("[Portal API] Error approving claim:", err);
    return c.json({ error: "Failed to approve claim" }, 500);
  }
});

// ── POST /portal/claims/:id/reject ────────────────────────────────────────

portal.post("/portal/claims/:id/reject", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<{ reason: string }>();

  if (!body.reason) return c.json({ error: "Rejection reason is required" }, 400);

  try {
    const check = await gqlQuery<{ claimsById: { status: string } | null }>(
      `query CheckClaimStatus($id: Uuid!) { claimsById(id: $id) { status } }`,
      { id },
    );
    if (!check.claimsById) return c.json({ error: "Claim not found" }, 404);
    if (check.claimsById.status !== "under_review") {
      return c.json({ error: `Cannot reject claim in status '${check.claimsById.status}'` }, 409);
    }

    await gqlQuery(`
      mutation RejectPortalClaim($id: Uuid!, $reason: String!, $updatedBy: Uuid!) {
        updateClaimsById(keyId: $id, updateColumns: {
          status: { set: "denied" },
          denialReason: { set: $reason },
          updatedBy: { set: $updatedBy }
        }) { affectedRows }
      }
    `, { id, reason: body.reason, updatedBy: user.sub });

    await updatePipelineStatus(id, "approval", "rejected", body.reason);

    return c.json({ success: true });
  } catch (err) {
    console.error("[Portal API] Error rejecting claim:", err);
    return c.json({ error: "Failed to reject claim" }, 500);
  }
});

// ── POST /portal/claims/:id/expenses ──────────────────────────────────────

portal.post("/portal/claims/:id/expenses", async (c) => {
  const id = c.req.param("id");

  try {
    const body = await c.req.json<{ items: Array<Record<string, unknown>> }>();
    if (!body.items || !Array.isArray(body.items)) {
      return c.json({ error: "items array is required" }, 400);
    }

    const merge = await getMergeExtractedData();

    // Recalculate coverage totals from the edited items
    let totalCovered = 0;
    let totalUncovered = 0;
    let coveredItemCount = 0;
    let uncoveredItemCount = 0;
    let totalRequested = 0;

    for (const item of body.items) {
      const amount = (item.payable_amount as number | undefined) ?? (item.total_amount as number) ?? 0;
      totalRequested += (item.total_amount as number) ?? 0;
      if (item.is_covered) {
        totalCovered += amount;
        coveredItemCount++;
      } else {
        totalUncovered += amount;
        uncoveredItemCount++;
      }
    }

    // Merge updated expenses into the assessment namespace
    await merge(id, {
      expenses: { items: body.items },
      coverageAnalysis: {
        totalRequested,
        totalCovered,
        totalUncovered,
        coveredItemCount,
        uncoveredItemCount,
      },
    }, "assessment");

    return c.json({ success: true });
  } catch (err) {
    console.error("[Portal API] Error saving expenses:", err);
    return c.json({ error: "Failed to save expenses" }, 500);
  }
});

// ── POST /portal/claims/:id/benefit-grouping ─────────────────────────────

portal.post("/portal/claims/:id/benefit-grouping", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json<{ benefitGroups: Array<Record<string, unknown>> }>();
    if (!body.benefitGroups || !Array.isArray(body.benefitGroups)) {
      return c.json({ error: "benefitGroups array is required" }, 400);
    }
    const merge = await getMergeExtractedData();
    await merge(id, { benefitGrouping: { benefitGroups: body.benefitGroups } }, "assessment");
    return c.json({ success: true });
  } catch (err) {
    console.error("[Portal API] Error saving benefit grouping:", err);
    return c.json({ error: "Failed to save benefit grouping" }, 500);
  }
});

// ── GET /portal/documents/:id ─────────────────────────────────────────────

portal.get("/portal/documents/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const data = await gqlQuery<{
      claimDocumentsById: { fileUrl: string; fileName: string; fileType: string | null } | null;
    }>(`
      query PortalDocument($id: Uuid!) {
        claimDocumentsById(id: $id) {
          fileUrl
          fileName
          fileType
        }
      }
    `, { id });

    const doc = data.claimDocumentsById;
    if (!doc?.fileUrl) {
      return c.json({ error: "Document not found" }, 404);
    }

    const mimeType = doc.fileType ?? "application/octet-stream";
    const fileName = doc.fileName ?? "document";

    // S3 file — proxy using AWS SDK (bucket is private, raw fetch won't work)
    const s3Url = new URL(doc.fileUrl);
    const s3Key = decodeURIComponent(s3Url.pathname.slice(1)); // Remove leading /

    const command = new GetObjectCommand({
      Bucket: PORTAL_S3_BUCKET,
      Key: s3Key,
    });

    const s3Response = await getS3Client().send(command);
    if (!s3Response.Body) {
      return c.json({ error: "Failed to fetch document file" }, 502);
    }

    const s3Mime = s3Response.ContentType ?? mimeType;
    const bodyStream = s3Response.Body.transformToWebStream();

    return new Response(bodyStream, {
      headers: {
        "Content-Type": s3Mime,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[Portal API] Error fetching document:", err);
    return c.json({ error: "Failed to fetch document" }, 500);
  }
});

// ── GET /portal/analytics ─────────────────────────────────────────────────

portal.get("/portal/analytics", async (c) => {
  try {
    // Outcome distribution — claims grouped by status
    const statusData = await gqlQuery<{
      approved: { _count: number };
      denied: { _count: number };
      processing: { _count: number };
      submitted: { _count: number };
      error: { _count: number };
      waitingForApproval: { _count: number };
    }>(`
      query PortalAnalyticsOutcome {
        approved: claimsAggregate(filter_input: { where: { status: { _eq: "APPROVED" } } }) { _count }
        denied: claimsAggregate(filter_input: { where: { status: { _eq: "DENIED" } } }) { _count }
        processing: claimsAggregate(filter_input: { where: { status: { _in: ["PROCESSING", "SUBMITTED"] } } }) { _count }
        submitted: claimsAggregate(filter_input: { where: { status: { _eq: "SUBMITTED" } } }) { _count }
        error: claimsAggregate(filter_input: { where: { status: { _eq: "ERROR" } } }) { _count }
        waitingForApproval: claimsAggregate(filter_input: { where: { status: { _eq: "WAITING_FOR_APPROVAL" } } }) { _count }
      }
    `);

    const outcomeDistribution = [
      { status: "APPROVED", count: statusData.approved._count },
      { status: "DENIED", count: statusData.denied._count },
      { status: "PROCESSING", count: statusData.processing._count },
      { status: "WAITING_FOR_APPROVAL", count: statusData.waitingForApproval._count },
      { status: "ERROR", count: statusData.error._count },
    ].filter((d) => d.count > 0);

    // Claims over time — recent claims with dates for grouping on frontend
    const recentClaimsData = await gqlQuery<{
      claims: Array<{ createdAt: string; status: string }>;
    }>(`
      query PortalAnalyticsOverTime {
        claims(limit: 1000, orderBy: { createdAt: Asc }) {
          createdAt
          status
        }
      }
    `);

    // Group by month
    const monthBuckets = new Map<string, number>();
    for (const claim of recentClaimsData.claims) {
      const month = claim.createdAt.substring(0, 7); // YYYY-MM
      monthBuckets.set(month, (monthBuckets.get(month) ?? 0) + 1);
    }
    const claimsOverTime = Array.from(monthBuckets.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Top diagnoses
    const diagnosisData = await gqlQuery<{
      claims: Array<{ diagnosis: string | null; icdCode: string | null }>;
    }>(`
      query PortalAnalyticsDiagnoses {
        claims(where: { diagnosis: { _is_null: false } }, limit: 1000) {
          diagnosis
          icdCode
        }
      }
    `);

    const diagnosisCounts = new Map<string, { count: number; icdCode: string | null }>();
    for (const claim of diagnosisData.claims) {
      if (!claim.diagnosis) continue;
      const existing = diagnosisCounts.get(claim.diagnosis);
      if (existing) {
        existing.count++;
      } else {
        diagnosisCounts.set(claim.diagnosis, { count: 1, icdCode: claim.icdCode });
      }
    }
    const topDiagnoses = Array.from(diagnosisCounts.entries())
      .map(([diagnosis, { count, icdCode }]) => ({ diagnosis, icdCode, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return c.json({
      claimsOverTime,
      outcomeDistribution,
      topDiagnoses,
      processingTimes: [], // Requires agent_sessions duration data — computed on demand
    });
  } catch (err) {
    console.error("[Portal API] Error fetching analytics:", err);
    return c.json({ error: "Failed to fetch analytics" }, 500);
  }
});

// ── GET /portal/fwa-analytics ─────────────────────────────────────────────

// Demo mock data for FWA Analytics — used until real data is populated in DB
function buildFWAMockData(groupBy: string) {
  const summary = {
    totalAnalyzed: 2847,
    avgRiskScore: 42.3,
    detectionRate: 18.7,
    highCriticalCount: 534,
    totalClaimsValue: 87_450_000,
    totalValueSaved: 12_680_000,
    totalFraudDeclined: 8_350_000,
    totalWADenied: 4_330_000,
    casesIdentified: 534,
    casesConfirmed: 312,
  };

  const riskDistribution = [
    { riskLevel: "LOW", count: 1423 },
    { riskLevel: "MEDIUM", count: 890 },
    { riskLevel: "HIGH", count: 387 },
    { riskLevel: "CRITICAL", count: 147 },
  ];

  const flagsByCategory = [
    { category: "Billing Irregularities", count: 245 },
    { category: "Service Patterns", count: 189 },
    { category: "Identity & Eligibility", count: 134 },
    { category: "Clinical Inconsistencies", count: 112 },
    { category: "Provider Behavior", count: 98 },
    { category: "Documentation Issues", count: 76 },
    { category: "Timing Anomalies", count: 53 },
  ];

  const recommendations = [
    { recommendation: "CLEAR", count: 1845 },
    { recommendation: "REVIEW", count: 668 },
    { recommendation: "INVESTIGATE", count: 334 },
  ];

  // Generate time series based on groupBy
  const periods = groupBy === "day" ? 30 : groupBy === "week" ? 12 : 6;
  const now = new Date();
  const riskTrends: Array<{ date: string; low: number; medium: number; high: number; critical: number }> = [];
  const financialTrends: Array<{ date: string; totalValue: number; flaggedValue: number; savedValue: number }> = [];

  for (let i = periods - 1; i >= 0; i--) {
    const d = new Date(now);
    if (groupBy === "day") d.setDate(d.getDate() - i);
    else if (groupBy === "week") d.setDate(d.getDate() - i * 7);
    else d.setMonth(d.getMonth() - i);

    const label = groupBy === "month"
      ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : d.toISOString().slice(0, 10);

    const base = 30 + Math.floor(Math.random() * 20);
    riskTrends.push({
      date: label,
      low: base + Math.floor(Math.random() * 15),
      medium: Math.floor(base * 0.6) + Math.floor(Math.random() * 10),
      high: Math.floor(base * 0.3) + Math.floor(Math.random() * 8),
      critical: Math.floor(base * 0.1) + Math.floor(Math.random() * 5),
    });

    const totalVal = 12_000_000 + Math.floor(Math.random() * 6_000_000);
    financialTrends.push({
      date: label,
      totalValue: totalVal,
      flaggedValue: Math.floor(totalVal * (0.15 + Math.random() * 0.1)),
      savedValue: Math.floor(totalVal * (0.05 + Math.random() * 0.08)),
    });
  }

  const fwaClassification = [
    { type: "FRAUD" as const, identified: 178, confirmed: 112, totalValue: 24_500_000, deniedValue: 8_350_000 },
    { type: "WASTE" as const, identified: 234, confirmed: 134, totalValue: 18_200_000, deniedValue: 2_870_000 },
    { type: "ABUSE" as const, identified: 122, confirmed: 66, totalValue: 12_800_000, deniedValue: 1_460_000 },
  ];

  const flagTemplates = [
    { category: "Billing Irregularities", title: "Duplicate charge detected", severity: "HIGH" as const },
    { category: "Billing Irregularities", title: "Upcoded procedure", severity: "HIGH" as const },
    { category: "Service Patterns", title: "Unusual frequency of visits", severity: "MEDIUM" as const },
    { category: "Identity & Eligibility", title: "Coverage gap detected", severity: "MEDIUM" as const },
    { category: "Clinical Inconsistencies", title: "Diagnosis/procedure mismatch", severity: "HIGH" as const },
    { category: "Provider Behavior", title: "Excessive referral pattern", severity: "MEDIUM" as const },
    { category: "Documentation Issues", title: "Missing supporting documents", severity: "LOW" as const },
    { category: "Timing Anomalies", title: "Claim filed before service date", severity: "HIGH" as const },
    { category: "Service Patterns", title: "Weekend/holiday service cluster", severity: "LOW" as const },
    { category: "Provider Behavior", title: "Abnormal billing ratio", severity: "MEDIUM" as const },
  ];

  const thaiNames = [
    "Somchai Prasert", "Nattaya Suwannarat", "Pichaya Kongphan", "Kittisak Wongcharoen",
    "Supaporn Thongkam", "Arthit Saetang", "Ploy Chaiyasit", "Tanawat Ruangrit",
    "Naruemon Petcharat", "Wichai Bunnak", "Siriporn Kaewmanee", "Chatree Phongsri",
    "Duangjai Srisombat", "Preecha Thammarat", "Kanokwan Intaramat",
  ];

  const classifications: Array<"FRAUD" | "WASTE" | "ABUSE"> = ["FRAUD", "WASTE", "ABUSE"];
  const resolutions: Array<"IDENTIFIED" | "CONFIRMED" | "CLEARED"> = ["IDENTIFIED", "CONFIRMED", "CLEARED"];
  const riskLevels = ["HIGH", "CRITICAL", "HIGH", "MEDIUM", "CRITICAL", "HIGH", "MEDIUM", "HIGH", "CRITICAL", "HIGH"];
  const recOptions = ["INVESTIGATE", "INVESTIGATE", "REVIEW", "INVESTIGATE", "INVESTIGATE", "REVIEW", "INVESTIGATE", "INVESTIGATE", "REVIEW", "INVESTIGATE"];

  const topFlaggedClaims = Array.from({ length: 15 }, (_, i) => {
    const numFlags = 2 + Math.floor(Math.random() * 4);
    const flags = Array.from({ length: numFlags }, () => flagTemplates[Math.floor(Math.random() * flagTemplates.length)]!);
    const requested = 50_000 + Math.floor(Math.random() * 500_000);
    return {
      id: `mock-claim-${i + 1}`,
      claimCode: `CLM-${String(24000 + i).padStart(6, "0")}`,
      insuredName: thaiNames[i % thaiNames.length]!,
      riskScore: 55 + Math.floor(Math.random() * 45),
      riskLevel: riskLevels[i % riskLevels.length]!,
      recommendation: recOptions[i % recOptions.length]!,
      flagCount: numFlags,
      flags,
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)).toISOString(),
      requestedAmount: requested,
      coveredAmount: Math.floor(requested * (0.4 + Math.random() * 0.4)),
      fwaClassification: classifications[i % 3]!,
      resolutionStatus: resolutions[Math.min(i % 4, 2)]!,
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  const hotspots = {
    byProvince: [
      { name: "Bangkok", nameTh: "กรุงเทพมหานคร", totalClaims: 892, flaggedClaims: 178, flaggedAmount: 15_400_000, detectionRate: 19.9, avgRiskScore: 48.2 },
      { name: "Chon Buri", nameTh: "ชลบุรี", totalClaims: 423, flaggedClaims: 89, flaggedAmount: 7_200_000, detectionRate: 21.0, avgRiskScore: 45.6 },
      { name: "Chiang Mai", nameTh: "เชียงใหม่", totalClaims: 356, flaggedClaims: 67, flaggedAmount: 5_100_000, detectionRate: 18.8, avgRiskScore: 41.3 },
      { name: "Nonthaburi", nameTh: "นนทบุรี", totalClaims: 312, flaggedClaims: 62, flaggedAmount: 4_800_000, detectionRate: 19.8, avgRiskScore: 43.7 },
      { name: "Phuket", nameTh: "ภูเก็ต", totalClaims: 245, flaggedClaims: 78, flaggedAmount: 8_900_000, detectionRate: 31.8, avgRiskScore: 52.1 },
      { name: "Nakhon Ratchasima", nameTh: "นครราชสีมา", totalClaims: 198, flaggedClaims: 34, flaggedAmount: 2_600_000, detectionRate: 17.1, avgRiskScore: 38.9 },
      { name: "Khon Kaen", nameTh: "ขอนแก่น", totalClaims: 167, flaggedClaims: 29, flaggedAmount: 2_100_000, detectionRate: 17.3, avgRiskScore: 37.4 },
      { name: "Surat Thani", nameTh: "สุราษฎร์ธานี", totalClaims: 134, flaggedClaims: 41, flaggedAmount: 3_800_000, detectionRate: 30.5, avgRiskScore: 50.8 },
      { name: "Udon Thani", nameTh: "อุดรธานี", totalClaims: 112, flaggedClaims: 18, flaggedAmount: 1_200_000, detectionRate: 16.0, avgRiskScore: 35.2 },
      { name: "Songkhla", nameTh: "สงขลา", totalClaims: 98, flaggedClaims: 22, flaggedAmount: 1_800_000, detectionRate: 22.4, avgRiskScore: 44.1 },
      { name: "Rayong", nameTh: "ระยอง", totalClaims: 87, flaggedClaims: 19, flaggedAmount: 1_500_000, detectionRate: 21.8, avgRiskScore: 42.6 },
      { name: "Chiang Rai", nameTh: "เชียงราย", totalClaims: 76, flaggedClaims: 12, flaggedAmount: 890_000, detectionRate: 15.7, avgRiskScore: 36.8 },
    ],
    byCity: [
      { name: "Bangkok Watthana", province: "Bangkok", totalClaims: 234, flaggedClaims: 56, flaggedAmount: 5_200_000, detectionRate: 23.9 },
      { name: "Pattaya", province: "Chon Buri", totalClaims: 189, flaggedClaims: 48, flaggedAmount: 4_100_000, detectionRate: 25.3 },
      { name: "Patong", province: "Phuket", totalClaims: 156, flaggedClaims: 52, flaggedAmount: 6_200_000, detectionRate: 33.3 },
      { name: "Chiang Mai Mueang", province: "Chiang Mai", totalClaims: 198, flaggedClaims: 38, flaggedAmount: 2_900_000, detectionRate: 19.1 },
      { name: "Pak Kret", province: "Nonthaburi", totalClaims: 145, flaggedClaims: 31, flaggedAmount: 2_400_000, detectionRate: 21.3 },
      { name: "Koh Samui", province: "Surat Thani", totalClaims: 89, flaggedClaims: 32, flaggedAmount: 3_100_000, detectionRate: 35.9 },
      { name: "Hat Yai", province: "Songkhla", totalClaims: 67, flaggedClaims: 15, flaggedAmount: 1_200_000, detectionRate: 22.3 },
      { name: "Si Racha", province: "Chon Buri", totalClaims: 112, flaggedClaims: 22, flaggedAmount: 1_700_000, detectionRate: 19.6 },
    ],
    byProvider: [
      { name: "Bangkok Hospital Pattaya", totalClaims: 312, flaggedClaims: 67, flaggedAmount: 8_900_000, detectionRate: 21.4 },
      { name: "Bumrungrad International", totalClaims: 289, flaggedClaims: 52, flaggedAmount: 7_200_000, detectionRate: 17.9 },
      { name: "Samitivej Sukhumvit", totalClaims: 245, flaggedClaims: 48, flaggedAmount: 5_600_000, detectionRate: 19.5 },
      { name: "Bangkok Hospital Phuket", totalClaims: 198, flaggedClaims: 63, flaggedAmount: 7_800_000, detectionRate: 31.8 },
      { name: "Chiang Mai Ram Hospital", totalClaims: 167, flaggedClaims: 31, flaggedAmount: 2_400_000, detectionRate: 18.5 },
      { name: "Phyathai 2 Hospital", totalClaims: 156, flaggedClaims: 29, flaggedAmount: 2_100_000, detectionRate: 18.5 },
      { name: "Bangkok Hospital Samui", totalClaims: 89, flaggedClaims: 28, flaggedAmount: 2_800_000, detectionRate: 31.4 },
      { name: "Rajavithi Hospital", totalClaims: 234, flaggedClaims: 18, flaggedAmount: 1_200_000, detectionRate: 7.6 },
    ],
    byBroker: [
      { name: "Golden Orchid Insurance Broker", totalClaims: 445, flaggedClaims: 89, flaggedAmount: 9_800_000, detectionRate: 20.0 },
      { name: "Lotus Shield Partners", totalClaims: 378, flaggedClaims: 56, flaggedAmount: 6_200_000, detectionRate: 14.8 },
      { name: "Horizon Broker Network", totalClaims: 312, flaggedClaims: 67, flaggedAmount: 7_100_000, detectionRate: 21.4 },
      { name: "Summit Life Agents", totalClaims: 267, flaggedClaims: 45, flaggedAmount: 4_500_000, detectionRate: 16.8 },
      { name: "Emerald Bay Associates", totalClaims: 198, flaggedClaims: 42, flaggedAmount: 4_200_000, detectionRate: 21.2 },
      { name: "Pearl River Broker", totalClaims: 156, flaggedClaims: 34, flaggedAmount: 3_100_000, detectionRate: 21.7 },
    ],
  };

  return { summary, riskDistribution, flagsByCategory, recommendations, riskTrends, fwaClassification, financialTrends, topFlaggedClaims, hotspots };
}

portal.get("/portal/fwa-analytics", async (c) => {
  const groupBy = c.req.query("groupBy") || "week";

  // TODO: switch to real DB data once FWA pipeline is populated
  // For now, always return mock data for demo purposes
  return c.json(buildFWAMockData(groupBy));

  /* ── Real data path (disabled for demo) ──────────────────────────────────
  try {
    const data = await gqlQuery<{
      totalCases: { _count: number };
      confirmedCases: { _count: number };
      clearedCases: { _count: number };
      underInvestigation: { _count: number };
      totalFlaggedAmount: { totalFlaggedAmount: { sum: number | null } };
      totalConfirmedAmount: { totalFlaggedAmount: { sum: number | null } };
      allCases: Array<{
        riskLevel: string | null;
        status: string;
        category: string | null;
        createdAt: string;
        flaggedAmount: number | null;
      }>;
      topFlaggedClaims: Array<{
        id: string;
        claimNumber: string;
        insuredName: string | null;
        totalRequestedAmount: number | null;
        status: string;
      }>;
    }>(`
      query PortalFWAAnalytics {
        totalCases: fwaCasesAggregate(filter_input: { where: { deletedAt: { _is_null: true } } }) { _count }
        confirmedCases: fwaCasesAggregate(filter_input: { where: { status: { _eq: "CONFIRMED" }, deletedAt: { _is_null: true } } }) { _count }
        clearedCases: fwaCasesAggregate(filter_input: { where: { status: { _eq: "CLEARED" }, deletedAt: { _is_null: true } } }) { _count }
        underInvestigation: fwaCasesAggregate(filter_input: { where: { status: { _eq: "UNDER_INVESTIGATION" }, deletedAt: { _is_null: true } } }) { _count }
        totalFlaggedAmount: fwaCasesAggregate(filter_input: { where: { deletedAt: { _is_null: true } } }) { totalFlaggedAmount { sum } }
        totalConfirmedAmount: fwaCasesAggregate(filter_input: { where: { status: { _eq: "CONFIRMED" }, deletedAt: { _is_null: true } } }) { totalFlaggedAmount { sum } }
        allCases: fwaCases(where: { deletedAt: { _is_null: true } }, limit: 500, order_by: { createdAt: Desc }) {
          riskLevel
          status
          category
          createdAt
          flaggedAmount
        }
        topFlaggedClaims: claims(
          where: { status: { _eq: "FLAGGED" } }
          limit: 10
          orderBy: { totalRequestedAmount: DescNullsLast }
        ) {
          id claimNumber insuredName totalRequestedAmount status
        }
      }
    `);

    // Risk distribution
    const riskMap = new Map<string, number>();
    for (const fc of data.allCases) {
      const level = fc.riskLevel ?? "UNKNOWN";
      riskMap.set(level, (riskMap.get(level) ?? 0) + 1);
    }
    const riskDistribution = Array.from(riskMap.entries()).map(([riskLevel, count]) => ({ riskLevel, count }));

    // Flags by category
    const catMap = new Map<string, number>();
    for (const fc of data.allCases) {
      const cat = fc.category ?? "UNCATEGORIZED";
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    }
    const flagsByCategory = Array.from(catMap.entries()).map(([category, count]) => ({ category, count }));

    // Recommendations — derive from risk level
    const recMap = new Map<string, number>();
    for (const fc of data.allCases) {
      const level = (fc.riskLevel ?? "").toUpperCase();
      const rec = level === "CRITICAL" || level === "HIGH" ? "INVESTIGATE" : level === "MEDIUM" ? "REVIEW" : "CLEAR";
      recMap.set(rec, (recMap.get(rec) ?? 0) + 1);
    }
    const recommendations = Array.from(recMap.entries()).map(([recommendation, count]) => ({ recommendation, count }));

    // Risk trends — group by the requested interval
    const trendMap = new Map<string, { high: number; medium: number; low: number; critical: number }>();
    for (const fc of data.allCases) {
      let key: string;
      const d = new Date(fc.createdAt);
      if (groupBy === "day") {
        key = fc.createdAt.substring(0, 10);
      } else if (groupBy === "week") {
        const dayOfWeek = d.getDay();
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - dayOfWeek);
        key = weekStart.toISOString().slice(0, 10);
      } else {
        key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      }
      if (!trendMap.has(key)) trendMap.set(key, { high: 0, medium: 0, low: 0, critical: 0 });
      const bucket = trendMap.get(key)!;
      const level = (fc.riskLevel ?? "").toUpperCase();
      if (level === "CRITICAL") bucket.critical++;
      else if (level === "HIGH") bucket.high++;
      else if (level === "MEDIUM") bucket.medium++;
      else bucket.low++;
    }
    const riskTrends = Array.from(trendMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalDetected = data.totalCases._count;
    const totalConfirmed = data.confirmedCases._count;
    const totalFlagged = data.totalFlaggedAmount.totalFlaggedAmount.sum ?? 0;
    const totalConfirmedAmt = data.totalConfirmedAmount.totalFlaggedAmount.sum ?? 0;

    // High + Critical count
    const highCriticalCount = data.allCases.filter(
      (fc) => fc.riskLevel === "HIGH" || fc.riskLevel === "CRITICAL"
    ).length;

    const summary = {
      totalAnalyzed: totalDetected,
      avgRiskScore: 0,
      detectionRate: totalDetected > 0 ? Math.round((highCriticalCount / totalDetected) * 1000) / 10 : 0,
      highCriticalCount,
      totalClaimsValue: totalFlagged,
      totalValueSaved: totalConfirmedAmt,
      totalFraudDeclined: Math.floor(totalConfirmedAmt * 0.65),
      totalWADenied: Math.floor(totalConfirmedAmt * 0.35),
      casesIdentified: totalDetected,
      casesConfirmed: totalConfirmed,
    };

    // Map top flagged claims to the expected shape
    const topFlaggedClaims = data.topFlaggedClaims.map((claim) => ({
      id: claim.id,
      claimCode: claim.claimNumber,
      insuredName: claim.insuredName ?? "Unknown",
      riskScore: 0,
      riskLevel: "HIGH",
      recommendation: "INVESTIGATE",
      flagCount: 0,
      flags: [],
      createdAt: new Date().toISOString(),
      requestedAmount: claim.totalRequestedAmount ?? 0,
      coveredAmount: 0,
    }));

    return c.json({
      summary,
      riskDistribution,
      flagsByCategory,
      recommendations,
      riskTrends,
      topFlaggedClaims,
      // These fields require richer DB data — omitted when using real data
      // They'll appear as "No data available" on the frontend gracefully
    });
  } catch (err) {
    console.error("[Portal API] Error fetching FWA analytics:", err);
    return c.json(buildFWAMockData(groupBy));
  }
  ── End of real data path ──────────────────────────────────────────────── */
});

// ── FWA Cases mock data ───────────────────────────────────────────────

function buildFWACasesMockData() {
  const thaiNames = [
    "Somchai Prasert", "Nattaya Suwannarat", "Pichaya Kongphan", "Kittisak Wongcharoen",
    "Supaporn Thongkam", "Arthit Saetang", "Ploy Chaiyasit", "Tanawat Ruangrit",
    "Naruemon Petcharat", "Wichai Bunnak", "Siriporn Kaewmanee", "Chatree Phongsri",
    "Duangjai Srisombat", "Preecha Thammarat", "Kanokwan Intaramat",
  ];
  const providerNames = [
    "Bangkok Hospital Pattaya", "Bumrungrad International", "Samitivej Sukhumvit",
    "Bangkok Hospital Phuket", "Chiang Mai Ram Hospital", "Phyathai 2 Hospital",
    "Bangkok Hospital Samui", "Rajavithi Hospital",
  ];
  const brokerNames = [
    "Golden Orchid Insurance Broker", "Lotus Shield Partners", "Horizon Broker Network",
    "Summit Life Agents", "Emerald Bay Associates",
  ];
  const flagTemplates = [
    { category: "Billing Irregularities", title: "Duplicate charge detected", severity: "HIGH" as const },
    { category: "Billing Irregularities", title: "Upcoded procedure", severity: "HIGH" as const },
    { category: "Service Patterns", title: "Unusual frequency of visits", severity: "MEDIUM" as const },
    { category: "Identity & Eligibility", title: "Coverage gap detected", severity: "MEDIUM" as const },
    { category: "Clinical Inconsistencies", title: "Diagnosis/procedure mismatch", severity: "HIGH" as const },
    { category: "Provider Behavior", title: "Excessive referral pattern", severity: "MEDIUM" as const },
    { category: "Documentation Issues", title: "Missing supporting documents", severity: "LOW" as const },
    { category: "Timing Anomalies", title: "Claim filed before service date", severity: "HIGH" as const },
    { category: "Service Patterns", title: "Weekend/holiday service cluster", severity: "LOW" as const },
    { category: "Provider Behavior", title: "Abnormal billing ratio", severity: "MEDIUM" as const },
  ];

  const riskLevels = ["HIGH", "CRITICAL", "MEDIUM", "HIGH", "CRITICAL"] as const;
  const recs = ["INVESTIGATE", "INVESTIGATE", "REVIEW", "INVESTIGATE", "REVIEW"] as const;

  function pickFlags(count: number) {
    return Array.from({ length: count }, () => flagTemplates[Math.floor(Math.random() * flagTemplates.length)]!);
  }

  // Flagged Queue — 12 claims awaiting triage
  const flaggedQueue = Array.from({ length: 12 }, (_, i) => {
    const amount = 45_000 + Math.floor(Math.random() * 400_000);
    const numFlags = 2 + Math.floor(Math.random() * 4);
    return {
      id: `mock-flagged-${i + 1}`,
      claimCode: `CLM-${String(25000 + i).padStart(6, "0")}`,
      insuredName: thaiNames[i % thaiNames.length]!,
      insuredPersonId: `mock-insured-${i + 1}`,
      providerName: providerNames[i % providerNames.length]!,
      providerId: `mock-provider-${i + 1}`,
      brokerName: i % 3 === 0 ? brokerNames[i % brokerNames.length]! : null,
      riskScore: 50 + Math.floor(Math.random() * 50),
      riskLevel: riskLevels[i % riskLevels.length]!,
      recommendation: recs[i % recs.length]!,
      flags: pickFlags(numFlags),
      flagCount: numFlags,
      requestedAmount: amount,
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 14 * 86400000)).toISOString(),
      existingCaseId: null,
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  // Active Cases — 8 cases in various stages
  const caseStatuses = ["NEW", "UNDER_INVESTIGATION", "UNDER_INVESTIGATION", "CONFIRMED_HIT", "UNDER_INVESTIGATION", "CONFIRMED_HIT", "CLEARED", "NEW"] as const;
  const entityTypes = ["INSURED_PERSON", "PROVIDER", "SINGLE_CLAIM", "INSURED_PERSON", "AGENCY_BROKER", "PROVIDER", "SINGLE_CLAIM", "INSURED_PERSON"] as const;

  const cases = Array.from({ length: 8 }, (_, i) => {
    const numClaims = 1 + Math.floor(Math.random() * 4);
    const linkedClaims = Array.from({ length: numClaims }, (_, j) => {
      const amount = 30_000 + Math.floor(Math.random() * 300_000);
      return {
        id: `mock-linked-claim-${i}-${j}`,
        claimCode: `CLM-${String(24000 + i * 10 + j).padStart(6, "0")}`,
        insuredName: thaiNames[(i + j) % thaiNames.length]!,
        providerName: providerNames[(i + j) % providerNames.length]!,
        riskScore: 45 + Math.floor(Math.random() * 55),
        riskLevel: riskLevels[j % riskLevels.length]! as string,
        recommendation: recs[j % recs.length]! as string,
        flags: pickFlags(2 + Math.floor(Math.random() * 3)),
        requestedAmount: amount,
        coveredAmount: Math.floor(amount * (0.3 + Math.random() * 0.5)),
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)).toISOString(),
        fwaConfirmed: caseStatuses[i]! === "CONFIRMED_HIT",
      };
    });

    const riskScores = linkedClaims.map((lc) => lc.riskScore);
    const totalFlagged = linkedClaims.reduce((s, lc) => s + lc.requestedAmount, 0);
    const flagSummary: Record<string, number> = {};
    for (const lc of linkedClaims) {
      for (const f of lc.flags) {
        flagSummary[f.category] = (flagSummary[f.category] ?? 0) + 1;
      }
    }

    const entityName = entityTypes[i]! === "PROVIDER"
      ? providerNames[i % providerNames.length]!
      : entityTypes[i]! === "AGENCY_BROKER"
        ? brokerNames[i % brokerNames.length]!
        : thaiNames[i % thaiNames.length]!;

    const status = caseStatuses[i]!;
    const createdAt = new Date(Date.now() - (30 - i * 3) * 86400000).toISOString();

    const aiSummary = status !== "NEW" ? (
      `## Investigation Summary\n\nThis ${entityTypes[i]!.toLowerCase().replace(/_/g, " ")} case involves **${numClaims} linked claims** ` +
      `totaling **฿${(totalFlagged / 1000).toFixed(0)}K** in flagged amounts.\n\n` +
      `### Key Findings\n- Multiple ${Object.keys(flagSummary)[0] ?? "billing"} flags detected across claims\n` +
      `- Risk scores range from ${Math.min(...riskScores)} to ${Math.max(...riskScores)}\n` +
      `- Pattern suggests ${status === "CONFIRMED_HIT" ? "confirmed fraudulent activity" : "potential coordinated billing irregularities"}\n\n` +
      `### Recommendation\n${status === "CONFIRMED_HIT" ? "Case confirmed — proceed with denial and recovery." : "Continue investigation with document verification and provider interview."}`
    ) : null;

    const aiNextSteps = status !== "NEW" ? [
      "Request itemized billing records from provider",
      "Cross-reference with similar claims from the same provider",
      "Verify patient treatment records with attending physician",
      "Review provider billing patterns over the past 12 months",
    ] : null;

    const aiPatterns = status === "CONFIRMED_HIT" || status === "UNDER_INVESTIGATION"
      ? "Recurring pattern of upcoded procedures during weekend admissions with incomplete documentation. Similar pattern detected in 3 other providers in the same network."
      : null;

    const actions = [
      ...(status !== "NEW" ? [{
        id: `mock-action-${i}-1`,
        caseId: `mock-case-${i + 1}`,
        type: "STATUS_CHANGE" as const,
        content: "Case opened for investigation based on automated FWA flagging.",
        createdAt: new Date(new Date(createdAt).getTime() + 3600000).toISOString(),
        createdBy: "system",
      }, {
        id: `mock-action-${i}-2`,
        caseId: `mock-case-${i + 1}`,
        type: "NOTE" as const,
        content: "Initial review complete. Multiple billing irregularities confirmed across linked claims. Requesting additional documentation from provider.",
        createdAt: new Date(new Date(createdAt).getTime() + 86400000).toISOString(),
        createdBy: "analyst@papaya.co.th",
      }] : []),
      ...(status === "UNDER_INVESTIGATION" ? [{
        id: `mock-action-${i}-3`,
        caseId: `mock-case-${i + 1}`,
        type: "DOCUMENT_REQUEST" as const,
        content: "Requested itemized billing records and treatment notes from provider for all linked claims.",
        createdAt: new Date(new Date(createdAt).getTime() + 172800000).toISOString(),
        createdBy: "analyst@papaya.co.th",
      }] : []),
      ...(status === "CONFIRMED_HIT" ? [{
        id: `mock-action-${i}-3`,
        caseId: `mock-case-${i + 1}`,
        type: "ESCALATION" as const,
        content: "Escalated to senior fraud analyst. Evidence of systematic upcoding across multiple claims.",
        createdAt: new Date(new Date(createdAt).getTime() + 172800000).toISOString(),
        createdBy: "analyst@papaya.co.th",
      }, {
        id: `mock-action-${i}-4`,
        caseId: `mock-case-${i + 1}`,
        type: "CONFIRMATION" as const,
        content: "Fraud confirmed. Provider admitted to billing errors. Recovery process initiated.",
        createdAt: new Date(new Date(createdAt).getTime() + 432000000).toISOString(),
        createdBy: "senior.analyst@papaya.co.th",
      }] : []),
      ...(status === "CLEARED" ? [{
        id: `mock-action-${i}-3`,
        caseId: `mock-case-${i + 1}`,
        type: "CLEARANCE" as const,
        content: "After thorough investigation, all flagged items were found to be legitimate. Case cleared.",
        createdAt: new Date(new Date(createdAt).getTime() + 259200000).toISOString(),
        createdBy: "senior.analyst@papaya.co.th",
      }] : []),
    ];

    return {
      id: `mock-case-${i + 1}`,
      caseCode: `FWA-${String(1000 + i).padStart(5, "0")}`,
      status,
      entityType: entityTypes[i]!,
      entityName,
      entityId: `mock-entity-${i + 1}`,
      linkedClaims,
      actions,
      highestRiskScore: Math.max(...riskScores),
      avgRiskScore: Math.round((riskScores.reduce((a, b) => a + b, 0) / riskScores.length) * 10) / 10,
      totalFlaggedAmount: totalFlagged,
      flagSummary,
      aiSummary,
      aiNextSteps,
      aiPatterns,
      createdAt,
      updatedAt: actions.length > 0 ? actions[actions.length - 1]!.createdAt : createdAt,
      closedAt: status === "CONFIRMED_HIT" || status === "CLEARED"
        ? (actions.length > 0 ? actions[actions.length - 1]!.createdAt : createdAt)
        : null,
    };
  });

  return {
    flaggedQueue,
    cases,
    stats: {
      totalFlagged: flaggedQueue.length,
      newCases: cases.filter((c) => c.status === "NEW").length,
      underInvestigation: cases.filter((c) => c.status === "UNDER_INVESTIGATION").length,
      confirmedHits: cases.filter((c) => c.status === "CONFIRMED_HIT").length,
      cleared: cases.filter((c) => c.status === "CLEARED").length,
    },
  };
}

// Cache mock data so case IDs are stable within a server session
let _fwaCasesMock: ReturnType<typeof buildFWACasesMockData> | null = null;
function getFWACasesMock() {
  if (!_fwaCasesMock) _fwaCasesMock = buildFWACasesMockData();
  return _fwaCasesMock;
}

// ── GET /portal/fwa-cases ─────────────────────────────────────────────────

portal.get("/portal/fwa-cases", async (c) => {
  try {
    // Fetch claims with FWA data (non-null aiSummary)
    const claimsData = await gqlQuery<{
      claims: Array<{
        id: string;
        claimNumber: string;
        claimantName: string | null;
        providerName: string | null;
        amountClaimed: number | null;
        createdAt: string;
        aiSummary: string | null;
      }>;
    }>(`
      query FlaggedQueueClaims {
        claims(
          limit: 100,
          order_by: { createdAt: Desc },
          where: { aiSummary: { _is_null: false } }
        ) {
          id claimNumber claimantName providerName amountClaimed createdAt aiSummary
        }
      }
    `);

    // Parse FWA data and filter for flagged / high-risk claims
    type ParsedClaim = {
      id: string;
      claimNumber: string;
      claimantName: string | null;
      providerName: string | null;
      amountClaimed: number | null;
      createdAt: string;
      fwa: {
        riskScore: number;
        riskLevel: string;
        recommendation: string;
        flags: Array<{ category: string; title: string; severity: string; description?: string }>;
        flaggedForReview?: boolean;
      };
    };
    const parsedClaims: ParsedClaim[] = [];
    for (const claim of claimsData.claims) {
      if (!claim.aiSummary) continue;
      try {
        const parsed = JSON.parse(claim.aiSummary);
        const fwa = parsed.fwa;
        if (!fwa?.riskScore || !fwa?.riskLevel) continue;
        const riskUpper = (fwa.riskLevel as string).toUpperCase();
        // Include if flaggedForReview or HIGH/CRITICAL risk
        if (fwa.flaggedForReview || riskUpper === "HIGH" || riskUpper === "CRITICAL") {
          parsedClaims.push({ ...claim, fwa });
        }
      } catch { continue; }
    }

    // Check which claims already have linked FWA cases
    const claimIds = parsedClaims.map((c) => c.id);
    let linkedMap = new Map<string, string>();
    if (claimIds.length > 0) {
      try {
        const linkData = await gqlQuery<{
          fwaCaseClaims: Array<{ claimId: string; fwaCaseId: string }>;
        }>(`
          query FlaggedQueueLinks($claimIds: [Uuid!]!) {
            fwaCaseClaims(where: { claimId: { _in: $claimIds }, fwaCase: { deletedAt: { _is_null: true } } }) {
              claimId fwaCaseId
            }
          }
        `, { claimIds });
        for (const link of linkData.fwaCaseClaims) {
          linkedMap.set(link.claimId, link.fwaCaseId);
        }
      } catch { /* non-fatal — proceed without link data */ }
    }

    // Build flagged queue items sorted by risk score descending
    const flaggedQueue = parsedClaims
      .map((c) => ({
        id: c.id,
        claimCode: c.claimNumber,
        insuredName: c.claimantName ?? "Unknown",
        insuredPersonId: c.id,
        providerName: c.providerName,
        providerId: null,
        brokerName: null,
        riskScore: c.fwa.riskScore,
        riskLevel: c.fwa.riskLevel.toUpperCase(),
        recommendation: (c.fwa.recommendation ?? "REVIEW").toUpperCase(),
        flags: c.fwa.flags ?? [],
        flagCount: c.fwa.flags?.length ?? 0,
        requestedAmount: c.amountClaimed ?? 0,
        createdAt: c.createdAt,
        existingCaseId: linkedMap.get(c.id) ?? null,
      }))
      .sort((a, b) => b.riskScore - a.riskScore);

    // Fetch real FWA cases
    const casesData = await gqlQuery<{
      fwaCases: Array<{
        id: string;
        entityType: string;
        entityId: string;
        status: string;
        riskLevel: string | null;
        category: string | null;
        flaggedAmount: number | null;
        description: string | null;
        createdAt: string;
        updatedAt: string;
        createdBy: string | null;
      }>;
    }>(`
      query FWACasesList {
        fwaCases(where: { deletedAt: { _is_null: true } }, limit: 100, order_by: { createdAt: Desc }) {
          id entityType entityId status riskLevel category flaggedAmount description
          createdAt updatedAt createdBy
        }
      }
    `);

    // Compute stats
    const cases = casesData.fwaCases;
    const stats = {
      totalFlagged: flaggedQueue.length,
      newCases: cases.filter((c) => c.status === "NEW").length,
      underInvestigation: cases.filter((c) => c.status === "UNDER_INVESTIGATION").length,
      confirmedHits: cases.filter((c) => c.status === "CONFIRMED_HIT" || c.status === "CONFIRMED").length,
      cleared: cases.filter((c) => c.status === "CLEARED").length,
    };

    return c.json({ flaggedQueue, cases, stats });
  } catch (err) {
    console.error("[Portal API] Error fetching FWA cases:", err);
    // Fallback to mock data on error to avoid breaking the page
    return c.json(getFWACasesMock());
  }
});

// ── GET /portal/fwa-cases/:id ─────────────────────────────────────────────

portal.get("/portal/fwa-cases/:id", async (c) => {
  const id = c.req.param("id");

  // Check mock data first
  if (id.startsWith("mock-case-")) {
    const mock = getFWACasesMock();
    const mockCase = mock.cases.find((cs) => cs.id === id);
    if (mockCase) return c.json(mockCase);
    return c.json({ error: "FWA case not found" }, 404);
  }

  try {
    const data = await gqlQuery<{
      fwaCasesByPk: {
        id: string;
        entityType: string;
        entityId: string;
        status: string;
        riskLevel: string | null;
        category: string | null;
        flaggedAmount: number | null;
        description: string | null;
        findings: Record<string, unknown> | null;
        createdAt: string;
        updatedAt: string;
        createdBy: string | null;
        linkedClaims: Array<{
          claim: {
            id: string;
            claimNumber: string;
            insuredName: string | null;
            totalRequestedAmount: number | null;
            status: string;
            diagnosis: string | null;
          };
        }>;
        actions: Array<{
          id: string;
          actionType: string;
          notes: string | null;
          createdAt: string;
          createdBy: string | null;
        }>;
      } | null;
    }>(`
      query PortalFWACaseDetail($id: Uuid!) {
        fwaCasesByPk(id: $id) {
          id entityType entityId status riskLevel category flaggedAmount description findings
          createdAt updatedAt createdBy
          linkedClaims: fwaCaseClaims {
            claim {
              id claimNumber insuredName totalRequestedAmount status diagnosis
            }
          }
          actions: fwaCaseActions(order_by: { createdAt: Desc }) {
            id actionType notes createdAt createdBy
          }
        }
      }
    `, { id });

    if (!data.fwaCasesByPk) {
      return c.json({ error: "FWA case not found" }, 404);
    }

    return c.json(data.fwaCasesByPk);
  } catch (err) {
    console.error("[Portal API] Error fetching FWA case:", err);
    return c.json({ error: "Failed to fetch FWA case" }, 500);
  }
});

// ── POST /portal/fwa-cases ────────────────────────────────────────────────

portal.post("/portal/fwa-cases", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    entityType: string;
    entityId: string;
    claimIds: string[];
    riskLevel?: string;
    category?: string;
    description?: string;
    flaggedAmount?: number;
  }>();

  if (!body.entityType || !body.entityId || !body.claimIds?.length) {
    return c.json({ error: "entityType, entityId, and claimIds are required" }, 400);
  }

  try {
    // Insert the FWA case
    const insertData = await gqlQuery<{
      insertFwaCases: { returning: Array<{ id: string }> };
    }>(`
      mutation InsertFWACase($object: InsertFwaCasesObjectInput!) {
        insertFwaCases(objects: [$object]) {
          returning { id }
        }
      }
    `, {
      object: {
        entityType: body.entityType,
        entityId: body.entityId,
        status: "NEW",
        riskLevel: body.riskLevel ?? null,
        category: body.category ?? null,
        description: body.description ?? null,
        flaggedAmount: body.flaggedAmount ?? null,
        createdBy: user.sub,
      },
    });

    const newCase = insertData.insertFwaCases.returning[0]!;

    // Link claims to the FWA case
    const linkObjects = body.claimIds.map((claimId) => ({
      fwaCaseId: newCase.id,
      claimId,
      createdBy: user.sub,
    }));

    await gqlQuery(`
      mutation LinkClaimsToFWACase($objects: [InsertFwaCaseClaimsObjectInput!]!) {
        insertFwaCaseClaims(objects: $objects) {
          returning { id }
        }
      }
    `, { objects: linkObjects });

    return c.json({ id: newCase.id }, 201);
  } catch (err) {
    console.error("[Portal API] Error creating FWA case:", err);
    return c.json({ error: "Failed to create FWA case" }, 500);
  }
});

// ── DELETE /portal/fwa-cases/:id ──────────────────────────────────────────

portal.delete("/portal/fwa-cases/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  try {
    // Soft delete
    await gqlQuery(`
      mutation SoftDeleteFWACase($id: Uuid!, $deletedBy: Uuid!) {
        updateFwaCasesById(keyId: $id, updateColumns: { deletedAt: "now()", deletedBy: $deletedBy }) {
          affectedRows
        }
      }
    `, { id, deletedBy: user.sub });

    return c.json({ success: true });
  } catch (err) {
    console.error("[Portal API] Error deleting FWA case:", err);
    return c.json({ error: "Failed to delete FWA case" }, 500);
  }
});

// ── GET /portal/claims/:id/fwa-case-link ──────────────────────────────────

portal.get("/portal/claims/:id/fwa-case-link", async (c) => {
  const claimId = c.req.param("id");

  try {
    const data = await gqlQuery<{
      fwaCaseClaims: Array<{
        fwaCase: {
          id: string;
          status: string;
        };
      }>;
    }>(`
      query ClaimFWACaseLink($claimId: Uuid!) {
        fwaCaseClaims(where: { claimId: { _eq: $claimId }, fwaCase: { deletedAt: { _is_null: true } } }) {
          fwaCase {
            id
            status
          }
        }
      }
    `, { claimId });

    const link = data.fwaCaseClaims[0];
    if (link) {
      return c.json({ hasCase: true, caseId: link.fwaCase.id, caseStatus: link.fwaCase.status });
    }
    return c.json({ hasCase: false, caseId: null, caseStatus: null });
  } catch (err) {
    console.error("[Portal API] Error checking FWA case link:", err);
    return c.json({ error: "Failed to check FWA case link" }, 500);
  }
});

// ── POST /portal/claims/:id/flag-for-review ───────────────────────────────

portal.post("/portal/claims/:id/flag-for-review", async (c) => {
  const claimId = c.req.param("id");
  const user = c.get("user");

  try {
    const merge = await getMergeExtractedData();
    await merge(claimId, {
      flaggedForReview: true,
      flaggedAt: new Date().toISOString(),
      flaggedBy: user.sub,
    }, "fwa");
    return c.json({ success: true });
  } catch (err) {
    console.error("[Portal API] Error flagging claim for review:", err);
    return c.json({ error: "Failed to flag claim for review" }, 500);
  }
});

// SSE streaming endpoints removed — agents now run exclusively via background pipeline

// ---------------------------------------------------------------------------
// Pipeline Status Tracking — uses the shared mergeExtractedData write queue
// from the extraction agent to prevent race conditions when agents and the
// pipeline both write to aiSummary concurrently.
// ---------------------------------------------------------------------------

// Lazy-loaded reference to mergeExtractedData — shares the same write queue
// as the agents, ensuring all writes are serialized per claim.
let _mergeExtractedData: ((claimId: string, patch: Record<string, unknown>, namespace?: string) => Promise<void>) | null = null;

async function getMergeExtractedData() {
  if (!_mergeExtractedData) {
    const agentPath = "../../../agents/portal-extraction/tools/claims.ts";
    const mod = await import(/* @vite-ignore */ agentPath);
    _mergeExtractedData = mod.mergeExtractedData;
  }
  return _mergeExtractedData!;
}

async function updatePipelineStatus(
  claimId: string,
  module: string,
  status: "running" | "completed" | "error" | "rejected",
  error?: string,
  notes?: string,
  progress?: { turnCount?: number; maxTurns?: number; currentTool?: string; startedAt?: string },
): Promise<void> {
  try {
    const merge = await getMergeExtractedData();
    const now = new Date().toISOString();
    const moduleStatus: Record<string, unknown> = {
      status,
      ...(status === "running"
        ? { startedAt: progress?.startedAt ?? now }
        : { completedAt: now, ...(progress?.startedAt ? { startedAt: progress.startedAt } : {}) }),
      ...(error ? { error } : {}),
      ...(notes ? { notes } : {}),
      ...(progress?.turnCount != null ? { turnCount: progress.turnCount } : {}),
      ...(progress?.maxTurns != null ? { maxTurns: progress.maxTurns } : {}),
      ...(progress?.currentTool ? { currentTool: progress.currentTool } : {}),
    };
    // Use "_pipelineStatus" as a namespace — mergeExtractedData will read
    // the existing _pipelineStatus object and merge this module into it,
    // preserving other modules' statuses.
    await merge(claimId, { [module]: moduleStatus }, "_pipelineStatus");
  } catch (err) {
    console.error(`[Portal API] Failed to update pipeline status for ${claimId}/${module}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Auto-route HIGH/CRITICAL claims to flagged queue after FWA processing
// ---------------------------------------------------------------------------

async function autoRouteFWAResults(claimId: string): Promise<void> {
  // Read the claim's aiSummary to check FWA results
  const data = await gqlQuery<{
    claimsById: { aiSummary: string | null } | null;
  }>(`
    query GetClaimAISummary($id: Uuid!) {
      claimsById(id: $id) { aiSummary }
    }
  `, { id: claimId });

  if (!data.claimsById?.aiSummary) return;

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(data.claimsById.aiSummary); }
  catch { return; }

  const fwa = parsed.fwa as { riskLevel?: string; flaggedForReview?: boolean } | undefined;
  if (!fwa) return;

  const riskLevel = (fwa.riskLevel ?? "").toUpperCase();
  if ((riskLevel === "HIGH" || riskLevel === "CRITICAL") && !fwa.flaggedForReview) {
    const merge = await getMergeExtractedData();
    await merge(claimId, {
      flaggedForReview: true,
      flaggedAt: new Date().toISOString(),
      flaggedBy: "system",
    }, "fwa");
  }
}

// ---------------------------------------------------------------------------
// Pipeline Runner — sequential stages with parallel where possible
// ---------------------------------------------------------------------------

/**
 * Runs the full portal pipeline:
 *   Extraction → (Assessment + Medical Necessity + Pre-Existing in parallel) → FWA
 *
 * Updates claim status to PROCESSING before starting and under_review after.
 * Pre-existing is non-fatal: if it fails, FWA still runs without pre-existing data.
 * Pipeline status is persisted to aiSummary._pipelineStatus for frontend display.
 */
async function runPortalPipeline(claimId: string, _sessionId: string): Promise<void> {
  try {
    // Mark claim as PROCESSING
    await gqlQuery(`
      mutation UpdateClaimProcessing($id: Uuid!) {
        updateClaimsById(keyId: $id, updateColumns: { status: { set: "ai_processing" } }) {
          affectedRows
        }
      }
    `, { id: claimId });

    // Stage 1: Extraction
    await updatePipelineStatus(claimId, "extraction", "running");
    await runPortalAgent("extraction", claimId);
    await updatePipelineStatus(claimId, "extraction", "completed");

    // Stage 2: Assessment + Medical Necessity + Pre-Existing + Image Forensics in parallel
    // Pre-existing only depends on extraction (extractedTreatmentInfo), not assessment/MN
    // Image forensics only depends on extraction (classifiedDocuments)
    await updatePipelineStatus(claimId, "assessment", "running");
    await updatePipelineStatus(claimId, "medicalNecessity", "running");
    await updatePipelineStatus(claimId, "preExisting", "running");
    await updatePipelineStatus(claimId, "imageForensics", "running");
    const [assessResult, mnResult, preExResult, imgForensicsResult] = await Promise.allSettled([
      runPortalAgent("assessment", claimId),
      runPortalAgent("medical-necessity", claimId),
      runPortalAgent("pre-existing", claimId),
      runPortalAgent("image-forensics", claimId),
    ]);
    if (assessResult.status === "fulfilled") {
      await updatePipelineStatus(claimId, "assessment", "completed");
    } else {
      await updatePipelineStatus(claimId, "assessment", "error", assessResult.reason?.message ?? "Unknown error");
    }
    if (mnResult.status === "fulfilled") {
      await updatePipelineStatus(claimId, "medicalNecessity", "completed");
    } else {
      await updatePipelineStatus(claimId, "medicalNecessity", "error", mnResult.reason?.message ?? "Unknown error");
    }
    if (preExResult.status === "fulfilled") {
      await updatePipelineStatus(claimId, "preExisting", "completed");
    } else {
      console.warn(`[Portal API] Pre-existing agent failed for claim ${claimId} (non-fatal):`, preExResult.reason);
      await updatePipelineStatus(claimId, "preExisting", "error",
        preExResult.reason instanceof Error ? preExResult.reason.message : String(preExResult.reason));
    }
    if (imgForensicsResult.status === "fulfilled") {
      await updatePipelineStatus(claimId, "imageForensics", "completed");
    } else {
      console.warn(`[Portal API] Image forensics agent failed for claim ${claimId} (non-fatal):`, imgForensicsResult.reason);
      await updatePipelineStatus(claimId, "imageForensics", "error",
        imgForensicsResult.reason instanceof Error ? imgForensicsResult.reason.message : String(imgForensicsResult.reason));
    }
    // Re-throw if assessment failed (it's critical)
    if (assessResult.status === "rejected") throw assessResult.reason;

    // Stage 3: FWA
    await updatePipelineStatus(claimId, "fwa", "running");
    await runPortalAgent("fwa", claimId);
    await updatePipelineStatus(claimId, "fwa", "completed");

    // Auto-route HIGH/CRITICAL claims to flagged queue (non-fatal)
    try { await autoRouteFWAResults(claimId); }
    catch (err) { console.warn(`[Portal API] Auto-route failed (non-fatal):`, err); }

    // Mark claim as under review (awaiting human approval)
    await gqlQuery(`
      mutation UpdateClaimUnderReview($id: Uuid!) {
        updateClaimsById(keyId: $id, updateColumns: { status: { set: "under_review" } }) {
          affectedRows
        }
      }
    `, { id: claimId });
  } catch (err) {
    console.error(`[Portal API] Pipeline failed for claim ${claimId}:`, err);

    // Persist error to pipeline status
    await updatePipelineStatus(claimId, "pipeline", "error",
      err instanceof Error ? err.message : String(err));

    // Mark claim as ERROR — "error" may not be in claim_statuses reference table,
    // so wrap in try/catch to avoid a secondary failure masking the real error
    try {
      await gqlQuery(`
        mutation UpdateClaimError($id: Uuid!) {
          updateClaimsById(keyId: $id, updateColumns: { status: { set: "error" } }) {
            affectedRows
          }
        }
      `, { id: claimId });
    } catch (updateErr) {
      console.warn(`[Portal API] Failed to mark claim ${claimId} as ERROR (status may not be in reference table):`, updateErr);
    }
  }
}

// ---------------------------------------------------------------------------
// Agent Runner — runs pi-mono agents in background pipeline
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

type PortalAgentType = "extraction" | "assessment" | "medical-necessity" | "pre-existing" | "image-forensics" | "fwa";

const AGENT_TIMEOUTS: Record<PortalAgentType, number> = {
  "extraction": 10 * 60_000,       // 10 min (PDF rendering + multiple docs)
  "assessment": 5 * 60_000,        // 5 min
  "medical-necessity": 5 * 60_000,
  "pre-existing": 5 * 60_000,
  "image-forensics": 5 * 60_000,   // 5 min (S3 download + forensics API per document)
  "fwa": 8 * 60_000,               // 8 min (cross-claim analysis)
};

const AGENT_TO_MODULE_KEY: Record<PortalAgentType, string> = {
  "extraction": "extraction",
  "assessment": "assessment",
  "medical-necessity": "medicalNecessity",
  "pre-existing": "preExisting",
  "image-forensics": "imageForensics",
  "fwa": "fwa",
};

const AGENT_MAX_TURNS: Record<PortalAgentType, number> = {
  "extraction": 25,
  "assessment": 15,
  "medical-necessity": 15,
  "pre-existing": 15,
  "image-forensics": 10,
  "fwa": 25,
};

function isRetryableError(message: string): boolean {
  const patterns = [
    "http2", "GOAWAY", "did not get a response", "socket hang up",
    "ECONNRESET", "ETIMEDOUT", "throttl", "Too many requests", "rate limit",
  ];
  return patterns.some(p => message.toLowerCase().includes(p.toLowerCase()));
}

async function runPortalAgent(
  agentType: PortalAgentType,
  claimId: string,
): Promise<void> {
  const MAX_RETRIES = 2; // 3 total attempts
  const BACKOFF_MS = [5_000, 10_000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await runPortalAgentOnce(agentType, claimId);
      return; // Success — exit retry loop
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt < MAX_RETRIES && isRetryableError(message)) {
        const delay = BACKOFF_MS[attempt] ?? 10_000;
        console.warn(
          `[Agent ${agentType}] Retryable error on attempt ${attempt + 1}/${MAX_RETRIES + 1} for claim ${claimId}: ${message}. Retrying in ${delay / 1000}s...`,
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // Retry with a fresh agent
      }

      // Non-retryable or out of retries
      if (attempt > 0) {
        console.error(`[Agent ${agentType}] All ${attempt + 1} attempts failed for claim ${claimId}`);
      }
      throw err;
    }
  }
}

async function runPortalAgentOnce(
  agentType: PortalAgentType,
  claimId: string,
): Promise<void> {
  const timeoutMs = AGENT_TIMEOUTS[agentType];
  const maxTurns = AGENT_MAX_TURNS[agentType];
  const moduleKey = AGENT_TO_MODULE_KEY[agentType];
  const moduleStartedAt = new Date().toISOString();

  // Diagnostics state — updated by the event subscriber
  let lastEventType = "none";
  let lastEventTime = Date.now();
  let lastToolName = "none";
  let lastStopReason = "";
  let lastErrorMessage = "";
  let turnCount = 0;

  try {
    // Lazy import the appropriate agent
    const agentModule: Record<string, unknown> = await import(`../../../agents/portal-${agentType}/agent.ts`);
    const createAgent = agentModule.createPortalAgent ?? agentModule.default;

    if (typeof createAgent !== "function") {
      throw new Error(`Agent module portal-${agentType} does not export a factory function`);
    }

    const agent = await createAgent(claimId);

    // Subscribe to agent events for logging + diagnostics
    agent.subscribe((event: { type: string; [key: string]: unknown }) => {
      lastEventType = event.type;
      lastEventTime = Date.now();

      switch (event.type) {
        case "agent_start":
          console.log(`[Agent ${agentType}] Agent loop started for claim ${claimId}`);
          break;
        case "message_start": {
          const role = (event.message as { role?: string } | undefined)?.role ?? "?";
          console.log(`[Agent ${agentType}] Message start: role=${role}`);
          break;
        }
        case "tool_execution_start":
          lastToolName = String(event.toolName ?? "unknown");
          console.log(`[Agent ${agentType}] Tool start: ${lastToolName}`);
          updatePipelineStatus(claimId, moduleKey, "running", undefined, undefined, {
            turnCount, maxTurns, currentTool: lastToolName, startedAt: moduleStartedAt,
          }).catch(() => {});
          break;
        case "tool_execution_end": {
          const result = event.result as { content?: Array<{ type: string }>, isError?: boolean } | undefined;
          console.log(`[Agent ${agentType}] Tool end: ${event.toolName}, isError: ${result?.isError ?? false}, content types: ${JSON.stringify(result?.content?.map(c => c.type))}`);
          break;
        }
        case "turn_end": {
          turnCount++;
          const msg = event.message as { stopReason?: string; errorMessage?: string } | undefined;
          lastStopReason = msg?.stopReason ?? "";
          lastErrorMessage = msg?.errorMessage ?? "";
          console.log(`[Agent ${agentType}] Turn ${turnCount}/${maxTurns} end, stopReason: ${lastStopReason || "?"}${lastErrorMessage ? `, error: ${lastErrorMessage}` : ""}`);
          if (turnCount >= maxTurns) {
            console.error(`[Agent ${agentType}] Max turns (${maxTurns}) reached for claim ${claimId} — aborting`);
            agent.abort();
          }
          break;
        }
        case "agent_end":
          console.log(`[Agent ${agentType}] Agent loop ended after ${turnCount} turns`);
          break;
      }
    });

    // Run the agent with a timeout safety net
    console.log(`[Agent ${agentType}] Starting for claim ${claimId} (timeout: ${timeoutMs / 1000}s, maxTurns: ${maxTurns})`);
    await agent.prompt(`Process claim ${claimId}`);

    await withTimeout(
      agent.waitForIdle(),
      timeoutMs,
      () => {
        const elapsed = Math.round((Date.now() - lastEventTime) / 1000);
        const msg = `Agent ${agentType} timed out after ${timeoutMs / 1000}s for claim ${claimId}. ` +
          `Last event: ${lastEventType} (${elapsed}s ago), last tool: ${lastToolName}, turns: ${turnCount}/${maxTurns}`;
        console.error(`[Agent ${agentType}] ${msg}`);
        // Best-effort abort so the agent loop doesn't leak
        try { agent.abort(); } catch { /* ignore */ }
        return new Error(msg);
      },
    );

    // pi-agent-core resolves waitForIdle() even when the agent errors out.
    // Detect this by checking if the last turn ended with stopReason "error".
    if (lastStopReason === "error") {
      throw new Error(
        `Agent ${agentType} ended with error after ${turnCount} turns for claim ${claimId}: ${lastErrorMessage || "unknown error"}`,
      );
    }

    console.log(`[Agent ${agentType}] Finished for claim ${claimId} in ${turnCount} turns`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown agent error";
    const stack = err instanceof Error ? err.stack : "";
    console.error(`[Portal API] Agent ${agentType} failed for claim ${claimId}:`, message, stack);
    throw err; // Re-throw so pipeline/retry can handle
  }
}

export default portal;
