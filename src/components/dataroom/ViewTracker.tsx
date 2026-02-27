"use client";

import { useEffect, useState } from "react";
import { useViewTracking } from "@/hooks/useViewTracking";

export function ViewTracker({ fileId }: { fileId: string }) {
  const [accessLogId, setAccessLogId] = useState<string | null>(null);

  useEffect(() => {
    async function initTracking() {
      try {
        const res = await fetch(`/api/files/${fileId}/view`, {
          method: "GET",
        });
        const logId = res.headers.get("X-Access-Log-Id");
        if (logId) {
          setAccessLogId(logId);
        }
      } catch {
        // Tracking initialization failed silently
      }
    }

    initTracking();
  }, [fileId]);

  useViewTracking(fileId, accessLogId);

  return null;
}
