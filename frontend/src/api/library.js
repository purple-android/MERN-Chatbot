function getAuthHeader() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export async function listLibraryFiles() {
  try {
    const res = await fetch('/api/library', { headers: getAuthHeader() });
    return res.json();
  } catch (err) {
    return { error: 'Could not reach the server.' };
  }
}

export async function deleteLibraryFile(id) {
  try {
    const res = await fetch(`/api/library/${id}`, {
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
        onProgress({ phase: 'indexing', percent: 100 });
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

    xhr.open('POST', '/api/library/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
    xhr.send(formData);

    if (onCancelReady) {
      onCancelReady(async () => {
        try {
          await fetch(`/api/library/cancel/${uploadId}`, {
            method:  'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
        } catch (e) {
          // best effort
        }
        xhr.abort();
      });
    }
  });
}
