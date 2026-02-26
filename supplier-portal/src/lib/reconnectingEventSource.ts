// REQ.AUDIT.W4.SUPPLIER.SSE-NO-RECONNECT.001
// Additive utility: ReconnectingEventSource wraps the native EventSource with
// automatic reconnection, exponential backoff, and a user-visible connection state.
// This is a NEW file — does not modify any existing code.
// Wire-up (replacing raw EventSource in orders/page.tsx) requires operator approval
// under immutable-core mode.

export type SSEConnectionState = "connecting" | "connected" | "reconnecting" | "closed";

export interface ReconnectingEventSourceOptions {
  /** Initial retry delay in ms (default: 1000) */
  initialRetryDelayMs?: number;
  /** Maximum retry delay in ms (default: 30000) */
  maxRetryDelayMs?: number;
  /** Maximum number of retries before giving up (default: Infinity) */
  maxRetries?: number;
  /** Callback when connection state changes */
  onStateChange?: (state: SSEConnectionState) => void;
}

export class ReconnectingEventSource {
  private url: string;
  private options: ReconnectingEventSourceOptions;
  private es: EventSource | null = null;
  private retryCount = 0;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private messageHandlers: Map<string, Array<(event: MessageEvent) => void>> = new Map();
  private errorHandlers: Array<(err: Event) => void> = [];

  public connectionState: SSEConnectionState = "connecting";

  constructor(url: string, options: ReconnectingEventSourceOptions = {}) {
    this.url = url;
    this.options = {
      initialRetryDelayMs: 1000,
      maxRetryDelayMs: 30000,
      maxRetries: Infinity,
      ...options,
    };
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    this.setConnectionState(this.retryCount === 0 ? "connecting" : "reconnecting");

    try {
      this.es = new EventSource(this.url, { withCredentials: true });
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.es.onopen = () => {
      this.retryCount = 0;
      this.setConnectionState("connected");
    };

    this.es.onerror = (err) => {
      this.errorHandlers.forEach((h) => h(err));
      this.es?.close();
      this.es = null;
      this.scheduleReconnect();
    };

    // Re-attach all message handlers to the new EventSource
    this.messageHandlers.forEach((handlers, eventType) => {
      handlers.forEach((handler) => {
        if (eventType === "message") {
          this.es!.onmessage = handler;
        } else {
          this.es!.addEventListener(eventType, handler as EventListener);
        }
      });
    });
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const maxRetries = this.options.maxRetries ?? Infinity;
    if (this.retryCount >= maxRetries) {
      this.setConnectionState("closed");
      return;
    }
    const delay = Math.min(
      (this.options.initialRetryDelayMs ?? 1000) * Math.pow(2, this.retryCount),
      this.options.maxRetryDelayMs ?? 30000
    );
    this.retryTimeout = setTimeout(() => {
      this.retryCount++;
      this.connect();
    }, delay);
  }

  private setConnectionState(state: SSEConnectionState) {
    this.connectionState = state;
    this.options.onStateChange?.(state);
  }

  addEventListener(eventType: string, handler: (event: MessageEvent) => void) {
    if (!this.messageHandlers.has(eventType)) {
      this.messageHandlers.set(eventType, []);
    }
    this.messageHandlers.get(eventType)!.push(handler);
    if (this.es) {
      if (eventType === "message") {
        this.es.onmessage = handler;
      } else {
        this.es.addEventListener(eventType, handler as EventListener);
      }
    }
  }

  onError(handler: (err: Event) => void) {
    this.errorHandlers.push(handler);
  }

  close() {
    this.closed = true;
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    this.es?.close();
    this.es = null;
    this.setConnectionState("closed");
  }
}
