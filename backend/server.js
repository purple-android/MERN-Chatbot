// Polyfill: make sure the global 'crypto' object is available
// Some packages (mongoose, jsonwebtoken etc.) use crypto as a global without requiring it
// This line sets it up manually if it isn't already defined by the Node.js runtime
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const dns = require('dns');

const conversationRoutes = require('./routes/conversationRoutes');
const authRoutes = require('./routes/authRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const transcribeRoutes = require('./routes/transcribeRoutes');
const summarizeRoutes = require('./routes/summarizeRoutes');
const libraryRoutes = require('./routes/libraryRoutes');

const { loadEmbedder } = require('./controllers/ragController');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Mount the routes ──
// Any URL starting with /api/auth goes to authRoutes (login, register, etc.)
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/transcribe', transcribeRoutes);
app.use('/api/summarize', summarizeRoutes);
app.use('/api/library', libraryRoutes);

app.use((err, req, res, next) => {
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Your message is too large to send. Try using a shorter document.'
    });
  }
  // For any other Express-level error, pass it along
  next(err);
});

// ── Serve the built React frontend (for production) ──
app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

// For any URL that isn't an API route, serve the React app's main HTML file
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  if (res.headersSent) return;
  res.sendFile(path.resolve(__dirname, '..', 'frontend', 'build', 'index.html'));
});

dns.setServers(['8.8.8.8', '1.1.1.1']);

// ── Start the server ──
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');

    try {
      await loadEmbedder();
    } catch (embedderErr) {
      console.error('[RAG] Embedder failed to load:', embedderErr.message);
      console.error('[RAG] Server will still start, but Library / RAG features will not work until this is fixed.');
    }
    
    app.listen(process.env.PORT || 4000, () => {
      console.log('Server running on port', process.env.PORT || 4000);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
  });