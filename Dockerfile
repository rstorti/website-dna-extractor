# Slim Node 20 base — much smaller than ghcr.io/puppeteer/puppeteer (~3.5 GB)
FROM node:20-slim

# Install only the minimal Chromium system dependencies needed by Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer where to cache Chrome and skip auto-download (we'll install via postinstall)
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

WORKDIR /usr/src/app

# Copy package configs first for layer caching
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install backend deps (postinstall script downloads Chrome)
RUN npm install && npm cache clean --force

# Install frontend deps
RUN cd frontend && npm install && npm cache clean --force

# Copy source code
COPY . .

# Build Vite frontend
RUN cd frontend && npm run build

# Create outputs dir
RUN mkdir -p /usr/src/app/outputs

EXPOSE 3001

CMD ["npm", "start"]
