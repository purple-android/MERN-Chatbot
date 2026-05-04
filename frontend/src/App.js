import { useState, useEffect } from 'react';

import './App.css';

import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import InputBar from './components/InputBar';

import * as api from './api/conversations';


function App() {

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getAllConversations().then(setConversations);
  }, []);


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


  function handleInputChange(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }


  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="app">

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onNewChat={newChat}
        onOpen={openConversation}
        onDelete={deleteConversation}
      />

      <div className="main">

        {!activeId ? (
          <div className="welcome">
            <div className="welcome-icon">✦</div>
            <h1>What can I help with?</h1>
            <p>Start a new conversation below</p>
            <button className="start-btn" onClick={newChat}>
              Start chatting
            </button>
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