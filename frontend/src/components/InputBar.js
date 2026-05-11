// InputBar.js
// This component is the typing area at the bottom of the screen.
// It contains the textarea, the paperclip button (with submenu), the mic button, and send.

import React, { useRef } from 'react';

// ── InputBar Component ──
function InputBar({
  input, loading, onInputChange, onKeyDown, onSend,
  attachedDoc, uploading,
  onAttachClick, attachMenuOpen, onAttachClose, onDocSelect, onAudioFileSelect,
  onRemoveAttachment,
  transcribing, recording, onMicClick
}) {

  const docInputRef   = useRef(null);
  const audioInputRef = useRef(null);

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

          <div className="attach-btn-wrapper">

            <button
              className={`attach-btn${uploading ? ' uploading' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onAttachClick();
              }}
              disabled={uploading}
              title={uploading ? 'Uploading...' : 'Attach a file'}
            >
              {uploading ? '⏳' : '📎'}
            </button>

            {attachMenuOpen && (
              <div className="attach-menu" onClick={(e) => e.stopPropagation()}>

                <button
                  className="attach-menu-item"
                  onClick={() => {
                    docInputRef.current.click();
                    onAttachClose();
                  }}
                >
                  📄 Document
                </button>

                <button
                  className="attach-menu-item"
                  onClick={() => {
                    audioInputRef.current.click();
                    onAttachClose();
                  }}
                >
                  🎵 Audio file
                </button>

              </div>
            )}
          </div>

          <input
            ref={docInputRef}
            type="file"
            accept=".txt,.pdf,.doc,.docx"
            onChange={onDocSelect}
            onClick={e => { e.target.value = null; }}
            style={{ display: 'none' }}
            disabled={uploading}
          />

          <input
            ref={audioInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.webm,.flac,.mp4"
            onChange={onAudioFileSelect}
            onClick={e => { e.target.value = null; }}
            style={{ display: 'none' }}
            disabled={transcribing}
          />

          <button
            className={`audio-btn${recording ? ' recording' : ''}${transcribing ? ' transcribing' : ''}`}
            onClick={onMicClick}
            disabled={transcribing || loading}
            title={
              transcribing ? 'Transcribing...' :
              recording    ? 'Click to stop recording' :
                             'Click to record audio'
            }
          >
            {transcribing ? '⏳' : recording ? '⏹️' : '🎙️'}
          </button>

          <button
            className="send-btn"
            onClick={onSend}
            disabled={loading || uploading || transcribing || recording || (!input.trim() && !attachedDoc)}
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
