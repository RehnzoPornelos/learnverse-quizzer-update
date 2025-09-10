import { io, Socket } from 'socket.io-client';

const URL =
  import.meta.env?.VITE_BACKEND_URL?.replace(/\/$/, '') ||
  'http://localhost:8000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(URL, {
      transports: ['websocket'], // skip polling -> faster
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 500,
      timeout: 5000,
      // withCredentials removed to avoid preflight slowdown
      autoConnect: true,
    });
  }
  return socket;
}
