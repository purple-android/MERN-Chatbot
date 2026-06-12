import { API_BASE, apiHeaders } from './config';

function getAuthHeader() {
  const token = localStorage.getItem('token');
  return apiHeaders({ Authorization: `Bearer ${token}` });
}

export async function listLibraryFiles() {
  try {
    const res = await fetch(`${API_BASE}/api/library`, { headers: getAuthHeader() });
    return res.json();
  } catch (err) {
    return { error: 'Could not reach the server.' };
  }
}

export async function deleteLibraryFile(id) {
  try {
    const res = await fetch(`${API_BASE}/api/library/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    return res.json();
  } catch (err) {
    return { error: 'Could not reach the server.' };
  }
}

export function uploadLibraryFile(file, onProgress, onCancelReady) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    const uploadId = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);

    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = (e.loaded / e.total) * 100;
        onProgress({ phase: 'uploading', percent });
      }
    });

    xhr.upload.addEventListener('load', () => {
      if (onProgress) {
        // Bytes are uploaded; the server now extracts + indexes. Start the indexing bar
        // at 0% — the live 'library:progress' socket events drive it up from here.
        onProgress({ phase: 'indexing', percent: 0 });
      }
    });

    xhr.addEventListener('load', () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch (e) {
        resolve({ error: 'Server returned an unexpected response.' });
      }
    });

    xhr.addEventListener('error', () => {
      resolve({ error: 'Network error — could not reach the server.' });
    });

    xhr.addEventListener('abort', () => {
      resolve({ cancelled: true });
    });

    xhr.open('POST', `${API_BASE}/api/library/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
    xhr.setRequestHeader('ngrok-skip-browser-warning', 'true');
    xhr.send(formData);

    if (onCancelReady) {
      onCancelReady(async () => {
        try {
          await fetch(`${API_BASE}/api/library/cancel/${uploadId}`, {
            method:  'POST',
            headers: apiHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` })
          });
        } catch (e) {
          // best effort
        }
        xhr.abort();
      });
    }
  });
}
