# Dockerfile
# Builds the entire app — backend + frontend — into one container.
# The Express backend runs the server AND serves the built React frontend as static files.

# ── Base image ──
# node:18-bullseye = Node.js 18 on Debian Bullseye (a stable Linux version)
# This gives us Node.js pre-installed and a full Linux environment to work in
FROM node:18-bullseye

# ── Install system libraries ──
# These are Linux-level packages (not npm packages) required by the 'canvas' npm package
# 'canvas' is used for PDF OCR — it draws PDF pages as images so Tesseract can read them
# Without these, 'canvas' crashes on Linux even if it installed fine via npm
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Set working directory ──
# All following commands run inside /app inside the container
# Think of it as: the container's version of your project folder
WORKDIR /app

# ── Install backend dependencies ──
# We copy package.json BEFORE copying the source code — this is a Docker caching trick:
# if package.json hasn't changed, Docker skips re-running npm install on the next build
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# ── Install frontend dependencies ──
# Same caching trick for the frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# ── Copy all source code ──
# Now that dependencies are installed, copy the actual code files
COPY backend ./backend
COPY frontend ./frontend

# ── Build the React frontend ──
# 'npm run build' compiles the React app into plain HTML/CSS/JS files in frontend/build/
# CI=false stops React from treating warnings as errors (which would break the build)
RUN cd frontend && CI=false npm run build

# ── Tell Docker which port the app listens on ──
# This is just documentation — it tells Railway "this app uses port 4000"
EXPOSE 4000

# ── Start the server ──
# This command runs when the container starts — same as typing 'node server.js' locally
CMD ["node", "backend/server.js"]
