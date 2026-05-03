require('dotenv').config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const mongoose = require("mongoose");
const dns = require('dns');

app.use(cors());

// API route
app.get("/api", (req, res) => {
  res.json({
    message: "Hello from backend"
  });
});

// Serve React static files
app.use(express.static(path.join(__dirname, "..", "frontend", "build")));

// Serve React app
app.use((req, res) => {
  res.sendFile(
    path.resolve(__dirname, "..", "frontend", "build", "index.html")
  );
});

const PORT = process.env.PORT || 4000;

dns.setServers(['8.8.8.8', '1.1.1.1']);

// Connect to MongoDB database, then start listening for requests
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to database');
    // Start the server on the port from the .env file
    app.listen(process.env.PORT, () => {
      console.log('Listening for requests on port', process.env.PORT);
    });
  })
  .catch((err) => {
    console.log(err);
  });
