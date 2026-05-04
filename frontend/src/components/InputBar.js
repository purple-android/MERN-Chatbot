import React from 'react';

function InputBar({ input, loading, onInputChange, onKeyDown, onSend }) {
  return (
    <div className="input-area">

      <div className="input-box">

        <textarea
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder="Message Llama..."
          rows={1}
        />

        <button
          className="send-btn"
          onClick={onSend}
          disabled={loading || !input.trim()}
        >
          ↑
        </button>
      </div>

      <p className="disclaimer">
        Llama can make mistakes. Verify important information.
      </p>
    </div>
  );
}

export default InputBar;