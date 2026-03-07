"use client";

/**
 * WebSocket hook for live workout analysis.
 *
 * Wraps `FreeFormWS` from `lib/ws.ts` with React state management.
 * Exposes real-time metrics, rep count, connection status, and
 * convenience methods for connecting, disconnecting, and sending
 * frames.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { FreeFormWS } from "@/lib/ws";
import type {
  WebSocketFrameResult,
  WebSocketMessage,
  WebSocketSessionSummary,
} from "@/lib/types";

export interface LoadRecommendation {
  recommended_load_kg: number;
  change_pct: number;
  reason: "increase" | "maintain" | "decrease";
  explanation: string;
}

export interface SetSummaryFromBackend {
  type: "set_summary";
  set_number: number;
  reps: number;
  avg_form_score: number | null;
  fatigue_index: number | null;
  fatigue_risk: string | null;
  load_recommendation: LoadRecommendation | null;
}

export interface UseWebSocketReturn {
  /** Whether the WebSocket is currently open. */
  isConnected: boolean;
  /** Latest per-frame metrics from the server. */
  metrics: WebSocketFrameResult["metrics"] | null;
  /** Current cumulative rep count. */
  repCount: number;
  /** Server-reported status string (e.g. "Tracking", "Calibrating"). */
  status: string;
  /** Current movement phase (e.g. "TOP_READY", "DESCENDING", "BOTTOM"). */
  phase: string;
  /** Latest form score for the most recent rep. */
  formScore: number | null;
  /** Latest fatigue data. */
  fatigue: { fatigue_index: number; fatigue_risk: string } | null;
  /** Latest landmark positions (for overlay rendering). */
  landmarks: [number, number][];
  /** Session summary received when the workout ends (stop command). */
  sessionSummary: WebSocketSessionSummary | null;
  /** Latest set summary from backend (after end_set). */
  lastSetSummary: SetSummaryFromBackend | null;
  /** Open a WebSocket connection. */
  connect: (exerciseType: string, sessionId?: string | null) => void;
  /** Close the WebSocket connection. */
  disconnect: () => void;
  /** Send a captured frame to the server. */
  sendFrame: (frameData: Blob | ArrayBuffer) => void;
  /** Send a text command (e.g. "stop") to the server. */
  sendCommand: (command: string, extra?: Record<string, unknown>) => void;
  /** Send "stop" and wait for session_summary (resolves with summary or null on timeout). */
  stopAndWaitForSummary: (timeoutMs?: number) => Promise<WebSocketSessionSummary | null>;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<FreeFormWS | null>(null);
  const summaryResolveRef = useRef<((s: WebSocketSessionSummary) => void) | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [metrics, setMetrics] = useState<WebSocketFrameResult["metrics"] | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [phase, setPhase] = useState("TOP_READY");
  const [formScore, setFormScore] = useState<number | null>(null);
  const [fatigue, setFatigue] = useState<{ fatigue_index: number; fatigue_risk: string } | null>(null);
  const [landmarks, setLandmarks] = useState<[number, number][]>([]);
  const [sessionSummary, setSessionSummary] = useState<WebSocketSessionSummary | null>(null);
  const [lastSetSummary, setLastSetSummary] = useState<SetSummaryFromBackend | null>(null);

  /**
   * Process incoming WebSocket messages and update React state.
   */
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if ("error" in message) {
      // WebSocketError -- could be surfaced to UI if needed
      return;
    }

    if (message.type === "frame_result") {
      const frame = message as WebSocketFrameResult;
      setMetrics(frame.metrics);
      setRepCount(frame.rep_count);
      setStatus(frame.status);
      setPhase(frame.phase);
      // Only update formScore when the backend sends a non-null value
      // (it's only non-null when a new rep is detected)
      if (frame.form_score != null) {
        setFormScore(frame.form_score);
      }
      setFatigue(frame.fatigue);
      setLandmarks(frame.landmarks);
    }

    if (message.type === "session_summary") {
      const summary = message as WebSocketSessionSummary;
      setSessionSummary(summary);
      // Resolve any pending stopAndWaitForSummary promise
      if (summaryResolveRef.current) {
        summaryResolveRef.current(summary);
        summaryResolveRef.current = null;
      }
    }

    if ("type" in message && (message as { type: string }).type === "set_summary") {
      setLastSetSummary(message as unknown as SetSummaryFromBackend);
    }
  }, []);

  /**
   * Open a WebSocket connection for live analysis.
   */
  const connect = useCallback(
    (exerciseType: string, sessionId?: string | null) => {
      // Disconnect any existing connection
      if (wsRef.current) {
        wsRef.current.disconnect();
      }

      // Reset state for the new session
      setMetrics(null);
      setRepCount(0);
      setStatus("Connecting");
      setPhase("TOP_READY");
      setFormScore(null);
      setFatigue(null);
      setLandmarks([]);
      setSessionSummary(null);

      const ws = new FreeFormWS();

      ws.onOpen = () => {
        setIsConnected(true);
      };

      ws.onMessage = handleMessage;

      ws.onClose = () => {
        setIsConnected(false);
      };

      ws.onError = () => {
        // The onClose handler will fire after an error, updating
        // isConnected. No additional state changes needed here.
      };

      ws.connect(exerciseType, sessionId);
      wsRef.current = ws;
    },
    [handleMessage],
  );

  /**
   * Close the WebSocket connection gracefully.
   */
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
    setIsConnected(false);
    setStatus("Idle");
  }, []);

  /**
   * Send a single captured frame to the backend for processing.
   */
  const sendFrame = useCallback((frameData: Blob | ArrayBuffer) => {
    wsRef.current?.sendFrame(frameData);
  }, []);

  /**
   * Send a text command to the server (e.g. "stop"), optionally with extra data.
   */
  const sendCommand = useCallback((command: string, extra?: Record<string, unknown>) => {
    wsRef.current?.sendCommand(command, extra);
  }, []);

  /**
   * Send "stop" command and wait for the session_summary message.
   * Returns the summary or null if it times out or the WS is not connected.
   */
  const stopAndWaitForSummary = useCallback(
    (timeoutMs = 10_000): Promise<WebSocketSessionSummary | null> => {
      // If the WS is not connected, resolve immediately — don't wait
      if (!wsRef.current?.isConnected) {
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        let resolved = false;

        const cleanup = () => {
          if (resolved) return;
          resolved = true;
          summaryResolveRef.current = null;
          clearTimeout(timer);
        };

        const timer = setTimeout(() => {
          cleanup();
          resolve(null);
        }, timeoutMs);

        // Resolve when the summary arrives
        summaryResolveRef.current = (summary: WebSocketSessionSummary) => {
          cleanup();
          resolve(summary);
        };

        // Also resolve immediately if the WS closes before the summary arrives
        const prevOnClose = wsRef.current?.onClose;
        if (wsRef.current) {
          const ws = wsRef.current;
          ws.onClose = (event: CloseEvent) => {
            prevOnClose?.(event);
            if (!resolved) {
              cleanup();
              resolve(null);
            }
          };
        }

        // Mark as intentional so auto-reconnect doesn't kick in
        // when the server closes the WS after sending the summary.
        wsRef.current?.markClosing();
        wsRef.current?.sendCommand("stop");
      });
    },
    [],
  );

  /**
   * Clean up the WebSocket connection when the component unmounts.
   */
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, []);

  return {
    isConnected,
    metrics,
    repCount,
    status,
    phase,
    formScore,
    fatigue,
    landmarks,
    sessionSummary,
    lastSetSummary,
    connect,
    disconnect,
    sendFrame,
    sendCommand,
    stopAndWaitForSummary,
  };
}
