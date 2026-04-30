import { useEffect, useRef } from 'react';

import { getApiBaseUrl } from './client';

export type RealtimeEvent =
  | { type: 'hello'; business_id: string }
  | { type: 'pong' }
  | {
      type: 'entry.created' | 'entry.updated' | 'entry.deleted';
      business_id: string;
      data: Record<string, unknown>;
    }
  | { type: string; business_id?: string; data?: Record<string, unknown> };

function toWsUrl(httpBase: string): string {
  if (httpBase.startsWith('https://')) return 'wss://' + httpBase.slice('https://'.length);
  if (httpBase.startsWith('http://')) return 'ws://' + httpBase.slice('http://'.length);
  return httpBase;
}

export interface UseRealtimeOptions {
  enabled: boolean;
  businessId: string | null | undefined;
  token: string | null | undefined;
  onEvent: (e: RealtimeEvent) => void;
}

/**
 * Open a WebSocket to /v1/ws scoped to a single business and dispatch events
 * to the callback. Reconnects automatically with exponential backoff (max 30s).
 * Sends a ping every 25s to keep proxies happy.
 */
export function useRealtime(opts: UseRealtimeOptions): void {
  const { enabled, businessId, token, onEvent } = opts;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !businessId || !token) return;

    let socket: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const url = `${toWsUrl(getApiBaseUrl())}/v1/ws?token=${encodeURIComponent(
        token,
      )}&business_id=${encodeURIComponent(businessId)}`;
      try {
        socket = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socket.onopen = () => {
        attempt = 0;
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          try {
            socket?.send(JSON.stringify({ type: 'ping' }));
          } catch {
            // ignore; close handler will reconnect
          }
        }, 25_000);
      };
      socket.onmessage = (ev: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(ev.data) as RealtimeEvent;
          onEventRef.current(parsed);
        } catch {
          // ignore malformed frames
        }
      };
      socket.onerror = () => {
        // close handler does the reconnect
      };
      socket.onclose = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      attempt += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    };
  }, [enabled, businessId, token]);
}
