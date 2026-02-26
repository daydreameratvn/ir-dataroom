import { createDroneAgent } from "./agent.ts";
import { createSSEResponse } from "../shared/sse-stream.ts";
import { getDroneState, processDroneClaim, startDrone, stopDrone } from "./runner.ts";

/**
 * Handler for interactive drone agent (single claim, SSE stream).
 * Accepts a claim code, creates the agent, and returns an SSE stream.
 */
export async function handleDrone(request: { claimCode: string }) {
  const { claimCode } = request;

  const agent = await createDroneAgent(claimCode);

  agent.prompt(
    `Thẩm định yêu cầu bồi thường ${claimCode}. Đây là hồ sơ thuốc mạn tính Tier 1.`,
  ).catch(console.error);

  return createSSEResponse(agent);
}

/**
 * Handler for drone batch operations.
 *
 * GET    — Return drone state + last 20 errors
 * POST   — Start drone loop (fire-and-forget)
 * PUT    — Process a single claim directly (for testing)
 * DELETE — Graceful stop
 */
export async function handleDroneBatch(method: string, body?: Record<string, unknown>): Promise<Response> {
  switch (method) {
    case "GET": {
      const state = getDroneState();
      return Response.json(state);
    }

    case "POST": {
      const state = getDroneState();
      if (state.isRunning) {
        return Response.json(
          { error: "Drone is already running", state },
          { status: 409 },
        );
      }

      const config = body as { batchSize?: number; pollIntervalMs?: number; maxBackoffMs?: number } | undefined;

      // Fire-and-forget — don't await
      startDrone(config).catch((err) => {
        console.error("[Drone] startDrone crashed:", err);
      });

      return Response.json({
        message: "Drone started",
        config: {
          batchSize: config?.batchSize ?? 5,
          pollIntervalMs: config?.pollIntervalMs ?? 30_000,
          maxBackoffMs: config?.maxBackoffMs ?? 300_000,
        },
      });
    }

    case "PUT": {
      const claimCaseId = body?.claimCaseId as string | undefined;
      const claimCode = body?.claimCode as string | undefined;

      if (!claimCaseId || !claimCode) {
        return Response.json(
          { error: "claimCaseId and claimCode are required" },
          { status: 400 },
        );
      }

      try {
        const result = await processDroneClaim(claimCaseId, claimCode);
        return Response.json(result);
      } catch (error) {
        return Response.json(
          { status: "error", message: error instanceof Error ? error.message : "Unknown error" },
          { status: 500 },
        );
      }
    }

    case "DELETE": {
      const state = getDroneState();
      if (!state.isRunning) {
        return Response.json(
          { error: "Drone is not running", state },
          { status: 409 },
        );
      }

      stopDrone();

      return Response.json({
        message: "Drone stop signal sent",
        state: getDroneState(),
      });
    }

    default:
      return Response.json({ error: `Unsupported method: ${method}` }, { status: 405 });
  }
}
