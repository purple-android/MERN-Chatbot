import { API_BASE, apiHeaders } from './config';

function getAuthHeader() {
  const token = localStorage.getItem('token');
  return apiHeaders({ Authorization: `Bearer ${token}` });
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: formData
  });
  return res.json();
}
