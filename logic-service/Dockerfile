FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY .env.docker ./.env.docker

RUN npm run prisma:generate
RUN npm run build

EXPOSE 8003

CMD ["npm", "run", "start"]
