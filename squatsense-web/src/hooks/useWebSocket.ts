"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SquatSenseWS } from "@/lib/ws";
import type { WebSocketFrameResult, WebSocketMessage, WebSocketSessionSummary } from "@/lib/types";
import type { ReplayFrame } from "@/lib/replayStore";

const MIN_FORM_THRESHOLD = 30;
const COMBO_THRESHOLD = 70;
const PERFECT_THRESHOLD = 90;

export type WsConnectionStatus = "connected" | "disconnected" | "reconnecting" | "reconnect_failed";

export interface UseWebSocketReturn {
  isConnected: boolean;
  connectionStatus: WsConnectionStatus;
  metrics: WebSocketFrameResult["metrics"] | null;
  repCount: number;
  status: string;
  phase: string;
  formScore: number | null;
  landmarks: [number, number][];
  sessionSummary: WebSocketSessionSummary | null;
  // Movement Points state
  movementPoints: number;
  currentCombo: number;
  maxCombo: number;
  perfectReps: number;
  countedReps: number;
  repMultipliers: number[];
  repFormScores: number[];
  lastRepQuality: "perfect" | "good" | "weak" | null;
  // Methods
  connect: (sessionId: string) => void;
  disconnect: () => void;
  sendFrame: (data: Blob | ArrayBuffer) => void;
  sendCommand: (command: string, extra?: Record<string, unknown>) => void;
  stopAndWaitForSummary: (timeoutMs?: number) => Promise<WebSocketSessionSummary | null>;
  markBlitzStart: () => void;
  getFrameData: () => ReplayFrame[];
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<SquatSenseWS | null>(null);
  const summaryResolveRef = useRef<((s: WebSocketSessionSummary) => void) | null>(null);
  const frameDataRef = useRef<ReplayFrame[]>([]);
  const blitzStartRef = useRef<number>(0);

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<WsConnectionStatus>("disconnected");
  const [metrics, setMetrics] = useState<WebSocketFrameResult["metrics"] | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [phase, setPhase] = useState("TOP_READY");
  const [formScore, setFormScore] = useState<number | null>(null);
  const [landmarks, setLandmarks] = useState<[number, number][]>([]);
  const [sessionSummary, setSessionSummary] = useState<WebSocketSessionSummary | null>(null);

  // Movement Points state
  const [movementPoints, setMovementPoints] = useState(0);
  const [currentCombo, setCurrentCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [perfectReps, setPerfectReps] = useState(0);
  const [countedReps, setCountedReps] = useState(0);
  const [repMultipliers, setRepMultipliers] = useState<number[]>([]);
  const [repFormScores, setRepFormScores] = useState<number[]>([]);
  const [lastRepQuality, setLastRepQuality] = useState<"perfect" | "good" | "weak" | null>(null);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    if ("error" in message) return;

    if (message.type === "frame_result") {
      const frame = message as WebSocketFrameResult;
      setMetrics(frame.metrics);
      setRepCount(frame.rep_count);
      setStatus(frame.status);
      setPhase(frame.phase);
      setLandmarks(frame.landmarks);

      // Collect frame data for replay
      if (blitzStartRef.current > 0) {
        frameDataRef.current.push({
          timestamp: Date.now() - blitzStartRef.current,
          landmarks: frame.landmarks,
          formScore: frame.form_score,
          phase: frame.phase,
          repCount: frame.rep_count,
        });
      }

      // When a new rep is detected (form_score is non-null)
      if (frame.form_score != null) {
        setFormScore(frame.form_score);
        const score = frame.form_score;

        // Collect raw score for every rep (backend needs these for calculate_session_points)
        setRepFormScores((prev) => [...prev, score]);

        if (score >= MIN_FORM_THRESHOLD) {
          const multiplier = 0.6 + (score / 100) * 0.4;

          setCountedReps((prev) => prev + 1);
          setMovementPoints((prev) => Math.round((prev + multiplier) * 100) / 100);
          setRepMultipliers((prev) => [...prev, multiplier]);

          if (score >= PERFECT_THRESHOLD) {
            setPerfectReps((prev) => prev + 1);
            setLastRepQuality("perfect");
          } else if (score >= COMBO_THRESHOLD) {
            setLastRepQuality("good");
          } else {
            setLastRepQuality("weak");
          }

          if (score >= COMBO_THRESHOLD) {
            setCurrentCombo((prev) => {
              const next = prev + 1;
              setMaxCombo((max) => Math.max(max, next));
              return next;
            });
          } else {
            setCurrentCombo(0);
          }
        } else {
          setLastRepQuality("weak");
          setCurrentCombo(0);
        }

        // Clear quality indicator after 1 second
        setTimeout(() => setLastRepQuality(null), 1000);
      }
    }

    if (message.type === "session_summary") {
      const summary = message as WebSocketSessionSummary;
      setSessionSummary(summary);
      if (summaryResolveRef.current) {
        summaryResolveRef.current(summary);
        summaryResolveRef.current = null;
      }
    }
  }, []);

  const connect = useCallback((sessionId: string) => {
    if (wsRef.current) wsRef.current.disconnect();

    // Reset all state
    setMetrics(null);
    setRepCount(0);
    setStatus("Connecting");
    setPhase("TOP_READY");
    setFormScore(null);
    setLandmarks([]);
    setSessionSummary(null);
    setMovementPoints(0);
    setCurrentCombo(0);
    setMaxCombo(0);
    setPerfectReps(0);
    setCountedReps(0);
    setRepMultipliers([]);
    setRepFormScores([]);
    setLastRepQuality(null);
    frameDataRef.current = [];
    blitzStartRef.current = 0;

    const ws = new SquatSenseWS();
    ws.onOpen = () => {
      setIsConnected(true);
      setConnectionStatus("connected");
    };
    ws.onMessage = (data: unknown) => handleMessage(data as WebSocketMessage);
    ws.onClose = () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
    };
    ws.onError = () => {};
    ws.onReconnecting = () => {
      setIsConnected(false);
      setConnectionStatus("reconnecting");
    };
    ws.onReconnectFailed = () => {
      setIsConnected(false);
      setConnectionStatus("reconnect_failed");
    };

    ws.connect(sessionId);
    wsRef.current = ws;
  }, [handleMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus("disconnected");
    setStatus("Idle");
  }, []);

  const sendFrame = useCallback((data: Blob | ArrayBuffer) => {
    wsRef.current?.sendFrame(data);
  }, []);

  const sendCommand = useCallback((command: string, extra?: Record<string, unknown>) => {
    wsRef.current?.sendCommand(command, extra);
  }, []);

  const stopAndWaitForSummary = useCallback(
    (timeoutMs = 10_000): Promise<WebSocketSessionSummary | null> => {
      if (!wsRef.current?.isConnected) return Promise.resolve(null);

      return new Promise((resolve) => {
        let resolved = false;
        const cleanup = () => {
          if (resolved) return;
          resolved = true;
          summaryResolveRef.current = null;
          clearTimeout(timer);
        };

        const timer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);

        summaryResolveRef.current = (summary) => { cleanup(); resolve(summary); };

        wsRef.current?.markClosing();
        wsRef.current?.sendCommand("stop");
      });
    },
    []
  );

  const markBlitzStart = useCallback(() => {
    blitzStartRef.current = Date.now();
    frameDataRef.current = [];
  }, []);

  const getFrameData = useCallback((): ReplayFrame[] => {
    return frameDataRef.current;
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, []);

  return {
    isConnected, connectionStatus, metrics, repCount, status, phase, formScore, landmarks, sessionSummary,
    movementPoints, currentCombo, maxCombo, perfectReps, countedReps, repMultipliers, repFormScores, lastRepQuality,
    connect, disconnect, sendFrame, sendCommand, stopAndWaitForSummary, markBlitzStart, getFrameData,
  };
}
