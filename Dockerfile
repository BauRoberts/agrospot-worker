FROM node:18

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies without using npm ci
RUN npm install

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