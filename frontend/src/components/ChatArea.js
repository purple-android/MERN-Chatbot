import React, { useRef, useEffect } from 'react';

import ReactMarkdown from 'react-markdown';
import { BookOpen, Globe } from 'lucide-react';

function ChatArea({ messages, loading }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="messages">

      {messages.map((msg, index) => (
        <div key={index} className={`message ${msg.role}`}>

          <div className="message-avatar">
            {msg.role === 'user' ? 'Y' : 'L'}
          </div>

          <div className="message-body">
            <div className="message-sender">
              {msg.role === 'user' ? 'You' : 'Llama'}
            </div>

            {msg.role === 'assistant' ? (
              <div className="message-text message-text-markdown">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="message-text">{msg.content}</div>
            )}

            {/* ── RAG sources badge (Phase 4) ── */}
            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
              <div className="message-sources">
                <BookOpen size={14} className="sources-icon" />
                <span className="sources-label">
                  Used {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''} from your library:
                </span>
                <span className="sources-files">
                  {/* Deduplicate filenames before listing — same file may have
                      contributed multiple chunks but we only need to show it once. */}
                  {[...new Set(msg.sources.map(s => s.filename))].join(', ')}
                </span>
              </div>
            )}

            {/* ── Web search sources badge ── */}
            {msg.role === 'assistant' && msg.webSources && msg.webSources.length > 0 && (
              <div className="message-sources message-sources-web">
                <div className="web-sources-header">
                  <Globe size={14} className="sources-icon" />
                  <span className="sources-label">
                    {msg.webSources.length} web source{msg.webSources.length > 1 ? 's' : ''}:
                  </span>
                </div>
                <ul className="web-sources-list">
                  {msg.webSources.map((s, i) => (
                    <li key={i}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="web-source-link"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        </div>
      ))}

      {loading && (
        <div className="message assistant">
          <div className="message-avatar">L</div>
          <div className="message-body">
            <div className="message-sender">Llama</div>
            <div className="thinking">
              <span /><span /><span />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

export default ChatArea;
