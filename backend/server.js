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

const app = express();

app.use(cors());
app.use(express.json());


// ── Mount the routes ──
// Any URL starting with /api/auth goes to authRoutes (login, register, etc.)
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/transcribe', transcribeRoutes);

// ── Serve the built React frontend (for production) ──
app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

// For any URL that isn't an API route, serve the React app's main HTML file
app.use((req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'frontend', 'build', 'index.html'));
});

dns.setServers(['8.8.8.8', '1.1.1.1']);

// ── Start the server ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(process.env.PORT || 4000, () => {
      console.log('Server running on port', process.env.PORT || 4000);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
  });