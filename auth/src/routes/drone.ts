import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { EventEmitter } from "node:events";
import { requireAuth, requireAdmin } from "../middleware.ts";
import {
  createDroneRun,
  recordDroneResult,
  updateDroneRunProgress,
  completeDroneRun,
  listDroneRuns,
  getDroneRunById,
  listDroneRunResults,
  listDroneSchedules,
  createDroneSchedule,
  updateDroneSchedule,
  softDeleteDroneSchedule,
  getDroneStats,
} from "../../../agents/drone/persistence.ts";
import { processDroneClaim } from "../../../agents/drone/runner.ts";
import {
  fetchDroneEligibleClaims,
} from "../../../agents/drone/eligibility.ts";
import type { DroneTier } from "../../../agents/drone/eligibility.ts";

// ---------------------------------------------------------------------------
// SSE Event Emitter Registry
// ---------------------------------------------------------------------------

interface DroneSSEEvent {
  type: "run_started" | "claim_started" | "claim_completed" | "run_completed";
  runId: string;
  claimCode?: string;
  claimStatus?: string;
  message?: string;
  processed?: number;
  total?: number;
}

/** In-memory map of active run event emitters for SSE streaming. */
const activeRunEmitters = new Map<string, EventEmitter>();

/** Active abort controllers for cancellation. */
const activeRunAbortControllers = new Map<string, AbortController>();

function getOrCreateEmitter(runId: string): EventEmitter {
  let emitter = activeRunEmitters.get(runId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    activeRunEmitters.set(runId, emitter);
  }
  return emitter;
}

function cleanupEmitter(runId: string): void {
  const emitter = activeRunEmitters.get(runId);
  if (emitter) {
    emitter.removeAllListeners();
    activeRunEmitters.delete(runId);
  }
  activeRunAbortControllers.delete(runId);
}

function emitRunEvent(runId: string, event: DroneSSEEvent): void {
  const emitter = activeRunEmitters.get(runId);
  if (emitter) {
    emitter.emit("event", event);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const drone = new Hono();

// All drone routes require auth + admin
drone.use("/drone/*", requireAuth, requireAdmin);

// ── GET /drone/runs — List drone runs (paginated) ───────────────────────────

drone.get("/drone/runs", async (c) => {
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || c.req.query("limit") || "20", 10);

  try {
    const result = await listDroneRuns(page, pageSize);
    return c.json({
      data: result.runs,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    console.error("[Drone API] Error listing runs:", err);
    return c.json({ error: "Failed to list drone runs" }, 500);
  }
});

// ── POST /drone/runs — Start a new drone run ────────────────────────────────

drone.post("/drone/runs", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json<{
      tier: DroneTier;
      batchSize: number;
      claimCodes?: string[];
      claimCaseIds?: string[];
    }>();

    if (!body.tier || ![1, 2].includes(body.tier)) {
      return c.json({ error: "tier must be 1 or 2" }, 400);
    }

    if (!body.batchSize || body.batchSize < 1 || body.batchSize > 500) {
      return c.json({ error: "batchSize must be between 1 and 500" }, 400);
    }

    // Determine which claims to process
    let claimsToProcess: { id: string; code: string }[];

    // Accept both claimCodes and claimCaseIds from frontend
    const specificIds = body.claimCaseIds ?? body.claimCodes;

    if (specificIds && specificIds.length > 0) {
      claimsToProcess = specificIds.map((idOrCode) => ({ id: idOrCode, code: idOrCode }));
    } else {
      claimsToProcess = await fetchDroneEligibleClaims(body.batchSize, body.tier);
    }

    if (claimsToProcess.length === 0) {
      return c.json({ error: "No eligible claims found for the given tier" }, 404);
    }

    // Create the run record
    const runId = await createDroneRun({
      runType: specificIds ? "manual" : "manual",
      tier: body.tier,
      batchSize: body.batchSize,
      totalClaims: claimsToProcess.length,
      triggeredBy: user.sub,
    });

    // Set up abort controller for cancellation
    const abortController = new AbortController();
    activeRunAbortControllers.set(runId, abortController);

    // Fire-and-forget: process claims in the background
    processRunInBackground(runId, claimsToProcess, body.tier, abortController.signal);

    // Return shape matching DroneRun (frontend expects .id)
    return c.json({ id: runId, runId, totalClaims: claimsToProcess.length }, 201);
  } catch (err) {
    console.error("[Drone] Start run failed:", (err as Error).message);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

// ── GET /drone/runs/:id — Get run details ───────────────────────────────────

drone.get("/drone/runs/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const run = await getDroneRunById(id);
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }
    return c.json(run);
  } catch (err) {
    console.error("[Drone API] Error fetching run:", err);
    return c.json({ error: "Failed to fetch drone run" }, 500);
  }
});

// ── GET /drone/runs/:id/results — Get run results (paginated) ───────────────

drone.get("/drone/runs/:id/results", async (c) => {
  const id = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || c.req.query("limit") || "100", 10);

  try {
    const result = await listDroneRunResults(id, page, pageSize);
    return c.json({
      data: result.results,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    console.error("[Drone API] Error fetching run results:", err);
    return c.json({ error: "Failed to fetch run results" }, 500);
  }
});

// ── GET /drone/runs/:id/stream — SSE stream for real-time progress ──────────

drone.get("/drone/runs/:id/stream", async (c) => {
  try {
    const id = c.req.param("id");

    const run = await getDroneRunById(id);
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return streamSSE(c, async (stream) => {
      const emitter = getOrCreateEmitter(id);

      const onEvent = (event: DroneSSEEvent) => {
        stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        }).catch(() => {
          // Client disconnected
        });
      };

      emitter.on("event", onEvent);

      c.req.raw.signal.addEventListener("abort", () => {
        emitter.off("event", onEvent);
      });

      await new Promise<void>((resolve) => {
        const onComplete = (event: DroneSSEEvent) => {
          if (event.type === "run_completed") {
            emitter.off("event", onComplete);
            setTimeout(resolve, 100);
          }
        };
        emitter.on("event", onComplete);

        c.req.raw.signal.addEventListener("abort", () => {
          emitter.off("event", onComplete);
          resolve();
        });
      });
    });
  } catch (err) {
    console.error("[Drone] Stream run progress failed:", (err as Error).message);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

// ── POST /drone/runs/:id/cancel — Cancel a running drone run ────────────────

drone.post("/drone/runs/:id/cancel", async (c) => {
  try {
    const id = c.req.param("id");

    const run = await getDroneRunById(id);
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    if (run.status !== "running") {
      return c.json({ error: "Run is not currently running" }, 400);
    }

    const abortController = activeRunAbortControllers.get(id);
    if (abortController) {
      abortController.abort();
    }

    return c.json({ success: true, message: "Run cancellation requested" });
  } catch (err) {
    console.error("[Drone] Cancel run failed:", (err as Error).message);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

// Keep DELETE as alias for backward compatibility
drone.delete("/drone/runs/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const run = await getDroneRunById(id);
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }
    if (run.status !== "running") {
      return c.json({ error: "Run is not currently running" }, 400);
    }
    const abortController = activeRunAbortControllers.get(id);
    if (abortController) {
      abortController.abort();
    }
    return c.json({ success: true, message: "Run cancellation requested" });
  } catch (err) {
    console.error("[Drone] Cancel run (DELETE) failed:", (err as Error).message);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

// ── GET /drone/eligible — Preview eligible claims ───────────────────────────

drone.get("/drone/eligible", async (c) => {
  const tier = parseInt(c.req.query("tier") || "1", 10) as DroneTier;
  const batchSize = parseInt(c.req.query("batchSize") || "20", 10);

  if (![1, 2].includes(tier)) {
    return c.json({ error: "tier must be 1 or 2" }, 400);
  }

  try {
    const eligible = await fetchDroneEligibleClaims(batchSize, tier);
    // Map to frontend's expected shape
    const data = eligible.map((claim) => ({
      claimCaseId: claim.id,
      claimCode: claim.code,
      benefitType: claim.benefitType ?? "OutPatient",
      icdCodes: claim.icdCodes ?? [],
    }));
    return c.json({ data });
  } catch (err) {
    console.error("[Drone API] Error fetching eligible claims:", err);
    return c.json({ error: "Failed to fetch eligible claims" }, 500);
  }
});

// Keep POST as alias for backward compatibility
drone.post("/drone/eligible", async (c) => {
  try {
    const body = await c.req.json<{ tier: DroneTier; batchSize?: number }>();

    if (!body.tier || ![1, 2].includes(body.tier)) {
      return c.json({ error: "tier must be 1 or 2" }, 400);
    }

    const eligible = await fetchDroneEligibleClaims(body.batchSize ?? 20, body.tier);
    const data = eligible.map((claim) => ({
      claimCaseId: claim.id,
      claimCode: claim.code,
      benefitType: claim.benefitType ?? "OutPatient",
      icdCodes: claim.icdCodes ?? [],
    }));
    return c.json({ data });
  } catch (err) {
    console.error("[Drone] Fetch eligible claims (POST) failed:", (err as Error).message);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

// ── GET /drone/schedules — List schedules ───────────────────────────────────

drone.get("/drone/schedules", async (c) => {
  try {
    const schedules = await listDroneSchedules();
    return c.json({ data: schedules });
  } catch (err) {
    console.error("[Drone API] Error listing schedules:", err);
    return c.json({ error: "Failed to list schedules" }, 500);
  }
});

// ── POST /drone/schedules — Create schedule ─────────────────────────────────

drone.post("/drone/schedules", async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      description?: string;
      tier: number;
      batchSize: number;
      cronExpression: string;
      timezone?: string;
      slackChannel?: string;
    }>();

    if (!body.name || !body.cronExpression) {
      return c.json({ error: "name and cronExpression are required" }, 400);
    }

    if (!body.tier || ![1, 2].includes(body.tier)) {
      return c.json({ error: "tier must be 1 or 2" }, 400);
    }

    if (!body.batchSize || body.batchSize < 1 || body.batchSize > 100) {
      return c.json({ error: "batchSize must be between 1 and 100" }, 400);
    }

    const id = await createDroneSchedule({
      name: body.name,
      description: body.description,
      tier: body.tier,
      batchSize: body.batchSize,
      cronExpression: body.cronExpression,
      timezone: body.timezone,
      slackChannel: body.slackChannel,
    });
    return c.json({ id }, 201);
  } catch (err) {
    console.error("[Drone] Create schedule failed:", (err as Error).message);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

// ── PUT /drone/schedules/:id — Update schedule ──────────────────────────────

drone.put("/drone/schedules/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{
      name?: string;
      description?: string;
      tier?: number;
      batchSize?: number;
      cronExpression?: string;
      timezone?: string;
      slackChannel?: string;
      enabled?: boolean;
    }>();

    if (body.tier !== undefined && ![1, 2].includes(body.tier)) {
      return c.json({ error: "tier must be 1 or 2" }, 400);
    }

    if (body.batchSize !== undefined && (body.batchSize < 1 || body.batchSize > 100)) {
      return c.json({ error: "batchSize must be between 1 and 100" }, 400);
    }

    await updateDroneSchedule(id, body);
    return c.json({ success: true });
  } catch (err) {
    console.error("[Drone] Update schedule failed:", (err as Error).message);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

// ── DELETE /drone/schedules/:id — Soft-delete schedule ──────────────────────

drone.delete("/drone/schedules/:id", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");

    await softDeleteDroneSchedule(id, user.sub);
    return c.json({ success: true });
  } catch (err) {
    console.error("[Drone] Delete schedule failed:", (err as Error).message);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

// ── GET /drone/stats — Aggregate stats ──────────────────────────────────────

drone.get("/drone/stats", async (c) => {
  try {
    const stats = await getDroneStats();
    return c.json(stats);
  } catch (err) {
    console.error("[Drone API] Error fetching stats:", err);
    return c.json({ error: "Failed to fetch drone stats" }, 500);
  }
});

// ---------------------------------------------------------------------------
// Background Processing
// ---------------------------------------------------------------------------

async function processRunInBackground(
  runId: string,
  claims: { id: string; code: string }[],
  tier: DroneTier,
  signal: AbortSignal,
): Promise<void> {
  const startTime = Date.now();
  const counts = {
    processedCount: 0,
    successCount: 0,
    deniedCount: 0,
    errorCount: 0,
    skippedCount: 0,
  };

  emitRunEvent(runId, {
    type: "run_started",
    runId,
    processed: 0,
    total: claims.length,
  });

  try {
    for (const claim of claims) {
      if (signal.aborted) {
        console.log(`[Drone API] Run ${runId} cancelled`);
        break;
      }

      emitRunEvent(runId, {
        type: "claim_started",
        runId,
        claimCode: claim.code,
        processed: counts.processedCount,
        total: claims.length,
      });

      const claimStart = Date.now();

      try {
        const result = await processDroneClaim(claim.id, claim.code, { tier });
        const durationMs = Date.now() - claimStart;

        counts.processedCount++;

        switch (result.status) {
          case "success":
            counts.successCount++;
            break;
          case "denied":
            counts.deniedCount++;
            break;
          case "error":
            counts.errorCount++;
            break;
          case "skipped":
            counts.skippedCount++;
            break;
        }

        await recordDroneResult(runId, {
          claimCode: claim.code,
          claimCaseId: claim.id,
          tier,
          status: result.status,
          message: result.message,
          durationMs,
        }).catch((err) => {
          console.error(`[Drone API] Failed to record result for ${claim.code}:`, err);
        });

        await updateDroneRunProgress(runId, counts).catch((err) => {
          console.error(`[Drone API] Failed to update run progress:`, err);
        });

        // Use claimStatus field to match frontend SSE event type
        emitRunEvent(runId, {
          type: "claim_completed",
          runId,
          claimCode: claim.code,
          claimStatus: result.status,
          message: result.message,
          processed: counts.processedCount,
          total: claims.length,
        });
      } catch (err) {
        const durationMs = Date.now() - claimStart;
        counts.processedCount++;
        counts.errorCount++;

        const errorMsg = err instanceof Error ? err.message : "Unknown error";

        await recordDroneResult(runId, {
          claimCode: claim.code,
          claimCaseId: claim.id,
          tier,
          status: "error",
          message: errorMsg,
          durationMs,
        }).catch((recordErr) => {
          console.error(`[Drone API] Failed to record error result for ${claim.code}:`, recordErr);
        });

        await updateDroneRunProgress(runId, counts).catch((updateErr) => {
          console.error(`[Drone API] Failed to update run progress:`, updateErr);
        });

        emitRunEvent(runId, {
          type: "claim_completed",
          runId,
          claimCode: claim.code,
          claimStatus: "error",
          message: errorMsg,
          processed: counts.processedCount,
          total: claims.length,
        });

        console.error(`[Drone API] Error processing ${claim.code}:`, err);
      }
    }

    const durationMs = Date.now() - startTime;
    const finalStatus = signal.aborted ? "cancelled" : "completed";

    await completeDroneRun(runId, finalStatus, durationMs).catch((err) => {
      console.error(`[Drone API] Failed to complete run ${runId}:`, err);
    });

    emitRunEvent(runId, {
      type: "run_completed",
      runId,
      claimStatus: finalStatus,
      processed: counts.processedCount,
      total: claims.length,
    });
  } catch (err) {
    console.error(`[Drone API] Fatal error in run ${runId}:`, err);

    const durationMs = Date.now() - startTime;
    await completeDroneRun(runId, "failed", durationMs).catch((completeErr) => {
      console.error(`[Drone API] Failed to mark run ${runId} as failed:`, completeErr);
    });

    emitRunEvent(runId, {
      type: "run_completed",
      runId,
      claimStatus: "failed",
      processed: counts.processedCount,
      total: claims.length,
    });
  } finally {
    setTimeout(() => cleanupEmitter(runId), 5000);
  }
}

export default drone;
