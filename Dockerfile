FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY dist/ dist/
COPY src/frontend/ src/frontend/

EXPOSE 4117

ENTRYPOINT ["node", "dist/index.js"]
