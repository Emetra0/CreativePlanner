import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSettingsStore } from './useSettingsStore';
import { useAuthStore } from './useAuthStore';
import { readFile, createFile, createFolder, checkExists, deleteEntry } from '@/lib/fileSystem';
import { getWorkerUrl } from '@/lib/cloudSync';
import { MindMapCategory, MindMapTheme } from './useStore';
import { Node, Edge } from 'reactflow';

export interface MindmapDocument {
  id: string;
  title: string;
  lastModified: number;
  isFavorite?: boolean;
  /** 'mindmap' (default) or 'moodboard' */
  type?: 'mindmap' | 'moodboard';
  /** Author / owner username */
  createdBy?: string;
  /** Username of the person who last saved the document */
  lastEditedBy?: string;
}

export interface MindmapData {
  nodes: Node[];
  edges: Edge[];
  categories: MindMapCategory[];
  theme?: MindMapTheme;
}

export interface MindmapSyncPayload {
  documents: MindmapDocument[];
  dataById: Record<string, MindmapData>;
}

export interface SharedMindmapSnapshot {
  document: MindmapDocument;
  data: MindmapData;
}

export interface MindmapTemplate {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'planning' | 'analysis' | 'story' | 'personal' | 'custom';
  icon: string; // icon-id (see TEMPLATE_ICON_MAP in MindmapTemplateModal.tsx)
  isBuiltIn: boolean;
  nodes: Omit<Node, 'width' | 'height'>[];
  edges: Edge[];
  categories?: MindMapCategory[];
}

const sanitizeNodeForSync = (node: Node): Node => {
  const nextNode = { ...node } as any;
  delete nextNode.selected;
  delete nextNode.dragging;
  delete nextNode.resizing;
  return nextNode as Node;
};

const sanitizeEdgeForSync = (edge: Edge): Edge => {
  const nextEdge = { ...edge } as any;
  delete nextEdge.selected;
  return nextEdge as Edge;
};

export const sanitizeMindmapData = (data: MindmapData): MindmapData => ({
  ...data,
  nodes: Array.isArray(data.nodes) ? data.nodes.map(sanitizeNodeForSync) : [],
  edges: Array.isArray(data.edges) ? data.edges.map(sanitizeEdgeForSync) : [],
  categories: Array.isArray(data.categories) ? data.categories : [],
  theme: data.theme,
});

// ─── Node factory helpers ────────────────────────────────────────────────────

const n = (id: string, label: string, x: number, y: number, extra?: any): Node =>
  ({ id, type: 'mindMap', position: { x, y }, data: { label, category: 'default', ...extra } } as Node);

const e = (id: string, source: string, target: string): Edge =>
  ({ id, source, target, type: 'mindMap' } as Edge);

// ─── Built-in templates ──────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: MindmapTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Mind Map',
    description: 'Start with a single central idea and build freely.',
    category: 'general',
    icon: 'map',
    isBuiltIn: true,
    nodes: [n('1', 'Central Idea', 0, 0)],
    edges: [],
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'Rapid idea capture around a central topic — perfect for creative sessions.',
    category: 'general',
    icon: 'zap',
    isBuiltIn: true,
    nodes: [
      n('1', 'Topic', 0, 0),
      n('2', 'Ideas', 220, -160),
      n('3', 'Questions', 220, -60),
      n('4', 'Opportunities', 220, 40),
      n('5', 'Challenges', -280, -80),
      n('6', 'Solutions', -280, 40),
      n('7', 'Next Steps', 0, 160),
    ],
    edges: [
      e('e1-2','1','2'), e('e1-3','1','3'), e('e1-4','1','4'),
      e('e1-5','1','5'), e('e1-6','1','6'), e('e1-7','1','7'),
    ],
  },
  {
    id: 'swot',
    name: 'SWOT Analysis',
    description: 'Evaluate Strengths, Weaknesses, Opportunities and Threats.',
    category: 'analysis',
    icon: 'search',
    isBuiltIn: true,
    categories: [
      { id: 'default', name: 'General', color: '#e5e7eb' },
      { id: 'strength', name: 'Strength', color: '#bbf7d0' },
      { id: 'weakness', name: 'Weakness', color: '#fecaca' },
      { id: 'opportunity', name: 'Opportunity', color: '#bfdbfe' },
      { id: 'threat', name: 'Threat', color: '#fde68a' },
    ],
    nodes: [
      n('1', 'SWOT Analysis', 0, 0),
      n('s0', 'Strengths', -300, -180, { category: 'strength' }),
      n('s1', 'Strength 1', -480, -260, { category: 'strength' }),
      n('s2', 'Strength 2', -480, -180, { category: 'strength' }),
      n('s3', 'Strength 3', -480, -100, { category: 'strength' }),
      n('w0', 'Weaknesses', 260, -180, { category: 'weakness' }),
      n('w1', 'Weakness 1', 440, -260, { category: 'weakness' }),
      n('w2', 'Weakness 2', 440, -180, { category: 'weakness' }),
      n('w3', 'Weakness 3', 440, -100, { category: 'weakness' }),
      n('o0', 'Opportunities', -300, 140, { category: 'opportunity' }),
      n('o1', 'Opportunity 1', -480, 60, { category: 'opportunity' }),
      n('o2', 'Opportunity 2', -480, 140, { category: 'opportunity' }),
      n('o3', 'Opportunity 3', -480, 220, { category: 'opportunity' }),
      n('t0', 'Threats', 260, 140, { category: 'threat' }),
      n('t1', 'Threat 1', 440, 60, { category: 'threat' }),
      n('t2', 'Threat 2', 440, 140, { category: 'threat' }),
      n('t3', 'Threat 3', 440, 220, { category: 'threat' }),
    ],
    edges: [
      e('e1-s0','1','s0'), e('es0-1','s0','s1'), e('es0-2','s0','s2'), e('es0-3','s0','s3'),
      e('e1-w0','1','w0'), e('ew0-1','w0','w1'), e('ew0-2','w0','w2'), e('ew0-3','w0','w3'),
      e('e1-o0','1','o0'), e('eo0-1','o0','o1'), e('eo0-2','o0','o2'), e('eo0-3','o0','o3'),
      e('e1-t0','1','t0'), e('et0-1','t0','t1'), e('et0-2','t0','t2'), e('et0-3','t0','t3'),
    ],
  },
  {
    id: 'project-plan',
    name: 'Project Plan',
    description: 'Break a project into Goals, Timeline, Team, Risks and Deliverables.',
    category: 'planning',
    icon: 'clipboard-list',
    isBuiltIn: true,
    nodes: [
      n('1', 'Project Name', 0, 0),
      n('g0', 'Goals', -360, -200),
      n('g1', 'Goal 1', -560, -260), n('g2', 'Goal 2', -560, -180),
      n('t0', 'Timeline', -360, 60),
      n('t1', 'Phase 1', -560, 0), n('t2', 'Phase 2', -560, 80), n('t3', 'Phase 3', -560, 160),
      n('r0', 'Team / Resources', 300, -200),
      n('r1', 'Member 1', 500, -260), n('r2', 'Member 2', 500, -180),
      n('k0', 'Risks', 300, 60),
      n('k1', 'Risk 1', 500, 0), n('k2', 'Risk 2', 500, 80),
      n('d0', 'Deliverables', 0, 220),
      n('d1', 'Deliverable 1', -120, 310), n('d2', 'Deliverable 2', 120, 310),
    ],
    edges: [
      e('e1g','1','g0'), e('eg1','g0','g1'), e('eg2','g0','g2'),
      e('e1t','1','t0'), e('et1','t0','t1'), e('et2','t0','t2'), e('et3','t0','t3'),
      e('e1r','1','r0'), e('er1','r0','r1'), e('er2','r0','r2'),
      e('e1k','1','k0'), e('ek1','k0','k1'), e('ek2','k0','k2'),
      e('e1d','1','d0'), e('ed1','d0','d1'), e('ed2','d0','d2'),
    ],
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Capture agenda, attendees, decisions and action items in one map.',
    category: 'planning',
    icon: 'file-text',
    isBuiltIn: true,
    nodes: [
      n('1', 'Meeting', 0, 0),
      n('ag', 'Agenda', -320, -160),
      n('ag1', 'Item 1', -500, -220), n('ag2', 'Item 2', -500, -140),
      n('at', 'Attendees', -320, 80),
      n('at1', 'Person 1', -500, 20), n('at2', 'Person 2', -500, 100),
      n('de', 'Decisions', 280, -160),
      n('de1', 'Decision 1', 460, -220), n('de2', 'Decision 2', 460, -140),
      n('ai', 'Action Items', 280, 80),
      n('ai1', 'Action 1', 460, 20), n('ai2', 'Action 2', 460, 100),
      n('fu', 'Follow-up', 0, 200),
    ],
    edges: [
      e('e1ag','1','ag'), e('eag1','ag','ag1'), e('eag2','ag','ag2'),
      e('e1at','1','at'), e('eat1','at','at1'), e('eat2','at','at2'),
      e('e1de','1','de'), e('ede1','de','de1'), e('ede2','de','de2'),
      e('e1ai','1','ai'), e('eai1','ai','ai1'), e('eai2','ai','ai2'),
      e('e1fu','1','fu'),
    ],
  },
  {
    id: 'problem-solving',
    name: 'Problem Solving',
    description: 'Diagnose root causes and map out solutions systematically.',
    category: 'analysis',
    icon: 'wrench',
    isBuiltIn: true,
    nodes: [
      n('1', 'Problem', 0, 0),
      n('rc', 'Root Causes', -320, -120),
      n('rc1', 'Cause 1', -500, -200), n('rc2', 'Cause 2', -500, -120), n('rc3', 'Cause 3', -500, -40),
      n('sy', 'Symptoms', -320, 100),
      n('sy1', 'Symptom 1', -500, 60), n('sy2', 'Symptom 2', -500, 140),
      n('so', 'Solutions', 300, -120),
      n('so1', 'Solution 1', 480, -200), n('so2', 'Solution 2', 480, -120), n('so3', 'Solution 3', 480, -40),
      n('ns', 'Next Steps', 300, 100),
      n('ns1', 'Step 1', 480, 60), n('ns2', 'Step 2', 480, 140),
    ],
    edges: [
      e('e1rc','1','rc'), e('erc1','rc','rc1'), e('erc2','rc','rc2'), e('erc3','rc','rc3'),
      e('e1sy','1','sy'), e('esy1','sy','sy1'), e('esy2','sy','sy2'),
      e('e1so','1','so'), e('eso1','so','so1'), e('eso2','so','so2'), e('eso3','so','so3'),
      e('e1ns','1','ns'), e('ens1','ns','ns1'), e('ens2','ns','ns2'),
    ],
  },
  {
    id: 'story-outline',
    name: 'Story Outline',
    description: 'Map characters, plot arcs, setting and themes for any narrative.',
    category: 'story',
    icon: 'book-open',
    isBuiltIn: true,
    categories: [
      { id: 'default', name: 'General', color: '#e5e7eb' },
      { id: 'characters', name: 'Characters', color: '#bfdbfe' },
      { id: 'plot', name: 'Plot', color: '#fde68a' },
      { id: 'setting', name: 'Setting', color: '#bbf7d0' },
      { id: 'theme', name: 'Theme', color: '#f5d0fe' },
    ],
    nodes: [
      n('1', 'Story Title', 0, 0),
      n('ch', 'Characters', -350, -200, { category: 'characters' }),
      n('ch1', 'Protagonist', -540, -280, { category: 'characters' }),
      n('ch2', 'Antagonist', -540, -200, { category: 'characters' }),
      n('ch3', 'Supporting', -540, -120, { category: 'characters' }),
      n('pl', 'Plot', -350, 80, { category: 'plot' }),
      n('pl1', 'Act 1 — Setup', -540, 0, { category: 'plot' }),
      n('pl2', 'Act 2 — Conflict', -540, 80, { category: 'plot' }),
      n('pl3', 'Act 3 — Resolution', -540, 160, { category: 'plot' }),
      n('se', 'Setting', 310, -200, { category: 'setting' }),
      n('se1', 'World', 500, -280, { category: 'setting' }),
      n('se2', 'Time Period', 500, -200, { category: 'setting' }),
      n('se3', 'Locations', 500, -120, { category: 'setting' }),
      n('th', 'Themes', 310, 80, { category: 'theme' }),
      n('th1', 'Central Theme', 500, 0, { category: 'theme' }),
      n('th2', 'Motifs', 500, 80, { category: 'theme' }),
      n('ch4', 'Chapters', 0, 240),
      n('ch4a', 'Chapter 1', -120, 330), n('ch4b', 'Chapter 2', 120, 330),
    ],
    edges: [
      e('e1ch','1','ch'), e('ech1','ch','ch1'), e('ech2','ch','ch2'), e('ech3','ch','ch3'),
      e('e1pl','1','pl'), e('epl1','pl','pl1'), e('epl2','pl','pl2'), e('epl3','pl','pl3'),
      e('e1se','1','se'), e('ese1','se','se1'), e('ese2','se','se2'), e('ese3','se','se3'),
      e('e1th','1','th'), e('eth1','th','th1'), e('eth2','th','th2'),
      e('e1c4','1','ch4'), e('ec4a','ch4','ch4a'), e('ec4b','ch4','ch4b'),
    ],
  },
  {
    id: 'weekly-planner',
    name: 'Weekly Planner',
    description: 'Organise tasks and goals across the seven days of the week.',
    category: 'personal',
    icon: 'calendar',
    isBuiltIn: true,
    nodes: [
      n('1', 'Week', 0, 0),
      n('mo', 'Monday',    -400, -240),
      n('tu', 'Tuesday',   -400, -120),
      n('we', 'Wednesday', -400, 0),
      n('th', 'Thursday',  -400, 120),
      n('fr', 'Friday',     300, -240),
      n('sa', 'Saturday',   300, -60),
      n('su', 'Sunday',     300, 120),
    ],
    edges: [
      e('em','1','mo'), e('et','1','tu'), e('ew','1','we'),
      e('eth','1','th'), e('ef','1','fr'), e('esa','1','sa'), e('esu','1','su'),
    ],
  },
  {
    id: 'decision-tree',
    name: 'Decision Tree',
    description: 'Walk through choices and their outcomes step by step.',
    category: 'analysis',
    icon: 'git-branch',
    isBuiltIn: true,
    nodes: [
      n('1', 'Decision', 0, 0),
      n('y', 'Yes', -260, -120),
      n('n', 'No', 260, -120),
      n('y1', 'Outcome A', -420, -220), n('y2', 'Outcome B', -420, -60),
      n('n1', 'Outcome C', 420, -220), n('n2', 'Outcome D', 420, -60),
      n('y1a', 'Next Step', -600, -220), n('y2a', 'Next Step', -600, -60),
    ],
    edges: [
      e('e1y','1','y'), e('e1n','1','n'),
      e('ey1','y','y1'), e('ey2','y','y2'),
      e('en1','n','n1'), e('en2','n','n2'),
      e('ey1a','y1','y1a'), e('ey2a','y2','y2a'),
    ],
  },
  {
    id: 'concept-map',
    name: 'Concept Map',
    description: 'Visualise relationships between concepts for learning or documentation.',
    category: 'general',
    icon: 'brain',
    isBuiltIn: true,
    nodes: [
      n('1', 'Core Concept', 0, 0),
      n('a', 'Related Concept', -300, -140),
      n('b', 'Related Concept', 300, -140),
      n('c', 'Related Concept', -300, 140),
      n('d', 'Related Concept', 300, 140),
      n('a1', 'Sub-concept', -480, -220), n('a2', 'Sub-concept', -480, -80),
      n('b1', 'Sub-concept', 480, -220), n('b2', 'Sub-concept', 480, -80),
    ],
    edges: [
      e('e1a','1','a'), e('e1b','1','b'), e('e1c','1','c'), e('e1d','1','d'),
      e('ea1','a','a1'), e('ea2','a','a2'),
      e('eb1','b','b1'), e('eb2','b','b2'),
    ],
  },
];

const defaultCategories: MindMapCategory[] = [
  { id: 'default', name: 'General', color: '#e5e7eb' },
  { id: 'characters', name: 'Characters', color: '#bfdbfe' },
  { id: 'plot', name: 'Plot', color: '#fde68a' },
  { id: 'builds', name: 'Builds', color: '#bbf7d0' },
];

const defaultMindmapTheme: MindMapTheme = {
  id: 'default',
  name: 'Default',
  background: { color: '#f8fafc', pattern: 'clean' },
  node: { borderRadius: '9999px', shadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', border: '2px solid transparent' },
  edge: { stroke: '#b1b1b7', strokeWidth: 2, type: 'smoothstep' },
};

const getMindmapRoot = (): string => {
  const path = useSettingsStore.getState().projectPath || 'root/Cloud Storage';
  let root = path;
  if (path === 'root/Cloud Storage') root = 'root';
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root}${sep}mindmap`;
};

const getSep = (root: string) => (root.includes('\\') ? '\\' : '/');

const saveIndex = async (root: string, docs: MindmapDocument[]): Promise<void> => {
  const sep = getSep(root);
  const parts = root.replace(/\\/g, '/').split('/');
  const dirName = parts.pop()!;
  const parentPath = parts.join('/');

  if (!(await checkExists(root))) {
    await createFolder(parentPath, dirName);
  }

  await createFile(root, 'index.json', JSON.stringify(docs, null, 2));
};

interface MindmapState {
  documents: MindmapDocument[];
  customTemplates: MindmapTemplate[];
  loadDocuments: () => Promise<void>;
  createDocument: (title: string, templateId?: string, type?: 'mindmap' | 'moodboard') => Promise<string>;
  deleteDocument: (id: string) => Promise<void>;
  renameDocument: (id: string, title: string) => Promise<void>;
  toggleFavorite: (id: string) => void;
  /** Update lightweight metadata and persist to index */
  updateDocumentMeta: (id: string, updates: Partial<Pick<MindmapDocument, 'title' | 'createdBy' | 'lastEditedBy'>>) => void;
  setDocuments: (docs: MindmapDocument[]) => void;
  updateLastModified: (id: string) => void;
  loadMindmapData: (id: string) => Promise<MindmapData | null>;
  saveMindmapData: (id: string, data: MindmapData, options?: { skipRemoteSync?: boolean }) => Promise<void>;
  getDocumentSnapshot: (id: string) => Promise<{ document: MindmapDocument; data: MindmapData } | null>;
  exportDocumentsForSync: () => Promise<MindmapSyncPayload>;
  importDocumentsFromSync: (payload: MindmapSyncPayload | null | undefined, options?: { preferIncoming?: boolean }) => Promise<void>;
  fetchSharedDocumentSnapshot: (projectId: string, resourceId: string) => Promise<SharedMindmapSnapshot | null>;
  syncSharedDocument: (projectId: string, resourceId: string) => Promise<MindmapData | null>;
  saveAsTemplate: (name: string, description: string, category: MindmapTemplate['category'], data: MindmapData) => void;
  deleteCustomTemplate: (id: string) => void;
}

const sortDocuments = (docs: MindmapDocument[]) => [...docs].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

const upsertDocuments = (existing: MindmapDocument[], incoming: MindmapDocument[], preferIncoming = false) => {
  const map = new Map(existing.map((doc) => [doc.id, doc]));
  for (const next of incoming) {
    const prev = map.get(next.id);
    if (!prev || preferIncoming || (next.lastModified || 0) >= (prev.lastModified || 0)) {
      map.set(next.id, { ...prev, ...next });
    }
  }
  return sortDocuments(Array.from(map.values()));
};

export const useMindmapStore = create<MindmapState>()(
  persist(
    (set, get) => ({
      documents: [],
      customTemplates: [],

      loadDocuments: async () => {
        const root = getMindmapRoot();
        const sep = getSep(root);
        const indexPath = `${root}${sep}index.json`;
        const content = await readFile(indexPath);
        if (content) {
          try {
            const docs = JSON.parse(content) as MindmapDocument[];
            // Back-fill createdBy for legacy docs that lack it
            const me = useAuthStore.getState().user;
            const myName = me?.username || me?.email;
            const needsSave = docs.some((d) => !d.createdBy && myName);
            const filledDocs = myName
              ? docs.map((d) => d.createdBy ? d : { ...d, createdBy: myName })
              : docs;
            set({ documents: filledDocs });
            if (needsSave) {
              // Persist the back-filled names silently
              await saveIndex(root, filledDocs);
            }
          } catch (e) {
            console.error('Failed to parse mindmap index', e);
          }
        }
      },

      createDocument: async (title: string, templateId?: string, type: 'mindmap' | 'moodboard' = 'mindmap') => {
        const id = Date.now().toString();
        const me = useAuthStore.getState().user;
        const doc: MindmapDocument = {
          id,
          title,
          lastModified: Date.now(),
          isFavorite: false,
          type,
          createdBy: me?.username || me?.email || undefined,
        };
        const newDocs = [doc, ...get().documents];
        set({ documents: newDocs });

        const root = getMindmapRoot();
        const sep = getSep(root);

        // Ensure folder exists
        const parts = root.replace(/\\/g, '/').split('/');
        const dirName = parts.pop()!;
        const parentPath = parts.join('/');
        if (!(await checkExists(root))) {
          await createFolder(parentPath, dirName);
        }

        // Save updated index
        await saveIndex(root, newDocs);

        // For moodboards, save an empty canvas — no default nodes
        if (type === 'moodboard') {
          const emptyData: MindmapData = { nodes: [], edges: [], categories: [], theme: defaultMindmapTheme };
          await createFile(root, `${id}.json`, JSON.stringify(emptyData, null, 2));
          return id;
        }

        // Resolve template data
        let templateData: MindmapData | null = null;
        if (templateId && templateId !== 'blank') {
          const builtIn = BUILT_IN_TEMPLATES.find(t => t.id === templateId);
          const custom = get().customTemplates.find(t => t.id === templateId);
          const tpl = builtIn || custom;
          if (tpl) {
            templateData = {
              nodes: tpl.nodes.map(nd => ({ ...nd, data: { ...nd.data, label: nd.data.label === 'Central Idea' || nd.data.label === 'Central Concept' || nd.data.label === 'Topic' || nd.data.label === 'Meeting' || nd.data.label === 'Problem' || nd.data.label === 'Decision' || nd.data.label === 'Week' || nd.data.label === 'Project Name' || nd.data.label === 'SWOT Analysis' || nd.data.label === 'Story Title' ? title : nd.data.label } })) as Node[],
              edges: tpl.edges,
              categories: tpl.categories || defaultCategories,
              theme: defaultMindmapTheme,
            };
          }
        }

        const defaultData: MindmapData = templateData || {
          nodes: [
            { id: '1', type: 'mindMap', position: { x: 0, y: 0 }, data: { label: title, category: 'default' } } as Node,
          ],
          edges: [],
          categories: defaultCategories,
          theme: defaultMindmapTheme,
        };

        await createFile(root, `${id}.json`, JSON.stringify(defaultData, null, 2));

        return id;
      },

      deleteDocument: async (id: string) => {
        const newDocs = get().documents.filter((d) => d.id !== id);
        set({ documents: newDocs });

        const root = getMindmapRoot();
        const sep = getSep(root);

        await saveIndex(root, newDocs);

        const filePath = `${root}${sep}${id}.json`;
        await deleteEntry(filePath, false);
      },

      renameDocument: async (id: string, title: string) => {
        const newDocs = get().documents.map((d) =>
          d.id === id ? { ...d, title, lastModified: Date.now() } : d
        );
        set({ documents: newDocs });

        const root = getMindmapRoot();
        await saveIndex(root, newDocs);
      },

      toggleFavorite: (id: string) => {
        const newDocs = get().documents.map((d) =>
          d.id === id ? { ...d, isFavorite: !d.isFavorite } : d
        );
        set({ documents: newDocs });

        const root = getMindmapRoot();
        saveIndex(root, newDocs);
      },

      updateDocumentMeta: (id, updates) => {
        const newDocs = get().documents.map((d) =>
          d.id === id ? { ...d, ...updates } : d
        );
        set({ documents: newDocs });
        const root = getMindmapRoot();
        saveIndex(root, newDocs);
      },

      setDocuments: (documents) => set({ documents }),

      saveAsTemplate: (name, description, category, data) => {
        const id = `custom-${Date.now()}`;
        const tpl: MindmapTemplate = {
          id, name, description, category,
          icon: '⭐',
          isBuiltIn: false,
          nodes: data.nodes,
          edges: data.edges,
          categories: data.categories,
        };
        set({ customTemplates: [tpl, ...get().customTemplates] });
      },

      deleteCustomTemplate: (id) => {
        set({ customTemplates: get().customTemplates.filter(t => t.id !== id) });
      },

      updateLastModified: (id: string) => {
        const me = useAuthStore.getState().user;
        const displayName = me?.username || me?.email || undefined;
        const newDocs = get().documents.map((d) =>
          d.id === id ? { ...d, lastModified: Date.now(), lastEditedBy: displayName } : d
        );
        set({ documents: newDocs });
        const root = getMindmapRoot();
        saveIndex(root, newDocs);
      },

      loadMindmapData: async (id: string): Promise<MindmapData | null> => {
        try {
          const { useProjectStore } = await import('./useProjectStore');
          const { projects, projectResources } = useProjectStore.getState();
          const sharedProject = projects.find((project) =>
            (projectResources[project.id] || []).some((resource) => resource.resource_type === 'mindmap' && resource.resource_id === id),
          );
          if (sharedProject) {
            const remote = await get().syncSharedDocument(sharedProject.id, id);
            if (remote) return remote;
          }
        } catch {
          // Fall back to the local cached version below.
        }

        const root = getMindmapRoot();
        const sep = getSep(root);
        const filePath = `${root}${sep}${id}.json`;
        const content = await readFile(filePath);
        if (!content) return null;
        try {
          return sanitizeMindmapData(JSON.parse(content) as MindmapData);
        } catch (e) {
          console.error('Failed to parse mindmap data', e);
          return null;
        }
      },

      saveMindmapData: async (id: string, data: MindmapData, options): Promise<void> => {
        const root = getMindmapRoot();
        const sanitizedData = sanitizeMindmapData(data);
        await createFile(root, `${id}.json`, JSON.stringify(sanitizedData, null, 2));
        get().updateLastModified(id);

        if (options?.skipRemoteSync) return;

        try {
          const { useProjectStore } = await import('./useProjectStore');
          const { projects, projectResources } = useProjectStore.getState();
          const linkedProject = projects.find((project) =>
            (projectResources[project.id] || []).some((resource) => resource.resource_type === 'mindmap' && resource.resource_id === id),
          );
          const document = get().documents.find((doc) => doc.id === id);
          const token = useAuthStore.getState().token;
          const displayName = useAuthStore.getState().user?.username || useAuthStore.getState().user?.email || undefined;

          if (linkedProject && document && token) {
            const syncedDoc: MindmapDocument = {
              ...document,
              lastModified: Date.now(),
              lastEditedBy: displayName,
            };

            await fetch(`${getWorkerUrl()}/projects/${linkedProject.id}/resources/${id}/content`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ document: syncedDoc, data: sanitizedData }),
            });
          }
        } catch {
          // Keep the local save even if shared sync fails temporarily.
        }
      },

      getDocumentSnapshot: async (id: string) => {
        const document = get().documents.find((doc) => doc.id === id);
        if (!document) return null;
        const data = await get().loadMindmapData(id);
        if (!data) return null;
        return { document, data };
      },

      exportDocumentsForSync: async () => {
        const documents = sortDocuments(get().documents);
        const dataById: Record<string, MindmapData> = {};
        await Promise.all(documents.map(async (doc) => {
          const data = await get().loadMindmapData(doc.id);
          if (data) dataById[doc.id] = sanitizeMindmapData(data);
        }));
        return { documents, dataById };
      },

      importDocumentsFromSync: async (payload, options) => {
        if (!payload) return;

        const preferIncoming = options?.preferIncoming ?? false;
        const nextDocuments = upsertDocuments(get().documents, payload.documents || [], preferIncoming);
        set({ documents: nextDocuments });

        const root = getMindmapRoot();
        await saveIndex(root, nextDocuments);

        await Promise.all(
          Object.entries(payload.dataById || {}).map(([id, mindmapData]) =>
            createFile(root, `${id}.json`, JSON.stringify(sanitizeMindmapData(mindmapData), null, 2)),
          ),
        );
      },

      fetchSharedDocumentSnapshot: async (projectId, resourceId) => {
        const token = useAuthStore.getState().token;
        if (!token) return null;

        try {
          const res = await fetch(`${getWorkerUrl()}/projects/${projectId}/resources/${resourceId}/content`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return null;

          const { document, data } = await res.json();
          if (!document || !data) return null;
          return { document, data: sanitizeMindmapData(data) } as SharedMindmapSnapshot;
        } catch {
          return null;
        }
      },

      syncSharedDocument: async (projectId, resourceId) => {
        try {
          const snapshot = await get().fetchSharedDocumentSnapshot(projectId, resourceId);
          if (!snapshot) return null;

          await get().importDocumentsFromSync({
            documents: [snapshot.document],
            dataById: { [snapshot.document.id]: snapshot.data },
          }, { preferIncoming: true });

          return snapshot.data as MindmapData;
        } catch {
          return null;
        }
      },
    }),
    { name: 'mindmap-documents-store' }
  )
);
