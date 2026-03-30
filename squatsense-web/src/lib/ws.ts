const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

export class SquatSenseWS {
  private ws: WebSocket | null = null;
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSessionId: string | null = null;

  public onOpen: (() => void) | null = null;
  public onMessage: ((data: unknown) => void) | null = null;
  public onClose: ((event: CloseEvent) => void) | null = null;
  public onError: ((event: Event) => void) | null = null;
  public onReconnecting: ((attempt: number) => void) | null = null;
  public onReconnectFailed: (() => void) | null = null;

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(sessionId: string): void {
    const url = `${WS_BASE}/api/v1/ws/live/?exercise_type=squat&session_id=${sessionId}`;
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.lastSessionId = sessionId;
    this._connect(url);
  }

  private _connect(url: string): void {
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.onOpen?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        try {
          const parsed = JSON.parse(event.data);
          this.onMessage?.(parsed);
        } catch {
          // Ignore non-JSON text
        }
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      if (!this.intentionalClose && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        this.onReconnecting?.(this.reconnectAttempts);
        this.reconnectTimer = setTimeout(() => {
          if (this.lastSessionId) {
            const reconnectUrl = `${WS_BASE}/api/v1/ws/live/?exercise_type=squat&session_id=${this.lastSessionId}`;
            this._connect(reconnectUrl);
          }
        }, RECONNECT_DELAY_MS);
      } else if (!this.intentionalClose && this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.onReconnectFailed?.();
        this.onClose?.(event);
      } else {
        this.onClose?.(event);
      }
    };

    this.ws.onerror = (event: Event) => this.onError?.(event);
  }

  sendFrame(data: Blob | ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendLandmarks(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendCommand(command: string, extra?: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ command, ...extra }));
    }
  }

  markClosing(): void {
    this.intentionalClose = true;
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
