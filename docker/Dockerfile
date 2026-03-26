FROM node:22-alpine

WORKDIR /app

# Install backend deps
COPY package.json package-lock.json* ./
RUN npm ci --production

# Build frontend
COPY ui/package.json ui/package-lock.json* ./ui/
RUN cd ui && npm ci
COPY ui/ ./ui/
RUN cd ui && npm run build

# Copy backend
COPY src/ ./src/

# Create data dirs
RUN mkdir -p data/ca data/certs

EXPOSE 3000 5353/udp

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

VOLUME ["/app/data"]

CMD ["node", "src/server.js"]
