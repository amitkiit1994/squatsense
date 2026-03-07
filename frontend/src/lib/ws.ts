/**
 * WebSocket client for FreeForm Fitness live analysis.
 *
 * Connects to the backend's `/api/v1/ws/live/` WebSocket endpoint,
 * sends raw JPEG frames (as binary), and receives real-time analysis
 * results (JSON) including landmarks, rep counts, form scores, and
 * fatigue data.
 *
 * Implements automatic reconnection with exponential backoff (up to
 * 5 retries), periodic keep-alive pings, and a clean disconnect API.
 */

import type { WebSocketMessage } from "@/lib/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
    : "ws://localhost:8000");

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1_000; // 1 second initial backoff
const PING_INTERVAL_MS = 15_000; // send ping every 15s to keep connection alive

// ---------------------------------------------------------------------------
// FreeFormWS class
// ---------------------------------------------------------------------------

export type MessageHandler = (message: WebSocketMessage) => void;
export type CloseHandler = (event: CloseEvent) => void;
export type ErrorHandler = (event: Event) => void;

export class FreeFormWS {
  private ws: WebSocket | null = null;
  private exerciseType: string = "squat";
  private sessionId: string | null = null;

  /** How many consecutive reconnect attempts have been made. */
  private retryCount = 0;

  /** Timer handle for the scheduled reconnect. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Timer handle for periodic keep-alive pings. */
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether the user explicitly called disconnect(). */
  private intentionalClose = false;

  // -- Callbacks (set by the consumer) --

  /** Invoked when the socket opens (including reconnections). */
  onOpen: () => void = () => {};

  /** Invoked with every JSON message from the server. */
  onMessage: MessageHandler = () => {};

  /** Invoked when the socket closes. */
  onClose: CloseHandler = () => {};

  /** Invoked on socket-level errors. */
  onError: ErrorHandler = () => {};

  // -- Public API --

  /**
   * Open a WebSocket connection to the live analysis endpoint.
   *
   * @param exerciseType - exercise key (e.g. "squat", "deadlift")
   * @param sessionId    - optional session UUID to associate frames with
   */
  connect(exerciseType: string, sessionId?: string | null): void {
    // Clean up any existing connection first
    this.cleanupConnection();

    this.exerciseType = exerciseType;
    this.sessionId = sessionId ?? null;
    this.intentionalClose = false;
    this.retryCount = 0;

    this.openSocket();
  }

  /**
   * Send a single frame (JPEG bytes) to the server for processing.
   *
   * The backend expects raw binary (Blob or ArrayBuffer).
   */
  sendFrame(frameData: Blob | ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(frameData);
  }

  /**
   * Send a text command to the server (e.g. `{ command: "stop" }`).
   */
  sendCommand(command: string, extras?: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({ command, ...extras }));
  }

  /**
   * Gracefully close the connection. No reconnect will be attempted.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.cleanupConnection();
  }

  /**
   * Mark the next server-initiated close as intentional so auto-reconnect
   * is suppressed. Use before sending "stop" — the server will close
   * the WS after sending the summary, and we don't want to reconnect.
   */
  markClosing(): void {
    this.intentionalClose = true;
  }

  /**
   * Whether the socket is currently open and ready to send data.
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // -- Internals --

  private buildUrl(): string {
    const params = new URLSearchParams({
      exercise_type: this.exerciseType,
    });
    if (this.sessionId) {
      params.set("session_id", this.sessionId);
    }
    return `${WS_BASE}/api/v1/ws/live/?${params}`;
  }

  private openSocket(): void {
    const url = this.buildUrl();
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      // Successful connection resets the retry counter
      this.retryCount = 0;
      this.startPing();
      this.onOpen();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data: WebSocketMessage =
          typeof event.data === "string"
            ? JSON.parse(event.data)
            : JSON.parse(new TextDecoder().decode(event.data));
        this.onMessage(data);
      } catch {
        // Ignore unparseable messages
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.stopPing();
      this.onClose(event);

      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event: Event) => {
      this.onError(event);
    };
  }

  /**
   * Start sending periodic ping messages to prevent CDN/proxy idle timeout.
   */
  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ command: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }

  /**
   * Stop the keep-alive ping timer.
   */
  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Schedule a reconnect attempt with exponential backoff.
   * Gives up after MAX_RETRIES consecutive failures.
   */
  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) {
      return;
    }

    const delay = BASE_BACKOFF_MS * Math.pow(2, this.retryCount);
    this.retryCount += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  /**
   * Tear down the current socket and cancel any pending reconnect timer.
   */
  private cleanupConnection(): void {
    this.stopPing();

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Remove listeners to avoid stale callbacks
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, "Client disconnect");
      }

      this.ws = null;
    }
  }
}
