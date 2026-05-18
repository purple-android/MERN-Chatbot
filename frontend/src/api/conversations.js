const BASE = '/api/conversations';

function getAuthHeader() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export async function getAllConversations() {
  const res = await fetch(BASE, {
    headers: getAuthHeader()
  });
  return res.json();
}

export async function getConversation(id) {
  const res = await fetch(`${BASE}/${id}`, {
    headers: getAuthHeader()
  });
  return res.json();
}

export async function createConversation() {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: getAuthHeader()
  });
  return res.json();
}

export async function sendMessage(id, content, useLibrary = true, useWebSearch = false) {
  const res = await fetch(`${BASE}/${id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ content, useLibrary, useWebSearch })
  });
  return res.json();
}

export async function deleteConversation(id) {
  await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
}