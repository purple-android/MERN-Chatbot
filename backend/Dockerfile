# Dockerfile
# This file tells Render (or any server) exactly how to build and run this app.
# Instead of using Render's automatic Node.js setup, we control every step ourselves.
# This lets us install the system libraries that the 'canvas' package needs for PDF OCR.

# ── Step 1: Choose the base image ──
# Think of this as picking a fresh Linux computer to work on.
# 'node:18-bullseye' is an official image that comes with Node.js 18 already installed,
# running on Debian Bullseye (a stable version of Linux).
FROM node:18-bullseye

# ── Step 2: Install system libraries ──
# These are Linux-level libraries (not npm packages) that the 'canvas' package needs.
# 'canvas' uses them to draw PDF pages as images so Tesseract can read the text.
# apt-get is Linux's package manager (like npm but for the whole operating system).
# The '&& rm -rf /var/lib/apt/lists/*' at the end just cleans up the package list
# after installing — saves disk space.
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Step 3: Set the working directory ──
# All following commands will run inside this folder inside the container.
# Think of it as doing 'cd /app' — this is where our project will live.
WORKDIR /app

# ── Step 4: Copy package.json first and install npm packages ──
# We copy package.json BEFORE copying the rest of the code.
# This is a performance trick: if your code changes but package.json doesn't,
# Docker skips re-running npm install and uses the cached result instead.
COPY package*.json ./
RUN npm install

# ── Step 5: Copy the rest of the project files ──
# Now copy all the actual code files into the container.
# The .dockerignore file (see below) tells Docker which folders to skip.
COPY . .

# ── Step 6: Tell Docker which port this app listens on ──
# This is just documentation — it doesn't actually open the port.
# It tells Render "this app listens on port 4000".
EXPOSE 4000

# ── Step 7: The command to start the server ──
# This runs when the container starts — same as typing 'node server.js' in the terminal.
CMD ["node", "server.js"]
