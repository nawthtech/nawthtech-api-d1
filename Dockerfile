# Development Dockerfile for NawthTech Worker
FROM node:20-alpine AS development

# Install dependencies for building
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    git \
    openssl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY wrangler.toml ./

# Install dependencies
RUN npm ci --only=development

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8787/health || exit 1

# Start development server
CMD ["npm", "run", "dev"]

# Production Dockerfile
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY wrangler.toml ./

# Install production dependencies
RUN npm ci --only=production

# Copy built files
COPY --from=development /app/dist ./dist
COPY --from=development /app/src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8787/health || exit 1

# Start production server
CMD ["npm", "start"]