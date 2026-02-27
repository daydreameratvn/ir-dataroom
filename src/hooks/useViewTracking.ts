"use client";

import { useEffect, useRef, useCallback } from "react";

export function useViewTracking(fileId: string, accessLogId: string | null) {
  const startTime = useRef<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(() => {
    if (!accessLogId) return;

    const duration = Math.round((Date.now() - startTime.current) / 1000);

    // Use sendBeacon for reliability (works on page unload)
    const data = JSON.stringify({ accessLogId, duration });
    navigator.sendBeacon(
      "/api/tracking",
      new Blob([data], { type: "application/json" })
    );
  }, [accessLogId]);

  useEffect(() => {
    if (!accessLogId) return;

    startTime.current = Date.now();

    // Send heartbeat every 30 seconds
    intervalRef.current = setInterval(sendHeartbeat, 30000);

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendHeartbeat();
      }
    };

    // Handle page unload
    const handleBeforeUnload = () => {
      sendHeartbeat();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      sendHeartbeat(); // Final heartbeat on unmount
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [accessLogId, sendHeartbeat]);
}
