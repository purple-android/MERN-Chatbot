import { useState, useEffect } from 'react';

import {
  listLibraryFiles,
  deleteLibraryFile,
  uploadLibraryFile
} from '../api/library';

import { BookOpen, Upload, FileText, X } from 'lucide-react';

function formatSize(bytes) {

  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LibraryPage() {

  const [files, setFiles] = useState([]);

  const [loading, setLoading] = useState(true);

  const [uploadStatus, setUploadStatus] = useState(null);

  const [uploadError, setUploadError] = useState(null);

  const [cancelUpload, setCancelUpload] = useState(null);

  useEffect(() => {
    loadFiles();
  }, []);

  async function loadFiles() {
    setLoading(true);
    const data = await listLibraryFiles();

    if (Array.isArray(data)) {
      setFiles(data);
    }
    setLoading(false);
  }

  async function handleFileSelect(e) {

    const file = e.target.files[0];
    if (!file) return;

    setUploadError(null);

    setUploadStatus({ phase: 'uploading', percent: 0, filename: file.name });

    const result = await uploadLibraryFile(
      file,
      (progress) => {
        setUploadStatus({ ...progress, filename: file.name });
      },
      (cancelFn) => {
        setCancelUpload(() => cancelFn);
      }
    );

    setUploadStatus(null);
    setCancelUpload(null);

    e.target.value = '';

    if (result.cancelled) {
      setUploadError('Upload cancelled.');
      return;
    }

    if (result.error) {
      setUploadError(result.error);
      return;
    }

    loadFiles();
  }

  function handleCancel() {
    if (cancelUpload) cancelUpload();
  }

  async function handleDelete(id, filename) {

    if (!window.confirm(`Delete "${filename}" from your library?`)) return;

    const result = await deleteLibraryFile(id);

    if (result.error) {
      alert('Could not delete: ' + result.error);
      return;
    }

    setFiles(prev => prev.filter(f => f._id !== id));
  }

  return (
    <div className="library-page">

      <div className="library-header">
        <h1>

          <BookOpen size={26} className="library-header-icon" />
          Library
        </h1>
        <p>Documents here are searchable by the AI in every conversation.</p>
      </div>

      <div className="library-upload-section">

        {uploadStatus ? (

          <div className="upload-progress">
            <div className="upload-progress-info">
              <span className="upload-progress-filename">
              <FileText size={14} /> {uploadStatus.filename}
            </span>
              <span className="upload-progress-status">

                {uploadStatus.phase === 'uploading'
                  ? `Uploading… ${Math.round(uploadStatus.percent)}%`
                  : 'Indexing on server — this can take a few minutes for large files…'}
              </span>
            </div>

            <div className="progress-bar">
              <div
                className={`progress-bar-fill ${uploadStatus.phase === 'indexing' ? 'indexing' : ''}`}

                style={{
                  width: uploadStatus.phase === 'uploading'
                    ? `${uploadStatus.percent}%`
                    : '100%'
                }}
              />
            </div>

            <button
              type="button"
              className="upload-cancel-btn"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        ) : (

          <label className="upload-button">
            <input
              type="file"
              accept=".txt,.pdf,.doc,.docx"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <Upload size={28} className="upload-button-icon" />
            <span className="upload-button-text">Choose a file to upload</span>
            <span className="upload-button-hint">PDF, DOCX, DOC, or TXT (max 100MB)</span>
          </label>
        )}

        {uploadError && (
          <div className="upload-error">⚠️ {uploadError}</div>
        )}
      </div>

      <div className="library-list">

        {loading ? (
          <div className="library-loading">Loading your library…</div>
        ) : files.length === 0 ? (
          <div className="library-empty">
            <p>No files in your library yet.</p>
            <p className="library-empty-hint">Upload a document above to get started.</p>
          </div>
        ) : (
          <table className="library-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Chunks</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>

              {files.map(file => (
                <tr key={file._id }>
                  <td className="library-cell-filename">
                    <FileText size={14} /> {file.filename}
                  </td>
                  <td>{formatSize(file.size)}</td>
                  <td>{file.chunkCount}</td>
                  <td>

                    <span className={`library-status library-status-${file.status}`}>
                      {file.status}
                    </span>
                  </td>
                  <td>

                    {new Date(file.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className="library-delete-btn"
                      onClick={() => handleDelete(file._id, file.filename)}
                      title="Delete this file"
                    >
                      <X size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default LibraryPage;

