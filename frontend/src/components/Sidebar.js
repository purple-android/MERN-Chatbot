import React from 'react';

function Sidebar({ conversations, activeId, user, onNewChat, onOpen, onDelete, onLogout, isOpen, onClose }) {
  return (
    <div className={`sidebar${isOpen ? ' open' : ''}`}>

      <div className="sidebar-header">
        <span className="logo-dot" />
        <span className="app-name">Llama Chat</span>
        <button className="sidebar-close-btn" onClick={onClose}>×</button>
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

      <div className="sidebar-footer">
        <div className="user-avatar">
          {user.username.charAt(0).toUpperCase()}
        </div>

        <span className="user-name">{user.username}</span>

        <button className="logout-btn" onClick={onLogout} title="Log out">
          ⎋
        </button>
      </div>

    </div>
  );
}

export default Sidebar;