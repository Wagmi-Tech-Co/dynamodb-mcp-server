FROM node:20-alpine AS builder

WORKDIR /app

# Enable yarn
RUN corepack enable

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies (skip scripts to avoid build issues)
RUN yarn install --frozen-lockfile --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Production stage
FROM node:20-alpine AS release

WORKDIR /app

# Enable yarn
RUN corepack enable

# Copy package files
COPY package.json yarn.lock ./

# Install production dependencies only (skip scripts)
RUN yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mcp -u 1001

# Change ownership of the app directory
RUN chown -R mcp:nodejs /app
USER mcp

# Set environment
ENV NODE_ENV=production

# Expose port (optional, for future HTTP support)
EXPOSE 8080

# Use exec form for proper signal handling
ENTRYPOINT ["node", "dist/index.js"]
