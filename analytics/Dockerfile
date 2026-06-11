FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3002
EXPOSE 3002
CMD ["node", "server.js"]
