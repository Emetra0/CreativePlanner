
import * as OTPAuth from 'otpauth';

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function authenticateSessionToken(env, token) {
  if (!token) return null;
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').bind(token, Date.now()).first();
  return session?.user_id || null;
}

let tempStoreTableReady = false;

async function ensureTempStoreTable(env) {
  if (tempStoreTableReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS temp_store (
      id TEXT PRIMARY KEY,
      data TEXT,
      expires_at INTEGER
    )
  `).run();
  tempStoreTableReady = true;
}

function toBase64Url(input) {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return atob(normalized + padding);
}

async function signOfficeToken(env, payload) {
  const data = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.WOPI_SECRET || env.COLLABORA_URL || 'creative-planner-office'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const signature = toBase64Url(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  return `${toBase64Url(data)}.${signature}`;
}

async function verifyOfficeToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) return null;

  const payloadString = fromBase64Url(payloadPart);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.WOPI_SECRET || env.COLLABORA_URL || 'creative-planner-office'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expectedBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadString));
  const expectedSignature = toBase64Url(String.fromCharCode(...new Uint8Array(expectedBuffer)));
  if (expectedSignature !== signaturePart) return null;

  try {
    const payload = JSON.parse(payloadString);
    if (!payload?.expiresAt || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function base64ToBytes(content) {
  const binary = atob(content || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function getOfficeExtension(kind) {
  if (kind === 'spreadsheet') return 'ods';
  if (kind === 'presentation') return 'odp';
  return 'odt';
}

function getOfficeLockId(fileId) {
  return `OFFICE_LOCK:${fileId}`;
}

async function getOfficeLock(env, fileId) {
  await ensureTempStoreTable(env);
  const record = await env.DB.prepare('SELECT data, expires_at FROM temp_store WHERE id = ?').bind(getOfficeLockId(fileId)).first();
  if (!record) return null;
  if (Number(record.expires_at || 0) <= Date.now()) {
    await env.DB.prepare('DELETE FROM temp_store WHERE id = ?').bind(getOfficeLockId(fileId)).run();
    return null;
  }
  try {
    return JSON.parse(record.data);
  } catch {
    return null;
  }
}

async function setOfficeLock(env, fileId, lockValue, userId) {
  await ensureTempStoreTable(env);
  const expiresAt = Date.now() + 30 * 60 * 1000;
  await env.DB.prepare(`
    INSERT INTO temp_store (id, data, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      expires_at = excluded.expires_at
  `).bind(getOfficeLockId(fileId), JSON.stringify({ lockValue, userId }), expiresAt).run();
}

async function clearOfficeLock(env, fileId) {
  await ensureTempStoreTable(env);
  await env.DB.prepare('DELETE FROM temp_store WHERE id = ?').bind(getOfficeLockId(fileId)).run();
}

let projectPermissionColumnsReady = false;

async function ensureProjectPermissionColumns(env) {
  if (projectPermissionColumnsReady) return;
  const statements = [
    "ALTER TABLE project_members ADD COLUMN clearance_level INTEGER NOT NULL DEFAULT 10",
    "ALTER TABLE project_members ADD COLUMN is_page_admin INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE project_members ADD COLUMN can_share INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE project_members ADD COLUMN can_create_nodes INTEGER NOT NULL DEFAULT 1",
  ];
  for (const statement of statements) {
    try {
      await env.DB.prepare(statement).run();
    } catch {
      // Ignore duplicate-column errors after the first successful migration.
    }
  }
  projectPermissionColumnsReady = true;
}

function normalizeProjectMemberCapabilities(member, fallbackPermission = 'view') {
  return {
    user_id: member?.user_id || null,
    role: member?.role || 'Viewer',
    permission: member?.permission || fallbackPermission,
    clearance_level: Number(member?.clearance_level ?? 10),
    is_page_admin: Number(member?.is_page_admin ?? 0),
    can_share: Number(member?.can_share ?? 0),
    can_create_nodes: Number(member?.can_create_nodes ?? 1),
  };
}

async function getMindmapMemberCapabilities(env, projectId, userId) {
  await ensureProjectPermissionColumns(env);
  const project = await env.DB.prepare('SELECT owner_id FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return null;
  if (project.owner_id === userId) {
    return {
      project,
      isOwner: true,
      user_id: userId,
      role: 'Owner',
      permission: 'edit',
      clearance_level: 999,
      is_page_admin: 1,
      can_share: 1,
      can_create_nodes: 1,
    };
  }

  const member = await env.DB.prepare('SELECT user_id, role, permission, clearance_level, is_page_admin, can_share, can_create_nodes FROM project_members WHERE project_id = ? AND user_id = ?').bind(projectId, userId).first();
  if (!member) return null;
  return { project, isOwner: false, ...normalizeProjectMemberCapabilities(member) };
}

function getNodeAcl(node) {
  return node?.data?.accessControl || null;
}

function getNodeAccessLevel(node, memberCapabilities) {
  if (!memberCapabilities) return 'none';
  if (memberCapabilities.isOwner || Number(memberCapabilities.is_page_admin)) return 'write';

  const acl = getNodeAcl(node);
  if (!acl) {
    if (memberCapabilities.permission === 'edit') return 'write';
    if (memberCapabilities.permission === 'request_edit') return 'suggest';
    return 'read';
  }

  if (acl.ownerUserId && acl.ownerUserId === memberCapabilities.user_id) return 'write';

  const roleRules = Array.isArray(acl.roleRules) ? acl.roleRules : [];
  const rule = roleRules.find((entry) => entry?.role === memberCapabilities.role);
  const minimumRead = Number(acl.minClearanceToRead ?? acl.minClearanceToWrite ?? 0);
  const minimumWrite = Number(acl.minClearanceToWrite ?? minimumRead);

  let access = 'none';
  if (rule?.access) access = rule.access;
  else if (memberCapabilities.clearance_level >= minimumWrite) access = 'write';
  else if (memberCapabilities.clearance_level >= minimumRead) access = 'read';

  if (memberCapabilities.permission === 'view' && access === 'write') return 'read';
  if (memberCapabilities.permission === 'request_edit' && access === 'write') return 'suggest';
  return access;
}

function canReadNode(node, memberCapabilities) {
  return getNodeAccessLevel(node, memberCapabilities) !== 'none';
}

function canWriteNode(node, memberCapabilities) {
  return getNodeAccessLevel(node, memberCapabilities) === 'write';
}

function buildDefaultNodeAcl(memberCapabilities) {
  const level = Number(memberCapabilities?.clearance_level ?? 10);
  return {
    ownerUserId: memberCapabilities?.user_id || null,
    ownerRole: memberCapabilities?.role || 'Viewer',
    minClearanceToRead: level,
    minClearanceToWrite: level,
    roleRules: memberCapabilities?.role ? [{ role: memberCapabilities.role, access: 'write' }] : [],
  };
}

function sanitizeIncomingNode(node, memberCapabilities) {
  const nextNode = { ...node, data: { ...(node?.data || {}) } };
  delete nextNode.selected;
  delete nextNode.dragging;
  delete nextNode.resizing;
  if (!nextNode.data.accessControl) nextNode.data.accessControl = buildDefaultNodeAcl(memberCapabilities);
  return nextNode;
}

function sanitizeIncomingEdge(edge) {
  const nextEdge = { ...edge };
  delete nextEdge.selected;
  return nextEdge;
}

function filterMindmapDataForMember(data, memberCapabilities) {
  const sourceNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const visibleNodes = sourceNodes.filter((node) => canReadNode(node, memberCapabilities));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = (Array.isArray(data?.edges) ? data.edges : []).filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  return {
    ...data,
    nodes: visibleNodes,
    edges: visibleEdges,
    categories: Array.isArray(data?.categories) ? data.categories : [],
    theme: data?.theme,
  };
}

function mergeMindmapDataForMember(existingData, incomingData, memberCapabilities) {
  const currentNodes = Array.isArray(existingData?.nodes) ? existingData.nodes : [];
  const incomingNodes = Array.isArray(incomingData?.nodes) ? incomingData.nodes : [];
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  const incomingById = new Map(incomingNodes.map((node) => [node.id, node]));
  const nextNodes = [];

  for (const currentNode of currentNodes) {
    const incomingNode = incomingById.get(currentNode.id);
    if (!incomingNode) {
      if (!canWriteNode(currentNode, memberCapabilities)) nextNodes.push(currentNode);
      continue;
    }

    if (!canWriteNode(currentNode, memberCapabilities)) {
      nextNodes.push(currentNode);
      continue;
    }

    const sanitizedIncomingNode = sanitizeIncomingNode(incomingNode, memberCapabilities);
    if (!memberCapabilities.isOwner && !Number(memberCapabilities.is_page_admin)) {
      sanitizedIncomingNode.data.accessControl = currentNode?.data?.accessControl || sanitizedIncomingNode.data.accessControl;
    }
    nextNodes.push(sanitizedIncomingNode);
  }

  for (const incomingNode of incomingNodes) {
    if (currentById.has(incomingNode.id)) continue;
    if (!Number(memberCapabilities?.can_create_nodes ?? 0) && !memberCapabilities?.isOwner && !Number(memberCapabilities?.is_page_admin)) continue;
    nextNodes.push(sanitizeIncomingNode(incomingNode, memberCapabilities));
  }

  const nextNodeIds = new Set(nextNodes.map((node) => node.id));
  const currentEdges = Array.isArray(existingData?.edges) ? existingData.edges : [];
  const incomingEdges = Array.isArray(incomingData?.edges) ? incomingData.edges : [];
  const currentEdgeById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  const incomingEdgeById = new Map(incomingEdges.map((edge) => [edge.id, edge]));
  const nextEdges = [];

  const canWriteEdge = (edge) => {
    const sourceNode = nextNodes.find((node) => node.id === edge.source) || currentById.get(edge.source);
    const targetNode = nextNodes.find((node) => node.id === edge.target) || currentById.get(edge.target);
    return !!sourceNode && !!targetNode && canWriteNode(sourceNode, memberCapabilities) && canWriteNode(targetNode, memberCapabilities);
  };

  for (const currentEdge of currentEdges) {
    const incomingEdge = incomingEdgeById.get(currentEdge.id);
    if (!incomingEdge) {
      if (!canWriteEdge(currentEdge)) nextEdges.push(currentEdge);
      continue;
    }
    nextEdges.push(canWriteEdge(currentEdge) ? sanitizeIncomingEdge(incomingEdge) : currentEdge);
  }

  for (const incomingEdge of incomingEdges) {
    if (currentEdgeById.has(incomingEdge.id)) continue;
    if (!nextNodeIds.has(incomingEdge.source) || !nextNodeIds.has(incomingEdge.target)) continue;
    if (!canWriteEdge(incomingEdge)) continue;
    nextEdges.push(sanitizeIncomingEdge(incomingEdge));
  }

  return {
    ...existingData,
    ...incomingData,
    nodes: nextNodes,
    edges: nextEdges,
    categories: Array.isArray(incomingData?.categories) ? incomingData.categories : Array.isArray(existingData?.categories) ? existingData.categories : [],
    theme: incomingData?.theme || existingData?.theme,
  };
}

export async function getProjectAccess(env, projectId, userId) {
  const access = await getMindmapMemberCapabilities(env, projectId, userId);
  if (!access) return null;
  return { project: access.project, permission: access.permission || 'view', isOwner: !!access.isOwner, member: access };
}

async function getUserData(env, userId) {
  const row = await env.DB.prepare('SELECT content FROM data WHERE user_id = ?').bind(userId).first();
  return row?.content ? JSON.parse(row.content) : {};
}

async function persistUserData(env, userId, data) {
  await env.DB.prepare(`
    INSERT INTO data (user_id, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      content = excluded.content,
      updated_at = excluded.updated_at
  `).bind(userId, JSON.stringify(data), Date.now()).run();
}

async function getUserOfficeSnapshot(env, ownerId, documentId) {
  const ownerData = await getUserData(env, ownerId);
  const office = ownerData?.officeDocuments || {};
  const documents = Array.isArray(office.documents) ? office.documents : [];
  const dataById = office.dataById || {};
  const document = documents.find((entry) => entry.id === documentId) || null;
  const data = dataById[documentId] || null;
  if (!document || !data) return null;
  return { ownerData, document, data };
}

async function persistUserOfficeSnapshot(env, ownerId, document, data) {
  const ownerData = await getUserData(env, ownerId);
  const nextOffice = ownerData.officeDocuments || { documents: [], dataById: {} };
  const nextDocuments = Array.isArray(nextOffice.documents) ? [...nextOffice.documents] : [];
  const nextDataById = { ...(nextOffice.dataById || {}) };
  const existingIndex = nextDocuments.findIndex((entry) => entry.id === document.id);
  const normalizedDocument = {
    ...document,
    id: document.id,
    extension: document.extension || getOfficeExtension(document.kind),
    lastModified: Number(data?.updatedAt || document?.lastModified || Date.now()),
  };
  const normalizedData = {
    encoding: 'base64',
    content: data?.content || '',
    size: Number(data?.size || base64ToBytes(data?.content || '').byteLength),
    updatedAt: Number(data?.updatedAt || Date.now()),
  };

  if (existingIndex >= 0) nextDocuments[existingIndex] = { ...nextDocuments[existingIndex], ...normalizedDocument };
  else nextDocuments.push(normalizedDocument);
  nextDataById[document.id] = normalizedData;
  ownerData.officeDocuments = { documents: nextDocuments, dataById: nextDataById };
  await persistUserData(env, ownerId, ownerData);
  return { document: normalizedDocument, data: normalizedData };
}

function buildCollaboraLaunchUrl(collaboraUrl, { wopiSrc, accessToken, accessTokenTtl, document }) {
  if (!collaboraUrl) return '';

  if (collaboraUrl.includes('{WOPI_SRC}') || collaboraUrl.includes('{ACCESS_TOKEN}')) {
    return collaboraUrl
      .replaceAll('{WOPI_SRC}', encodeURIComponent(wopiSrc))
      .replaceAll('{ACCESS_TOKEN}', encodeURIComponent(accessToken))
      .replaceAll('{ACCESS_TOKEN_TTL}', String(accessTokenTtl))
      .replaceAll('{TITLE}', encodeURIComponent(document.title || 'Document'));
  }

  const launchUrl = new URL(collaboraUrl);
  launchUrl.searchParams.set('WOPISrc', wopiSrc);
  launchUrl.searchParams.set('access_token', accessToken);
  launchUrl.searchParams.set('access_token_ttl', String(accessTokenTtl));
  return launchUrl.toString();
}

function resolveCollaboraUrl(env, overrideUrl) {
  const normalizedOverride = typeof overrideUrl === 'string' ? overrideUrl.trim() : '';
  if (normalizedOverride) return normalizedOverride;
  return (env.COLLABORA_URL || '').trim();
}

function sanitizeStorageSegment(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function getSelfhostStorageTools(env) {
  const storageRoot = (env.SELFHOST_DATA_DIR || '').trim() || '/app/.wrangler/user-storage';

  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    return { storageRoot, fs, path };
  } catch {
    return null;
  }
}

async function getSelfhostUpdateTools(env) {
  const repoDir = (env.SELFHOST_REPO_DIR || '').trim() || '/workspace';

  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    return {
      fs,
      path,
      repoDir,
      stateFile: path.join(repoDir, '.selfhost-update-state.json'),
      requestFile: path.join(repoDir, '.selfhost-update-request.json'),
      logFile: path.join(repoDir, '.selfhost-update.log'),
    };
  } catch {
    return null;
  }
}

function parseGithubRepoFromRemote(remoteUrl) {
  if (!remoteUrl) return null;

  const normalized = String(remoteUrl).trim();
  const httpsMatch = normalized.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

async function getSelfhostRepoRemote(env) {
  const tools = await getSelfhostUpdateTools(env);
  if (!tools) return null;

  try {
    const gitConfigPath = tools.path.join(tools.repoDir, '.git', 'config');
    const raw = await tools.fs.readFile(gitConfigPath, 'utf8');
    const remoteMatch = raw.match(/\[remote\s+"origin"\][^\[]*?url\s*=\s*(.+)/i);
    return remoteMatch?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

async function getSelfhostUpdateNotes(env, currentCommit, remoteCommit) {
  if (!currentCommit || !remoteCommit || currentCommit === remoteCommit) return [];

  const remoteUrl = await getSelfhostRepoRemote(env);
  const repoMeta = parseGithubRepoFromRemote(remoteUrl);
  if (!repoMeta) return [];

  try {
    const response = await fetch(`https://api.github.com/repos/${repoMeta.owner}/${repoMeta.repo}/compare/${currentCommit}...${remoteCommit}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'CreativePlanner-Selfhost-Updater',
      },
    });

    if (!response.ok) return [];

    const payload = await response.json();
    return Array.isArray(payload?.commits)
      ? payload.commits.slice(0, 10).map((commit) => ({
          id: commit.sha,
          shortId: commit.sha?.slice(0, 7) || '',
          message: commit.commit?.message?.split('\n')[0] || 'Update',
          author: commit.commit?.author?.name || 'Unknown',
        }))
      : [];
  } catch {
    return [];
  }
}

async function readSelfhostUpdateState(env) {
  const tools = await getSelfhostUpdateTools(env);
  if (!tools) return null;

  try {
    const raw = await tools.fs.readFile(tools.stateFile, 'utf8');
    const state = JSON.parse(raw);
    const changes = await getSelfhostUpdateNotes(env, state?.currentCommit, state?.remoteCommit);
    return { ...state, changes };
  } catch {
    return {
      status: 'unavailable',
      branch: '',
      currentCommit: '',
      remoteCommit: '',
      updateAvailable: false,
      changes: [],
      lastError: 'Self-host updater is not initialized yet.',
      lastChecked: Date.now(),
    };
  }
}

async function queueSelfhostUpdate(env, requestedBy) {
  const tools = await getSelfhostUpdateTools(env);
  if (!tools) return false;

  await tools.fs.writeFile(tools.requestFile, JSON.stringify({ requestedAt: Date.now(), requestedBy }, null, 2), 'utf8');
  return true;
}

async function writeSelfhostUserSnapshot(env, userId, data) {
  const tools = await getSelfhostStorageTools(env);
  if (!tools) return false;

  const userDir = tools.path.join(tools.storageRoot, sanitizeStorageSegment(userId));
  const filePath = tools.path.join(userDir, 'app-data.json');
  await tools.fs.mkdir(userDir, { recursive: true });
  await tools.fs.writeFile(filePath, JSON.stringify({ data, updatedAt: Date.now() }, null, 2), 'utf8');
  return true;
}

async function readSelfhostUserSnapshot(env, userId) {
  const tools = await getSelfhostStorageTools(env);
  if (!tools) return null;

  try {
    const filePath = tools.path.join(tools.storageRoot, sanitizeStorageSegment(userId), 'app-data.json');
    const raw = await tools.fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resolveOfficeTokenContext(env, accessToken, fileId) {
  const payload = await verifyOfficeToken(env, accessToken);
  if (!payload || payload.fileId !== fileId) return null;

  if (payload.projectId && payload.resourceId) {
    const snapshot = await getSharedOfficeSnapshot(env, payload.projectId, payload.resourceId);
    if (!snapshot) return null;
    return {
      ...payload,
      ownerId: snapshot.resource.owner_id,
      document: snapshot.document,
      data: snapshot.data,
    };
  }

  const snapshot = await getUserOfficeSnapshot(env, payload.ownerId, payload.fileId);
  if (!snapshot) return null;
  return { ...payload, document: snapshot.document, data: snapshot.data };
}

export async function getSharedMindmapSnapshot(env, projectId, resourceId) {
  const resource = await env.DB.prepare('SELECT * FROM project_resources WHERE project_id = ? AND resource_id = ?').bind(projectId, resourceId).first();
  if (!resource || resource.resource_type !== 'mindmap') return null;

  const ownerDataRow = await env.DB.prepare('SELECT content FROM data WHERE user_id = ?').bind(resource.owner_id).first();
  const ownerData = ownerDataRow?.content ? JSON.parse(ownerDataRow.content) : {};
  const mindmaps = ownerData?.mindmaps || {};
  const documents = Array.isArray(mindmaps.documents) ? mindmaps.documents : [];
  const dataById = mindmaps.dataById || {};
  const document = documents.find((doc) => doc.id === resource.resource_id) || null;
  const data = dataById[resource.resource_id] || null;
  if (!document || !data) return null;

  return { resource, ownerData, document, data };
}

export async function persistSharedMindmapSnapshot(env, projectId, resourceId, document, data) {
  const existing = await env.DB.prepare('SELECT * FROM project_resources WHERE project_id = ? AND resource_id = ?').bind(projectId, resourceId).first();
  if (!existing || existing.resource_type !== 'mindmap') return null;

  const ownerDataRow = await env.DB.prepare('SELECT content FROM data WHERE user_id = ?').bind(existing.owner_id).first();
  const ownerData = ownerDataRow?.content ? JSON.parse(ownerDataRow.content) : {};
  const nextMindmaps = ownerData.mindmaps || { documents: [], dataById: {} };
  const nextDocuments = Array.isArray(nextMindmaps.documents) ? [...nextMindmaps.documents] : [];
  const nextDataById = { ...(nextMindmaps.dataById || {}) };
  const existingIndex = nextDocuments.findIndex((doc) => doc.id === resourceId);
  const normalizedDocument = { ...document, id: resourceId };

  if (existingIndex >= 0) nextDocuments[existingIndex] = { ...nextDocuments[existingIndex], ...normalizedDocument };
  else nextDocuments.push(normalizedDocument);
  nextDataById[resourceId] = data;

  ownerData.mindmaps = { documents: nextDocuments, dataById: nextDataById };

  await env.DB.prepare(`
    INSERT INTO data (user_id, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      content = excluded.content,
      updated_at = excluded.updated_at
  `).bind(existing.owner_id, JSON.stringify(ownerData), Date.now()).run();

  if (normalizedDocument.title) {
    await env.DB.prepare('UPDATE project_resources SET resource_name = ? WHERE project_id = ? AND resource_id = ?')
      .bind(normalizedDocument.title, projectId, resourceId).run();
  }

  return { document: normalizedDocument, data };
}

async function getSharedOfficeSnapshot(env, projectId, resourceId) {
  const resource = await env.DB.prepare('SELECT * FROM project_resources WHERE project_id = ? AND resource_id = ?').bind(projectId, resourceId).first();
  if (!resource || resource.resource_type !== 'document') return null;

  const ownerDataRow = await env.DB.prepare('SELECT content FROM data WHERE user_id = ?').bind(resource.owner_id).first();
  const ownerData = ownerDataRow?.content ? JSON.parse(ownerDataRow.content) : {};
  const office = ownerData?.officeDocuments || {};
  const documents = Array.isArray(office.documents) ? office.documents : [];
  const dataById = office.dataById || {};
  const document = documents.find((doc) => doc.id === resource.resource_id) || null;
  const data = dataById[resource.resource_id] || null;
  if (!document || !data) return null;

  return { resource, ownerData, document, data };
}

async function persistSharedOfficeSnapshot(env, projectId, resourceId, document, data) {
  const existing = await env.DB.prepare('SELECT * FROM project_resources WHERE project_id = ? AND resource_id = ?').bind(projectId, resourceId).first();
  if (!existing || existing.resource_type !== 'document') return null;

  const ownerDataRow = await env.DB.prepare('SELECT content FROM data WHERE user_id = ?').bind(existing.owner_id).first();
  const ownerData = ownerDataRow?.content ? JSON.parse(ownerDataRow.content) : {};
  const nextOffice = ownerData.officeDocuments || { documents: [], dataById: {} };
  const nextDocuments = Array.isArray(nextOffice.documents) ? [...nextOffice.documents] : [];
  const nextDataById = { ...(nextOffice.dataById || {}) };
  const existingIndex = nextDocuments.findIndex((doc) => doc.id === resourceId);
  const normalizedDocument = { ...document, id: resourceId };

  if (existingIndex >= 0) nextDocuments[existingIndex] = { ...nextDocuments[existingIndex], ...normalizedDocument };
  else nextDocuments.push(normalizedDocument);
  nextDataById[resourceId] = data;

  ownerData.officeDocuments = { documents: nextDocuments, dataById: nextDataById };

  await env.DB.prepare(`
    INSERT INTO data (user_id, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      content = excluded.content,
      updated_at = excluded.updated_at
  `).bind(existing.owner_id, JSON.stringify(ownerData), Date.now()).run();

  if (normalizedDocument.title) {
    await env.DB.prepare('UPDATE project_resources SET resource_name = ? WHERE project_id = ? AND resource_id = ?')
      .bind(normalizedDocument.title, projectId, resourceId).run();
  }

  return { document: normalizedDocument, data };
}

export async function getCollaborationParticipant(env, userId) {
  const participant = await env.DB.prepare('SELECT id, username, email, avatar_url, banner_color, banner_image, presence FROM users WHERE id = ?').bind(userId).first();
  return participant || { id: userId, username: 'Collaborator', email: null, avatar_url: null, banner_color: null, banner_image: null, presence: 'online' };
}

export class CollaborationRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
    this.writeChain = Promise.resolve();
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

    return Array.from(merged.values()).sort((a, b) => (a.username || a.email || '').localeCompare(b.username || b.email || ''));
  }

  async broadcastParticipants() {
    const message = JSON.stringify({ type: 'presence', participants: this.buildParticipants() });
    for (const socket of this.clients.keys()) {
      try {
        socket.send(message);
      } catch {
        this.clients.delete(socket);
      }
    }
  }

  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected websocket upgrade', { status: 426 });
    }

    const projectId = request.headers.get('x-project-id');
    const resourceId = request.headers.get('x-resource-id');
    const userId = request.headers.get('x-user-id');
    const permission = request.headers.get('x-permission') || 'view';
    const clientId = request.headers.get('x-client-id') || crypto.randomUUID();
    if (!projectId || !resourceId || !userId) return new Response('Missing collaboration metadata', { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const participant = await getCollaborationParticipant(this.env, userId);
    this.clients.set(server, {
      projectId,
      resourceId,
      userId,
      permission,
      clientId,
      ...participant,
      selectedNodeIds: [],
      editingNodeIds: [],
      presence: participant?.presence || 'online',
    });
    server.addEventListener('message', (event) => {
      this.writeChain = this.writeChain.then(() => this.handleMessage(server, event)).catch(() => {});
    });
    const dropClient = () => {
      this.clients.delete(server);
      this.writeChain = this.writeChain.then(() => this.broadcastParticipants()).catch(() => {});
    };
    server.addEventListener('close', dropClient);
    server.addEventListener('error', dropClient);

    const snapshot = await getSharedMindmapSnapshot(this.env, projectId, resourceId);
    const version = (await this.state.storage.get('version')) || 0;
    if (snapshot) {
      server.send(JSON.stringify({
        type: 'init',
        version,
        senderId: 'server',
        clientId,
        participants: this.buildParticipants(),
        snapshot: { document: snapshot.document, data: snapshot.data },
      }));
    }

    await this.broadcastParticipants();

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleMessage(server, event) {
    const meta = this.clients.get(server);
    if (!meta) return;

    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      server.send(JSON.stringify({ type: 'error', message: 'Invalid collaboration payload' }));
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
      server.send(JSON.stringify({ type: 'error', message: 'Read-only access' }));
      return;
    }
    if (payload.type === 'op') {
      const version = ((await this.state.storage.get('version')) || 0) + 1;
      await this.state.storage.put('version', version);
      const message = JSON.stringify({
        type: 'op',
        version,
        senderId: meta.userId,
        clientId: meta.clientId,
        op: payload.op,
      });

      for (const socket of this.clients.keys()) {
        try {
          socket.send(message);
        } catch {
          this.clients.delete(socket);
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
      server.send(JSON.stringify({ type: 'error', message: 'Unable to persist collaboration update' }));
      return;
    }

    const version = ((await this.state.storage.get('version')) || 0) + 1;
    await this.state.storage.put('version', version);
    const message = JSON.stringify({
      type: 'snapshot',
      version,
      senderId: meta.userId,
      clientId: meta.clientId,
      snapshot: persisted,
    });

    for (const socket of this.clients.keys()) {
      try {
        socket.send(message);
      } catch {
        this.clients.delete(socket);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    const officeFileMatch = url.pathname.match(/^\/office\/wopi\/files\/([^/]+)$/);
    const officeContentsMatch = url.pathname.match(/^\/office\/wopi\/files\/([^/]+)\/contents$/);
    if (officeFileMatch || officeContentsMatch) {
      const fileId = decodeURIComponent((officeContentsMatch || officeFileMatch)[1]);
      const accessToken = url.searchParams.get('access_token') || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const context = await resolveOfficeTokenContext(env, accessToken, fileId);
      if (!context) {
        return new Response(JSON.stringify({ error: 'Invalid or expired office token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (officeContentsMatch && request.method === 'GET') {
        return new Response(base64ToBytes(context.data.content), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(Number(context.data.size || 0)),
          },
        });
      }

      if (officeFileMatch && request.method === 'GET') {
        return new Response(JSON.stringify({
          BaseFileName: `${context.document.title}.${context.document.extension || getOfficeExtension(context.document.kind)}`,
          OwnerId: context.ownerId,
          UserId: context.userId,
          UserFriendlyName: context.username || 'Creative Planner User',
          Version: String(context.data.updatedAt || context.document.lastModified || Date.now()),
          Size: Number(context.data.size || 0),
          UserCanWrite: context.permission !== 'view',
          SupportsUpdate: context.permission !== 'view',
          SupportsLocks: true,
          SupportsRename: false,
          ReadOnly: context.permission === 'view',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (officeFileMatch && request.method === 'POST') {
        const override = (request.headers.get('X-WOPI-Override') || '').toUpperCase();
        const requestedLock = request.headers.get('X-WOPI-Lock') || '';
        const existingLock = await getOfficeLock(env, fileId);

        if (override === 'LOCK' || override === 'REFRESH_LOCK') {
          if (existingLock && existingLock.lockValue !== requestedLock) {
            return new Response('', { status: 409, headers: { ...corsHeaders, 'X-WOPI-Lock': existingLock.lockValue } });
          }
          await setOfficeLock(env, fileId, requestedLock, context.userId);
          return new Response('', { status: 200, headers: { ...corsHeaders, 'X-WOPI-ItemVersion': String(context.data.updatedAt || Date.now()) } });
        }

        if (override === 'UNLOCK') {
          if (existingLock && existingLock.lockValue !== requestedLock) {
            return new Response('', { status: 409, headers: { ...corsHeaders, 'X-WOPI-Lock': existingLock.lockValue } });
          }
          await clearOfficeLock(env, fileId);
          return new Response('', { status: 200, headers: corsHeaders });
        }

        if (override === 'GET_LOCK') {
          return new Response('', { status: 200, headers: existingLock?.lockValue ? { ...corsHeaders, 'X-WOPI-Lock': existingLock.lockValue } : corsHeaders });
        }

        return new Response('', { status: 501, headers: corsHeaders });
      }

      if (officeContentsMatch && request.method === 'POST') {
        if (context.permission === 'view') {
          return new Response(JSON.stringify({ error: 'Read-only access' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const existingLock = await getOfficeLock(env, fileId);
        const requestedLock = request.headers.get('X-WOPI-Lock') || '';
        if (existingLock && existingLock.lockValue !== requestedLock) {
          return new Response('', { status: 409, headers: { ...corsHeaders, 'X-WOPI-Lock': existingLock.lockValue } });
        }

        const buffer = new Uint8Array(await request.arrayBuffer());
        const updatedAt = Date.now();
        const updatedDocument = { ...context.document, lastModified: updatedAt };
        const updatedData = {
          encoding: 'base64',
          content: bytesToBase64(buffer),
          size: buffer.byteLength,
          updatedAt,
        };

        if (context.projectId && context.resourceId) {
          await persistSharedOfficeSnapshot(env, context.projectId, context.resourceId, updatedDocument, updatedData);
        } else {
          await persistUserOfficeSnapshot(env, context.ownerId, updatedDocument, updatedData);
        }

        return new Response('', { status: 200, headers: { ...corsHeaders, 'X-WOPI-ItemVersion': String(updatedAt) } });
      }

      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

      if (url.pathname.match(/^\/projects\/[^/]+\/resources\/[^/]+\/live$/)) {
        const token = url.searchParams.get('token');
        const clientId = url.searchParams.get('clientId') || crypto.randomUUID();
        const wsUserId = await authenticateSessionToken(env, token);
        if (!wsUserId) {
          return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: corsHeaders });
        }

        const parts = url.pathname.split('/');
        const projectId = parts[2];
        const resourceId = parts[4];
        const access = await getProjectAccess(env, projectId, wsUserId);
        if (!access) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
        }

        const resource = await env.DB.prepare('SELECT resource_type FROM project_resources WHERE project_id = ? AND resource_id = ?').bind(projectId, resourceId).first();
        if (!resource || resource.resource_type !== 'mindmap') {
          return new Response(JSON.stringify({ error: 'Resource not found' }), { status: 404, headers: corsHeaders });
        }

        const roomId = env.COLLAB_ROOM.idFromName(`${projectId}:${resourceId}`);
        const stub = env.COLLAB_ROOM.get(roomId);
        const proxyHeaders = new Headers(request.headers);
        proxyHeaders.set('x-project-id', projectId);
        proxyHeaders.set('x-resource-id', resourceId);
        proxyHeaders.set('x-user-id', wsUserId);
        proxyHeaders.set('x-permission', access.permission || 'view');
        proxyHeaders.set('x-client-id', clientId);
        return stub.fetch(new Request(request, { headers: proxyHeaders }));
      }

    try {
      // ---------------------------------------------------------------
      // BOOTSTRAP ADMIN  (one-time, no auth required)
      // Creates the very first admin account when no admins exist yet.
      // Self-disabling: returns 403 once any admin account is present.
      // This account should be deleted once real admins are promoted.
      // ---------------------------------------------------------------
      if (url.pathname === '/bootstrap-admin' && request.method === 'POST') {
          // 1. Hard-refuse if ANY admin already exists
          const existingAdmin = await env.DB.prepare(
              "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
          ).first();
          if (existingAdmin) {
              return new Response(
                  JSON.stringify({ error: 'An admin account already exists. Bootstrap is disabled.' }),
                  { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
          }

          // 2. Validate input
          const { username, password } = await request.json();
          if (!username || !password) {
              return new Response(
                  JSON.stringify({ error: 'username and password are required.' }),
                  { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
          }
          if (username.trim().length < 3) {
              return new Response(
                  JSON.stringify({ error: 'username must be at least 3 characters.' }),
                  { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
          }
          if (password.length < 12) {
              return new Response(
                  JSON.stringify({ error: 'Bootstrap admin password must be at least 12 characters.' }),
                  { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
          }

          // 3. Hash the password
          const salt = crypto.randomUUID();
          const hash = await hashPassword(password, salt);
          const storedHash = `${salt}:${hash}`;
          const userId = crypto.randomUUID();

          // 4. Insert — email is admin@local (not a real domain, clearly internal)
          await env.DB.prepare(
              'INSERT INTO users (id, email, username, password_hash, created_at, role, status, subscription_status, auth_provider, is_bootstrap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(userId, 'admin@local', username.trim(), storedHash, Date.now(), 'admin', 'active', 'free', 'local', 1).run();

          return new Response(
              JSON.stringify({
                  success: true,
                  message: 'Bootstrap admin created. Log in and promote real admins, then delete this account.',
                  email: 'admin@local',
                  username: username.trim()
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
      }

      // Register
      if (url.pathname === '/register' && request.method === 'POST') {
        const { email, password, username } = await request.json();
        if (!email || !password) return new Response('Missing email or password', { status: 400, headers: corsHeaders });

        const salt = crypto.randomUUID(); // Simple salt
        const hash = await hashPassword(password, salt);
        const storedHash = `${salt}:${hash}`; // Store salt and hash together
        const userId = crypto.randomUUID();

        const regDisc = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        try {
            // Default role is 'user', status is 'pending', auth_provider is 'local'
            await env.DB.prepare('INSERT INTO users (id, email, username, discriminator, password_hash, created_at, role, status, subscription_status, auth_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(userId, email, username || null, regDisc, storedHash, Date.now(), 'user', 'pending', 'free', 'local').run();
        } catch (e) {
            if (e.message.includes('UNIQUE')) {
                return new Response(JSON.stringify({ error: 'Email or Username already exists' }), { status: 409, headers: corsHeaders });
            }
            throw e;
        }

        return new Response(JSON.stringify({ success: true, userId, message: 'Account created. Please wait for admin approval.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // --- 2FA RESET REQUEST FLOW ---
      // Email sending is not yet available. Users file a request here;
      // an admin reviews it in the dashboard and manually resets 2FA after
      // verifying the user's identity via their backup email.

      if (url.pathname === '/auth/2fa-reset-request' && request.method === 'POST') {
          const { email, backupEmail } = await request.json();

          if (!email || !backupEmail) {
              return new Response(JSON.stringify({ error: 'Account email and backup email are required.' }), { status: 400, headers: corsHeaders });
          }

          // Look up account by email OR username — always return success to prevent enumeration
          const user = await env.DB.prepare('SELECT id, email, two_factor_enabled FROM users WHERE email = ? OR username = ?').bind(email, email).first();

          if (user && user.two_factor_enabled) {
              const requestId = `2FA_RESET_REQ:${crypto.randomUUID()}`;
              const payload = JSON.stringify({
                  userId: user.id,
                  email: user.email,
                  backupEmail,
                  submittedAt: Date.now()
              });
              // Request expires after 7 days
              await env.DB.prepare('INSERT INTO temp_store (id, data, expires_at) VALUES (?, ?, ?)').bind(requestId, payload, Date.now() + 7 * 24 * 60 * 60 * 1000).run();
          }

          // Always return the same response
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -------------------------------------------------------------------
      // HACK / SECURITY REPORT  (public — no auth required)
      // User can report a compromised account; admin can then reset pwd.
      // -------------------------------------------------------------------
      if (url.pathname === '/auth/report-hack' && request.method === 'POST') {
          const { email, backupEmail, description } = await request.json();

          if (!email || !backupEmail) {
              return new Response(JSON.stringify({ error: 'Account email and backup email are required.' }), { status: 400, headers: corsHeaders });
          }

          // Look up account — always return success to prevent enumeration
          const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ? OR username = ?').bind(email, email).first();

          if (user) {
              const reportId = `SEC_REPORT:${crypto.randomUUID()}`;
              const payload = JSON.stringify({
                  userId: user.id,
                  accountEmail: user.email,
                  backupEmail,
                  description: description || '',
                  submittedAt: Date.now(),
                  status: 'pending',
              });
              // Reports expire after 30 days
              await env.DB.prepare('INSERT INTO temp_store (id, data, expires_at) VALUES (?, ?, ?)').bind(reportId, payload, Date.now() + 30 * 24 * 60 * 60 * 1000).run();
          }

          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Google Login Callback
      if (url.pathname === '/auth/google/callback' && request.method === 'POST') {
          const { code, redirectUri } = await request.json();
          const clientId = env.GOOGLE_CLIENT_ID;
          const clientSecret = env.GOOGLE_CLIENT_SECRET;

          if (!clientId || !clientSecret) {
            return new Response(JSON.stringify({ error: 'Google OAuth is not configured' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          try {
              console.log('Exchanging Google Code:', code.substring(0, 10) + '...', 'Redirect:', redirectUri);

              const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                      code,
                      client_id: clientId,
                      client_secret: clientSecret,
                      redirect_uri: redirectUri,
                      grant_type: 'authorization_code'
                  })
              });
              
              const tokenData = await tokenResponse.json();
              if (!tokenData.access_token) {
                  console.error('Google Token Error:', tokenData);
                  return new Response(JSON.stringify({ error: 'Failed to get access token from Google', details: tokenData.error + ': ' + tokenData.error_description }), { status: 400, headers: corsHeaders });
              }

              // Get User Info
              const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                  headers: { Authorization: `Bearer ${tokenData.access_token}` }
              });
              const userData = await userResponse.json();
              
              if (!userData.email) {
                  return new Response(JSON.stringify({ error: 'Failed to get email from Google' }), { status: 400, headers: corsHeaders });
              }

              // Find or Create User
              let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(userData.email).first();
              
              if (!user) {
                  // NEW USER: Require Username Setup
                  // Create a temporary session token for the signup flow
                  // user_id format: PENDING_GOOGLE_SIGNUP:<email>
                  const signupToken = crypto.randomUUID();
                  const pendingId = `PENDING_GOOGLE_SIGNUP:${userData.email}`;
                  // Store Google Token/Profile data in pending_signups table
                  await env.DB.prepare('INSERT INTO pending_signups (id, email, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(signupToken, userData.email, userData.name || '', Date.now(), Date.now() + 15 * 60 * 1000).run();

                  return new Response(JSON.stringify({ 
                      requiresSignup: true, 
                      signupToken: signupToken,
                      email: userData.email,
                      defaultName: userData.name 
                  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }

              // EXISTING USER
              
              if (user.status === 'pending') {
                  return new Response(JSON.stringify({ error: 'Account pending approval' }), { status: 403, headers: corsHeaders });
              }
              if (user.status === 'banned' || user.status === 'rejected') {
                  return new Response(JSON.stringify({ error: 'Account suspended' }), { status: 403, headers: corsHeaders });
              }

              // 1. Check for 2FA
              if (user.two_factor_enabled) {
                  // Generate temporary token for 2FA verification
                  const tempToken = crypto.randomUUID();
                  // user_id format: PENDING_2FA:<user_id>
                  await env.DB.prepare('INSERT INTO temp_store (id, data, expires_at) VALUES (?, ?, ?)').bind(tempToken, `PENDING_2FA:${user.id}`, Date.now() + 5 * 60 * 1000).run();
                  
                  return new Response(JSON.stringify({ require2fa: true, tempToken }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }

              // 2. Normal Login
              const sessionId = crypto.randomUUID();
              await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(sessionId, user.id, Date.now() + 30 * 24 * 60 * 60 * 1000).run();

              return new Response(JSON.stringify({ 
                  token: sessionId, 
                  user: { id: user.id, email: user.email, username: user.username, role: user.role, two_factor_enabled: !!user.two_factor_enabled, auth_provider: 'google' } 
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          } catch (e) {
              return new Response(JSON.stringify({ error: 'Google auth failed', details: e.message }), { status: 500, headers: corsHeaders });
          }
      }

      // Google Signup - Get 2FA Params (New Endpoint)
      if (url.pathname === '/auth/google/signup-params' && request.method === 'POST') {
          const { signupToken } = await request.json();
          
          // Verify signup token
          const session = await env.DB.prepare('SELECT * FROM pending_signups WHERE id = ? AND expires_at > ?').bind(signupToken, Date.now()).first();
          if (!session) {
              return new Response(JSON.stringify({ error: 'Invalid or expired signup session' }), { status: 401, headers: corsHeaders });
          }
          
          // Extract email
          const email = session.email;

          // Generate Secret
          const secret = new OTPAuth.Secret({ size: 20 });
          const base32Secret = secret.base32;
          
          const totp = new OTPAuth.TOTP({
              issuer: "CreativePlanner",
              label: email,
              algorithm: "SHA1",
              digits: 6,
              period: 30,
              secret: secret
          });
          
          return new Response(JSON.stringify({ success: true, secret: base32Secret, uri: totp.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Google Signup Completion
      if (url.pathname === '/auth/google/complete-signup' && request.method === 'POST') {
          const { signupToken, username, twoFactorSecret, twoFactorCode } = await request.json();
          
          if (!username || username.trim().length < 3) {
             return new Response(JSON.stringify({ error: 'Username must be at least 3 characters' }), { status: 400, headers: corsHeaders });
          }

          const session = await env.DB.prepare('SELECT * FROM pending_signups WHERE id = ? AND expires_at > ?').bind(signupToken, Date.now()).first();
          
          if (!session) {
              return new Response(JSON.stringify({ error: 'Invalid or expired signup session' }), { status: 401, headers: corsHeaders });
          }
          
          // Validate 2FA if provided
          let is2faEnabled = 0;
          let storedSecret = null;
          
          if (twoFactorSecret || twoFactorCode) {
              if (!twoFactorSecret || !twoFactorCode) {
                  return new Response(JSON.stringify({ error: 'Both 2FA secret and code are required' }), { status: 400, headers: corsHeaders });
              }
              
              const totp = new OTPAuth.TOTP({
                  issuer: "CreativePlanner",
                  label: "Verify",
                  algorithm: "SHA1",
                  digits: 6,
                  period: 30,
                  secret: OTPAuth.Secret.fromBase32(twoFactorSecret)
              });
              
              const delta = totp.validate({ token: twoFactorCode, window: 1 });
              if (delta === null) {
                  return new Response(JSON.stringify({ error: 'Invalid 2FA code' }), { status: 400, headers: corsHeaders });
              }
              
              is2faEnabled = 1;
              storedSecret = twoFactorSecret;
          }

          const email = session.email;
          
          // Check if username taken
          const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
          if (existing) {
              return new Response(JSON.stringify({ error: 'Username already taken' }), { status: 409, headers: corsHeaders });
          }

          // Create User
          const userId = crypto.randomUUID();
          // Random password for Google users
          const randomPwd = crypto.randomUUID(); 
          const salt = crypto.randomUUID();
          const hash = await hashPassword(randomPwd, salt);
          const storedHash = `${salt}:${hash}`;

          const googleDisc = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
          try {
              // Status defaults to 'pending' to require admin approval
              await env.DB.prepare('INSERT INTO users (id, email, username, discriminator, password_hash, created_at, role, status, subscription_status, two_factor_enabled, two_factor_secret, auth_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(userId, email, username, googleDisc, storedHash, Date.now(), 'user', 'pending', 'free', is2faEnabled, storedSecret, 'google').run();
          } catch(e) {
               return new Response(JSON.stringify({ error: 'Creation failed: ' + e.message }), { status: 500, headers: corsHeaders });
          }
          
          // Delete signup token
          try {
              // Try delete from both just in case
              await env.DB.prepare('DELETE FROM pending_signups WHERE id = ?').bind(signupToken).run();
              await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(signupToken).run();
          } catch(e) { console.error("Cleanup error", e); }

          // DO NOT Log in immediately for pending users.
          // Return success but indicate approval is needed.
          
          return new Response(JSON.stringify({ 
              success: true,
              pendingApproval: true,
              message: 'Account created. Please wait for admin approval.',
              user: { id: userId, email: email, username: username, role: 'user', two_factor_enabled: !!is2faEnabled, auth_provider: 'google' } 
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      // Google 2FA Verification (step 2)
      if (url.pathname === '/auth/google/verify-2fa' && request.method === 'POST') {
          const { tempToken, code } = await request.json();
          
          const session = await env.DB.prepare('SELECT * FROM temp_store WHERE id = ? AND expires_at > ?').bind(tempToken, Date.now()).first();
          
          if (!session || !session.data.startsWith('PENDING_2FA:')) {
              return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401, headers: corsHeaders });
          }

          const userId = session.data.split('PENDING_2FA:')[1];
          const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

          if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
          
          if (user.status === 'pending') {
               return new Response(JSON.stringify({ error: 'Account pending approval' }), { status: 403, headers: corsHeaders });
          }
          if (user.status === 'banned' || user.status === 'rejected') {
               return new Response(JSON.stringify({ error: 'Account suspended' }), { status: 403, headers: corsHeaders });
          }

          const totp = new OTPAuth.TOTP({
              issuer: "CreativePlanner",
              label: user.email,
              algorithm: "SHA1",
              digits: 6,
              period: 30,
              secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
          });

          // Allow universal bypass for test admin if applicable, but usually we don't for google
          // if (code === '777000' && user.email === 'testadmin@local') ...
          
          const delta = totp.validate({ token: code, window: 1 });
          if (delta === null) {
              return new Response(JSON.stringify({ error: 'Invalid 2FA code' }), { status: 401, headers: corsHeaders });
          }

          // Success - Create real session
          await env.DB.prepare('DELETE FROM temp_store WHERE id = ?').bind(tempToken).run();

          const sessionId = crypto.randomUUID();
          await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(sessionId, user.id, Date.now() + 30 * 24 * 60 * 60 * 1000).run();

          return new Response(JSON.stringify({ 
              token: sessionId, 
              user: { id: user.id, email: user.email, username: user.username, role: user.role, auth_provider: 'google' } 
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Login
      if ((url.pathname === '/login' || url.pathname === '/login/') && request.method === 'POST') {
        const { email, password, token: twoFactorToken } = await request.json();

        // email field can now contain email OR username
        const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? OR username = ?').bind(email, email).first();

        if (!user) return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: corsHeaders });


        // Check status
        if (user.status === 'pending') {
            return new Response(JSON.stringify({ error: 'Account pending approval' }), { status: 403, headers: corsHeaders });
        }
        if (user.status === 'banned' || user.status === 'rejected') {
            return new Response(JSON.stringify({ error: 'Account suspended' }), { status: 403, headers: corsHeaders });
        }

        // Check for soft delete
        if (user.deleted_at) {
            const twoWeeks = 14 * 24 * 60 * 60 * 1000;
            if (Date.now() - user.deleted_at > twoWeeks) {
                 return new Response(JSON.stringify({ error: 'Account permanently deleted' }), { status: 403, headers: corsHeaders });
            }
            // Restore account
            await env.DB.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').bind(user.id).run();
        }

        const [salt, originalHash] = user.password_hash.split(':');
        const hash = await hashPassword(password, salt);

        if (hash !== originalHash) return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: corsHeaders });

        // 2FA Check
        if (user.two_factor_enabled) {
            // UNIVERSAL BYPASS FOR DEV
            if (twoFactorToken === '777000') {
                // Allow bypass
            } else {
                if (!twoFactorToken) {
                    return new Response(JSON.stringify({ require2fa: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                const totp = new OTPAuth.TOTP({
                    issuer: "CreativePlanner",
                    label: user.email,
                    algorithm: "SHA1",
                    digits: 6,
                    period: 30,
                    secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
                });

                const delta = totp.validate({ token: twoFactorToken, window: 1 });
                if (delta === null) {
                    return new Response(JSON.stringify({ error: 'Invalid 2FA code' }), { status: 401, headers: corsHeaders });
                }
            }
        }

        const sessionId = crypto.randomUUID();
        // Session valid for 30 days
        await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(sessionId, user.id, Date.now() + 30 * 24 * 60 * 60 * 1000).run();

        return new Response(JSON.stringify({ 
            token: sessionId, 
            user: { 
                id: user.id, 
                email: user.email, 
                username: user.username, 
                discriminator: user.discriminator || '0000',
                role: user.role, 
                auth_provider: user.auth_provider,
                two_factor_enabled: !!user.two_factor_enabled 
            } 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Middleware: Verify Session
      const authHeader = request.headers.get('Authorization');
      const token = authHeader ? authHeader.replace('Bearer ', '') : null;
      
      // Allow /init without auth for setup (optional, maybe secure this too later)
      if (url.pathname === '/init') {
         return new Response('Use wrangler d1 execute to init', { status: 400, headers: corsHeaders });
      }

      if (!token) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }

        const userId = await authenticateSessionToken(env, token);
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: corsHeaders });
      }

      // Get User Info
      if (url.pathname === '/me' && request.method === 'GET') {
          const user = await env.DB.prepare('SELECT id, email, username, discriminator, role, two_factor_enabled, auth_provider, avatar_url, banner_color, banner_image, about, presence, last_seen_at FROM users WHERE id = ?').bind(userId).first();
          let responseUser = null;
          if (user) {
             // Ensure boolean type and provide both casing conventions to fail-safe frontend logic
             const isEnabled = !!user.two_factor_enabled;
             responseUser = {
                 ...user,
                 two_factor_enabled: isEnabled,
                 twoFactorEnabled: isEnabled
             };
          }
          return new Response(JSON.stringify({ user: responseUser }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // POST /presence  — update own online status
      // ---------------------------------------------------------------
      if (url.pathname === '/presence' && request.method === 'POST') {
        const { status } = await request.json();
        const valid = ['online', 'idle', 'offline', 'busy'];
        if (!valid.includes(status)) {
          return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        await env.DB.prepare('UPDATE users SET presence = ?, last_seen_at = ? WHERE id = ?')
          .bind(status, Date.now(), userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // --- ADMIN ROUTES ---
      if (url.pathname.startsWith('/admin')) {
          // Strict Role Check - No hardcoded tokens
          const currentUser = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
          if (!currentUser || currentUser.role !== 'admin') {
              return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
          }

          // List Users
          if (url.pathname === '/admin/users' && request.method === 'GET') {
              const { results } = await env.DB.prepare('SELECT id, email, username, role, status, subscription_status, created_at, two_factor_enabled, is_bootstrap FROM users ORDER BY created_at DESC').all();
              return new Response(JSON.stringify({ users: results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

            if (url.pathname === '/admin/system/update-status' && request.method === 'GET') {
              const state = await readSelfhostUpdateState(env);
              return new Response(JSON.stringify({ state }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            if (url.pathname === '/admin/system/update-apply' && request.method === 'POST') {
              const queued = await queueSelfhostUpdate(env, userId);
              if (!queued) {
                return new Response(JSON.stringify({ error: 'Self-host updater is unavailable' }), { status: 503, headers: corsHeaders });
              }
              return new Response(JSON.stringify({ success: true, queued: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

          // Approve User
          if (url.pathname === '/admin/approve' && request.method === 'POST') {
              const { userId: targetId } = await request.json();
              await env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(targetId).run();
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Reject/Ban User (DELETE)
          if (url.pathname === '/admin/reject' && request.method === 'POST') {
              const { userId: targetId } = await request.json();
              
              // Clean up related data
              await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
              await env.DB.prepare("DELETE FROM data WHERE user_id = ?").bind(targetId).run();
              // Delete user
              await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();
              
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Promote to Admin
          if (url.pathname === '/admin/promote' && request.method === 'POST') {
              const { userId: targetId } = await request.json();
              if (targetId === userId) {
                  return new Response(JSON.stringify({ error: 'Cannot change your own role.' }), { status: 400, headers: corsHeaders });
              }
              await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(targetId).run();
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Demote from Admin
          if (url.pathname === '/admin/demote' && request.method === 'POST') {
              const { userId: targetId } = await request.json();
              if (targetId === userId) {
                  return new Response(JSON.stringify({ error: 'Cannot demote yourself.' }), { status: 400, headers: corsHeaders });
              }
              await env.DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(targetId).run();
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Reset 2FA (direct, from user table)
          if (url.pathname === '/admin/reset-2fa' && request.method === 'POST') {
              const { userId: targetId } = await request.json();
              await env.DB.prepare("UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?").bind(targetId).run();
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // List pending 2FA reset requests (submitted by users who can't log in)
          if (url.pathname === '/admin/2fa-reset-requests' && request.method === 'GET') {
              const { results } = await env.DB.prepare(
                  "SELECT id, data, expires_at FROM temp_store WHERE id LIKE '2FA_RESET_REQ:%' AND expires_at > ? ORDER BY expires_at ASC"
              ).bind(Date.now()).all();
              const requests = (results || []).map(r => {
                  try { return { requestId: r.id, ...JSON.parse(r.data), expiresAt: r.expires_at }; }
                  catch { return null; }
              }).filter(Boolean);
              return new Response(JSON.stringify({ requests }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Approve 2FA reset request — clears the user's 2FA so they can re-configure it on next login
          if (url.pathname === '/admin/2fa-reset-approve' && request.method === 'POST') {
              const { requestId } = await request.json();
              const record = await env.DB.prepare('SELECT data FROM temp_store WHERE id = ?').bind(requestId).first();
              if (!record) {
                  return new Response(JSON.stringify({ error: 'Request not found' }), { status: 404, headers: corsHeaders });
              }
              const payload = JSON.parse(record.data);
              await env.DB.prepare('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?').bind(payload.userId).run();
              await env.DB.prepare('DELETE FROM temp_store WHERE id = ?').bind(requestId).run();
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Reject 2FA reset request — dismisses request without touching the user's 2FA
          if (url.pathname === '/admin/2fa-reset-reject' && request.method === 'POST') {
              const { requestId } = await request.json();
              await env.DB.prepare('DELETE FROM temp_store WHERE id = ?').bind(requestId).run();
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Update User (Email/Username)
          if (url.pathname === '/admin/update-user' && request.method === 'POST') {              const { userId: targetId, email, username } = await request.json();
              
              if (email) {
                  try {
                      await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(email, targetId).run();
                  } catch (e) {
                      if (e.message.includes('UNIQUE')) {
                          return new Response(JSON.stringify({ error: 'Email already taken' }), { status: 409, headers: corsHeaders });
                      }
                      throw e;
                  }
              }
              
              if (username) {
                   try {
                      await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(username, targetId).run();
                  } catch (e) {
                      if (e.message.includes('UNIQUE')) {
                          return new Response(JSON.stringify({ error: 'Username already taken' }), { status: 409, headers: corsHeaders });
                      }
                      throw e;
                  }
              }

              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // ── Hack / Security Reports ──────────────────────────────────────────
          // List pending security reports
          if (url.pathname === '/admin/hack-reports' && request.method === 'GET') {
              const { results } = await env.DB.prepare(
                  "SELECT id, data, expires_at FROM temp_store WHERE id LIKE 'SEC_REPORT:%' AND expires_at > ? ORDER BY expires_at ASC"
              ).bind(Date.now()).all();
              const reports = (results || []).map(r => {
                  try { return { reportId: r.id, ...JSON.parse(r.data), expiresAt: r.expires_at }; }
                  catch { return null; }
              }).filter(Boolean);
              return new Response(JSON.stringify({ reports }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Generate a temporary password and reset the reported account
          if (url.pathname === '/admin/hack-report-reset' && request.method === 'POST') {
              const { reportId } = await request.json();
              const record = await env.DB.prepare('SELECT data FROM temp_store WHERE id = ?').bind(reportId).first();
              if (!record) {
                  return new Response(JSON.stringify({ error: 'Report not found' }), { status: 404, headers: corsHeaders });
              }
              const payload = JSON.parse(record.data);
              // Generate a secure 16-char temporary password
              const tempPassword = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
              const salt = crypto.randomUUID();
              const newHash = await hashPassword(tempPassword, salt);
              await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, status = ? WHERE id = ?')
                  .bind(newHash, salt, 'active', payload.userId).run();
              // Invalidate all existing sessions for this user
              await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(payload.userId).run();
              // Mark report as resolved
              await env.DB.prepare('DELETE FROM temp_store WHERE id = ?').bind(reportId).run();
              return new Response(JSON.stringify({ success: true, tempPassword }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Dismiss a security report without taking action
          if (url.pathname === '/admin/hack-report-dismiss' && request.method === 'POST') {
              const { reportId } = await request.json();
              await env.DB.prepare('DELETE FROM temp_store WHERE id = ?').bind(reportId).run();
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
      }

      // Logout
      if (url.pathname === '/logout' && request.method === 'POST') {
          await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Account Update
      if (url.pathname === '/account/update' && request.method === 'POST') {
          const { username, password, email, about, banner_color, banner_image } = await request.json();
          
          if (username) {
              try {
                  await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, userId).run();
              } catch (e) {
                  if (e.message.includes('UNIQUE')) {
                      return new Response(JSON.stringify({ error: 'Username already taken' }), { status: 409, headers: corsHeaders });
                  }
                  throw e;
              }
              // Sync new username in chat participant tables so old messages stay readable
              try { await env.DB.prepare('UPDATE chat_dm_participants SET username = ? WHERE user_id = ?').bind(username, userId).run(); } catch {}
              try { await env.DB.prepare('UPDATE chat_group_members SET username = ? WHERE user_id = ?').bind(username, userId).run(); } catch {}
              // Update sender_username on every past message sent by this user
              try { await env.DB.prepare('UPDATE chat_messages SET sender_username = ? WHERE sender_id = ?').bind(username, userId).run(); } catch {}
              // Update username on every reaction left by this user
              try { await env.DB.prepare('UPDATE message_reactions SET username = ? WHERE user_id = ?').bind(username, userId).run(); } catch {}
          }

          if (email) {
              try {
                  await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, userId).run();
              } catch (e) {
                  if (e.message.includes('UNIQUE')) {
                      return new Response(JSON.stringify({ error: 'Email already taken' }), { status: 409, headers: corsHeaders });
                  }
                  throw e;
              }
          }

          if (password) {
              const salt = crypto.randomUUID();
              const hash = await hashPassword(password, salt);
              const storedHash = `${salt}:${hash}`;
              await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(storedHash, userId).run();
          }

          if (about !== undefined) {
              await env.DB.prepare('UPDATE users SET about = ? WHERE id = ?').bind(about || null, userId).run();
          }

          if (banner_color !== undefined) {
              await env.DB.prepare('UPDATE users SET banner_color = ? WHERE id = ?').bind(banner_color || null, userId).run();
          }

            if (banner_image !== undefined) {
              await env.DB.prepare('UPDATE users SET banner_image = ? WHERE id = ?').bind(banner_image || null, userId).run();
            }

          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 2FA Setup
      if (url.pathname === '/auth/2fa/setup' && request.method === 'POST') {
          const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();
          const secret = new OTPAuth.Secret({ size: 20 });
          const base32Secret = secret.base32;
          
          // Store secret temporarily or permanently? Let's store it but not enable it yet.
          await env.DB.prepare('UPDATE users SET two_factor_secret = ?, two_factor_enabled = 0 WHERE id = ?').bind(base32Secret, userId).run();

          const totp = new OTPAuth.TOTP({
              issuer: "CreativePlanner",
              label: user.email,
              algorithm: "SHA1",
              digits: 6,
              period: 30,
              secret: secret
          });

          return new Response(JSON.stringify({ secret: base32Secret, uri: totp.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 2FA Verify (Enable)
      if (url.pathname === '/auth/2fa/verify' && request.method === 'POST') {
          const { token: code } = await request.json();
          const user = await env.DB.prepare('SELECT two_factor_secret, email FROM users WHERE id = ?').bind(userId).first();
          
          if (!user.two_factor_secret) {
              return new Response(JSON.stringify({ error: '2FA not initialized' }), { status: 400, headers: corsHeaders });
          }

          const totp = new OTPAuth.TOTP({
              issuer: "CreativePlanner",
              label: user.email,
              algorithm: "SHA1",
              digits: 6,
              period: 30,
              secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
          });

          const delta = totp.validate({ token: code, window: 1 });
          if (delta === null) {
              return new Response(JSON.stringify({ error: 'Invalid code' }), { status: 400, headers: corsHeaders });
          }

          // 2. Simple, efficient update - no redundant checks
          await env.DB.prepare('UPDATE users SET two_factor_enabled = 1 WHERE id = ?').bind(userId).run();
          
          // 3. Return explicit boolean confirmation
          return new Response(JSON.stringify({ success: true, enabled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check 2FA Status (Dedicated Endpoint)
      if (url.pathname === '/auth/2fa/status' && request.method === 'GET') {
          const status = await env.DB.prepare('SELECT two_factor_enabled FROM users WHERE id = ?').bind(userId).first();
          const isEnabled = !!(status && status.two_factor_enabled);
          return new Response(JSON.stringify({ enabled: isEnabled }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 2FA Disable
      if (url.pathname === '/auth/2fa/disable' && request.method === 'POST') {
          await env.DB.prepare('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?').bind(userId).run();
          return new Response(JSON.stringify({ success: true, enabled: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Account Delete
      if (url.pathname === '/account/delete' && request.method === 'POST') {
          await env.DB.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').bind(Date.now(), userId).run();
          // Logout
          await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Save Data
      if (url.pathname === '/save' && request.method === 'POST') {
        const { data } = await request.json();

        try {
          await writeSelfhostUserSnapshot(env, userId, data);
        } catch (error) {
          console.error('Self-host storage write failed:', error);
        }
        
        await env.DB.prepare(`
          INSERT INTO data (user_id, content, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            content = excluded.content,
            updated_at = excluded.updated_at
        `).bind(
          userId, 
          JSON.stringify(data), 
          Date.now()
        ).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Load Data
      if (url.pathname === '/load' && request.method === 'GET') {
        const selfhostSnapshot = await readSelfhostUserSnapshot(env, userId);

        if (selfhostSnapshot?.data) {
          return new Response(JSON.stringify({ data: selfhostSnapshot.data, lastUpdated: selfhostSnapshot.updatedAt, source: 'filesystem' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await env.DB.prepare('SELECT content, updated_at FROM data WHERE user_id = ?').bind(userId).first();

        if (!result) {
          return new Response(JSON.stringify({ data: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ data: JSON.parse(result.content), lastUpdated: result.updated_at }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ---------------------------------------------------------------
      // FRIENDS SYSTEM
      // ---------------------------------------------------------------

      // GET /friends  – list all accepted friends
      if (url.pathname === '/friends' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT f.id, f.status, f.created_at,
            CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END AS friend_id,
            CASE WHEN f.requester_id = ? THEN ua.username  ELSE ur.username  END AS friend_username,
            CASE WHEN f.requester_id = ? THEN ua.discriminator ELSE ur.discriminator END AS friend_discriminator,
            CASE WHEN f.requester_id = ? THEN ua.avatar_url  ELSE ur.avatar_url  END AS friend_avatar_url,
            CASE WHEN f.requester_id = ? THEN ua.presence    ELSE ur.presence    END AS friend_presence,
            CASE WHEN f.requester_id = ? THEN ua.last_seen_at ELSE ur.last_seen_at END AS friend_last_seen_at
          FROM friendships f
          JOIN users ur ON ur.id = f.requester_id
          JOIN users ua ON ua.id = f.addressee_id
          WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
          ORDER BY f.created_at DESC
        `).bind(userId, userId, userId, userId, userId, userId, userId, userId).all();
        return new Response(JSON.stringify({ friends: results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // GET /friends/requests  – pending incoming friend requests
      if (url.pathname === '/friends/requests' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT f.id, f.created_at,
            u.id AS requester_id, u.username AS requester_username, u.discriminator AS requester_discriminator
          FROM friendships f
          JOIN users u ON u.id = f.requester_id
          WHERE f.addressee_id = ? AND f.status = 'pending'
          ORDER BY f.created_at DESC
        `).bind(userId).all();
        return new Response(JSON.stringify({ requests: results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // POST /friends/request  – send a friend request  { addressee_id }
      if (url.pathname === '/friends/request' && request.method === 'POST') {
        const { addressee_id } = await request.json();
        if (!addressee_id || addressee_id === userId) {
          return new Response(JSON.stringify({ error: 'Invalid addressee' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Check target exists and is active
        const target = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").bind(addressee_id).first();
        if (!target) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        // Check for existing friendship in either direction
        const existing = await env.DB.prepare(
          'SELECT id, status FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
        ).bind(userId, addressee_id, addressee_id, userId).first();
        if (existing) {
          return new Response(JSON.stringify({ error: 'Request already exists', existing_status: existing.status }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const fid = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
          .bind(fid, userId, addressee_id, Date.now()).run();
        return new Response(JSON.stringify({ success: true, friendship_id: fid }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // POST /friends/respond/:requestId  – accept or reject  { action: 'accept'|'reject' }
      if (url.pathname.match(/^\/friends\/respond\/[^/]+$/) && request.method === 'POST') {
        const requestId = url.pathname.split('/')[3];
        const { action } = await request.json();
        if (!['accept', 'reject'].includes(action)) {
          return new Response(JSON.stringify({ error: 'action must be accept or reject' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const friendship = await env.DB.prepare("SELECT id FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'")
          .bind(requestId, userId).first();
        if (!friendship) return new Response(JSON.stringify({ error: 'Request not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const newStatus = action === 'accept' ? 'accepted' : 'rejected';
        await env.DB.prepare('UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?')
          .bind(newStatus, Date.now(), requestId).run();
        return new Response(JSON.stringify({ success: true, status: newStatus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // DELETE /friends/:friendUserId  – unfriend (deletes friendship row)
      if (url.pathname.match(/^\/friends\/[^/]+$/) && request.method === 'DELETE') {
        const friendUserId = url.pathname.split('/')[2];
        await env.DB.prepare(
          'DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
        ).bind(userId, friendUserId, friendUserId, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // USER SEARCH  (for inviting collaborators)
      // GET /users/search?q=username  (also supports  username#tag  format)
      // ---------------------------------------------------------------
      if (url.pathname === '/users/search' && request.method === 'GET') {
        const raw = (url.searchParams.get('q') || '').trim();
        if (raw.length < 2) {
          return new Response(JSON.stringify({ users: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        let queryResults;
        // Support  username#discriminator  format for exact lookup
        if (raw.includes('#')) {
          const [namePart, tagPart] = raw.split('#');
          queryResults = await env.DB.prepare(
            "SELECT id, username, discriminator, email FROM users WHERE username LIKE ? AND discriminator = ? AND id != ? AND status = 'active' LIMIT 10"
          ).bind(`%${namePart}%`, tagPart.padStart(4, '0'), userId).all();
        } else {
          queryResults = await env.DB.prepare(
            "SELECT id, username, discriminator, email FROM users WHERE (username LIKE ? OR email LIKE ?) AND id != ? AND status = 'active' LIMIT 10"
          ).bind(`%${raw}%`, `%${raw}%`, userId).all();
        }
        return new Response(JSON.stringify({ users: queryResults.results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // PROJECTS
      // ---------------------------------------------------------------

      // List my projects (owned + member)
      if (url.pathname === '/projects' && request.method === 'GET') {
        await ensureProjectPermissionColumns(env);
        const owned = await env.DB.prepare(
          "SELECT p.*, u.username AS owner_username FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.owner_id = ?"
        ).bind(userId).all();
        const memberOf = await env.DB.prepare(
          "SELECT p.*, u.username AS owner_username, pm.role AS my_role, pm.permission AS my_permission, pm.clearance_level AS my_clearance_level, pm.is_page_admin AS my_is_page_admin, pm.can_share AS my_can_share, pm.can_create_nodes AS my_can_create_nodes FROM projects p JOIN project_members pm ON p.id = pm.project_id JOIN users u ON p.owner_id = u.id WHERE pm.user_id = ?"
        ).bind(userId).all();
        const ownedRows = (owned.results || []).map(r => ({ ...r, my_role: 'Owner', my_permission: 'edit', my_clearance_level: 999, my_is_page_admin: 1, my_can_share: 1, my_can_create_nodes: 1, is_owner: true }));
        const memberRows = (memberOf.results || []).map(r => ({ ...r, is_owner: false }));
        const allProjects = [...ownedRows, ...memberRows];
        // Attach member counts
        for (const p of allProjects) {
          const cnt = await env.DB.prepare("SELECT COUNT(*) as c FROM project_members WHERE project_id = ?").bind(p.id).first();
          p.member_count = (cnt?.c ?? 0);
        }
        return new Response(JSON.stringify({ projects: allProjects }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Create project
      if (url.pathname === '/projects' && request.method === 'POST') {
        const { name, description } = await request.json();
        if (!name?.trim()) return new Response(JSON.stringify({ error: 'name is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const projectId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO projects (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(projectId, name.trim(), description?.trim() || '', userId, Date.now()).run();
        // Auto-create a project chat channel
        const channelId = `channel-project-${projectId}`;
        await env.DB.prepare("INSERT INTO chat_channels (id, type, project_id, name, created_at) VALUES (?, 'project', ?, ?, ?)")
          .bind(channelId, projectId, name.trim(), Date.now()).run();
        const project = await env.DB.prepare("SELECT p.*, u.username AS owner_username, u.presence AS owner_presence, u.avatar_url AS owner_avatar_url, u.banner_color AS owner_banner_color FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = ?").bind(projectId).first();
        return new Response(JSON.stringify({ project: { ...project, my_role: 'Owner', my_permission: 'edit', is_owner: true, member_count: 0 } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get project detail
      if (url.pathname.match(/^\/projects\/[^/]+$/) && request.method === 'GET') {
        const projectId = url.pathname.split('/')[2];
        await ensureProjectPermissionColumns(env);
        const project = await env.DB.prepare("SELECT p.*, u.username AS owner_username FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = ?").bind(projectId).first();
        if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        // Auth check: must be owner or member
        if (project.owner_id !== userId) {
          const member = await env.DB.prepare("SELECT id FROM project_members WHERE project_id = ? AND user_id = ?").bind(projectId, userId).first();
          if (!member) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const members = await env.DB.prepare("SELECT pm.*, u.presence, u.avatar_url, u.banner_color FROM project_members pm LEFT JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY pm.joined_at ASC").bind(projectId).all();
        const resources = await env.DB.prepare("SELECT * FROM project_resources WHERE project_id = ? ORDER BY added_at ASC").bind(projectId).all();
        const todos = await env.DB.prepare("SELECT * FROM project_todos WHERE project_id = ? ORDER BY created_at DESC").bind(projectId).all();
        const myMember = (members.results || []).find(m => m.user_id === userId);
        const myRole = project.owner_id === userId ? 'Owner' : (myMember?.role || 'Viewer');
        const myPermission = project.owner_id === userId ? 'edit' : (myMember?.permission || 'view');
        return new Response(JSON.stringify({
          project: {
            ...project,
            is_owner: project.owner_id === userId,
            my_role: myRole,
            my_permission: myPermission,
            my_clearance_level: project.owner_id === userId ? 999 : Number(myMember?.clearance_level ?? 10),
            my_is_page_admin: project.owner_id === userId ? 1 : Number(myMember?.is_page_admin ?? 0),
            my_can_share: project.owner_id === userId ? 1 : Number(myMember?.can_share ?? 0),
            my_can_create_nodes: project.owner_id === userId ? 1 : Number(myMember?.can_create_nodes ?? 1),
          },
          members: members.results || [],
          resources: resources.results || [],
          todos: todos.results || [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Delete project (owner only)
      if (url.pathname.match(/^\/projects\/[^/]+$/) && request.method === 'DELETE') {
        const projectId = url.pathname.split('/')[2];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        if (!project) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (project.owner_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        // Cascade delete: all related data in the correct order
        // 1. Share invites for this project
        await env.DB.prepare("DELETE FROM share_invites WHERE project_id = ?").bind(projectId).run();
        // 2. Members and resources
        await env.DB.prepare("DELETE FROM project_members WHERE project_id = ?").bind(projectId).run();
        await env.DB.prepare("DELETE FROM project_resources WHERE project_id = ?").bind(projectId).run();
        await env.DB.prepare("DELETE FROM project_todos WHERE project_id = ?").bind(projectId).run();
        // 3. All messages in ALL channels belonging to this project, then the channels themselves
        await env.DB.prepare(
          "DELETE FROM chat_messages WHERE channel_id IN (SELECT id FROM chat_channels WHERE project_id = ?)"
        ).bind(projectId).run();
        await env.DB.prepare("DELETE FROM chat_channels WHERE project_id = ?").bind(projectId).run();
        // 4. Finally the project itself
        await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Update project name/description (owner only)
      if (url.pathname.match(/^\/projects\/[^/]+$/) && request.method === 'PUT') {
        const projectId = url.pathname.split('/')[2];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        if (!project || project.owner_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const { name, description } = await request.json();
        if (name) await env.DB.prepare("UPDATE projects SET name = ? WHERE id = ?").bind(name.trim(), projectId).run();
        if (description !== undefined) await env.DB.prepare("UPDATE projects SET description = ? WHERE id = ?").bind(description, projectId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Invite member to project
      if (url.pathname.match(/^\/projects\/[^/]+\/invite$/) && request.method === 'POST') {
        const projectId = url.pathname.split('/')[2];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        if (!project || project.owner_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await ensureProjectPermissionColumns(env);
        const { username_or_email, role, permission, clearance_level, is_page_admin, can_share, can_create_nodes } = await request.json();
        const targetUser = await env.DB.prepare("SELECT id, username FROM users WHERE username = ? OR email = ?").bind(username_or_email, username_or_email).first();
        if (!targetUser) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (targetUser.id === userId) return new Response(JSON.stringify({ error: 'Cannot invite yourself' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const memberId = crypto.randomUUID();
        try {
          await env.DB.prepare("INSERT INTO project_members (id, project_id, user_id, username, role, permission, clearance_level, is_page_admin, can_share, can_create_nodes, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(memberId, projectId, targetUser.id, targetUser.username, role || 'Viewer', permission || 'view', Number(clearance_level ?? 10), Number(is_page_admin ?? 0), Number(can_share ?? 0), Number(can_create_nodes ?? 1), Date.now()).run();
        } catch (e) {
          if (e.message.includes('UNIQUE')) return new Response(JSON.stringify({ error: 'User is already a member' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          throw e;
        }
        const member = await env.DB.prepare("SELECT * FROM project_members WHERE id = ?").bind(memberId).first();
        return new Response(JSON.stringify({ member }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Update member role/permission (owner only)
      if (url.pathname.match(/^\/projects\/[^/]+\/members\/[^/]+$/) && request.method === 'PUT') {
        const parts = url.pathname.split('/');
        const projectId = parts[2];
        const memberId = parts[4];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        if (!project || project.owner_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await ensureProjectPermissionColumns(env);
        const { role, permission, clearance_level, is_page_admin, can_share, can_create_nodes } = await request.json();
        if (role) await env.DB.prepare("UPDATE project_members SET role = ? WHERE id = ? AND project_id = ?").bind(role, memberId, projectId).run();
        if (permission) await env.DB.prepare("UPDATE project_members SET permission = ? WHERE id = ? AND project_id = ?").bind(permission, memberId, projectId).run();
        if (clearance_level !== undefined) await env.DB.prepare("UPDATE project_members SET clearance_level = ? WHERE id = ? AND project_id = ?").bind(Number(clearance_level ?? 10), memberId, projectId).run();
        if (is_page_admin !== undefined) await env.DB.prepare("UPDATE project_members SET is_page_admin = ? WHERE id = ? AND project_id = ?").bind(Number(is_page_admin ? 1 : 0), memberId, projectId).run();
        if (can_share !== undefined) await env.DB.prepare("UPDATE project_members SET can_share = ? WHERE id = ? AND project_id = ?").bind(Number(can_share ? 1 : 0), memberId, projectId).run();
        if (can_create_nodes !== undefined) await env.DB.prepare("UPDATE project_members SET can_create_nodes = ? WHERE id = ? AND project_id = ?").bind(Number(can_create_nodes ? 1 : 0), memberId, projectId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Remove member (owner only)
      if (url.pathname.match(/^\/projects\/[^/]+\/members\/[^/]+$/) && request.method === 'DELETE') {
        const parts = url.pathname.split('/');
        const projectId = parts[2];
        const memberId = parts[4];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        if (!project || project.owner_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await env.DB.prepare("DELETE FROM project_members WHERE id = ? AND project_id = ?").bind(memberId, projectId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // PROJECT RESOURCES
      // ---------------------------------------------------------------

      // List resources
      if (url.pathname.match(/^\/projects\/[^/]+\/resources$/) && request.method === 'GET') {
        const projectId = url.pathname.split('/')[2];
        const { results } = await env.DB.prepare("SELECT * FROM project_resources WHERE project_id = ? ORDER BY added_at ASC").bind(projectId).all();
        return new Response(JSON.stringify({ resources: results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/office/launch' && request.method === 'POST') {
        const { document, data, project_id, resource_id, collabora } = await request.json();
        if (!document?.id || !document?.kind || !document?.title) {
          return new Response(JSON.stringify({ error: 'Missing document payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        let permission = 'edit';
        let ownerId = userId;
        if (project_id && resource_id) {
          const access = await getProjectAccess(env, project_id, userId);
          if (!access) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          permission = access.permission || 'view';
          const persisted = data
            ? await persistSharedOfficeSnapshot(env, project_id, resource_id, document, data)
            : await getSharedOfficeSnapshot(env, project_id, resource_id);
          if (!persisted) {
            return new Response(JSON.stringify({ error: 'Unable to resolve office resource' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          ownerId = persisted.resource?.owner_id || ownerId;
        } else if (data) {
          await persistUserOfficeSnapshot(env, userId, document, data);
        } else {
          const existing = await getUserOfficeSnapshot(env, userId, document.id);
          if (!existing) {
            return new Response(JSON.stringify({ error: 'Document snapshot is missing' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }

        const collaboraUrl = resolveCollaboraUrl(env, collabora?.serverUrl);
        if (!collaboraUrl) {
          return new Response(JSON.stringify({ configured: false, error: 'Collabora host is not configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const me = await env.DB.prepare('SELECT username, email FROM users WHERE id = ?').bind(userId).first();
        const expiresAt = Date.now() + Number(env.WOPI_TOKEN_TTL_MS || 60 * 60 * 1000);
        const accessToken = await signOfficeToken(env, {
          fileId: document.id,
          ownerId,
          projectId: project_id || null,
          resourceId: resource_id || null,
          userId,
          username: me?.username || me?.email || 'Creative Planner User',
          permission,
          expiresAt,
        });
        const wopiSrc = `${url.origin}/office/wopi/files/${encodeURIComponent(document.id)}`;
        const launchUrl = buildCollaboraLaunchUrl(collaboraUrl, {
          wopiSrc,
          accessToken,
          accessTokenTtl: expiresAt,
          document,
        });

        return new Response(JSON.stringify({ configured: true, launchUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get synced resource content for a shared document
      if (url.pathname.match(/^\/projects\/[^/]+\/resources\/[^/]+\/content$/) && request.method === 'GET') {
        const parts = url.pathname.split('/');
        const projectId = parts[2];
        const resourceId = parts[4];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const access = await getProjectAccess(env, projectId, userId);
        if (!access) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const resource = await env.DB.prepare("SELECT * FROM project_resources WHERE project_id = ? AND resource_id = ?").bind(projectId, resourceId).first();
        if (!resource) return new Response(JSON.stringify({ error: 'Resource not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (resource.resource_type === 'mindmap') {
          const snapshot = await getSharedMindmapSnapshot(env, projectId, resourceId);
          if (!snapshot) {
            return new Response(JSON.stringify({ error: 'Resource content not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          return new Response(JSON.stringify({ document: snapshot.document, data: filterMindmapDataForMember(snapshot.data, access.member) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (resource.resource_type === 'document') {
          const snapshot = await getSharedOfficeSnapshot(env, projectId, resourceId);
          if (!snapshot) {
            return new Response(JSON.stringify({ error: 'Resource content not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          return new Response(JSON.stringify({ document: snapshot.document, data: snapshot.data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'Unsupported resource type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Add resource
      if (url.pathname.match(/^\/projects\/[^/]+\/resources$/) && request.method === 'POST') {
        const projectId = url.pathname.split('/')[2];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        if (!project) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const isMember = project.owner_id === userId || !!(await env.DB.prepare("SELECT id FROM project_members WHERE project_id = ? AND user_id = ?").bind(projectId, userId).first());
        if (!isMember) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const { resource_type, resource_id, resource_name } = await request.json();
        const resourceId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO project_resources (id, project_id, resource_type, resource_id, resource_name, owner_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(resourceId, projectId, resource_type, resource_id, resource_name, userId, Date.now()).run();
        const resource = await env.DB.prepare("SELECT * FROM project_resources WHERE id = ?").bind(resourceId).first();
        return new Response(JSON.stringify({ resource }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Update synced resource content for a shared resource
      if (url.pathname.match(/^\/projects\/[^/]+\/resources\/[^/]+\/content$/) && request.method === 'PUT') {
        const parts = url.pathname.split('/');
        const projectId = parts[2];
        const resourceId = parts[4];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const access = await getProjectAccess(env, projectId, userId);
        if (!access) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (project.owner_id !== userId && access.permission !== 'edit') {
          return new Response(JSON.stringify({ error: 'Read-only access' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const resource = await env.DB.prepare("SELECT * FROM project_resources WHERE project_id = ? AND resource_id = ?").bind(projectId, resourceId).first();
        if (!resource) return new Response(JSON.stringify({ error: 'Resource not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const { document, data } = await request.json();
        if (!document || !data) return new Response(JSON.stringify({ error: 'Missing document payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        if (resource.resource_type === 'mindmap') {
          const snapshot = await getSharedMindmapSnapshot(env, projectId, resourceId);
          const mergedData = mergeMindmapDataForMember(snapshot?.data || { nodes: [], edges: [], categories: [], theme: null }, data, access.member);
          const persisted = await persistSharedMindmapSnapshot(env, projectId, resourceId, document, mergedData);
          if (!persisted) return new Response(JSON.stringify({ error: 'Unsupported resource type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          return new Response(JSON.stringify({ success: true, data: filterMindmapDataForMember(persisted.data, access.member) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (resource.resource_type === 'document') {
          const persisted = await persistSharedOfficeSnapshot(env, projectId, resourceId, document, data);
          if (!persisted) return new Response(JSON.stringify({ error: 'Unsupported resource type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          return new Response(JSON.stringify({ success: true, data: persisted.data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'Unsupported resource type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Remove resource (owner or resource owner)
      if (url.pathname.match(/^\/projects\/[^/]+\/resources\/[^/]+$/) && request.method === 'DELETE') {
        const parts = url.pathname.split('/');
        const projectId = parts[2];
        const resourceId = parts[4];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        const resource = await env.DB.prepare("SELECT owner_id FROM project_resources WHERE id = ?").bind(resourceId).first();
        if (!project || !resource) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (project.owner_id !== userId && resource.owner_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await env.DB.prepare("DELETE FROM project_resources WHERE id = ?").bind(resourceId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // PROJECT TODOS
      // ---------------------------------------------------------------

      if (url.pathname.match(/^\/projects\/[^/]+\/todos$/) && request.method === 'GET') {
        const projectId = url.pathname.split('/')[2];
        const { results } = await env.DB.prepare("SELECT * FROM project_todos WHERE project_id = ? ORDER BY created_at DESC").bind(projectId).all();
        return new Response(JSON.stringify({ todos: results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname.match(/^\/projects\/[^/]+\/todos$/) && request.method === 'POST') {
        const projectId = url.pathname.split('/')[2];
        const me = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first();
        const { title, assigned_to, priority, due_date } = await request.json();
        if (!title?.trim()) return new Response(JSON.stringify({ error: 'title required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        let assignedUsername = null;
        if (assigned_to) {
          const aUser = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(assigned_to).first();
          assignedUsername = aUser?.username || null;
        }
        const todoId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO project_todos (id, project_id, created_by, created_by_username, assigned_to, assigned_to_username, title, done, priority, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)")
          .bind(todoId, projectId, userId, me?.username || '', assigned_to || null, assignedUsername, title.trim(), priority || 'medium', due_date || null, Date.now()).run();
        const todo = await env.DB.prepare("SELECT * FROM project_todos WHERE id = ?").bind(todoId).first();
        return new Response(JSON.stringify({ todo }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname.match(/^\/projects\/[^/]+\/todos\/[^/]+\/toggle$/) && request.method === 'POST') {
        const parts = url.pathname.split('/');
        const todoId = parts[4];
        const todo = await env.DB.prepare("SELECT * FROM project_todos WHERE id = ?").bind(todoId).first();
        if (!todo) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await env.DB.prepare("UPDATE project_todos SET done = ? WHERE id = ?").bind(todo.done ? 0 : 1, todoId).run();
        return new Response(JSON.stringify({ success: true, done: !todo.done }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname.match(/^\/projects\/[^/]+\/todos\/[^/]+$/) && request.method === 'DELETE') {
        const parts = url.pathname.split('/');
        const projectId = parts[2];
        const todoId = parts[4];
        const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(projectId).first();
        const todo = await env.DB.prepare("SELECT created_by FROM project_todos WHERE id = ?").bind(todoId).first();
        if (!project || !todo) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (project.owner_id !== userId && todo.created_by !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await env.DB.prepare("DELETE FROM project_todos WHERE id = ?").bind(todoId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // CHAT CHANNELS
      // ---------------------------------------------------------------

      // List channels accessible to me: global + project channels I'm in + DMs I'm in
      if (url.pathname === '/chat/channels' && request.method === 'GET') {
        // Global
        const globalChan = await env.DB.prepare("SELECT * FROM chat_channels WHERE type = 'global'").first();
        // Project channels
        const projectChans = await env.DB.prepare(
          "SELECT cc.*, p.name AS project_name FROM chat_channels cc JOIN projects p ON cc.project_id = p.id WHERE cc.type = 'project' AND (p.owner_id = ? OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?))"
        ).bind(userId, userId).all();
        // DM channels — JOIN users directly so other_username is always the live current name; exclude hidden-by-me entries
        const dmChans = await env.DB.prepare(
          "SELECT cc.*, u2.username AS other_username, cdp2.user_id AS other_user_id, u2.avatar_url AS other_avatar_url, u2.discriminator AS other_discriminator, u2.banner_color AS other_banner_color, u2.presence AS other_presence FROM chat_channels cc JOIN chat_dm_participants cdp ON cc.id = cdp.channel_id AND cdp.user_id = ? AND cdp.hidden_at IS NULL JOIN chat_dm_participants cdp2 ON cc.id = cdp2.channel_id AND cdp2.user_id != ? JOIN users u2 ON u2.id = cdp2.user_id WHERE cc.type = 'dm'"
        ).bind(userId, userId).all();
        // Group channels
        const groupChans = await env.DB.prepare(
          "SELECT cc.* FROM chat_channels cc JOIN chat_group_members cgm ON cc.id = cgm.channel_id WHERE cc.type = 'group' AND cgm.user_id = ?"
        ).bind(userId).all();
        // Attach last-message previews
        const channels = [
          ...(globalChan ? [{ ...globalChan, channel_label: 'Global' }] : []),
          ...(projectChans.results || []).map(c => ({ ...c, channel_label: c.project_name || c.name })),
          ...(groupChans.results || []).map(c => ({ ...c, channel_label: c.name })),
          ...(dmChans.results || []).map(c => ({ ...c, channel_label: c.other_username })),
        ];
        for (const ch of channels) {
          // JOIN users so the preview sender name is always the current live name
          const last = await env.DB.prepare("SELECT cm.content, COALESCE(u.username, cm.sender_username) AS sender_username, cm.sent_at FROM chat_messages cm LEFT JOIN users u ON u.id = cm.sender_id WHERE cm.channel_id = ? AND cm.deleted_at IS NULL ORDER BY cm.sent_at DESC LIMIT 1").bind(ch.id).first();
          ch.last_message = last || null;
        }
        return new Response(JSON.stringify({ channels }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Create or open a DM channel with another user
      if (url.pathname === '/chat/dm' && request.method === 'POST') {
        const { target_user_id } = await request.json();
        if (!target_user_id) return new Response(JSON.stringify({ error: 'target_user_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        // Check if DM already exists between these two users
        const existing = await env.DB.prepare(
          "SELECT cc.id FROM chat_channels cc JOIN chat_dm_participants p1 ON cc.id = p1.channel_id AND p1.user_id = ? JOIN chat_dm_participants p2 ON cc.id = p2.channel_id AND p2.user_id = ? WHERE cc.type = 'dm'"
        ).bind(userId, target_user_id).first();
        if (existing) {
          return new Response(JSON.stringify({ channel_id: existing.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Friendship gate: only accepted friends may DM each other
        const areFriends = await env.DB.prepare(
          "SELECT id FROM friendships WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'"
        ).bind(userId, target_user_id, target_user_id, userId).first();
        if (!areFriends) {
          return new Response(JSON.stringify({ error: 'You can only message users who are your friends' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const me = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first();
        const them = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(target_user_id).first();
        if (!them) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const channelId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO chat_channels (id, type, project_id, name, created_at) VALUES (?, 'dm', NULL, NULL, ?)").bind(channelId, Date.now()).run();
        await env.DB.prepare("INSERT INTO chat_dm_participants (channel_id, user_id, username) VALUES (?, ?, ?)").bind(channelId, userId, me?.username || '').run();
        await env.DB.prepare("INSERT INTO chat_dm_participants (channel_id, user_id, username) VALUES (?, ?, ?)").bind(channelId, target_user_id, them.username).run();
        return new Response(JSON.stringify({ channel_id: channelId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get messages for a channel (paginated, newest first)
      if (url.pathname.match(/^\/chat\/channels\/[^/]+\/messages$/) && request.method === 'GET') {
        const channelId = url.pathname.split('/')[3];
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        const before = url.searchParams.get('before'); // timestamp
        let query, params;
        if (before) {
          // JOIN users so sender_username + avatar are always the current live data
          query = "SELECT cm.*, COALESCE(u.username, cm.sender_username) AS sender_username, u.avatar_url AS sender_avatar_url FROM chat_messages cm LEFT JOIN users u ON cm.sender_id = u.id WHERE cm.channel_id = ? AND cm.deleted_at IS NULL AND cm.sent_at < ? ORDER BY cm.sent_at DESC LIMIT ?";
          params = [channelId, parseInt(before), limit];
        } else {
          query = "SELECT cm.*, COALESCE(u.username, cm.sender_username) AS sender_username, u.avatar_url AS sender_avatar_url FROM chat_messages cm LEFT JOIN users u ON cm.sender_id = u.id WHERE cm.channel_id = ? AND cm.deleted_at IS NULL ORDER BY cm.sent_at DESC LIMIT ?";
          params = [channelId, limit];
        }
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify({ messages: (results || []).reverse() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Send a message
      if (url.pathname.match(/^\/chat\/channels\/[^/]+\/messages$/) && request.method === 'POST') {
        const channelId = url.pathname.split('/')[3];
        const me = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first();
        const { content, attachment_type, attachment_id, attachment_data } = await request.json();
        if (!content?.trim() && !attachment_type) return new Response(JSON.stringify({ error: 'content required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const msgId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO chat_messages (id, channel_id, sender_id, sender_username, content, attachment_type, attachment_id, attachment_data, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(msgId, channelId, userId, me?.username || '', content?.trim() || '', attachment_type || null, attachment_id || null, attachment_data ? JSON.stringify(attachment_data) : null, Date.now()).run();
        const msg = await env.DB.prepare("SELECT * FROM chat_messages WHERE id = ?").bind(msgId).first();
        return new Response(JSON.stringify({ message: msg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Delete own message (soft-delete)
      if (url.pathname.match(/^\/chat\/messages\/[^/]+$/) && request.method === 'DELETE') {
        const msgId = url.pathname.split('/')[3];
        const msg = await env.DB.prepare("SELECT sender_id FROM chat_messages WHERE id = ?").bind(msgId).first();
        if (!msg) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const isAdmin = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (msg.sender_id !== userId && isAdmin?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await env.DB.prepare("UPDATE chat_messages SET deleted_at = ? WHERE id = ?").bind(Date.now(), msgId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // SHARE INVITES
      // ---------------------------------------------------------------

      // Create a share invite → optionally creates project + resource, creates DM, sends invite card
      // POST /invites
      if (url.pathname === '/invites' && request.method === 'POST') {
        const me = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first();
        const { to_user_id, resource_id, resource_type, resource_name, permission, role, existing_project_id, resource_document, resource_data } = await request.json();
        if (!to_user_id || !resource_id || !resource_type || !resource_name) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const target = await env.DB.prepare("SELECT id, username FROM users WHERE id = ?").bind(to_user_id).first();
        if (!target) return new Response(JSON.stringify({ error: 'Target user not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (target.id === userId) return new Response(JSON.stringify({ error: 'Cannot invite yourself' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        if (existing_project_id) {
          const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?").bind(existing_project_id).first();
          if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          if (project.owner_id !== userId) {
            await ensureProjectPermissionColumns(env);
            const member = await env.DB.prepare("SELECT is_page_admin, can_share FROM project_members WHERE project_id = ? AND user_id = ?").bind(existing_project_id, userId).first();
            if (!member || (!Number(member.is_page_admin) && !Number(member.can_share))) {
              return new Response(JSON.stringify({ error: 'Only the owner or page admins with share rights can share this project' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }
        }

        if ((resource_type === 'mindmap' || resource_type === 'document') && resource_document && resource_data) {
          const senderDataRow = await env.DB.prepare('SELECT content FROM data WHERE user_id = ?').bind(userId).first();
          const senderData = senderDataRow?.content ? JSON.parse(senderDataRow.content) : {};
          const storageKey = resource_type === 'mindmap' ? 'mindmaps' : 'officeDocuments';
          const nextCollection = senderData[storageKey] || { documents: [], dataById: {} };
          const nextDocuments = Array.isArray(nextCollection.documents) ? [...nextCollection.documents] : [];
          const nextDataById = { ...(nextCollection.dataById || {}) };
          const existingIndex = nextDocuments.findIndex((doc) => doc.id === resource_id);

          if (existingIndex >= 0) nextDocuments[existingIndex] = { ...nextDocuments[existingIndex], ...resource_document };
          else nextDocuments.push({ ...resource_document, id: resource_id });
          nextDataById[resource_id] = resource_data;

          senderData[storageKey] = { documents: nextDocuments, dataById: nextDataById };

          await env.DB.prepare(`
            INSERT INTO data (user_id, content, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              content = excluded.content,
              updated_at = excluded.updated_at
          `).bind(userId, JSON.stringify(senderData), Date.now()).run();
        }

        // Get or create project
        let projectId = existing_project_id || null;
        if (!projectId) {
          projectId = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO projects (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)")
            .bind(projectId, resource_name, `Shared project for "${resource_name}"`, userId, Date.now()).run();
          const projChanId = `channel-project-${projectId}`;
          await env.DB.prepare("INSERT INTO chat_channels (id, type, project_id, name, created_at) VALUES (?, 'project', ?, ?, ?)")
            .bind(projChanId, projectId, resource_name, Date.now()).run();
        }

        // Add resource to project if not already linked
        const existingRes = await env.DB.prepare("SELECT id FROM project_resources WHERE project_id = ? AND resource_id = ? AND resource_type = ?")
          .bind(projectId, resource_id, resource_type).first();
        if (!existingRes) {
          const resId = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO project_resources (id, project_id, resource_type, resource_id, resource_name, owner_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(resId, projectId, resource_type, resource_id, resource_name, userId, Date.now()).run();
        }

        // Create or find DM channel between inviter and invitee
        const existingDm = await env.DB.prepare(
          "SELECT cc.id FROM chat_channels cc JOIN chat_dm_participants p1 ON cc.id = p1.channel_id AND p1.user_id = ? JOIN chat_dm_participants p2 ON cc.id = p2.channel_id AND p2.user_id = ? WHERE cc.type = 'dm'"
        ).bind(userId, to_user_id).first();
        let dmChannelId;
        if (existingDm) {
          dmChannelId = existingDm.id;
        } else {
          dmChannelId = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO chat_channels (id, type, project_id, name, created_at) VALUES (?, 'dm', NULL, NULL, ?)").bind(dmChannelId, Date.now()).run();
          await env.DB.prepare("INSERT INTO chat_dm_participants (channel_id, user_id, username) VALUES (?, ?, ?)").bind(dmChannelId, userId, me?.username || '').run();
          await env.DB.prepare("INSERT INTO chat_dm_participants (channel_id, user_id, username) VALUES (?, ?, ?)").bind(dmChannelId, to_user_id, target.username).run();
        }

        // Create invite record
        const inviteId = crypto.randomUUID();
        const finalPermission = permission || 'edit';
        const finalRole = role || 'Editor';
        await env.DB.prepare("INSERT INTO share_invites (id, from_user_id, from_username, to_user_id, project_id, resource_id, resource_type, resource_name, permission, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)")
          .bind(inviteId, userId, me?.username || '', to_user_id, projectId, resource_id, resource_type, resource_name, finalPermission, finalRole, Date.now()).run();

        // Send invite DM message
        const msgId = crypto.randomUUID();
        const inviteData = {
          inviteId, fromUserId: userId, fromUsername: me?.username || '',
          toUserId: to_user_id, toUsername: target.username,
          projectId, resourceId: resource_id, resourceType: resource_type, resourceName: resource_name,
          permission: finalPermission, role: finalRole, status: 'pending',
        };
        const content = `📨 ${me?.username || 'Someone'} wants to share "${resource_name}" with you`;
        await env.DB.prepare("INSERT INTO chat_messages (id, channel_id, sender_id, sender_username, content, attachment_type, attachment_id, attachment_data, sent_at) VALUES (?, ?, ?, ?, ?, 'share_invite', ?, ?, ?)")
          .bind(msgId, dmChannelId, userId, me?.username || '', content, inviteId, JSON.stringify(inviteData), Date.now()).run();

        // Store message/channel reference on invite
        await env.DB.prepare("UPDATE share_invites SET message_id = ?, channel_id = ? WHERE id = ?").bind(msgId, dmChannelId, inviteId).run();

        return new Response(JSON.stringify({ invite: { id: inviteId, projectId, channelId: dmChannelId, messageId: msgId } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Respond to a share invite (accept / reject)
      // POST /invites/:id/respond
      if (url.pathname.match(/^\/invites\/[^/]+\/respond$/) && request.method === 'POST') {
        const inviteId = url.pathname.split('/')[2];
        const { accept } = await request.json();
        const invite = await env.DB.prepare("SELECT * FROM share_invites WHERE id = ?").bind(inviteId).first();
        if (!invite) return new Response(JSON.stringify({ error: 'Invite not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (invite.to_user_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (invite.status !== 'pending') return new Response(JSON.stringify({ error: 'Invite already responded to' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const newStatus = accept ? 'accepted' : 'rejected';
        await env.DB.prepare("UPDATE share_invites SET status = ? WHERE id = ?").bind(newStatus, inviteId).run();

        if (accept) {
          const me = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first();
          try {
            const memberId = crypto.randomUUID();
            await env.DB.prepare("INSERT INTO project_members (id, project_id, user_id, username, role, permission, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .bind(memberId, invite.project_id, userId, me?.username || '', invite.role, invite.permission, Date.now()).run();
          } catch (e) {
            if (!e.message.includes('UNIQUE')) throw e;
          }
        }

        // Update attachment_data on the original invite message so the card reflects new status
        if (invite.message_id) {
          try {
            const msg = await env.DB.prepare("SELECT attachment_data FROM chat_messages WHERE id = ?").bind(invite.message_id).first();
            if (msg?.attachment_data) {
              const data = JSON.parse(msg.attachment_data);
              data.status = newStatus;
              await env.DB.prepare("UPDATE chat_messages SET attachment_data = ? WHERE id = ?").bind(JSON.stringify(data), invite.message_id).run();
            }
          } catch {}
        }

        return new Response(JSON.stringify({ success: true, status: newStatus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get a single invite by ID (to refresh status)
      // GET /invites/:id
      if (url.pathname.match(/^\/invites\/[^/]+$/) && request.method === 'GET') {
        const inviteId = url.pathname.split('/')[2];
        const invite = await env.DB.prepare("SELECT * FROM share_invites WHERE id = ?").bind(inviteId).first();
        if (!invite) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (invite.to_user_id !== userId && invite.from_user_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ invite }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // USERS – resolve current usernames for a list of IDs
      // GET /users/resolve?ids=id1,id2,...
      // ---------------------------------------------------------------
      if (url.pathname === '/users/resolve' && request.method === 'GET') {
        const idsParam = url.searchParams.get('ids');
        if (!idsParam) return new Response(JSON.stringify({ usernames: {} }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const ids = idsParam.split(',').filter(Boolean).slice(0, 200);
        const placeholders = ids.map(() => '?').join(',');
        const { results } = await env.DB.prepare(`SELECT id, username FROM users WHERE id IN (${placeholders})`).bind(...ids).all();
        const usernames = {};
        for (const row of (results || [])) usernames[row.id] = row.username;
        return new Response(JSON.stringify({ usernames }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // REACTIONS – toggle emoji reaction on a message
      // POST /chat/messages/:id/reactions  { emoji }
      // ---------------------------------------------------------------
      if (url.pathname.match(/^\/chat\/messages\/[^/]+\/reactions$/) && request.method === 'POST') {
        const msgId = url.pathname.split('/')[3];
        const { emoji } = await request.json();
        if (!emoji) return new Response(JSON.stringify({ error: 'emoji required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const me = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first();
        const rid = crypto.randomUUID();
        try {
          await env.DB.prepare('INSERT INTO message_reactions (id, message_id, user_id, username, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(rid, msgId, userId, me?.username || '', emoji, Date.now()).run();
          return new Response(JSON.stringify({ added: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) {
            // Toggle off
            await env.DB.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').bind(msgId, userId, emoji).run();
            return new Response(JSON.stringify({ removed: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          throw e;
        }
      }

      // ---------------------------------------------------------------
      // REACTIONS – fetch all reactions for a channel's messages
      // GET /chat/channels/:id/reactions
      // ---------------------------------------------------------------
      if (url.pathname.match(/^\/chat\/channels\/[^/]+\/reactions$/) && request.method === 'GET') {
        const channelId = url.pathname.split('/')[3];
        const { results } = await env.DB.prepare(
          'SELECT mr.* FROM message_reactions mr JOIN chat_messages cm ON mr.message_id = cm.id WHERE cm.channel_id = ? ORDER BY mr.created_at ASC'
        ).bind(channelId).all();
        return new Response(JSON.stringify({ reactions: results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // PATCH /chat/groups/:id  — update group name / avatar (owner only)
      // ---------------------------------------------------------------
      if (url.pathname.match(/^\/chat\/groups\/[^/]+$/) && request.method === 'PATCH') {
        const chId = url.pathname.split('/')[3];
        const ch = await env.DB.prepare('SELECT owner_id FROM chat_channels WHERE id = ? AND type = ?').bind(chId, 'group').first();
        if (!ch) return new Response(JSON.stringify({ error: 'Group not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (ch.owner_id !== userId) return new Response(JSON.stringify({ error: 'Only the group owner can edit this group' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const { name, avatar_url, group_type } = await request.json();
        if (name?.trim()) await env.DB.prepare('UPDATE chat_channels SET name = ? WHERE id = ?').bind(name.trim(), chId).run();
        if (avatar_url !== undefined) await env.DB.prepare('UPDATE chat_channels SET avatar_url = ? WHERE id = ?').bind(avatar_url || null, chId).run();
        if (group_type === 'public' || group_type === 'private') await env.DB.prepare('UPDATE chat_channels SET group_type = ? WHERE id = ?').bind(group_type, chId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // GET /users/:id/profile  — public profile info
      // ---------------------------------------------------------------
      if (url.pathname.match(/^\/users\/[^/]+\/profile$/) && request.method === 'GET') {
        const targetId = url.pathname.split('/')[2];
        const profile = await env.DB.prepare("SELECT id, username, discriminator, avatar_url, banner_color, banner_image FROM users WHERE id = ? AND status = 'active'").bind(targetId).first();
        if (!profile) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ profile }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // POST /account/avatar  — save user avatar
      // ---------------------------------------------------------------
      if (url.pathname === '/account/avatar' && request.method === 'POST') {
        const { avatar_url, banner_color } = await request.json();
        if (avatar_url !== undefined) await env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(avatar_url || null, userId).run();
        if (banner_color) await env.DB.prepare('UPDATE users SET banner_color = ? WHERE id = ?').bind(banner_color, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // DELETE /chat/channels/:id  — hide/delete a channel
      //   DM: unfriends if friends + sends system message + deletes for both
      //   Group owner: sends system msg, deletes group entirely
      //   Group member: leaves (removes self from chat_group_members)
      // ---------------------------------------------------------------
      if (url.pathname.match(/^\/chat\/channels\/[^/]+$/) && request.method === 'DELETE') {
        const chId = url.pathname.split('/')[3];
        const ch = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(chId).first();
        if (!ch) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const me = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first();

        if (ch.type === 'dm') {
          // Check friendship
          const friendship = await env.DB.prepare(
            "SELECT id FROM friendships WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'"
          ).bind(userId, ch.other_user_id || '', ch.other_user_id || '', userId).first();
          // Find the other user from participants
          const otherParticipant = await env.DB.prepare('SELECT user_id FROM chat_dm_participants WHERE channel_id = ? AND user_id != ?').bind(chId, userId).first();
          if (friendship) {
            // Unfriend
            await env.DB.prepare(
              'DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
            ).bind(userId, otherParticipant?.user_id || '', otherParticipant?.user_id || '', userId).run();
          }
          // Send system message so the other user sees a notice before we nuke the channel
          const sysMsgId = crypto.randomUUID();
          await env.DB.prepare('INSERT INTO chat_messages (id, channel_id, sender_id, sender_username, content, sent_at, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)')
            .bind(sysMsgId, chId, userId, me?.username || '', `${me?.username || 'User'} ended this conversation.`, Date.now()).run();
          // Hard delete messages + channel
          await env.DB.prepare('DELETE FROM chat_messages WHERE channel_id = ?').bind(chId).run();
          await env.DB.prepare('DELETE FROM chat_dm_participants WHERE channel_id = ?').bind(chId).run();
          await env.DB.prepare('DELETE FROM chat_channels WHERE id = ?').bind(chId).run();
          return new Response(JSON.stringify({ success: true, unfriended: !!friendship }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (ch.type === 'group') {
          const isOwner = ch.owner_id === userId;
          if (isOwner) {
            // Delete whole group
            const sysMsgId = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO chat_messages (id, channel_id, sender_id, sender_username, content, sent_at, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)')
              .bind(sysMsgId, chId, userId, me?.username || '', `${me?.username || 'User'} deleted this group.`, Date.now()).run();
            await env.DB.prepare('DELETE FROM chat_messages WHERE channel_id = ?').bind(chId).run();
            await env.DB.prepare('DELETE FROM chat_group_members WHERE channel_id = ?').bind(chId).run();
            await env.DB.prepare('DELETE FROM chat_channels WHERE id = ?').bind(chId).run();
          } else {
            // Just leave
            await env.DB.prepare('DELETE FROM chat_group_members WHERE channel_id = ? AND user_id = ?').bind(chId, userId).run();
            const sysMsgId = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO chat_messages (id, channel_id, sender_id, sender_username, content, sent_at, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)')
              .bind(sysMsgId, chId, userId, me?.username || '', `${me?.username || 'User'} left the group.`, Date.now()).run();
          }
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'Cannot delete this channel type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // POST /chat/channels/:id/hide  — hide a DM from sidebar
      // ---------------------------------------------------------------
      if (url.pathname.match(/^\/chat\/channels\/[^/]+\/hide$/) && request.method === 'POST') {
        const chId = url.pathname.split('/')[3];
        await env.DB.prepare('UPDATE chat_dm_participants SET hidden_at = ? WHERE channel_id = ? AND user_id = ?')
          .bind(Date.now(), chId, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // POST /chat/channels/:id/unhide  — restore a hidden DM
      // ---------------------------------------------------------------
      if (url.pathname.match(/^\/chat\/channels\/[^/]+\/unhide$/) && request.method === 'POST') {
        const chId = url.pathname.split('/')[3];
        await env.DB.prepare('UPDATE chat_dm_participants SET hidden_at = NULL WHERE channel_id = ? AND user_id = ?')
          .bind(chId, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // GET /chat/channels/hidden  — list hidden DMs for current user
      // ---------------------------------------------------------------
      if (url.pathname === '/chat/channels/hidden' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          "SELECT cc.*, u2.username AS other_username, cdp2.user_id AS other_user_id, u2.avatar_url AS other_avatar_url, u2.discriminator AS other_discriminator, u2.presence AS other_presence FROM chat_channels cc JOIN chat_dm_participants cdp ON cc.id = cdp.channel_id AND cdp.user_id = ? AND cdp.hidden_at IS NOT NULL JOIN chat_dm_participants cdp2 ON cc.id = cdp2.channel_id AND cdp2.user_id != ? JOIN users u2 ON u2.id = cdp2.user_id WHERE cc.type = 'dm'"
        ).bind(userId, userId).all();
        return new Response(JSON.stringify({ channels: results || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // PATCH /chat/messages/:id  — edit own message
      // ---------------------------------------------------------------
      if (url.pathname.match(/^\/chat\/messages\/[^/]+$/) && request.method === 'PATCH') {
        const msgId = url.pathname.split('/')[3];
        const msg = await env.DB.prepare('SELECT sender_id, is_system FROM chat_messages WHERE id = ? AND deleted_at IS NULL').bind(msgId).first();
        if (!msg) return new Response(JSON.stringify({ error: 'Message not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (msg.sender_id !== userId) return new Response(JSON.stringify({ error: 'Not your message' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (msg.is_system) return new Response(JSON.stringify({ error: 'Cannot edit system messages' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const { content } = await request.json();
        if (!content?.trim()) return new Response(JSON.stringify({ error: 'content required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await env.DB.prepare('UPDATE chat_messages SET content = ?, edited_at = ? WHERE id = ?')
          .bind(content.trim(), Date.now(), msgId).run();
        const updated = await env.DB.prepare('SELECT cm.*, COALESCE(u.username, cm.sender_username) AS sender_username, u.avatar_url AS sender_avatar_url FROM chat_messages cm LEFT JOIN users u ON cm.sender_id = u.id WHERE cm.id = ?').bind(msgId).first();
        return new Response(JSON.stringify({ message: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ---------------------------------------------------------------
      // GROUPS – create a group channel
      // POST /chat/groups  { name, member_ids: string[] }
      // ---------------------------------------------------------------
      if (url.pathname === '/chat/groups' && request.method === 'POST') {
        const me = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first();
        const { name, member_ids, group_type } = await request.json();
        if (!name?.trim()) return new Response(JSON.stringify({ error: 'name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const channelId = crypto.randomUUID();
        const gType = group_type === 'public' ? 'public' : 'private';
        await env.DB.prepare("INSERT INTO chat_channels (id, type, project_id, name, group_type, owner_id, created_at) VALUES (?, 'group', NULL, ?, ?, ?, ?)")
          .bind(channelId, name.trim(), gType, userId, Date.now()).run();
        // Add creator as owner
        await env.DB.prepare('INSERT OR IGNORE INTO chat_group_members (channel_id, user_id, username, role, added_at) VALUES (?, ?, ?, ?, ?)')
          .bind(channelId, userId, me?.username || '', 'owner', Date.now()).run();
        // Add other members
        const others = [...new Set((member_ids || []).filter(id => id !== userId))];
        for (const memberId of others) {
          const member = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(memberId).first();
          if (member) {
            await env.DB.prepare('INSERT OR IGNORE INTO chat_group_members (channel_id, user_id, username, role, added_at) VALUES (?, ?, ?, ?, ?)')
              .bind(channelId, memberId, member.username, 'member', Date.now()).run();
          }
        }
        return new Response(JSON.stringify({ channel_id: channelId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'Server error',
        message: error.message,
        stack: error.stack 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

