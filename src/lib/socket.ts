import { io, Socket } from 'socket.io-client';

// Determine the backend URL used for Socket.IO connections. When
// VITE_BACKEND_URL is provided in the environment it will be used as
// the base; otherwise the default of "http://localhost:8000" is used.
// We intentionally strip any trailing slash here so that the
// `path` option below can append `/socket.io` correctly without
// introducing a double slash.
const URL =
  import.meta.env?.VITE_BACKEND_URL?.replace(/\/$/, '') ||
  'http://localhost:8000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    /**
     * In some environments (e.g. incognito windows, proxies or where
     * WebSocket upgrades are not allowed), forcing the transport to
     * `websocket` only can break the connection negotiation.  Allow
     * socket.io to fall back to HTTP long‑polling by omitting the
     * `transports` option entirely.  Explicitly setting the `path`
     * ensures the client and server agree on where to establish the
     * websocket handshake (FastAPI's ASGIApp uses `/socket.io` by default).
     *
     * We also keep reconnection enabled with a handful of retries to
     * gracefully handle transient network issues.  The timeout has been
     * increased slightly to give the server extra time to respond on
     * slower networks.
     */
    socket = io(URL, {
      // The default path is '/socket.io', but we specify it here
      // explicitly to avoid mismatches with reverse proxies or
      // frameworks that mount the Socket.IO ASGI application at a
      // non‑standard route.  Do not include a trailing slash.
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 500,
      timeout: 10000,
      autoConnect: true,
    });
  }
  return socket;
}