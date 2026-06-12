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

const { loadEmbedder, resumeUnfinishedIndexing } = require('./controllers/ragController');

const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { handleStreamingMessage } = require('./controllers/conversationController');

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
async function connectToMongo() {
  const localUri = process.env.MONGO_URI_LOCAL;
  const cloudUri = process.env.MONGO_URI;

  if (localUri) {
    try {
      console.log('Trying LOCAL MongoDB first...');
      await mongoose.connect(localUri, { serverSelectionTimeoutMS: 5000 });
      return 'LOCAL';
    } catch (localErr) {
      console.warn('Local MongoDB unreachable:', localErr.message);
      console.warn('Falling back to cloud Atlas...');
    }
  }

  if (!cloudUri) {
    throw new Error('Local MongoDB failed and MONGO_URI (cloud) is not set — no database available.');
  }
  await mongoose.connect(cloudUri);
  return 'CLOUD';
}

const SummaryJob = require('./models/SummaryJob');

// ── Socket.IO: real-time streaming chat ──
// We wrap the Express app in an HTTP server so Socket.IO can share the same port.
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Make `io` available to controllers (so they can push events like indexing progress).
require('./utils/realtime').setIO(io);

// Authenticate each socket connection with the same JWT used by the REST routes.
// The client sends the token in the handshake auth (see frontend api/socket.js).
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('Not authorized'));
  try {
    socket.userId = jwt.verify(token, process.env.SECRET).id;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  // Join a room named after the user's id so the server can push events (chat tokens,
  // library indexing progress) to all of this user's open tabs.
  socket.join(String(socket.userId));

  // Stream a chat reply token-by-token. The handler emits 'chat:token' / 'chat:done' / 'chat:error'.
  socket.on('chat:send', (payload) => handleStreamingMessage(socket, payload));
});

connectToMongo()
  .then(async (which) => {
    console.log(`Connected to MongoDB (${which})`);

    // Any summary job still 'processing' was running in-process when the server
    // last stopped — that work died with the process and can't continue, so mark
    // these failed (otherwise the frontend would poll them forever).
    try {
      const r = await SummaryJob.updateMany(
        { status: 'processing' },
        { status: 'failed', error: 'The server restarted while this summary was in progress. Please try again.' }
      );
      if (r.modifiedCount) console.log(`[Summarize] Marked ${r.modifiedCount} interrupted job(s) as failed.`);
    } catch (e) {
      console.error('[Summarize] Could not clean up interrupted jobs:', e.message);
    }

    try {
      await loadEmbedder();

      resumeUnfinishedIndexing().catch(err =>
        console.error('[RAG] Resume pass failed:', err.message)
      );
    } catch (embedderErr) {
      console.error('[RAG] Embedder failed to load:', embedderErr.message);
      console.error('[RAG] Server will still start, but Library / RAG features will not work until this is fixed.');
    }

    server.listen(process.env.PORT || 4000, () => {
      console.log('Server running on port', process.env.PORT || 4000);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
  });