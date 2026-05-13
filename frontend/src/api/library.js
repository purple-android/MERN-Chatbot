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

export function uploadLibraryFile(file, onProgress) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
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

    xhr.open('POST', '/api/library/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
    xhr.send(formData);
  });
}
