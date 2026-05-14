import React, { useRef } from 'react';

// Lucide icon components — clean SVG icons.
//   BookOpen    — for the library on/off toggle (replaces 📚 emoji)
//   Paperclip   — for the attach button (replaces 📎 emoji)
//   FileText    — for the "Document" submenu option (replaces 📄 emoji)
//   Music       — for the "Audio file" submenu option (replaces 🎵 emoji)
//   Mic         — for the idle microphone state (replaces 🎙️ emoji)
//   Square      — for the recording state (replaces ⏹️ emoji)
//   Loader2     — for loading/uploading spinner states (replaces ⏳ emoji)
//   ArrowUp     — for the send button (replaces ↑ character)
//   X           — for the remove-attachment button (replaces × character)
import {
  BookOpen,
  Paperclip,
  FileText,
  Music,
  Mic,
  Square,
  Loader2,
  ArrowUp,
  X
} from 'lucide-react';

function InputBar({
  input, loading, onInputChange, onKeyDown, onSend,
  attachedDoc, uploading,
  onAttachClick, attachMenuOpen, onAttachClose, onDocSelect, onAudioFileSelect,
  onRemoveAttachment,
  transcribing, recording, onMicClick,
  useLibrary, onToggleLibrary
}) {

  // docInputRef points directly at the hidden document file input element in the DOM
  // audioInputRef points directly at the hidden audio file input element in the DOM
  // We use these to programmatically open the file picker — more reliable than <label htmlFor>
  const docInputRef   = useRef(null);
  const audioInputRef = useRef(null);

  return (
    <div className="input-area">

      {attachedDoc && (
        <div className="attachment-badge">

          <span className="attachment-badge-name">
            <FileText size={14} />
            {attachedDoc.filename}
          </span>

          <button
            className="remove-btn"
            onClick={onRemoveAttachment}
            title="Remove attachment"
          >
            <X size={16} />
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

          <button
            className={`library-toggle-btn${useLibrary ? ' on' : ' off'}`}
            onClick={onToggleLibrary}
            disabled={loading || uploading}
            title={useLibrary
              ? 'Library is ON — click to turn off (skip RAG, chat with LLM only)'
              : 'Library is OFF — click to turn on (search your uploaded files)'}
          >
            <BookOpen size={18} />
          </button>

          <div className="attach-btn-wrapper">

            <button
              className={`attach-btn${uploading ? ' uploading' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onAttachClick();
              }}
              disabled={uploading || loading}
              title={uploading ? 'Uploading...' : loading ? 'Please wait...' : 'Attach a file'}
            >
              {uploading ? <Loader2 size={18} className="spin" /> : <Paperclip size={18} />}
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
                  <FileText size={16} /> Document
                </button>

                <button
                  className="attach-menu-item"
                  onClick={() => {
                    audioInputRef.current.click();
                    onAttachClose();
                  }}
                >
                  <Music size={16} /> Audio file
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
            {transcribing
              ? <Loader2 size={18} className="spin" />
              : recording
                ? <Square size={16} fill="currentColor" />
                : <Mic size={18} />
            }
          </button>

          <button
            className="send-btn"
            onClick={onSend}
            disabled={loading || uploading || transcribing || recording || (!input.trim() && !attachedDoc)}
          >
            <ArrowUp size={18} strokeWidth={2.5} />
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
