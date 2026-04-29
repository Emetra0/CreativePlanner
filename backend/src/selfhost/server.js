import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import worker from '../worker.js';
import { attachCollaborationServer, createCollaborationNamespace } from './collaboration.js';
import { createD1CompatDatabase, createMariaDbPool, initializeMariaDb } from './db.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const backendRoot = path.resolve(currentDir, '../..');

function getBaseUrl(request) {
  const protocol = request.headers['x-forwarded-proto'] || 'http';
  const host = request.headers.host || `127.0.0.1:${process.env.PORT || 8787}`;
  return `${protocol}://${host}`;
}

function toHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
      continue;
    }
    if (typeof value === 'string') headers.set(name, value);
  }
  return headers;
}

function writeNodeResponse(response, nodeResponse) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  nodeResponse.writeHead(response.status, headers);
}

async function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function main() {
  const port = Number(process.env.PORT || 8787);
  const pool = await createMariaDbPool(process.env);
  await initializeMariaDb(pool, backendRoot, process.env);

  const env = {
    DB: createD1CompatDatabase(pool),
    COLLABORA_URL: process.env.COLLABORA_URL || '',
    WOPI_SECRET: process.env.WOPI_SECRET || '',
    WOPI_TOKEN_TTL_MS: process.env.WOPI_TOKEN_TTL_MS || '3600000',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    SELFHOST_DATA_DIR: process.env.SELFHOST_DATA_DIR || '/app/data/user-storage',
    SELFHOST_REPO_DIR: process.env.SELFHOST_REPO_DIR || '/workspace',
  };
  env.COLLAB_ROOM = createCollaborationNamespace(env);

  const server = http.createServer(async (request, response) => {
    try {
      const body = await readRequestBody(request);
      const runtimeRequest = new Request(new URL(request.url || '/', getBaseUrl(request)), {
        method: request.method,
        headers: toHeaders(request.headers),
        body,
      });
      const runtimeResponse = await worker.fetch(runtimeRequest, env);
      writeNodeResponse(runtimeResponse, response);

      if (!runtimeResponse.body) {
        response.end();
        return;
      }

      response.end(Buffer.from(await runtimeResponse.arrayBuffer()));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Self-host backend failed', detail: error instanceof Error ? error.message : 'Unknown error' }));
    }
  });

  attachCollaborationServer(server, env);

  server.listen(port, '0.0.0.0', () => {
    console.log(`Creative Planner self-host backend listening on ${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});