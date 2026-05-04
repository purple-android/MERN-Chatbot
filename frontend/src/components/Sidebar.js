import React from 'react';

function Sidebar({ conversations, activeId, onNewChat, onOpen, onDelete }) {
  return (
    <div className="sidebar">

      <div className="sidebar-header">
        <span className="logo-dot" />
        <span className="app-name">Llama Chat</span>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <span className="plus-icon">+</span>
        New Chat
      </button>

      <div className="chat-list">
        {conversations.map(conv => (
          <div
            key={conv._id}
            className={`chat-item ${activeId === conv._id ? 'active' : ''}`}
            onClick={() => onOpen(conv._id)}
          >
            <span className="chat-title">{conv.title}</span>

            <button
              className="delete-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(conv._id); }}
              title="Delete chat"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;
