import { create } from 'zustand';
import { checkExists, createFile, createFolder, readBinaryFile, readFile, writeBinaryFile } from '@/lib/fileSystem';
import { useAuthStore } from './useAuthStore';
import { getWorkerUrl } from '@/lib/cloudSync';

export type OfficeDocumentKind = 'document' | 'spreadsheet' | 'presentation';

export interface OfficeDocument {
  id: string;
  title: string;
  kind: OfficeDocumentKind;
  filePath: string;
  extension: string;
  lastModified: number;
  createdBy?: string;
}

export interface OfficeDocumentData {
  encoding: 'base64';
  content: string;
  size: number;
  updatedAt: number;
}

const OFFICE_ROOT = 'root/office';
const OFFICE_FILES_ROOT = 'root/office/files';
const OFFICE_INDEX = 'root/office/index.json';

const KIND_CONFIG: Record<OfficeDocumentKind, { extension: string; route: string }> = {
  document: { extension: 'odt', route: '/documents' },
  spreadsheet: { extension: 'ods', route: '/spreadsheets' },
  presentation: { extension: 'odp', route: '/presentations' },
};

const OFFICE_EXTENSION_KIND: Record<string, OfficeDocumentKind> = {
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  txt: 'document',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
};

const getFileName = (filePath: string) => filePath.split(/[\\/]/).pop() || filePath;
const getBaseName = (filePath: string) => getFileName(filePath).replace(/\.[^.]+$/, '');
const getExtension = (filePath: string) => {
  const match = getFileName(filePath).match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
};
const sanitizeTitle = (title: string) => title.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, ' ').trim();
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
};
const base64ToBytes = (content: string) => {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};
const textToBytes = (content: string) => new TextEncoder().encode(content);

async function ensureOfficeStructure() {
  if (!(await checkExists(OFFICE_ROOT))) {
    await createFolder('root', 'office');
  }
  if (!(await checkExists(OFFICE_FILES_ROOT))) {
    await createFolder(OFFICE_ROOT, 'files');
  }
  if (!(await checkExists(OFFICE_INDEX))) {
    await createFile(OFFICE_ROOT, 'index.json', '[]');
  }
}

async function persistDocuments(documents: OfficeDocument[]) {
  await ensureOfficeStructure();
  await createFile(OFFICE_ROOT, 'index.json', JSON.stringify(documents, null, 2));
}

function deriveKindFromPath(filePath: string): OfficeDocumentKind | null {
  const extension = getExtension(filePath);
  return OFFICE_EXTENSION_KIND[extension] || null;
}

interface OfficeDocumentState {
  documents: OfficeDocument[];
  loadDocuments: () => Promise<void>;
  createDocument: (title: string, kind: OfficeDocumentKind) => Promise<string>;
  ensureDocumentForFile: (filePath: string) => Promise<string | null>;
  getDocumentSnapshot: (id: string) => Promise<{ document: OfficeDocument; data: OfficeDocumentData } | null>;
  fetchSharedDocumentSnapshot: (projectId: string, resourceId: string) => Promise<{ document: OfficeDocument; data: OfficeDocumentData } | null>;
  syncSharedDocument: (projectId: string, resourceId: string) => Promise<OfficeDocumentData | null>;
  exportDocumentsForSync: () => Promise<{ documents: OfficeDocument[]; dataById: Record<string, OfficeDocumentData> }>;
  importDocumentsFromSync: (payload: { documents: OfficeDocument[]; dataById: Record<string, OfficeDocumentData> } | null | undefined, options?: { preferIncoming?: boolean }) => Promise<void>;
  getRouteForKind: (kind: OfficeDocumentKind) => string;
}

export const useOfficeDocumentStore = create<OfficeDocumentState>((set, get) => ({
  documents: [],

  loadDocuments: async () => {
    await ensureOfficeStructure();
    const content = await readFile(OFFICE_INDEX);
    if (!content) {
      set({ documents: [] });
      return;
    }

    try {
      const documents = JSON.parse(content) as OfficeDocument[];
      set({ documents: Array.isArray(documents) ? documents : [] });
    } catch (error) {
      console.error('Failed to parse office index', error);
      set({ documents: [] });
    }
  },

  getDocumentSnapshot: async (id) => {
    const document = get().documents.find((entry) => entry.id === id);
    if (!document) return null;

    const binary = await readBinaryFile(document.filePath);
    const text = binary ? null : await readFile(document.filePath);
    const bytes = binary || textToBytes(text || '');

    return {
      document,
      data: {
        encoding: 'base64',
        content: bytesToBase64(bytes),
        size: bytes.byteLength,
        updatedAt: document.lastModified,
      },
    };
  },

  createDocument: async (title, kind) => {
    await ensureOfficeStructure();

    const config = KIND_CONFIG[kind];
    const cleanTitle = sanitizeTitle(title) || `Untitled ${kind}`;
    let fileName = `${cleanTitle}.${config.extension}`;
    let filePath = `${OFFICE_FILES_ROOT}/${fileName}`;
    let counter = 2;

    while (await checkExists(filePath)) {
      fileName = `${cleanTitle} ${counter}.${config.extension}`;
      filePath = `${OFFICE_FILES_ROOT}/${fileName}`;
      counter += 1;
    }

    await createFile(OFFICE_FILES_ROOT, fileName, '');

    const user = useAuthStore.getState().user;
    const now = Date.now();
    const document: OfficeDocument = {
      id: now.toString(),
      title: fileName.replace(/\.[^.]+$/, ''),
      kind,
      filePath,
      extension: config.extension,
      lastModified: now,
      createdBy: user?.username || user?.email || undefined,
    };

    const documents = [document, ...get().documents];
    set({ documents });
    await persistDocuments(documents);
    return document.id;
  },

  ensureDocumentForFile: async (filePath) => {
    const kind = deriveKindFromPath(filePath);
    if (!kind) return null;

    await ensureOfficeStructure();
    const existing = get().documents.find((document) => document.filePath === filePath);
    if (existing) return existing.id;

    const user = useAuthStore.getState().user;
    const extension = getExtension(filePath);
    const now = Date.now();
    const document: OfficeDocument = {
      id: now.toString(),
      title: getBaseName(filePath),
      kind,
      filePath,
      extension,
      lastModified: now,
      createdBy: user?.username || user?.email || undefined,
    };

    const documents = [document, ...get().documents];
    set({ documents });
    await persistDocuments(documents);
    return document.id;
  },

  fetchSharedDocumentSnapshot: async (projectId, resourceId) => {
    const token = useAuthStore.getState().token;
    if (!token) return null;

    try {
      const response = await fetch(`${getWorkerUrl()}/projects/${projectId}/resources/${resourceId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;

      const payload = await response.json();
      if (!payload?.document || !payload?.data) return null;
      return payload;
    } catch {
      return null;
    }
  },

  syncSharedDocument: async (projectId, resourceId) => {
    const snapshot = await get().fetchSharedDocumentSnapshot(projectId, resourceId);
    if (!snapshot) return null;

    const bytes = base64ToBytes(snapshot.data.content);
    await writeBinaryFile(snapshot.document.filePath, bytes);

    const existing = get().documents;
    const nextDocuments = existing.some((entry) => entry.id === snapshot.document.id)
      ? existing.map((entry) => entry.id === snapshot.document.id ? { ...entry, ...snapshot.document } : entry)
      : [snapshot.document, ...existing];
    set({ documents: nextDocuments });
    await persistDocuments(nextDocuments);
    return snapshot.data;
  },

  exportDocumentsForSync: async () => {
    const dataById: Record<string, OfficeDocumentData> = {};
    await Promise.all(get().documents.map(async (document) => {
      const snapshot = await get().getDocumentSnapshot(document.id);
      if (snapshot) dataById[document.id] = snapshot.data;
    }));
    return { documents: get().documents, dataById };
  },

  importDocumentsFromSync: async (payload, options) => {
    if (!payload) return;

    const preferIncoming = options?.preferIncoming ?? false;
    const currentDocuments = get().documents;
    const merged = new Map(currentDocuments.map((document) => [document.id, document]));
    for (const document of payload.documents || []) {
      const existing = merged.get(document.id);
      if (!existing || preferIncoming || (document.lastModified || 0) >= (existing.lastModified || 0)) {
        merged.set(document.id, existing ? { ...existing, ...document } : document);
      }
    }

    const nextDocuments = Array.from(merged.values()).sort((left, right) => (right.lastModified || 0) - (left.lastModified || 0));
    for (const document of nextDocuments) {
      const data = payload.dataById?.[document.id];
      if (!data?.content) continue;
      await writeBinaryFile(document.filePath, base64ToBytes(data.content));
    }

    set({ documents: nextDocuments });
    await persistDocuments(nextDocuments);
  },

  getRouteForKind: (kind) => KIND_CONFIG[kind].route,
}));