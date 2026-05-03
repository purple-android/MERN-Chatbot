const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

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

app.listen(PORT, () => {
  console.log("Server running");
});