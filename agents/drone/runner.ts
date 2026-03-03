import { WebClient } from "@slack/web-api";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../shared/graphql-client.ts";
import { createDroneAgent } from "./agent.ts";
import { fetchDroneEligibleClaims, fetchPolicyDocEligibleClaims } from "./eligibility.ts";

const slackClient = new WebClient(process.env.SLACK_TOKEN);
const SLACK_CHANNEL = "C0A9MDAUR6Y";

// ============================================================================
// Fast Compliance Pre-Check (no LLM — pure GraphQL + deterministic logic)
// ============================================================================

const DOCUMENT_REQUIREMENTS: Record<string, { required: string[] }> = {
  OutPatient: { required: ["PrescriptionPaper", "InvoicePaper"] },
  InPatient: { required: ["DischargePaper", "InvoicePaper", "PrescriptionPaper"] },
  Dental: { required: ["DentalTreatmentProof", "InvoicePaper"] },
  Maternity: { required: ["MedicalRecord", "InvoicePaper"] },
  Accident: { required: ["AccidentProof", "InvoicePaper"] },
  Life: { required: ["DeathCertificate", "MedicalRecord"] },
  Others: { required: ["OtherPaper"] },
};

const CompliancePreCheckQuery = graphql(`
  query DroneCompliancePreCheck($claimNumber: String1!) {
    claims(where: { claimNumber: { _eq: $claimNumber }, deletedAt: { _is_null: true } }, limit: 1) {
      id
      claimDocuments(where: { deletedAt: { _is_null: true } }) {
        documentType
      }
    }
  }
`);

/**
 * Fast compliance pre-check: ~50ms GraphQL query + deterministic logic.
 * Returns null if compliant, or a message string if non-compliant.
 * Note: Drone only processes OutPatient claims (filtered at eligibility stage),
 * so we hardcode OutPatient document requirements here.
 */
async function fastComplianceCheck(claimCode: string): Promise<string | null> {
  const { data } = await getClient().query({
    query: CompliancePreCheckQuery,
    variables: { claimNumber: claimCode },
  });

  const claim = data?.claims?.[0];
  if (!claim) return "Claim not found";

  // Drone only processes OutPatient claims — hardcode the benefit type
  const benefitType = "OutPatient";

  const requirements = DOCUMENT_REQUIREMENTS[benefitType];
  if (!requirements) return null; // Unknown benefit type — let agent handle

  const presentTypes = claim.claimDocuments.map((d) => String(d.documentType));
  const missing = requirements.required.filter((t) => !presentTypes.includes(t));

  if (missing.length > 0) {
    return `Compliance failed — missing required documents: ${missing.join(", ")}`;
  }

  return null; // Compliant
}

// ============================================================================
// Drone State
// ============================================================================

export interface DroneError {
  claimCode: string;
  error: string;
  timestamp: string;
}

export interface DroneState {
  isRunning: boolean;
  startedAt: string | null;
  processedCount: number;
  successCount: number;
  deniedCount: number;
  errorCount: number;
  skippedCount: number;
  currentClaimCode: string | null;
  lastPollAt: string | null;
  errors: DroneError[];
  config: {
    batchSize: number;
    pollIntervalMs: number;
    maxBackoffMs: number;
    mode?: "tier" | "policy-doc";
  };
}

let state: DroneState = {
  isRunning: false,
  startedAt: null,
  processedCount: 0,
  successCount: 0,
  deniedCount: 0,
  errorCount: 0,
  skippedCount: 0,
  currentClaimCode: null,
  lastPollAt: null,
  errors: [],
  config: {
    batchSize: 5,
    pollIntervalMs: 30_000,
    maxBackoffMs: 300_000,
  },
};

let abortController: AbortController | null = null;

export function getDroneState(): DroneState {
  return { ...state, errors: [...state.errors] };
}

// ============================================================================
// Circuit Breaker
// ============================================================================

let consecutiveErrors = 0;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_PAUSE_MS = 300_000; // 5 minutes

// ============================================================================
// Helpers
// ============================================================================

function addError(claimCode: string, error: string) {
  state.errors.push({ claimCode, error, timestamp: new Date().toISOString() });
  if (state.errors.length > 20) {
    state.errors = state.errors.slice(-20);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function notifySlack(text: string) {
  try {
    await slackClient.chat.postMessage({ channel: SLACK_CHANNEL, text: `[Drone] ${text}` });
  } catch (err) {
    console.error("[Drone] Slack notification failed:", err);
  }
}

// ============================================================================
// Result Extraction
// ============================================================================

interface DroneResult {
  status: "success" | "denied" | "error" | "skipped";
  message?: string;
}

interface ToolTracker {
  calledTools: Set<string>;
  toolErrors: Map<string, string>;
  complianceNotCompliant: boolean;
  assessBenefitDenial: boolean;
}

/**
 * Determine drone result from event-based tool tracking.
 */
function extractDroneResultFromTracker(tracker: ToolTracker): DroneResult {
  const hasAssessBenefit = tracker.calledTools.has("assessBenefit");
  const hasCreateSignOff = tracker.calledTools.has("createSignOff");
  const hasCompliance = tracker.calledTools.has("invokeComplianceAgent");

  // Success: BOTH assessBenefit AND createSignOff were called
  // Check this BEFORE errors — agent may have retried after a transient error
  if (hasAssessBenefit && hasCreateSignOff) {
    return { status: "success" };
  }

  // Check for assessBenefit errors (only if workflow didn't complete)
  const assessError = tracker.toolErrors.get("assessBenefit");
  if (assessError) {
    return { status: "error", message: `assessBenefit error: ${assessError}` };
  }

  // createSignOff without assessBenefit — agent skipped assessment (e.g. compliance failure)
  if (hasCreateSignOff && !hasAssessBenefit) {
    return { status: "skipped", message: "Sign-off created without benefit assessment — likely compliance failure" };
  }

  // assessBenefit called but no createSignOff — likely denial or stopped early
  if (hasAssessBenefit && !hasCreateSignOff) {
    return { status: "denied", message: "Claim assessed but no sign-off created — left for human review" };
  }

  // Compliance failed — agent correctly skipped assessment
  if (!hasAssessBenefit && hasCompliance && tracker.complianceNotCompliant) {
    return { status: "skipped", message: "Compliance failed — missing required documents" };
  }

  // Compliance ran but compliant flag wasn't parsed — still treat as skipped if no assessment
  if (!hasAssessBenefit && hasCompliance) {
    return { status: "skipped", message: "Compliance checked but assessment not performed" };
  }

  if (!hasAssessBenefit) {
    return { status: "error", message: "Agent completed without calling assessBenefit" };
  }

  return { status: "error", message: "Agent completed in unexpected state" };
}

// ============================================================================
// Single Claim Processing (fully autonomous, no approval loop)
// ============================================================================

const AGENT_TIMEOUT_MS = 600_000; // 10 minutes
const MAX_TOOL_CALLS = 40; // Safety limit
const BEDROCK_RETRY_MAX = 3; // Retry up to 2 times on transient Bedrock failures (0 tool calls)

/**
 * Run the drone agent for a single claim and return the tool tracker + tool call count.
 * Extracted so the caller can retry on transient Bedrock failures.
 */
async function runDroneAgent(
  claimCode: string,
  attempt: number,
  options?: { tier?: 1 | 2; mode?: "tier" | "policy-doc" },
): Promise<{ tracker: ToolTracker; toolCallCount: number }> {
  const toolTracker: ToolTracker = {
    calledTools: new Set<string>(),
    toolErrors: new Map<string, string>(),
    complianceNotCompliant: false,
    assessBenefitDenial: false,
  };
  let toolCallCount = 0;

  let agent: Awaited<ReturnType<typeof createDroneAgent>> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  const overallStart = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      const elapsed = Math.round((Date.now() - overallStart) / 1000);
      console.warn(`[Drone] ${claimCode} overall timeout after ${elapsed}s, aborting`);
      agent?.abort();
      reject(new Error("DRONE_AGENT_TIMEOUT"));
    }, AGENT_TIMEOUT_MS);
  });

  const workPromise = (async () => {
    const agentStart = Date.now();
    const tag = attempt > 1 ? ` (retry #${attempt - 1})` : "";
    console.log(`[Drone] ${claimCode} creating agent...${tag}`);
    agent = await createDroneAgent(claimCode, { skipCompliance: true, tier: options?.tier, mode: options?.mode });
    console.log(`[Drone] ${claimCode} agent created in ${Date.now() - agentStart}ms`);

    agent.subscribe((e) => {
      switch (e.type) {
        case "tool_execution_start":
          toolCallCount++;
          console.log(`[Drone] ${claimCode} tool start [${toolCallCount}/${MAX_TOOL_CALLS}]: ${e.toolName}`);
          toolTracker.calledTools.add(e.toolName);
          if (toolCallCount >= MAX_TOOL_CALLS) {
            console.warn(`[Drone] ${claimCode} exceeded max tool calls (${MAX_TOOL_CALLS}), aborting`);
            agent!.abort();
          }
          break;
        case "tool_execution_end": {
          console.log(`[Drone] ${claimCode} tool end: ${e.toolName} (error=${e.isError})`);
          if (e.isError) {
            let errMsg = "Tool returned error";
            try {
              const res = e.result as any;
              if (res?.content?.[0]?.text) errMsg = res.content[0].text;
              else if (res?.message) errMsg = res.message;
              else if (typeof res === "string") errMsg = res;
            } catch { /* use default */ }
            console.error(`[Drone] ${claimCode} tool ${e.toolName} error:`, errMsg);
            toolTracker.toolErrors.set(e.toolName, errMsg);
          } else {
            toolTracker.toolErrors.delete(e.toolName);
          }
          if (e.toolName === "invokeComplianceAgent" && !e.isError && e.result) {
            try {
              const textContent = (e.result as any)?.content?.find?.((c: any) => c.type === "text");
              if (textContent?.text) {
                const parsed = JSON.parse(textContent.text);
                if (parsed?.compliant === false) {
                  toolTracker.complianceNotCompliant = true;
                }
              }
            } catch { /* ignore parse errors */ }
          }
          if (e.toolName === "assessBenefit" && !e.isError && e.result) {
            try {
              const textContent = (e.result as any)?.content?.find?.((c: any) => c.type === "text");
              if (textContent?.text) {
                const parsed = JSON.parse(textContent.text);
                const mutation = parsed?.createUpdateClaimDetail;
                if (mutation?.error) {
                  toolTracker.toolErrors.set("assessBenefit", `${mutation.error.code}: ${mutation.error.message}`);
                }
                if (mutation?.claimCaseDetailId === null) {
                  toolTracker.toolErrors.set("assessBenefit", "No claimCaseDetailId returned");
                }
              }
            } catch { /* ignore parse errors */ }
          }
          break;
        }
      }
    });

    const promptStart = Date.now();
    console.log(`[Drone] ${claimCode} running agent.prompt()...`);
    await agent.prompt(claimCode);
    console.log(`[Drone] ${claimCode} agent completed in ${Date.now() - promptStart}ms`);
  })();

  try {
    await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }

  const elapsed = Math.round((Date.now() - overallStart) / 1000);
  console.log(`[Drone] ${claimCode} total: ${elapsed}s, tools: ${[...toolTracker.calledTools].join(", ")}`);

  return { tracker: toolTracker, toolCallCount };
}

export async function processDroneClaim(
  claimCaseId: string,
  claimCode: string,
  options?: { tier?: 1 | 2; mode?: "tier" | "policy-doc" },
): Promise<{ status: "success" | "error" | "skipped" | "denied"; message?: string }> {
  // Skip if claim already has human-assessed benefits (don't override human work)
  // Check if claim status indicates it's already been assessed or has an approved amount
  const { data: detailData } = await getClient().query({
    query: graphql(`
      query DroneCheckExistingAssessment($claimCaseId: Uuid!) {
        claimsById(id: $claimCaseId) {
          id
          status
          amountApproved
        }
      }
    `),
    variables: { claimCaseId },
    fetchPolicy: "no-cache",
  });
  const assessedStatuses = ["assessed", "approved", "settled", "paid", "rejected"];
  const existingClaim = detailData?.claimsById;
  if (existingClaim && (assessedStatuses.includes(existingClaim.status ?? "") || existingClaim.amountApproved != null)) {
    return { status: "skipped", message: "Claim already has assessed benefits — not overriding" };
  }

  // ── Fast compliance pre-check (no LLM, ~50ms) ──────────────────────
  const complianceStart = Date.now();
  const complianceFail = await fastComplianceCheck(claimCode);
  console.log(`[Drone] ${claimCode} compliance pre-check: ${complianceFail ? "FAIL" : "PASS"} (${Date.now() - complianceStart}ms)`);

  if (complianceFail) {
    return { status: "skipped", message: complianceFail };
  }

  // ── Check policy exists (required for balance & assessBenefit) ──
  const { data: policyData } = await getClient().query({
    query: graphql(`
      query DroneCheckPolicy($claimCaseId: Uuid!) {
        claimsById(id: $claimCaseId) {
          policyId
        }
      }
    `),
    variables: { claimCaseId },
    fetchPolicy: "no-cache",
  });
  const policyId = policyData?.claimsById?.policyId;
  if (!policyId) {
    console.log(`[Drone] ${claimCode} skipped: no linked policy`);
    return { status: "skipped", message: "No linked policy — cannot assess benefit balance" };
  }

  try {
    // Run agent with retry on transient Bedrock failures (0 tool calls = silent stream error)
    for (let attempt = 1; attempt <= BEDROCK_RETRY_MAX; attempt++) {
      const { tracker, toolCallCount } = await runDroneAgent(claimCode, attempt, { tier: options?.tier, mode: options?.mode });

      // Transient Bedrock failure: agent completed instantly with 0 tool calls.
      // Retry once with a fresh agent — the next request usually succeeds.
      if (toolCallCount === 0 && attempt < BEDROCK_RETRY_MAX) {
        console.warn(`[Drone] ${claimCode} completed with 0 tool calls (transient Bedrock failure), retrying (${attempt}/${BEDROCK_RETRY_MAX})...`);
        await new Promise((r) => setTimeout(r, attempt * 3000)); // Increasing backoff
        continue;
      }

      return extractDroneResultFromTracker(tracker);
    }

    // Should not reach here, but just in case
    return { status: "error", message: "Exhausted retries" };
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === "DRONE_AGENT_TIMEOUT";
    const msg = isTimeout
      ? `Agent timed out after ${AGENT_TIMEOUT_MS / 1000}s`
      : (error instanceof Error ? error.message : "Unknown error");

    console.error(`[Drone] ${claimCode} ${isTimeout ? "timeout" : "error"}:`, error);
    return { status: "error", message: msg };
  }
}

// ============================================================================
// Main Loop
// ============================================================================

export async function startDrone(config?: {
  batchSize?: number;
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  mode?: "tier" | "policy-doc";
}): Promise<void> {
  if (state.isRunning) {
    console.warn("[Drone] Already running");
    return;
  }

  // Reset state
  state = {
    isRunning: true,
    startedAt: new Date().toISOString(),
    processedCount: 0,
    successCount: 0,
    deniedCount: 0,
    errorCount: 0,
    skippedCount: 0,
    currentClaimCode: null,
    lastPollAt: null,
    errors: [],
    config: {
      batchSize: config?.batchSize ?? 5,
      pollIntervalMs: config?.pollIntervalMs ?? 30_000,
      maxBackoffMs: config?.maxBackoffMs ?? 300_000,
      mode: config?.mode,
    },
  };

  consecutiveErrors = 0;
  abortController = new AbortController();
  const signal = abortController.signal;

  console.log(`[Drone] Starting with config:`, state.config);
  notifySlack(`Started — batchSize=${state.config.batchSize}, pollInterval=${state.config.pollIntervalMs}ms`);

  let currentBackoff = state.config.pollIntervalMs;

  // Infinite loop
  while (!signal.aborted) {
    try {
      state.lastPollAt = new Date().toISOString();

      // Fetch eligible claims
      console.log(`[Drone] Polling for eligible claims (mode=${state.config.mode ?? "tier"})...`);
      const eligibleClaims = state.config.mode === "policy-doc"
        ? await fetchPolicyDocEligibleClaims(state.config.batchSize)
        : await fetchDroneEligibleClaims(state.config.batchSize);

      if (eligibleClaims.length === 0) {
        // Exponential backoff when no claims
        console.log(`[Drone] No eligible claims, backing off ${currentBackoff}ms`);
        await sleep(currentBackoff, signal);
        currentBackoff = Math.min(currentBackoff * 2, state.config.maxBackoffMs);
        continue;
      }

      // Reset backoff on finding claims
      currentBackoff = state.config.pollIntervalMs;

      // Process sequentially
      for (const claim of eligibleClaims) {
        if (signal.aborted) break;

        state.currentClaimCode = claim.code;
        console.log(`[Drone] Processing ${claim.code} (${claim.id})`);

        try {
          const result = await processDroneClaim(claim.id, claim.code, { mode: state.config.mode });
          state.processedCount++;

          switch (result.status) {
            case "success":
              state.successCount++;
              consecutiveErrors = 0;
              notifySlack(`Assessed ${claim.code}`);
              break;
            case "denied":
              state.deniedCount++;
              consecutiveErrors = 0;
              notifySlack(`Denied ${claim.code}: ${result.message}`);
              break;
            case "skipped":
              state.skippedCount++;
              consecutiveErrors = 0;
              console.log(`[Drone] Skipped ${claim.code}: ${result.message}`);
              break;
            case "error":
              state.errorCount++;
              consecutiveErrors++;
              addError(claim.code, result.message ?? "Unknown error");
              notifySlack(`Error on ${claim.code}: ${result.message}`);
              break;
          }
        } catch (error) {
          state.processedCount++;
          state.errorCount++;
          consecutiveErrors++;
          const msg = error instanceof Error ? error.message : "Unknown error";
          addError(claim.code, msg);
          console.error(`[Drone] Fatal error processing ${claim.code}:`, error);
          notifySlack(`Fatal error on ${claim.code}: ${msg}`);
        }

        // Circuit breaker
        if (consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
          console.error(`[Drone] Circuit breaker triggered (${consecutiveErrors} consecutive errors), pausing ${CIRCUIT_BREAKER_PAUSE_MS}ms`);
          notifySlack(`Circuit breaker triggered! ${consecutiveErrors} consecutive errors. Pausing 5 minutes.`);
          await sleep(CIRCUIT_BREAKER_PAUSE_MS, signal);
          consecutiveErrors = 0;
        }

        state.currentClaimCode = null;
      }

      // Short pause between batches
      await sleep(state.config.pollIntervalMs, signal);
    } catch (error) {
      console.error("[Drone] Loop error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      addError("LOOP", msg);
      notifySlack(`Loop error: ${msg}`);
      await sleep(state.config.pollIntervalMs, signal);
    }
  }

  // Shutdown
  state.isRunning = false;
  state.currentClaimCode = null;
  console.log("[Drone] Stopped");
  notifySlack(
    `Stopped — processed=${state.processedCount}, success=${state.successCount}, denied=${state.deniedCount}, errors=${state.errorCount}, skipped=${state.skippedCount}`,
  );
}

export function stopDrone(): void {
  if (!state.isRunning) {
    console.warn("[Drone] Not running");
    return;
  }
  console.log("[Drone] Stopping...");
  abortController?.abort();
}
