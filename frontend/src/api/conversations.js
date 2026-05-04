// The base URL for all conversation-related API calls
const BASE = '/api/conversations';


// getAllConversations — fetches the list of all conversations (for the sidebar)
export async function getAllConversations() {
  const res = await fetch(BASE);
  return res.json();
}


// getConversation — fetches one full conversation (including all its messages)
export async function getConversation(id) {
  const res = await fetch(`${BASE}/${id}`);
  return res.json();
}


// createConversation — creates a brand new empty conversation in the database
export async function createConversation() {
  const res = await fetch(BASE, { method: 'POST' });
  return res.json();
}


// sendMessage — sends a user message and gets back the AI's reply
export async function sendMessage(id, content) {
  const res = await fetch(`${BASE}/${id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  return res.json();
}


// deleteConversation — permanently deletes a conversation from the database
export async function deleteConversation(id) {
  await fetch(`${BASE}/${id}`, { method: 'DELETE' });
}
