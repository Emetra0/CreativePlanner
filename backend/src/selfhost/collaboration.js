import { WebSocketServer } from 'ws';
import {
  authenticateSessionToken,
  getCollaborationParticipant,
  getProjectAccess,
  getSharedMindmapSnapshot,
  persistSharedMindmapSnapshot,
} from '../worker.js';

class NodeCollaborationRoom {
  constructor(env) {
    this.env = env;
    this.clients = new Map();
    this.version = 0;
    this.writeChain = Promise.resolve();
  }

  async fetch() {
    return new Response('Expected websocket upgrade', { status: 426 });
  }

  buildParticipants() {
    const merged = new Map();

    for (const meta of this.clients.values()) {
      const existing = merged.get(meta.userId);
      const selectedNodeIds = Array.isArray(meta.selectedNodeIds) ? meta.selectedNodeIds : [];

      if (existing) {
        existing.selectedNodeIds = Array.from(new Set([...(existing.selectedNodeIds || []), ...selectedNodeIds]));
        existing.editingNodeIds = Array.from(new Set([...(existing.editingNodeIds || []), ...((meta.editingNodeIds || []))]));
        existing.presence = existing.presence || meta.presence || 'online';
        continue;
      }

      merged.set(meta.userId, {
        userId: meta.userId,
        username: meta.username || null,
        email: meta.email || null,
        avatarUrl: meta.avatar_url || null,
        bannerColor: meta.banner_color || null,
        presence: meta.presence || 'online',
        selectedNodeIds: [...selectedNodeIds],
        editingNodeIds: [...(meta.editingNodeIds || [])],
      });
    }

    return Array.from(merged.values()).sort((left, right) => (left.username || left.email || '').localeCompare(right.username || right.email || ''));
  }

  async broadcastParticipants() {
    const message = JSON.stringify({ type: 'presence', participants: this.buildParticipants() });
    for (const socket of this.clients.keys()) {
      if (socket.readyState !== 1) {
        this.clients.delete(socket);
        continue;
      }

      try {
        socket.send(message);
      } catch {
        this.clients.delete(socket);
      }
    }
  }

  async connect(socket, meta) {
    const participant = await getCollaborationParticipant(this.env, meta.userId);
    this.clients.set(socket, {
      ...meta,
      ...participant,
      selectedNodeIds: [],
      editingNodeIds: [],
      presence: participant?.presence || 'online',
    });

    socket.on('message', (buffer) => {
      this.writeChain = this.writeChain.then(() => this.handleMessage(socket, buffer)).catch(() => {});
    });

    const dropClient = () => {
      this.clients.delete(socket);
      this.writeChain = this.writeChain.then(() => this.broadcastParticipants()).catch(() => {});
    };

    socket.on('close', dropClient);
    socket.on('error', dropClient);

    const snapshot = await getSharedMindmapSnapshot(this.env, meta.projectId, meta.resourceId);
    if (snapshot) {
      socket.send(JSON.stringify({
        type: 'init',
        version: this.version,
        senderId: 'server',
        clientId: meta.clientId,
        participants: this.buildParticipants(),
        snapshot: { document: snapshot.document, data: snapshot.data },
      }));
    }

    await this.broadcastParticipants();
  }

  async handleMessage(socket, rawMessage) {
    const meta = this.clients.get(socket);
    if (!meta) return;

    let payload;
    try {
      payload = JSON.parse(rawMessage.toString());
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid collaboration payload' }));
      return;
    }

    if (payload?.type !== 'sync' && payload?.type !== 'op' && payload?.type !== 'presence') return;

    if (payload.type === 'presence') {
      meta.selectedNodeIds = Array.isArray(payload.selectedNodeIds)
        ? Array.from(new Set(payload.selectedNodeIds.filter((value) => typeof value === 'string')))
        : [];
      meta.editingNodeIds = Array.isArray(payload.editingNodeIds)
        ? Array.from(new Set(payload.editingNodeIds.filter((value) => typeof value === 'string')))
        : [];
      await this.broadcastParticipants();
      return;
    }

    if (meta.permission !== 'edit') {
      socket.send(JSON.stringify({ type: 'error', message: 'Read-only access' }));
      return;
    }

    if (payload.type === 'op') {
      this.version += 1;
      const message = JSON.stringify({
        type: 'op',
        version: this.version,
        senderId: meta.userId,
        clientId: meta.clientId,
        op: payload.op,
      });

      for (const client of this.clients.keys()) {
        if (client.readyState !== 1) continue;
        try {
          client.send(message);
        } catch {
          this.clients.delete(client);
        }
      }
      return;
    }

    if (!payload.snapshot?.document || !payload.snapshot?.data) return;

    const persisted = await persistSharedMindmapSnapshot(
      this.env,
      meta.projectId,
      meta.resourceId,
      payload.snapshot.document,
      payload.snapshot.data,
    );
    if (!persisted) {
      socket.send(JSON.stringify({ type: 'error', message: 'Unable to persist collaboration update' }));
      return;
    }

    this.version += 1;
    const message = JSON.stringify({
      type: 'snapshot',
      version: this.version,
      senderId: meta.userId,
      clientId: meta.clientId,
      snapshot: persisted,
    });

    for (const client of this.clients.keys()) {
      if (client.readyState !== 1) continue;
      try {
        client.send(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}

export function createCollaborationNamespace(env) {
  const rooms = new Map();

  const getRoom = (name) => {
    if (!rooms.has(name)) rooms.set(name, new NodeCollaborationRoom(env));
    return rooms.get(name);
  };

  return {
    idFromName(name) {
      return name;
    },
    get(name) {
      return getRoom(name);
    },
  };
}

export function attachCollaborationServer(server, env) {
  const websocketServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (!url.pathname.match(/^\/projects\/[^/]+\/resources\/[^/]+\/live$/)) {
        socket.destroy();
        return;
      }

      const token = url.searchParams.get('token');
      const clientId = url.searchParams.get('clientId') || crypto.randomUUID();
      const userId = await authenticateSessionToken(env, token);
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const [, , projectId, , resourceId] = url.pathname.split('/');
      const access = await getProjectAccess(env, projectId, userId);
      if (!access) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      const resource = await env.DB.prepare('SELECT resource_type FROM project_resources WHERE project_id = ? AND resource_id = ?').bind(projectId, resourceId).first();
      if (!resource || resource.resource_type !== 'mindmap') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      websocketServer.handleUpgrade(request, socket, head, (ws) => {
        const roomId = env.COLLAB_ROOM.idFromName(`${projectId}:${resourceId}`);
        const room = env.COLLAB_ROOM.get(roomId);
        room.connect(ws, {
          projectId,
          resourceId,
          userId,
          permission: access.permission || 'view',
          clientId,
        }).catch(() => {
          try {
            ws.close();
          } catch {
            // ignore close failures during upgrade cleanup
          }
        });
      });
    } catch {
      socket.destroy();
    }
  });

  return websocketServer;
}