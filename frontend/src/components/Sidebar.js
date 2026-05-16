import React from 'react';
import { Plus, BookOpen, X, LogOut } from 'lucide-react';

function Sidebar({
  conversations, activeId, user,
  onNewChat, onOpen, onDelete, onLogout,
  isOpen, onClose,
  currentView, onLibrary
}) {
    return (
    <div className={`sidebar${isOpen ? ' open' : ''}`}>

      <div className="sidebar-header">
        <span className="logo-dot" />
        <span className="app-name">Llama Chat</span>
        <button className="sidebar-close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <Plus size={16} className="plus-icon" />
        New Chat
      </button>

      {/* ── Library Button ── */}
      <button
        className={`library-btn${currentView === 'library' ? ' active' : ''}`}
        onClick={onLibrary}
      >
        <BookOpen size={16} className="library-icon" />
        Library
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
              <X size={14} />
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
          {/* ⎋ */}
          <LogOut size={16} />
        </button>
      </div>

    </div>
  );
}

export default Sidebar;