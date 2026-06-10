import { API_BASE, apiHeaders } from './config';

const BASE = `${API_BASE}/api/auth`;

export async function register(username, email, password) {
  const res = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, email, password })
  });
  return res.json();
}

export async function login(email, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

export async function getMe(token) {
  const res = await fetch(`${BASE}/me`, {
    headers: apiHeaders({ Authorization: `Bearer ${token}` })
  });
  return res.json();
}