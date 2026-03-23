# Use official Puppeteer image which includes Chromium and all required dependencies
FROM ghcr.io/puppeteer/puppeteer:latest

# Environment variables to skip downloading Chromium again since the image has it
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Create and set the working directory
WORKDIR /usr/src/app

# Switch to root temporarily to perform installation
USER root

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

# Change permissions so the node user can write to outputs and history
RUN mkdir -p /usr/src/app/outputs && chown -R pptruser:pptruser /usr/src/app/outputs

# Drop back to secure user
USER pptruser

# Expose the API Port
EXPOSE 3001

# Start the unified server
CMD ["npm", "start"]
