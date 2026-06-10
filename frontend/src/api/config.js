// Central config for talking to the backend.

// API_BASE — where the backend lives:
//   • Local dev   → '' (empty), so requests use relative '/api/...' paths (same-origin).
//   • Online build → set REACT_APP_API_URL (see .env.production) to the backend's public
//     URL, e.g. an ngrok tunnel pointing at your locally-running backend.
export const API_BASE = process.env.REACT_APP_API_URL || '';

// apiHeaders — headers every request should carry.
// 'ngrok-skip-browser-warning' bypasses ngrok's free-tier interstitial page, which would
// otherwise return an HTML warning instead of our JSON (breaking the API calls).
export function apiHeaders(extra = {}) {
  return { 'ngrok-skip-browser-warning': 'true', ...extra };
}
