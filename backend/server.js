require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const dns = require('dns');

const conversationRoutes = require('./routes/conversationRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/conversations', conversationRoutes);

// API route to see if backend is working
app.get("/api", (req, res) => {
  res.json({
    "message": "Hello from backend"
  });
});

// ── Serve the built React frontend (for production) ──
// Serve the static files that React generates when you run 'npm run build'
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