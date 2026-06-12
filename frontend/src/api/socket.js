import { io } from 'socket.io-client';
import { API_BASE } from './config';

// One shared Socket.IO connection for the whole app, created lazily on first use so
// it picks up the login token from localStorage. We force the 'websocket' transport
// (skip the initial HTTP polling handshake) so it works cleanly through an ngrok
// tunnel without hitting ngrok's browser-warning interstitial.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      auth: { token: localStorage.getItem('token') },
      transports: ['websocket']
    });
  }
  return socket;
}

// Drop the connection (e.g. on logout) so the next login reconnects with a fresh token.
export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
