# Use official Puppeteer image which includes Chromium and all required dependencies
FROM ghcr.io/puppeteer/puppeteer:latest

# The base image already has Chromium installed and handles paths correctly.

# Create and set the working directory
WORKDIR /usr/src/app

# Switch to root temporarily to perform installation
USER root

# Setup Puppeteer Cache in the app folder so it survives user switching
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache

# Copy package configurations
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install root dependencies
RUN npm install

# Install frontend dependencies
RUN cd frontend && npm install

# Copy source code (respects .gitignore)
COPY . .

# Build the Vite frontend application
RUN cd frontend && npm run build

# Change permissions so the node user can access the Chrome cache and write to outputs
RUN mkdir -p /usr/src/app/outputs && chown -R pptruser:pptruser /usr/src/app

# Drop back to secure user
USER pptruser

# Expose the API Port
EXPOSE 3001

# Start the unified server
CMD ["npm", "start"]
