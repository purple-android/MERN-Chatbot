// App.js — the root of the whole app
// Its only job is to hold all shared state and decide what to show on screen:
// either the login/register page (if not logged in) or the full chat UI (if logged in)

import { useState, useEffect, useRef } from 'react';
import './App.css';

// Import the four UI components we built — each one draws one section of the screen
import Sidebar  from './components/Sidebar';   // Left panel: logo, conversation list, user info
import ChatArea from './components/ChatArea';   // Middle: scrollable message bubbles
import InputBar from './components/InputBar';   // Bottom: textarea + send button
import AuthPage from './components/AuthPage';   // Full-screen login / register form
import LibraryPage from './components/LibraryPage'; // RAG knowledge base page

// Lucide icons used directly in App.js — the welcome screen sparkle and the mobile
// hamburger menu icon.
import { Sparkles, Menu } from 'lucide-react';

// APIs
import * as api from './api/conversations';
import { getMe } from './api/auth';
import { uploadDocument } from './api/upload';
import { transcribeAudio } from './api/transcribe';
import { summarizeDocument } from './api/summarize';

// ── App Component — the main function that builds the whole app ──
function App() {

  // ── Auth state ──
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // ── Chat state ──
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // ── Document attachment state ──
  const [attachedDoc, setAttachedDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);

  const [useLibrary, setUseLibrary] = useState(() => {
    const saved = localStorage.getItem('useLibrary');
    // localStorage stores strings. 'false' is the only value that means OFF —
    // everything else (including missing) means ON (the default).
    return saved !== 'false';
  });

  // ── handleToggleLibrary — flips the library on/off ──
  function handleToggleLibrary() {
    setUseLibrary(prev => {
      const next = !prev;
      localStorage.setItem('useLibrary', next ? 'true' : 'false');
      return next;
    });
  }

  const [useWebSearch, setUseWebSearch] = useState(() => {
    const saved = localStorage.getItem('useWebSearch');
    return saved === 'true';   // off unless they previously turned it on
  });

  // ── handleToggleWebSearch — flips web search on/off ──
  function handleToggleWebSearch() {
    setUseWebSearch(prev => {
      const next = !prev;
      localStorage.setItem('useWebSearch', next ? 'true' : 'false');
      return next;
    });
  }

  const [currentView, setCurrentView] = useState('chat');
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);


  // ── On app startup: check if the user is already logged in ──
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


  // ── Close the paperclip submenu when the user clicks anywhere outside it ──
  useEffect(() => {
    if (!attachMenuOpen) return;
    function closeMenu() { setAttachMenuOpen(false); }
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [attachMenuOpen]);

  // ── Load conversations whenever the logged-in user changes ──
  useEffect(() => {
    if (user) {
      api.getAllConversations().then(setConversations);
    }
  }, [user]);

    useEffect(() => {
    const lastAssistantMsg = [...messages].filter(m => m.role === 'assistant').pop();

    if (lastAssistantMsg && lastAssistantMsg.content) {
      const titleSnippet = lastAssistantMsg.content
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20);

      const suffix = lastAssistantMsg.content.trim().length > 20 ? '…' : '';
      document.title = titleSnippet + suffix || 'Llama Chat';
    } else {
      document.title = 'Llama Chat';
    }
  }, [messages]);

  // ── handleLogin — called by AuthPage after a successful login or register ──
  // token    — the JWT string returned by the backend
  // userData — the user object { _id, username, email }
  function handleLogin(token, userData) {
    localStorage.setItem('token', token);
    setUser(userData);
  }

  // ── handleLogout — logs the user out and resets everything to a blank state ──
  function handleLogout() {
    localStorage.removeItem('token');
    setUser(null);
    setConversations([]);
    setActiveId(null);
    setMessages([]);
    setInput('');
  }

  // ── openConversation — opens a specific chat and loads its messages ──
  // id — the MongoDB _id of the conversation to open
  async function openConversation(id) {
    setCurrentView('chat');
    setActiveId(id);
    const data = await api.getConversation(id);
    setMessages(data.messages);
    setSidebarOpen(false);
  }

  // ── openLibrary — switches the right-side view to the Library page ──
  // Called by the Sidebar when the user clicks the "📚 Library" button.
  function openLibrary() {
    setCurrentView('library');
    // Clear activeId so no chat row is highlighted while we're on the library page
    setActiveId(null);
    // On mobile, close the sidebar so the library page fills the screen
    setSidebarOpen(false);      
  }

  // ── newChat — creates a brand new empty conversation in the database ──
  async function newChat() {
    setCurrentView('chat');
    const data = await api.createConversation();
    setConversations(prev => [data, ...prev]);
    setActiveId(data._id);
    setMessages([]);
    setInput('');
    setSidebarOpen(false);
  }

  // ── sendMessage — sends the user's message and adds Llama's reply to the screen ──
  async function sendMessage() {
    if ((!input.trim() && !attachedDoc) || loading || !activeId) return;

    let userText = input.trim();
    setInput('');

    const textarea = document.querySelector('.input-box textarea');
    if (textarea) textarea.style.height = 'auto';

    setLoading(true);

    // ── Build what to DISPLAY in the chat bubble ──
    const displayText = userText || `📄 ${attachedDoc.filename}`;

    let docForThisMessage = attachedDoc;

    let userBubbleAlreadyShown = false;

    const docNeedsSummary      = docForThisMessage && docForThisMessage.text.length >= 80000;
    const userTextNeedsSummary = userText.length >= 80000;

    if (docNeedsSummary || userTextNeedsSummary) {

      setMessages(prev => [
        ...prev,
        { role: 'user', content: displayText },
        { role: 'assistant', content: '⏳ Summarizing your input first because it is very large. This can take several minutes for very long content — please wait...' }      ]);
      userBubbleAlreadyShown = true;

    if (docNeedsSummary) {
      const docSummaryResult = await summarizeDocument(docForThisMessage.text);
      
      if (docSummaryResult.error) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `⚠️ Could not summarize the document: ${docSummaryResult.error}`
            };
            return updated;
          });
          setAttachedDoc(null);
          setLoading(false); // re-enable the buttons so the user can try again
          return;
        }

        // Success — replace the document's text with the much shorter summary.
        // The spread operator (...) copies the existing filename and overrides only the text.
        docForThisMessage = { ...docForThisMessage, text: docSummaryResult.summary };

      }

      if (userTextNeedsSummary) {
        const userTextSummaryResult = await summarizeDocument(userText);

        if (userTextSummaryResult.error) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `⚠️ Could not summarize your message: ${userTextSummaryResult.error}`
            };
            return updated;
          });
          setAttachedDoc(null);
          setLoading(false);
          return;
        }

        // Replace the typed text with its summary (this is why userText was declared with 'let')
        userText = userTextSummaryResult.summary;
      }

      setMessages(prev => prev.slice(0, -1));
    }

    // ── Build what to actually SEND to the AI ──
    let contentToSend;
    if (docForThisMessage && userText) {
      // Document (or its summary) + typed question
      contentToSend = `[Document: ${docForThisMessage.filename}]\n\n${docForThisMessage.text}\n\n---\n\n${userText}`;
    } else if (docForThisMessage && !userText) {
      // Document (or its summary) with no question — ask the AI to summarize/explain it
      contentToSend = `[Document: ${docForThisMessage.filename}]\n\n${docForThisMessage.text}\n\n---\n\nPlease read the above and explain its key points.`;
    } else {
      contentToSend = userText;
    }

    setAttachedDoc(null);
    
    if (!userBubbleAlreadyShown) {
      setMessages(prev => [...prev, { role: 'user', content: displayText }]);
    }    
    
    // Send the full content (including document text if any) to the backend
    // We wrap in try-catch so a network failure (Wi-Fi drops, server down, etc.)
    // shows an error bubble instead of silently crashing
    let data;
    try {
      data = await api.sendMessage(activeId, contentToSend, useLibrary, useWebSearch);
    } catch (err) {
      // Network-level failure (could not even reach the server)
      setLoading(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Could not reach the server. Please check your connection and try again.'
      }]);
      return;
    }

    setLoading(false);

    if (data.error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${data.error}` }]);
      return;
    }
    
    setMessages(prev => [...prev, {
      role:       'assistant',
      content:    data.reply,
      sources:    data.sources || [],
      webSources: data.webSources || []
    }]);
    
    api.getAllConversations().then(setConversations);
  }

  // ── handleAttachClick — toggles the paperclip submenu open and closed ──
  function handleAttachClick() {
    setAttachMenuOpen(prev => !prev);
  }

  // ── handleDocSelect — called when the user picks a document from the paperclip submenu ──
  async function handleDocSelect(e) {
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


  // ── handleAudioFileSelect — called when the user picks an audio file from the paperclip submenu ──
  // Routes the file to /api/transcribe (not /api/upload like documents)
  async function handleAudioFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    setTranscribing(true);
    const data = await transcribeAudio(file);
    setTranscribing(false);

    if (data.error) {
      alert(data.error);
      return;
    }

    if (data.source) {
      console.log(`[Whisper] Transcribed using: ${data.source === 'local' ? '💻 Local Whisper (your laptop)' : '☁️  Groq API'}`);
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


  // ── handleRemoveAttachment — removes the attached document without sending it ──
  function handleRemoveAttachment() {
    setAttachedDoc(null);
  }

  // ── handleMicClick — starts recording when clicked, stops recording when clicked again ──
  async function handleMicClick() {

    // ── If already recording: stop ──
    if (recording) {
      // Calling .stop() triggers the 'onstop' event defined below, which handles the rest
      mediaRecorderRef.current.stop();
      return;
    }

    // ── If not recording: start ──
    try {

      // Ask the browser for microphone permission
      // This shows the "Allow microphone" popup — if the user clicks Block we go to catch below
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create a MediaRecorder from the mic stream — it handles the actual audio capturing
      const mediaRecorder = new MediaRecorder(stream);

      // Save it to our ref so the stop-click can reach it
      mediaRecorderRef.current = mediaRecorder;

      // Clear any leftover chunks from a previous recording
      audioChunksRef.current = [];

      // ── ondataavailable — fires repeatedly while recording ──
      // MediaRecorder doesn't give us one big file — it sends pieces (chunks) over time
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      // ── onstop — fires when .stop() is called ──
      // This is where we assemble the audio, send it to the backend, and put text in the box
      mediaRecorder.onstop = async () => {

        stream.getTracks().forEach(track => track.stop());

        setRecording(false);
        setTranscribing(true);

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });

        const data = await transcribeAudio(audioFile);

        setTranscribing(false);

        if (data.error) {
          alert(data.error);
          return;
        }

        if (data.source) {
          console.log(`[Whisper] Transcribed using: ${data.source === 'local' ? '💻 Local Whisper (your laptop)' : '☁️  Groq API'}`);
        }

        setInput(data.text);

        setTimeout(() => {
          const textarea = document.querySelector('.input-box textarea');
          if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
          }
        }, 0);
      };

      mediaRecorder.start();

      setRecording(true);

    } catch (err) {
      alert('Could not access microphone. Please allow microphone permission in your browser.');
    }
  }

  // ── deleteConversation — permanently removes a conversation from the database ──
  // id — the MongoDB _id of the conversation to delete
  async function deleteConversation(id) {
    await api.deleteConversation(id);
    setConversations(prev => prev.filter(c => c._id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  // ── handleInputChange — updates the input state and auto-resizes the textarea ──
  // e — the browser event object, which contains info about what was typed
  function handleInputChange(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }

  // ── handleKeyDown — sends the message when Enter is pressed ──
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (!authChecked) return null;

  if (!user) return <AuthPage onLogin={handleLogin} />;

  return (
    <div className="app">

      <div
        className={`sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        user={user}
        onNewChat={newChat}
        onOpen={openConversation}
        onDelete={deleteConversation}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentView={currentView}       // 'chat' or 'library' — used to highlight the Library button
        onLibrary={openLibrary}         // Called when the "📚 Library" button is clicked        
      />

      <div className="main">

        <div className="mobile-header">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            title="Open menu"
          >
            <Menu size={22} />
          </button>
          <span className="mobile-app-title">Llama Chat</span>
        </div>

        {currentView === 'library' ? (
          <LibraryPage />
        ) : !activeId ? (
          // ── Welcome screen ──
          <div className="welcome">
            {/* <div className="welcome-icon">✦</div> */}
            <div className="welcome-icon">
              <Sparkles size={36} />
            </div>
            <h1>Hi, {user.username} 👋</h1>
            <p>What can I help with today?</p>
            <button className="start-btn" onClick={newChat}>Start chatting</button>
          </div>
        ) : (
          // ── Chat view — shown when a conversation is open ──
          // <> </> is a React Fragment — it lets us return two elements without a wrapper div
          <>
            <ChatArea
              messages={messages}
              loading={loading}
            />

            <InputBar
              input={input}
              loading={loading}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onSend={sendMessage}
              attachedDoc={attachedDoc}
              uploading={uploading}
              onAttachClick={handleAttachClick}
              attachMenuOpen={attachMenuOpen}
              onAttachClose={() => setAttachMenuOpen(false)}
              onDocSelect={handleDocSelect}
              onAudioFileSelect={handleAudioFileSelect}
              onRemoveAttachment={handleRemoveAttachment}
              transcribing={transcribing}
              recording={recording}
              onMicClick={handleMicClick}
              useLibrary={useLibrary}                          // Whether RAG / library search is currently ON
              onToggleLibrary={handleToggleLibrary}            // Flips the library toggle
              useWebSearch={useWebSearch}                      // Whether web search is currently ON
              onToggleWebSearch={handleToggleWebSearch}        // Flips the web search toggle
            />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
