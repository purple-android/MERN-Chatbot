import React from 'react';

function InputBar({ input, loading, onInputChange, onKeyDown, onSend, attachedDoc, uploading, onFileSelect, onRemoveAttachment }) {
  return (
    <div className="input-area">

      {attachedDoc && (
        <div className="attachment-badge">

          <span>📄 {attachedDoc.filename}</span>

          <button
            className="remove-btn"
            onClick={onRemoveAttachment}
            title="Remove attachment"
          >
            ×
          </button>
        </div>
      )}

      <div className="input-box">

        <textarea
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder="Message Llama..."
          rows={1}
        />

        <div className="input-actions">
          <label
            htmlFor="file-upload"
            className={`attach-btn${uploading ? ' uploading' : ''}`}
            title={uploading ? 'Uploading...' : 'Attach a document (.txt, .pdf, .docx)'}
          >
            {uploading ? '⏳' : '📎'}
          </label>

          <input
            type="file"
            id="file-upload"
            accept=".txt,.pdf,.doc,.docx"
            onChange={onFileSelect}
            onClick={e => { e.target.value = null; }}
            style={{ display: 'none' }}
            disabled={uploading}
          />

          <button
            className="send-btn"
            onClick={onSend}
            disabled={loading || uploading || (!input.trim() && !attachedDoc)}
          >
            ↑
          </button>
        </div>
      </div>

      <p className="disclaimer">
        Llama can make mistakes. Verify important information.
      </p>
    </div>
  );
}

export default InputBar;
