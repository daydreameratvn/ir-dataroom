import { NextRequest, NextResponse } from "next/server";
import { updateDuration } from "@/lib/tracking";

// POST /api/tracking - Update view duration (heartbeat)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessLogId, duration } = body;

    if (!accessLogId || typeof duration !== "number") {
      return NextResponse.json(
        { error: "accessLogId and duration are required" },
        { status: 400 }
      );
    }

    await updateDuration(accessLogId, duration);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tracking error:", error);
    return NextResponse.json(
      { error: "Failed to update tracking" },
      { status: 500 }
    );
  }
}
