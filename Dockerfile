FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund --loglevel=error

COPY index.html ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY postcss.config.js ./
COPY tailwind.config.ts ./
COPY public ./public
COPY src ./src

ARG VITE_WORKER_URL=/api
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_WORKER_URL=${VITE_WORKER_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/selfhost/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 443
