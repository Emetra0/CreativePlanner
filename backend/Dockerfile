FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend ./
COPY deploy/selfhost/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh

RUN chmod +x /usr/local/bin/backend-entrypoint.sh

EXPOSE 8787

CMD ["/usr/local/bin/backend-entrypoint.sh"]
