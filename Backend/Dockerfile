FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3001

EXPOSE 3001

CMD ["node", "index.js"]
