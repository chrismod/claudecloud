# Gloucester Glide – Spiel und Bestenlisten-Server in einem Container
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm test

FROM node:22-slim
ENV NODE_ENV=production PORT=8787 DB_FILE=/data/glide.db
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY shared ./shared
COPY server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
