function getToken() {
  return localStorage.getItem('token');
}

export async function summarizeDocument(text) {
  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },

      body: JSON.stringify({ text })
    });

    const data = await response.json();

    return data;

  } catch (err) {
    return { error: 'Could not reach the server. Please check your connection.' };
  }
}
