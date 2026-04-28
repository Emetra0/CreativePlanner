FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git docker-cli docker-cli-compose bash

COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund --loglevel=error

COPY backend ./
COPY deploy/selfhost/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
COPY deploy/selfhost/update-watcher.sh /usr/local/bin/update-watcher.sh

RUN chmod +x /usr/local/bin/backend-entrypoint.sh /usr/local/bin/update-watcher.sh

EXPOSE 8787

CMD ["/usr/local/bin/backend-entrypoint.sh"]
