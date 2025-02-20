FROM node:18-alpine

WORKDIR /app

# Add package files first for better caching
COPY package.json package-lock.json* ./

# Fix npm installation issues by clearing cache and using clean install
RUN npm cache clean --force && npm ci --omit=dev

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Build TypeScript
RUN npm run build

# Expose the API port
EXPOSE 8080

# Start the worker
CMD ["npm", "start"]