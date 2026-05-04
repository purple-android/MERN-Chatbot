import { useState, useEffect } from 'react';
import './App.css';

// UI components
import Sidebar  from './components/Sidebar';
import ChatArea from './components/ChatArea';
import InputBar from './components/InputBar';
import AuthPage from './components/AuthPage';

// API functions
import * as api      from './api/conversations';
import { getMe }     from './api/auth';


function App() {

  const [user, setUser]   = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // ── Chat state ──
  const [conversations, setConversations] = useState([]);
  const [activeId,       setActiveId]      = useState(null);
  const [messages,       setMessages]      = useState([]);
  const [input,          setInput]         = useState('');
  const [loading,        setLoading]       = useState(false);

  useEffect(() => {
    async function checkExistingSession() {
      const token = localStorage.getItem('token');

      if (token) {
        const data = await getMe(token);

        if (data.user) {
          setUser(data.user);
        } else {
          localStorage.removeItem('token');
        }
      }

      setAuthChecked(true);
    }

    checkExistingSession();
  }, []);


  useEffect(() => {
    if (user) {
      api.getAllConversations().then(setConversations);
    }
  }, [user]);


  function handleLogin(token, userData) {
    localStorage.setItem('token', token);
    setUser(userData);
  }


  function handleLogout() {
    localStorage.removeItem('token');
    setUser(null);
    setConversations([]);
    setActiveId(null);
    setMessages([]);
    setInput('');
  }


  async function openConversation(id) {
    setActiveId(id);
    const data = await api.getConversation(id);
    setMessages(data.messages);
  }

  async function newChat() {
    const data = await api.createConversation();
    setConversations(prev => [data, ...prev]);
    setActiveId(data._id);
    setMessages([]);
    setInput('');
  }

  async function sendMessage() {
    if (!input.trim() || loading || !activeId) return;

    const userText = input.trim();
    setInput('');

    const textarea = document.querySelector('.input-box textarea');
    if (textarea) textarea.style.height = 'auto';

    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    const data = await api.sendMessage(activeId, userText);

    setLoading(false);
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

    api.getAllConversations().then(setConversations);
  }


  async function deleteConversation(id) {
    await api.deleteConversation(id);
    setConversations(prev => prev.filter(c => c._id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  // ── handleInputChange — updates input and resizes the textarea ──
  function handleInputChange(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }

  // ── handleKeyDown — Enter sends the message, Shift+Enter adds a new line ──
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }


  // ── Render ──

  // Still checking localStorage — show nothing to avoid a flash of the login screen
  if (!authChecked) return null;

  // Not logged in — show the auth page (login / register)
  if (!user) return <AuthPage onLogin={handleLogin} />;

  // Logged in — show the full chat UI
  return (
    <div className="app">

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        user={user}
        onNewChat={newChat}
        onOpen={openConversation}
        onDelete={deleteConversation}
        onLogout={handleLogout}
      />

      <div className="main">
        {!activeId ? (
          <div className="welcome">
            <div className="welcome-icon">✦</div>
            <h1>Hi, {user.username} 👋</h1>
            <p>What can I help with today?</p>
            <button className="start-btn" onClick={newChat}>Start chatting</button>
          </div>
        ) : (
          <>
            <ChatArea messages={messages} loading={loading} />
            <InputBar
              input={input}
              loading={loading}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onSend={sendMessage}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default App;