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
import { uploadDocument } from './api/upload';
import { transcribeAudio } from './api/transcribe';

function App() {

  const [user, setUser]   = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // ── Chat state ──
  const [conversations, setConversations] = useState([]);
  const [activeId,       setActiveId]      = useState(null);
  const [messages,       setMessages]      = useState([]);
  const [input,          setInput]         = useState('');
  const [loading,        setLoading]       = useState(false);

    // ── Document attachment state ──
  const [attachedDoc, setAttachedDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

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
    if ((!input.trim() && !attachedDoc) || loading || !activeId) return;

    const userText = input.trim();
    setInput('');

    const textarea = document.querySelector('.input-box textarea');
    if (textarea) textarea.style.height = 'auto';

    const displayText = userText || `📄 ${attachedDoc.filename}`;

    let contentToSend;
    if (attachedDoc && userText) {
      contentToSend = `[Document: ${attachedDoc.filename}]\n\n${attachedDoc.text}\n\n---\n\n${userText}`;
    } else if (attachedDoc && !userText) {
      contentToSend = `[Document: ${attachedDoc.filename}]\n\n${attachedDoc.text}\n\n---\n\nPlease read the above document and summarize its key points.`;
    } else {
      contentToSend = userText;
    }

    setAttachedDoc(null);

    setMessages(prev => [...prev, { role: 'user', content: displayText }]);
    setLoading(true);

    const data = await api.sendMessage(activeId, contentToSend);

    setLoading(false);
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

    api.getAllConversations().then(setConversations);
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];

    if (!file) return;

    setUploading(true);

    const data = await uploadDocument(file);

    setUploading(false);

    if (data.error) {
      alert(data.error);
      return;
    }

    setAttachedDoc({ filename: data.filename, text: data.text });
  }

  function handleRemoveAttachment() {
    setAttachedDoc(null);
  }

  async function handleAudioSelect(e) {
    const file = e.target.files[0];

    if (!file) return;

    setTranscribing(true);

    const data = await transcribeAudio(file);
    setTranscribing(false);

    if (data.error) {
      alert(data.error);
      return;
    }

    setInput(data.text);

    setTimeout(() => {
      const textarea = document.querySelector('.input-box textarea');
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      }
    }, 0);
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
              attachedDoc={attachedDoc}
              uploading={uploading}
              onFileSelect={handleFileSelect}
              onRemoveAttachment={handleRemoveAttachment}
              transcribing={transcribing}
              onAudioSelect={handleAudioSelect} 
            />
          </>
        )}
      </div>
    </div>
  );
}

export default App;