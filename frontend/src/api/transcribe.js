function getAuthHeader() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export async function transcribeAudio(file) {

  const formData = new FormData();

  formData.append('file', file);

  const res = await fetch('/api/transcribe', {
    method: 'POST',

    headers: getAuthHeader(),

    body: formData
  });
return res.json();
}
