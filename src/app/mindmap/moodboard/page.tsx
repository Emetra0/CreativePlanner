import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  ReactFlowProvider,
  useReactFlow,
  ConnectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Link as LinkIcon, Trash2, LayoutGrid,
  Palette, Lightbulb, FolderPlus, FileImage, X, RefreshCw, Share2, User,
  CheckSquare, ClipboardList, Calendar as CalendarIcon, MessageSquare, Sparkles, BookOpen,
  Clock, StickyNote, GalleryHorizontal, BookMarked, MapPin,
} from 'lucide-react';
import { useMindmapStore } from '@/store/useMindmapStore';
import { useIdeaStore } from '@/store/useIdeaStore';
import { usePaletteStore, StoredPalette } from '@/store/usePaletteStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTodoStore, todayString } from '@/store/useTodoStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { usePlannerStore, sessionTodayString, getDurationMinutes } from '@/store/usePlannerStore';
import { useThemeStore } from '@/store/useThemeStore';
import MoodboardNode from '@/components/MoodboardNode';
import MoodboardColorPaletteNode from '@/components/MoodboardColorPaletteNode';
import MoodboardIdeaNode from '@/components/MoodboardIdeaNode';
import MoodboardGroupNode from '@/components/MoodboardGroupNode';
import MoodboardRefNode from '@/components/MoodboardRefNode';
import MoodboardEdge from '@/components/MoodboardEdge';
import MoodboardNoteNode from '@/components/MoodboardNoteNode';
import SourcesNode from '@/components/SourcesNode';
import SpecialNode from '@/components/SpecialNode';
import { useImageLibraryStore, getImageDimensions } from '@/store/useImageLibraryStore';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import { ConfirmModal } from '@/components/Modal';
import MindmapShareModal from '@/components/MindmapShareModal';
import { useAppDialogs } from '@/components/AppDialogs';
import { type PaletteHarmony } from '@/store/usePaletteStore';
import { eventMatchesKeybind, getKeybindValue, normalizeKeybindKey } from '@/lib/keybinds';
import { useAppTranslation } from '@/lib/appTranslations';

// ─── Palette harmony utilities (mirrors Brainstorming tab) ──────────────────

const HARMONY_LIST: PaletteHarmony[] = ['analogous', 'complementary', 'triadic', 'split-complementary', 'monochromatic', 'tetradic'];

function generateHarmoniousPalette(harmony: PaletteHarmony): string[] {
  const hue = Math.floor(Math.random() * 360);
  const sat = 58 + Math.floor(Math.random() * 18);
  const h = (deg: number, s = sat, l = 50) =>
    `hsl(${Math.round(((hue + deg) % 360 + 360) % 360)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  switch (harmony) {
    case 'analogous':           return [h(-40,sat,38), h(-20,sat,50), h(0,sat,62), h(20,sat,50), h(40,sat,38)];
    case 'complementary':       return [h(0,sat,30), h(0,sat,50), h(0,sat-8,70), h(180,sat,43), h(180,sat-8,62)];
    case 'triadic':             return [h(0,sat,50), h(120,sat,55), h(240,sat,50), h(0,sat-14,72), h(120,sat-14,72)];
    case 'split-complementary': return [h(0,sat,50), h(150,sat,50), h(210,sat,50), h(0,sat-10,70), h(150,sat-10,70)];
    case 'monochromatic':       return [h(0,sat,20), h(0,sat,36), h(0,sat,52), h(0,sat-12,68), h(0,sat-20,82)];
    case 'tetradic':            return [h(0,sat,50), h(90,sat,50), h(180,sat,50), h(270,sat,50), h(45,sat-10,68)];
    default:                    return Array(5).fill(0).map((_,i) => h(i*60));
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const NODE_TYPES = {
  moodboardNode: MoodboardNode,
  colorPaletteNode: MoodboardColorPaletteNode,
  ideaNode: MoodboardIdeaNode,
  groupNode: MoodboardGroupNode,
  moodboardRefNode: MoodboardRefNode,
  noteNode: MoodboardNoteNode,
  sourcesNode: SourcesNode,
  specialNode: SpecialNode,
};

const EDGE_TYPES = {
  moodboardEdge: MoodboardEdge,
};

// ─── Special (tool) node definitions ────────────────────────────────────────

import type { LucideIcon } from 'lucide-react';

const SPECIAL_TOOLS: { nodeType: string; Icon: LucideIcon; label: string; color: string }[] = [
  { nodeType: 'todo',         Icon: CheckSquare,   label: 'Todo List',    color: 'text-green-500'  },
  { nodeType: 'planner',      Icon: ClipboardList, label: 'Planner',      color: 'text-blue-500'   },
  { nodeType: 'brainstorm',   Icon: Sparkles,      label: 'Brainstorm',   color: 'text-purple-500' },
  { nodeType: 'calendar',     Icon: CalendarIcon,  label: 'Calendar',     color: 'text-red-500'    },
  { nodeType: 'chat',         Icon: MessageSquare, label: 'Chat Note',    color: 'text-cyan-500'   },
  { nodeType: 'idea',         Icon: Lightbulb,     label: 'Idea',         color: 'text-yellow-500' },
  { nodeType: 'storytelling', Icon: BookOpen,   label: 'Storytelling', color: 'text-indigo-500' },
  { nodeType: 'sources',      Icon: BookMarked, label: 'Sources',      color: 'text-blue-500'  },
];

const BRAINSTORM_PROMPT_KEYS = [
  'brainstorm.prompt1',
  'brainstorm.prompt2',
  'brainstorm.prompt3',
  'brainstorm.prompt4',
  'brainstorm.prompt5',
  'brainstorm.prompt6',
  'brainstorm.prompt7',
  'brainstorm.prompt8',
  'brainstorm.prompt9',
  'brainstorm.prompt10',
] as const;

// ─── Color extraction from images ──────────────────────────────────────────

function colorDist(a: [number, number, number], b: [number, number, number]) {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function sampleImageColors(url: string): Promise<[number,number,number][]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const SIZE = 64;
      const cv = document.createElement('canvas');
      cv.width = cv.height = SIZE;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
      const buckets: Record<string, { count: number; r: number; g: number; b: number }> = {};
      for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
        const r = Math.round(data[i]   / 24) * 24;
        const g = Math.round(data[i+1] / 24) * 24;
        const b = Math.round(data[i+2] / 24) * 24;
        if (data[i+3] < 128) continue; // skip transparent
        const key = `${r},${g},${b}`;
        if (!buckets[key]) buckets[key] = { count: 0, r, g, b };
        buckets[key].count++;
      }
      const sorted = Object.values(buckets)
        .sort((a, b) => b.count - a.count)
        .map(({ r, g, b }) => [r, g, b] as [number,number,number]);
      resolve(sorted);
    };
    img.onerror = () => resolve([]);
    img.src = url;
  });
}

async function extractPaletteFromImages(imageUrls: string[], n = 5): Promise<string[]> {
  const allColors: [number,number,number][] = [];
  for (const url of imageUrls) {
    const colors = await sampleImageColors(url);
    allColors.push(...colors.slice(0, 20));
  }
  if (allColors.length === 0) return [];

  // Greedy selection: pick most frequent color, then most different, repeat
  const chosen: [number,number,number][] = [];
  const pool = [...allColors];
  while (chosen.length < n && pool.length > 0) {
    const next = chosen.length === 0
      ? pool[0]
      : pool.find((c) => chosen.every((ch) => colorDist(c, ch) > 40)) || pool[0];
    chosen.push(next);
    const idx = pool.indexOf(next);
    if (idx !== -1) pool.splice(idx, 1);
  }
  return chosen.map(([r, g, b]) => rgbToHex(r, g, b));
}

// ─── Auto-layout: arrange nodes in a responsive grid ────────────────────────

function arrangeGrid(nodes: Node[]): Node[] {
  const COLS = 4;
  const GAP_X = 260;
  const GAP_Y = 300;
  return nodes.map((n, i) => ({
    ...n,
    position: {
      x: (i % COLS) * GAP_X,
      y: Math.floor(i / COLS) * GAP_Y,
    },
  }));
}

// ─── Image Library Panel ─────────────────────────────────────────────────────

function ImageLibraryPanel({ addImageNode, panelWidth }: { addImageNode: (dataUrl: string) => void; panelWidth: number }) {
  const { t } = useAppTranslation();
  const { images, addImage, removeImage } = useImageLibraryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await readFileAsDataUrl(file);
      const { width, height } = await getImageDimensions(dataUrl);
      addImage({ name: file.name, dataUrl, width, height });
    }
  };

  // Decide column count based on panel width
  const cols = panelWidth >= 320 ? 3 : 2;

  return (
    <div className="flex flex-col h-full p-2 gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors shrink-0"
      >
        <Plus size={12} /> {t('moodboard.imageLibraryUpload')}
      </button>
      {images.length === 0 ? (
        <p className="text-[10px] text-gray-400 text-center py-6 italic">
          {t('moodboard.imageLibraryEmpty')}
        </p>
      ) : (
        <div className="overflow-y-auto flex-1">
          <div
            style={{ columnCount: cols, columnGap: '6px' }}
          >
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 cursor-pointer"
                style={{ breakInside: 'avoid', marginBottom: '6px', display: 'block' }}
                onClick={() => addImageNode(img.dataUrl)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/moodboard-image-lib', img.dataUrl);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="w-full block"
                  style={{ display: 'block' }}
                  title={t('moodboard.imageLibraryAddImageTitle', { name: img.name })}
                />
                <button
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                  title={t('moodboard.imageLibraryRemove')}
                >
                  <X size={9} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Editor inner (needs ReactFlowProvider context) ─────────────────────────

function formatLastUpdated(
  ts: number | undefined,
  language: string,
  text: (value: string, params?: Record<string, string>) => string,
): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return text('just now');
  if (diff < 3_600_000) {
    return new Intl.RelativeTimeFormat(language, { numeric: 'always', style: 'short' }).format(-Math.floor(diff / 60_000), 'minute');
  }
  if (diff < 86_400_000) {
    return new Intl.RelativeTimeFormat(language, { numeric: 'always', style: 'short' }).format(-Math.floor(diff / 3_600_000), 'hour');
  }
  const d = new Date(ts);
  return new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(d);
}

function MoodboardEditorInner() {
  const dialogs = useAppDialogs();
  const { language, t, text } = useAppTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const documentId = searchParams.get('id');

  const { documents, loadMindmapData, saveMindmapData } = useMindmapStore();
  const { ideas, addIdea, removeIdea } = useIdeaStore();
  const { palettes, addPalette, removePalette } = usePaletteStore();
  const { keybinds } = useSettingsStore();
  const { todos, addTodo, toggleTodo, deleteTodo } = useTodoStore();
  const { events: calEvents, addEvent: addCalEvent } = useCalendarStore();
  const planItems = usePlannerStore((state) => state.planItems);
  const addPlanItem = usePlannerStore((state) => state.addPlanItem);
  const { themes } = useThemeStore();
  const moodboards = documents.filter((d) => (d as any).type === 'moodboard' && d.id !== documentId);
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loaded, setLoaded] = useState(false);
  const [docTitle, setDocTitle] = useState(t('moodboard.badge'));
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; flowX: number; flowY: number; items: ContextMenuItem[];
  } | null>(null);
  const [showPalettePicker, setShowPalettePicker] = useState(false);
  const [showIdeaPicker, setShowIdeaPicker] = useState(false);
  const [showMoodboardPicker, setShowMoodboardPicker] = useState(false);
  const [showToolsPicker, setShowToolsPicker] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [pendingPos, setPendingPos] = useState({ x: 100, y: 100 });
  const [mbPaletteHarmony, setMbPaletteHarmony] = useState<PaletteHarmony>('analogous');

  // Sidebar state
  const [activeToolPanel, setActiveToolPanel] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(224); // slide-out panel width in px
  const panelResizingRef = useRef(false);

  const startPanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    panelResizingRef.current = true;
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      if (!panelResizingRef.current) return;
      const next = Math.max(160, Math.min(480, startW + (ev.clientX - startX)));
      setPanelWidth(next);
    };
    const onUp = () => {
      panelResizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidth]);
  const [miniTodoInput, setMiniTodoInput] = useState('');
  const [miniChatMessages, setMiniChatMessages] = useState<string[]>([]);
  const [miniChatInput, setMiniChatInput] = useState('');
  const [miniPlannerInput, setMiniPlannerInput] = useState('');
  const [miniIdeaText, setMiniIdeaText] = useState('');
  const [miniCalTitle, setMiniCalTitle] = useState('');
  const [brainstormTab, setBrainstormTab] = useState<'ideas' | 'themes' | 'prompts' | 'palettes'>('ideas');
  const [brainstormPrompt, setBrainstormPrompt] = useState('');
  const [brainstormHarmony, setBrainstormHarmony] = useState<PaletteHarmony>('analogous');
  const [generatedPalette, setGeneratedPalette] = useState<string[]>([]);
  const brainstormPrompts = useMemo(() => BRAINSTORM_PROMPT_KEYS.map((key) => t(key)), [t]);
  const getPaletteHarmonyLabel = useCallback((harmony: PaletteHarmony) => {
    switch (harmony) {
      case 'analogous':
        return t('palette.harmonyAnalogous');
      case 'complementary':
        return t('palette.harmonyComplementary');
      case 'triadic':
        return t('palette.harmonyTriadic');
      case 'split-complementary':
        return t('palette.harmonySplitComplementary');
      case 'monochromatic':
        return t('palette.harmonyMonochromatic');
      case 'tetradic':
        return t('palette.harmonyTetradic');
      default:
        return harmony;
    }
  }, [t]);
  const brainstormTabs = useMemo(() => ([
    { id: 'ideas', label: '💡', title: t('brainstorm.tabIdeas') },
    { id: 'themes', label: '🎨', title: t('brainstorm.tabThemes') },
    { id: 'prompts', label: '✍️', title: t('brainstorm.tabPrompts') },
    { id: 'palettes', label: '🌈', title: t('brainstorm.tabPalettes') },
  ] as const), [t]);
  const getMoodboardToolLabel = useCallback((nodeType: string) => {
    switch (nodeType) {
      case 'todo':
        return t('moodboard.toolTodoList');
      case 'planner':
        return t('moodboard.toolPlanner');
      case 'brainstorm':
        return t('moodboard.toolBrainstorm');
      case 'calendar':
        return t('moodboard.toolCalendar');
      case 'chat':
        return t('moodboard.toolChatNote');
      case 'idea':
        return t('moodboard.toolIdea');
      case 'storytelling':
        return t('moodboard.toolStorytelling');
      case 'sources':
        return t('moodboard.toolSources');
      default:
        return nodeType;
    }
  }, [t]);

  // Edge format state
  const [mbEdgeColor, setMbEdgeColor] = useState('#a78bfa');
  const [mbEdgeType, setMbEdgeType] = useState('moodboardEdge');
  const [mbEdgeStrokeWidth, setMbEdgeStrokeWidth] = useState<1 | 2 | 4>(2);
  const [mbEdgeDasharray, setMbEdgeDasharray] = useState<string | undefined>(undefined);

  // Node hover edge format bar
  const [edgeFormatAnchor, setEdgeFormatAnchor] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const edgeFormatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete confirmation
  const [pendingDeleteNodes, setPendingDeleteNodes] = useState<{ ids: string[]; label: string } | null>(null);

  useEffect(() => {
    setBrainstormPrompt((current) => (current && brainstormPrompts.includes(current) ? current : (brainstormPrompts[0] ?? '')));
  }, [brainstormPrompts]);

  // Current doc metadata
  const currentDoc = documents.find((d) => d.id === documentId);

  const { screenToFlowPosition, getViewport } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Track source node when user drags from a handle to empty canvas
  const connectionStartRef = useRef<{ nodeId: string } | null>(null);
  // Set to source nodeId when connectEnd fires on pane; consumed by the next add-node call
  const pendingConnectionRef = useRef<string | null>(null);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const historyRef    = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const historyIdxRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const structKeyRef   = useRef('');

  const onConnectStart = useCallback((_: any, params: any) => {
    connectionStartRef.current = { nodeId: params.nodeId };
  }, []);

  const onConnectEnd = useCallback((event: any) => {
    if (!connectionStartRef.current) return;
    const isPane = (event.target as HTMLElement)?.classList?.contains('react-flow__pane');
    const sourceId = connectionStartRef.current.nodeId;
    connectionStartRef.current = null;
    if (!isPane) return;

    const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    pendingConnectionRef.current = sourceId;

    // Helper: create edge inline (used for immediate options below)
    const wireEdge = (targetId: string) =>
      setEdges((eds) => addEdge({ source: sourceId, target: targetId, sourceHandle: null, targetHandle: null, type: 'moodboardEdge' } as Connection, eds));

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowX: pos.x,
      flowY: pos.y,
      items: [
        {
          label: t('moodboard.contextAddImage'),
          action: () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              const url = await readFileAsDataUrl(file);
              const newId = `img-${Date.now()}`;
              setNodes((nds) => [...nds, { id: newId, type: 'moodboardNode', position: pos, data: { imageUrl: url, caption: '' } }]);
              wireEdge(newId);
              pendingConnectionRef.current = null;
            };
            input.click();
          },
        },
        {
          label: t('moodboard.contextAddImageFromUrl'),
          action: async () => {
            const url = await dialogs.prompt({
              title: t('moodboard.addImageFromUrlTitle'),
              message: t('moodboard.addImageFromUrlMessage'),
              label: t('moodboard.imageUrlLabel'),
              placeholder: 'https://example.com/image.jpg',
              submitLabel: t('moodboard.addImageAction'),
            });
            if (!url?.trim()) { pendingConnectionRef.current = null; return; }
            const newId = `img-${Date.now()}`;
            setNodes((nds) => [...nds, { id: newId, type: 'moodboardNode', position: pos, data: { imageUrl: url.trim(), caption: '' } }]);
            wireEdge(newId);
            pendingConnectionRef.current = null;
          },
        },
        { label: t('moodboard.contextAddColorPalette'), action: () => { setPendingPos(pos); setShowPalettePicker(true); } },
        { label: t('moodboard.contextAddIdea'), action: () => { setPendingPos(pos); setShowIdeaPicker(true); } },
        {
          label: t('moodboard.contextAddGroup'),
          action: () => {
            const id = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            setNodes((nds) => [...nds, { id, type: 'groupNode', position: pos, zIndex: 0, style: { width: 360, height: 260 }, data: { label: t('moodboard.defaultGroupLabel'), color: '#a78bfa' } }]);
            wireEdge(id);
            pendingConnectionRef.current = null;
          },
        },
        { label: t('moodboard.contextAddReference'), action: () => { setPendingPos(pos); setShowMoodboardPicker(true); } },
      ],
    });
  }, [dialogs, screenToFlowPosition, setNodes, setEdges, setPendingPos, t]);

  // ── Load document ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return;

    const doc = documents.find((d) => d.id === documentId);
    if (doc) {
      setDocTitle(doc.title);
      document.title = `${doc.title} — Moodboard`;
    }

    loadMindmapData(documentId).then((data) => {
      if (data && data.nodes.length > 0) {
        setNodes(data.nodes);
        // Upgrade any legacy smoothstep edges to the custom moodboardEdge type
        setEdges(data.edges.map((e: Edge) => ({ ...e, type: 'moodboardEdge' })));
      }
      setLoaded(true);
    });
    return () => { document.title = 'Creative Planner'; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // ── Autosave (2-second debounce) ───────────────────────────────────────────
  useEffect(() => {
    if (!documentId || !loaded) return;
    const t = setTimeout(() => {
      saveMindmapData(documentId, { nodes, edges, categories: [] });
    }, 2000);
    return () => clearTimeout(t);
  }, [nodes, edges, documentId, loaded, saveMindmapData]);

  // ── Listen for events dispatched by MoodboardNode ─────────────────────────
  useEffect(() => {
    const onUpdate = (e: CustomEvent) => {
      const { nodeId, updates } = e.detail;
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
      );
    };

    const onDelete = (e: CustomEvent) => {
      const { nodeId } = e.detail;
      setNodes((nds) => {
        const group = nds.find((n) => n.id === nodeId);
        if (!group) return nds.filter((n) => n.id !== nodeId);
        // Detach children to absolute positions before removing the group
        return nds
          .filter((n) => n.id !== nodeId)
          .map((n) => {
            if (n.parentNode !== nodeId) return n;
            return {
              ...n,
              parentNode: undefined,
              extent: undefined,
              position: {
                x: group.position.x + n.position.x,
                y: group.position.y + n.position.y,
              },
            };
          });
      });
    };

    window.addEventListener('moodboard:update-node', onUpdate as EventListener);
    window.addEventListener('moodboard:delete-node', onDelete as EventListener);
    return () => {
      window.removeEventListener('moodboard:update-node', onUpdate as EventListener);
      window.removeEventListener('moodboard:delete-node', onDelete as EventListener);
    };
  }, [setNodes]);

  // ── Add a single image node ────────────────────────────────────────────────
  const addImageNode = useCallback(
    (imageUrl: string, position?: { x: number; y: number }) => {
      const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const pos = position ?? {
        x: (nodes.length % 4) * 260 + Math.random() * 20,
        y: Math.floor(nodes.length / 4) * 300 + Math.random() * 20,
      };
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: 'moodboardNode',
          position: pos,
          data: { imageUrl, caption: '' },
        },
      ]);
    },
    [nodes.length, setNodes],
  );

  // ── Drag images anywhere on canvas ────────────────────────────────────────
  const handleCanvasDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();

      // Handle sidebar tool node drags
      const toolData = e.dataTransfer.getData('application/moodboard-node');
      if (toolData) {
        const { nodeType, label } = JSON.parse(toolData);
        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        if (nodeType === 'sources') {
          addSourcesNode(flowPos);
          return;
        }
        const id = `special-${nodeType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const isWide = nodeType === 'brainstorm' || nodeType === 'storytelling';
        setNodes((nds) => [...nds, {
          id, type: 'specialNode', position: flowPos,
          style: { width: isWide ? 360 : 280, height: 340 },
          data: { nodeType, label },
        }]);
        return;
      }

      // Handle image dragged from the image library panel
      const libImageData = e.dataTransfer.getData('application/moodboard-image-lib');
      if (libImageData) {
        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addImageNode(libImageData, flowPos);
        return;
      }

      // Handle image file drops
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (files.length === 0) return;

      const rect = canvasRef.current!.getBoundingClientRect();
      for (let i = 0; i < files.length; i++) {
        const flowPos = screenToFlowPosition({
          x: e.clientX - rect.left + i * 240,
          y: e.clientY - rect.top,
        });
        const url = await readFileAsDataUrl(files[i]);
        addImageNode(url, flowPos);
      }
    },
    [screenToFlowPosition, addImageNode, setNodes],
  );

  // ── File-picker button ─────────────────────────────────────────────────────
  const handleAddFromFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      for (let i = 0; i < files.length; i++) {
        const url = await readFileAsDataUrl(files[i]);
        addImageNode(url);
      }
    };
    input.click();
  }, [addImageNode]);

  // ── URL button ────────────────────────────────────────────────────────────
  const handleAddFromUrl = useCallback(() => {
    void (async () => {
      const url = await dialogs.prompt({
        title: t('moodboard.addImageFromUrlTitle'),
        message: t('moodboard.addImageFromUrlMessage'),
        label: t('moodboard.imageUrlLabel'),
        placeholder: 'https://example.com/image.jpg',
        submitLabel: t('moodboard.addImageAction'),
      });
      if (url?.trim()) addImageNode(url.trim());
    })();
  }, [addImageNode, dialogs, t]);

  // ── Auto-grid layout button ────────────────────────────────────────────────
  const handleArrangeGrid = useCallback(() => {
    setNodes((nds) => arrangeGrid(nds));
  }, [setNodes]);

  // ── Clear all ────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (nodes.length === 0) return;
    void (async () => {
      if (await dialogs.confirm({ title: t('moodboard.clearTitle'), message: t('moodboard.clearMessage'), confirmLabel: t('moodboard.clearAction'), isDanger: true })) {
        setNodes([]);
        setEdges([]);
      }
    })();
  }, [dialogs, nodes.length, setNodes, setEdges, t]);

  // ── Extract color palette from all images ─────────────────────────────────
  const [extracting, setExtracting] = useState(false);
  const handleExtractPalette = useCallback(async () => {
    const imageUrls = nodes
      .filter((n) => n.type === 'moodboardNode' && n.data?.imageUrl)
      .map((n) => n.data.imageUrl as string);
    if (imageUrls.length === 0) {
      await dialogs.alert({ title: t('moodboard.noImagesFoundTitle'), message: t('moodboard.noImagesFoundMessage'), tone: 'warning' });
      return;
    }
    setExtracting(true);
    try {
      const colors = await extractPaletteFromImages(imageUrls, 5);
      if (colors.length > 0) {
        addPalette({ id: `mb_${Date.now()}`, harmony: 'analogous', colors, name: docTitle });
        await dialogs.alert({ title: t('moodboard.paletteSavedTitle'), message: t('moodboard.paletteSavedMessage', { name: docTitle }) });
      }
    } finally {
      setExtracting(false);
    }
  }, [nodes, addPalette, docTitle, dialogs]);

  // ── Add non-image nodes ───────────────────────────────────────────────────
  const addColorPaletteNode = useCallback((palette: StoredPalette, position: { x: number; y: number }) => {
    const id = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNodes((nds) => [...nds, { id, type: 'colorPaletteNode', position, data: { ...palette } }]);
    if (pendingConnectionRef.current) {
      const src = pendingConnectionRef.current;
      pendingConnectionRef.current = null;
      setEdges((eds) => addEdge({ source: src, target: id, sourceHandle: null, targetHandle: null, type: 'moodboardEdge' } as Connection, eds));
    }
  }, [setNodes, setEdges]);

  const addIdeaNode = useCallback((content: string, tags: string[], color: string | undefined, position: { x: number; y: number }) => {
    const id = `idea-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNodes((nds) => [...nds, { id, type: 'ideaNode', position, data: { content, tags, color } }]);
    if (pendingConnectionRef.current) {
      const src = pendingConnectionRef.current;
      pendingConnectionRef.current = null;
      setEdges((eds) => addEdge({ source: src, target: id, sourceHandle: null, targetHandle: null, type: 'moodboardEdge' } as Connection, eds));
    }
  }, [setNodes, setEdges]);

  const addGroupNode = useCallback((position: { x: number; y: number }) => {
    const id = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNodes((nds) => [...nds, {
      id, type: 'groupNode', position,
      zIndex: 0,
      style: { width: 360, height: 260 },
      data: { label: t('moodboard.defaultGroupLabel'), color: '#a78bfa' },
    }]);
    if (pendingConnectionRef.current) {
      const src = pendingConnectionRef.current;
      pendingConnectionRef.current = null;
      setEdges((eds) => addEdge({ source: src, target: id, sourceHandle: null, targetHandle: null, type: 'moodboardEdge' } as Connection, eds));
    }
  }, [setNodes, setEdges, t]);

  const addMoodboardRefNode = useCallback((moodboardId: string, title: string, position: { x: number; y: number }) => {
    const id = `mbref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNodes((nds) => [...nds, { id, type: 'moodboardRefNode', position, data: { moodboardId, title } }]);
    if (pendingConnectionRef.current) {
      const src = pendingConnectionRef.current;
      pendingConnectionRef.current = null;
      setEdges((eds) => addEdge({ source: src, target: id, sourceHandle: null, targetHandle: null, type: 'moodboardEdge' } as Connection, eds));
    }
  }, [setNodes, setEdges]);

  const addSpecialNode = useCallback((nodeType: string, label: string, position?: { x: number; y: number }) => {
    const id = `special-${nodeType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pos = position ?? { x: 100, y: 100 };
    const isWide = nodeType === 'brainstorm' || nodeType === 'storytelling';
    setNodes((nds) => [...nds, {
      id,
      type: 'specialNode',
      position: pos,
      style: { width: isWide ? 360 : 280, height: 340 },
      data: { nodeType, label },
    }]);
    if (pendingConnectionRef.current) {
      const src = pendingConnectionRef.current;
      pendingConnectionRef.current = null;
      setEdges((eds) => addEdge({ source: src, target: id, sourceHandle: null, targetHandle: null, type: 'moodboardEdge' } as Connection, eds));
    }
  }, [setNodes, setEdges]);

  const addNoteNode = useCallback((position: { x: number; y: number }) => {
    const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNodes((nds) => [...nds, {
      id, type: 'noteNode', position,
      style: { width: 220, height: 160 },
      data: { title: '', content: '' },
    }]);
    if (pendingConnectionRef.current) {
      const src = pendingConnectionRef.current;
      pendingConnectionRef.current = null;
      setEdges((eds) => addEdge({ source: src, target: id, sourceHandle: null, targetHandle: null, type: 'moodboardEdge' } as Connection, eds));
    }
  }, [setNodes, setEdges]);

  const addSourcesNode = useCallback((position: { x: number; y: number }) => {
    const id = `sources-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNodes((nds) => [...nds, {
      id, type: 'sourcesNode', position,
      style: { width: 260, height: 240 },
      data: { title: t('moodboard.sourcesNodeTitle'), items: [] },
    }]);
    if (pendingConnectionRef.current) {
      const src = pendingConnectionRef.current;
      pendingConnectionRef.current = null;
      setEdges((eds) => addEdge({ source: src, target: id, sourceHandle: null, targetHandle: null, type: 'moodboardEdge' } as Connection, eds));
    }
  }, [setNodes, setEdges, t]);

  // ── Context menus ─────────────────────────────────────────────────────────
  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowX: flowPos.x,
      flowY: flowPos.y,
      items: [
        {
          label: t('moodboard.contextAddImage'),
          action: () => {
            const pos = flowPos;
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
            input.onchange = async () => {
              const files = Array.from(input.files || []);
              for (let i = 0; i < files.length; i++) {
                const url = await readFileAsDataUrl(files[i]);
                addImageNode(url, { x: pos.x + i * 260, y: pos.y });
              }
            };
            input.click();
          },
        },
        {
          label: t('moodboard.contextAddImageFromUrl'),
          action: async () => {
            const url = await dialogs.prompt({
              title: t('moodboard.addImageFromUrlTitle'),
              message: t('moodboard.addImageFromUrlMessage'),
              label: t('moodboard.imageUrlLabel'),
              placeholder: 'https://example.com/image.jpg',
              submitLabel: t('moodboard.addImageAction'),
            });
            if (url?.trim()) addImageNode(url.trim(), flowPos);
          },
        },
        {
          label: t('moodboard.contextAddColorPalette'),
          action: () => { setPendingPos(flowPos); setShowPalettePicker(true); },
        },
        {
          label: t('moodboard.contextAddIdea'),
          action: () => { setPendingPos(flowPos); setShowIdeaPicker(true); },
        },
        {
          label: t('moodboard.contextAddGroup'),
          action: () => addGroupNode(flowPos),
        },
        {
          label: t('moodboard.contextAddReference'),
          action: () => { setPendingPos(flowPos); setShowMoodboardPicker(true); },
        },
        {
          label: t('moodboard.contextAddToolNode'),
          action: () => { setPendingPos(flowPos); setShowToolsPicker(true); },
        },
        {
          label: t('moodboard.contextAddNote'),
          action: () => addNoteNode(flowPos),
        },
        {
          label: t('moodboard.contextAddSources'),
          action: () => addSourcesNode(flowPos),
        },
      ],
    });
  }, [screenToFlowPosition, addImageNode, addGroupNode, addNoteNode, addSourcesNode, dialogs]);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowX: 0,
      flowY: 0,
      items: [
        {
          label: t('mindMap.edgeDeleteConnection'),
          action: () => setEdges((eds) => eds.filter((e) => e.id !== edge.id)),
          danger: true,
        },
      ],
    });
  }, [setEdges]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();

    if (node.type === 'groupNode') {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowX: 0,
        flowY: 0,
        items: [
          {
            label: t('moodboard.groupRename'),
            action: async () => {
              const newLabel = await dialogs.prompt({
                title: t('moodboard.groupRenameTitle'),
                message: t('moodboard.groupRenameMessage'),
                label: t('moodboard.groupNameLabel'),
                initialValue: node.data.label || t('moodboard.groupFallbackLabel'),
                submitLabel: t('moodboard.groupRename'),
              });
              if (newLabel !== null && newLabel.trim()) {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === node.id ? { ...n, data: { ...n.data, label: newLabel.trim() } } : n,
                  ),
                );
              }
            },
          },
          {
            label: t('moodboard.groupColor'),
            type: 'color-picker' as const,
            currentColor: node.data.color || '#a78bfa',
            onColorChange: (color: string) => {
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === node.id ? { ...n, data: { ...n.data, color } } : n,
                ),
              );
            },
          },
          {
            label: t('moodboard.groupUngroup'),
            action: () => {
              setNodes((nds) => {
                const group = nds.find((n) => n.id === node.id);
                if (!group) return nds.filter((n) => n.id !== node.id);
                return nds
                  .filter((n) => n.id !== node.id)
                  .map((n) => {
                    if (n.parentNode !== node.id) return n;
                    return {
                      ...n,
                      parentNode: undefined,
                      extent: undefined,
                      position: {
                        x: n.position.x + group.position.x,
                        y: n.position.y + group.position.y,
                      },
                    };
                  });
              });
            },
          },
          {
            label: t('moodboard.groupDelete'),
            action: () => {
              setPendingDeleteNodes({
                ids: [node.id],
                label: node.data.label || t('moodboard.thisGroup'),
              });
            },
            danger: true,
          },
        ],
      });
      return;
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowX: 0,
      flowY: 0,
      items: [
        {
          label: t('mindMap.contextDelete'),
          action: () => setPendingDeleteNodes({ ids: [node.id], label: node.data?.label || node.data?.title || node.type || t('mindMap.contextThisNode') }),
          danger: true,
        },
      ],
    });
  }, [setNodes, setPendingDeleteNodes, dialogs, t]);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    pendingConnectionRef.current = null;
  }, []);

  // ── Node hover edge format bar ─────────────────────────────────────────────────
  const onNodeMouseEnter = useCallback((evt: React.MouseEvent, node: Node) => {
    if (edgeFormatTimeoutRef.current) clearTimeout(edgeFormatTimeoutRef.current);
    setEdgeFormatAnchor({ nodeId: node.id, x: evt.clientX, y: evt.clientY });
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    edgeFormatTimeoutRef.current = setTimeout(() => setEdgeFormatAnchor(null), 400);
  }, []);

  // ── Sticky groups: assign parentNode when a node is dropped inside a group ───
  const onMoodboardNodeDragStop = useCallback((_evt: React.MouseEvent, draggedNode: Node) => {
    if (draggedNode.type === 'groupNode') return;

    // Compute absolute position of the dragged node (accounts for existing parentNode)
    let absX = draggedNode.position.x;
    let absY = draggedNode.position.y;
    const currentNodes = nodes; // closure over latest nodes
    if (draggedNode.parentNode) {
      const par = currentNodes.find((n) => n.id === draggedNode.parentNode);
      if (par) { absX += par.position.x; absY += par.position.y; }
    }

    const nodeW = (draggedNode as any).measured?.width ?? (draggedNode as any).width ?? 240;
    const nodeH = (draggedNode as any).measured?.height ?? (draggedNode as any).height ?? 240;
    const cx = absX + nodeW / 2;
    const cy = absY + nodeH / 2;

    // Find the smallest group that contains the node's centre point
    const groups = currentNodes
      .filter((n) => n.type === 'groupNode')
      .sort((a, b) => {
        const aA = ((a.style?.width as number) || 360) * ((a.style?.height as number) || 260);
        const bA = ((b.style?.width as number) || 360) * ((b.style?.height as number) || 260);
        return aA - bA;
      });

    const group = groups.find((g) => {
      const gW = (g.style?.width as number) || (g as any).measured?.width || 360;
      const gH = (g.style?.height as number) || (g as any).measured?.height || 260;
      return cx >= g.position.x && cx <= g.position.x + gW && cy >= g.position.y && cy <= g.position.y + gH;
    });

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== draggedNode.id) return n;
        if (group) {
          // Position becomes relative to group
          return {
            ...n,
            parentNode: group.id,
            extent: undefined,
            position: { x: absX - group.position.x, y: absY - group.position.y },
          };
        }
        if (n.parentNode) {
          // Detach — convert back to absolute position
          return { ...n, parentNode: undefined, extent: undefined, position: { x: absX, y: absY } };
        }
        return n;
      }),
    );
  }, [nodes, setNodes]);

  // ── Structural snapshot for undo/redo ────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    if (isRestoringRef.current) return;
    const key = nodes.map((n) => `${n.id}:${n.parentNode ?? ''}`).sort().join('|')
              + '§' + edges.map((e) => e.id).sort().join('|');
    if (key === structKeyRef.current) return;
    structKeyRef.current = key;
    const h = historyRef.current.slice(0, historyIdxRef.current + 1);
    h.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    if (h.length > 50) h.splice(0, h.length - 50);
    historyRef.current = h;
    historyIdxRef.current = h.length - 1;
  }, [nodes, edges, loaded]);

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    isRestoringRef.current = true;
    const snap = historyRef.current[historyIdxRef.current];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setTimeout(() => { isRestoringRef.current = false; }, 100);
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    isRestoringRef.current = true;
    const snap = historyRef.current[historyIdxRef.current];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setTimeout(() => { isRestoringRef.current = false; }, 100);
  }, [setNodes, setEdges]);

  // ── Keyboard shortcuts (Ctrl+Z undo, Ctrl+Y redo, Ctrl+G group) ──────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea'
        || (document.activeElement as HTMLElement)?.isContentEditable;

      // Undo
      if (eventMatchesKeybind('moodboard.undo', e, keybinds)) {
        if (!isTyping) { e.preventDefault(); handleUndo(); }
        return;
      }
      if (eventMatchesKeybind('moodboard.redo', e, keybinds)) {
        if (!isTyping) { e.preventDefault(); handleRedo(); }
        return;
      }

      // Delete selected nodes using the configured delete key.
      if (normalizeKeybindKey(e.key) === getKeybindValue('moodboard.delete', keybinds) && !isTyping) {
        e.preventDefault();
        const selectedNodes = nodes.filter((n) => n.selected);
        const selectedEdgeIds = edges.filter((ed) => (ed as any).selected).map((ed) => ed.id);

        // Always delete selected edges immediately
        if (selectedEdgeIds.length > 0) {
          setEdges((eds) => eds.filter((ed) => !selectedEdgeIds.includes(ed.id)));
        }

        if (selectedNodes.length === 0) return;
        if (e.ctrlKey || e.metaKey) {
          // Instant delete nodes
          setNodes((nds) => nds.filter((n) => !n.selected));
          setEdges((eds) => eds.filter((ed) => !selectedNodes.some((n) => n.id === ed.source || n.id === ed.target)));
        } else {
          // Show confirm dialog
          setPendingDeleteNodes({
            ids: selectedNodes.map((n) => n.id),
            label: selectedNodes[0].data?.label || selectedNodes[0].data?.title || selectedNodes[0].type || t('moodboard.nodeFallback'),
          });
        }
        return;
      }

      if (eventMatchesKeybind('moodboard.group', e, keybinds)) {
        e.preventDefault();
        if (isTyping) return;
        // Gather selected non-group, non-child nodes
        const toGroup = nodes.filter((n) => n.selected && n.type !== 'groupNode' && !n.parentNode);
        if (toGroup.length === 0) {
          // Nothing selected → create empty group at center
          addGroupNode(screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
          return;
        }
        const PAD = 40;
        const minX = Math.min(...toGroup.map((n) => n.position.x));
        const minY = Math.min(...toGroup.map((n) => n.position.y));
        const maxX = Math.max(...toGroup.map((n) => n.position.x + ((n as any).measured?.width ?? 240)));
        const maxY = Math.max(...toGroup.map((n) => n.position.y + ((n as any).measured?.height ?? 240)));
        const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const groupPos = { x: minX - PAD, y: minY - PAD };
        setNodes((nds) => {
          const groupNode: Node = {
            id: groupId, type: 'groupNode',
            position: groupPos, zIndex: 0,
            style: { width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2 },
            data: { label: t('moodboard.groupFallbackLabel'), color: '#a78bfa' }, selected: false,
          };
          const updated = nds.map((n) => {
            if (!n.selected || n.type === 'groupNode' || n.parentNode) return n;
            return {
              ...n, parentNode: groupId, extent: undefined, selected: false,
              position: { x: n.position.x - groupPos.x, y: n.position.y - groupPos.y },
            };
          });
          return [groupNode, ...updated];
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodes, edges, handleUndo, handleRedo, keybinds, addGroupNode, screenToFlowPosition, setNodes, setEdges, setPendingDeleteNodes]);

  // ── Connect nodes ────────────────────────────────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'moodboardEdge',
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  if (!documentId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        {t('moodboard.noMoodboardSelected')}{' '}
        <button
          className="ml-2 text-yellow-600 underline"
          onClick={() => navigate('/mindmap')}
        >
          {t('moodboard.goBack')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 shrink-0 z-10">
        <button
          onClick={() => navigate('/mindmap')}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Title + badge */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-purple-500 dark:text-purple-400 shrink-0" />
            <h1 className="font-bold text-gray-800 dark:text-white text-sm truncate">{docTitle}</h1>
            <span className="shrink-0 text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-semibold">
              {t('moodboard.badge')}
            </span>
          </div>
          <span className="text-[11px] text-gray-400 pl-7 flex items-center gap-1 flex-wrap">
            {currentDoc?.createdBy && (
              <><User size={10} className="shrink-0" /> {currentDoc.createdBy}</>
            )}
            {currentDoc?.lastEditedBy && currentDoc.lastEditedBy !== currentDoc.createdBy && (
              <span> · {t('moodboard.editedBy')} <strong>{currentDoc.lastEditedBy}</strong></span>
            )}
            {currentDoc?.lastModified ? (
              <span className="flex items-center gap-0.5 text-gray-400 dark:text-gray-500">
                {currentDoc.createdBy ? ' · ' : ''}<Clock size={9} className="shrink-0" /> {formatLastUpdated(currentDoc.lastModified, language, text)}
              </span>
            ) : null}
          </span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowToolsPicker(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-800/50 text-indigo-700 dark:text-indigo-300 rounded-lg transition-colors"
              title={t('moodboard.toolsTitle')}
            >
              <Sparkles size={13} /> {t('moodboard.tools')}
            </button>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded-lg transition-colors"
            title={t('moodboard.shareTitle')}
          >
            <Share2 size={13} /> {t('moodboard.share')}
          </button>
          <button
            onClick={handleArrangeGrid}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              title={text('Auto-arrange in a grid')}
          >
              <LayoutGrid size={13} /> {text('Grid')}
          </button>
          <button
            onClick={handleExtractPalette}
            disabled={extracting}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-pink-100 hover:bg-pink-200 dark:bg-pink-900/30 dark:hover:bg-pink-800/50 text-pink-700 dark:text-pink-300 rounded-lg transition-colors disabled:opacity-50"
            title={t('moodboard.extractPaletteTitle')}
          >
            <Palette size={13} /> {extracting ? t('moodboard.extracting') : t('moodboard.extractPalette')}
          </button>
          <button
            onClick={handleAddFromUrl}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
          >
            <LinkIcon size={13} /> {t('moodboard.urlButton')}
          </button>
          <button
            onClick={handleAddFromFiles}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
          >
            <Plus size={13} /> {t('moodboard.addImages')}
          </button>
          {nodes.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title={text('Clear all')}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </header>

      {/* ── Sidebar + Canvas row ──────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

      {/* ── Sidebar Icon Rail + Slide-Out Panel ───────────────────────────── */}
      <div className="flex z-20 shadow-sm shrink-0">
        {/* Icon rail */}
        <div className="flex flex-col items-center w-11 py-2 gap-0.5 border-r bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shrink-0">
          <button onClick={handleAddFromFiles} title={t('moodboard.addImages')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
            <Plus size={16} />
          </button>
          <button onClick={() => addGroupNode(screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))} title={t('moodboard.contextAddGroup')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
            <FolderPlus size={16} />
          </button>
          <button onClick={() => setActiveToolPanel(prev => prev === 'images' ? null : 'images')} title={t('moodboard.imageLibrary')} className={`p-2 rounded-lg transition-colors ${activeToolPanel === 'images' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            <GalleryHorizontal size={16} />
          </button>
          <div className="w-7 h-px bg-gray-200 dark:bg-gray-700 my-1 shrink-0" />
          {SPECIAL_TOOLS.map(tool => (
            <button
              key={tool.nodeType}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/moodboard-node', JSON.stringify({ nodeType: tool.nodeType, label: getMoodboardToolLabel(tool.nodeType) }));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => setActiveToolPanel(prev => prev === tool.nodeType ? null : tool.nodeType)}
              title={getMoodboardToolLabel(tool.nodeType)}
              className={`p-2 rounded-lg transition-colors cursor-grab active:cursor-grabbing ${
                activeToolPanel === tool.nodeType
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              <tool.Icon size={17} />
            </button>
          ))}
        </div>

        {/* Slide-out mini panel */}
        {activeToolPanel && (
          <div
            className="flex flex-col border-r bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-full overflow-hidden relative"
            style={{ width: panelWidth }}
          >
            {/* Drag-to-resize handle on the right edge */}
            <div
              onMouseDown={startPanelResize}
              className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-blue-400/40 active:bg-blue-500/50 transition-colors"
              title={t('moodboard.dragToResizePanel')}
            />
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
              {(() => {
                if (activeToolPanel === 'images') return <div className="flex items-center gap-1.5"><GalleryHorizontal size={13} className="text-blue-500" /><span className="text-xs font-bold text-gray-700 dark:text-gray-300">{t('moodboard.imageLibrary')}</span></div>;
                const activeTool = SPECIAL_TOOLS.find((tool) => tool.nodeType === activeToolPanel);
                if (!activeTool) return null;
                return (<div className="flex items-center gap-1.5"><activeTool.Icon size={13} className={activeTool.color} /><span className="text-xs font-bold text-gray-700 dark:text-gray-300">{getMoodboardToolLabel(activeTool.nodeType)}</span></div>);
              })()}
              <div className="flex items-center gap-0.5">
                <button draggable onDragStart={(e) => { const activeTool = SPECIAL_TOOLS.find((tool) => tool.nodeType === activeToolPanel); if (activeTool) e.dataTransfer.setData('application/moodboard-node', JSON.stringify({ nodeType: activeTool.nodeType, label: getMoodboardToolLabel(activeTool.nodeType) })); e.dataTransfer.effectAllowed = 'copy'; }} title={t('mindMap.dragToCanvas')} className="p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-grab active:cursor-grabbing">
                  <Plus size={11} />
                </button>
                <button onClick={() => setActiveToolPanel(null)} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* ── TODO */}
              {activeToolPanel === 'todo' && (() => {
                const today = todayString();
                const projectTodos = documentId ? todos.filter(t => t.mindmapId === documentId) : [];
                const otherTodos = todos.filter(t =>
                  (t.scheduledDate === today || t.status !== 'done') && t.mindmapId !== documentId
                );
                const renderTodoRow = (item: typeof todos[0]) => (
                  <label key={item.id} className="flex items-start gap-2 cursor-pointer group">
                    <input type="checkbox" checked={item.status === 'done'} onChange={() => toggleTodo(item.id)} className="mt-0.5 rounded border-gray-300 accent-green-500 shrink-0" />
                    <span className={`text-xs leading-tight flex-1 break-words ${item.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{item.title}</span>
                    <button onClick={(e) => { e.preventDefault(); deleteTodo(item.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity shrink-0"><X size={10} /></button>
                  </label>
                );
                return (
                  <div className="p-2 space-y-2">
                    <form onSubmit={(e) => { e.preventDefault(); if (miniTodoInput.trim()) { addTodo(miniTodoInput.trim(), undefined, 'medium', documentId ?? undefined, undefined, today); setMiniTodoInput(''); } }} className="flex gap-1">
                      <input value={miniTodoInput} onChange={e => setMiniTodoInput(e.target.value)} placeholder={t('moodboard.todoPlaceholder')} className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none focus:border-green-400" />
                      <button type="submit" className="px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white font-medium">+</button>
                    </form>

                    {/* Project tasks section */}
                    {documentId && (
                      <>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <div className="flex-1 h-px bg-green-200 dark:bg-green-800" />
                          <span className="text-[9px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wide shrink-0 truncate max-w-[100px] flex items-center gap-1">
                            <MapPin size={9} className="shrink-0" />{docTitle || t('moodboard.todoProjectFallback')}
                          </span>
                          <div className="flex-1 h-px bg-green-200 dark:bg-green-800" />
                        </div>
                        {projectTodos.length === 0
                          ? <p className="text-[10px] text-gray-400 text-center py-1">{t('moodboard.todoNoProjectTasks')}</p>
                          : projectTodos.map(renderTodoRow)
                        }
                      </>
                    )}

                    {/* Today / other tasks section */}
                    {otherTodos.length > 0 && (
                      <>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide shrink-0">{t('moodboard.todoToday')}</span>
                          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                        </div>
                        {otherTodos.map(renderTodoRow)}
                      </>
                    )}

                    {projectTodos.length === 0 && otherTodos.length === 0 && !documentId && <p className="text-[10px] text-gray-400 text-center py-3">{t('moodboard.todoNoTasksToday')}</p>}
                    <button onClick={() => navigate('/todo')} className="w-full text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 py-1 transition-colors">{t('moodboard.todoOpenFullApp')}</button>
                  </div>
                );
              })()}

              {/* ── CALENDAR */}
              {activeToolPanel === 'calendar' && (() => {
                const now = new Date(); const yr = now.getFullYear(); const mo = now.getMonth();
                const dim = new Date(yr, mo + 1, 0).getDate(); const fd = new Date(yr, mo, 1).getDay();
                const td = now.getDate(); const monthLabel = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(now);
                const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
                  const day = new Date(2024, 0, 7 + index);
                  return new Intl.DateTimeFormat(language, { weekday: 'short' }).format(day);
                });
                const todayStr = todayString();
                const upcomingEvents = calEvents.filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
                const typeColors: Record<string, string> = { deadline: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', recording: 'bg-blue-100 text-blue-700', editing: 'bg-purple-100 text-purple-700', release: 'bg-green-100 text-green-700', task: 'bg-yellow-100 text-yellow-700', other: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
                return (
                  <div className="p-2 space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 text-center mb-1.5">{monthLabel}</div>
                      <div className="grid grid-cols-7 gap-0.5 text-center">
                        {weekdayLabels.map((dayLabel, i) => <div key={i} className="text-[9px] text-gray-400 font-medium py-0.5">{dayLabel}</div>)}
                        {Array(fd).fill(null).map((_, i) => <div key={`e-${i}`} />)}
                        {Array(dim).fill(null).map((_, i) => {
                          const dayStr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
                          const hasEvent = calEvents.some(e => e.date === dayStr);
                          return <div key={i+1} className={`text-[10px] rounded-full w-5 h-5 flex items-center justify-center mx-auto relative ${i+1===td ? 'bg-blue-600 text-white font-bold' : 'text-gray-700 dark:text-gray-300'}`}>{i+1}{hasEvent && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-400" />}</div>;
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">{t('moodboard.calendarUpcoming')}</div>
                      {upcomingEvents.length === 0 ? <p className="text-[10px] text-gray-400 text-center py-2">{t('moodboard.calendarNoEvents')}</p> : upcomingEvents.map(ev => <div key={ev.id} className={`text-[10px] rounded px-1.5 py-1 mb-1 ${typeColors[ev.type] ?? typeColors.other}`}><div className="font-medium truncate">{ev.title}</div><div className="opacity-70">{ev.date}</div></div>)}
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); if (miniCalTitle.trim()) { addCalEvent({ id: Date.now().toString(), title: miniCalTitle.trim(), date: todayStr, type: 'other' }); setMiniCalTitle(''); } }} className="flex gap-1">
                      <input value={miniCalTitle} onChange={e => setMiniCalTitle(e.target.value)} placeholder={t('moodboard.calendarQuickEventPlaceholder')} className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none focus:border-red-400" />
                      <button type="submit" className="px-2 py-1 text-xs rounded bg-red-500 hover:bg-red-600 text-white font-medium">+</button>
                    </form>
                    <button onClick={() => navigate('/calendar')} className="w-full text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 py-1 transition-colors">{t('moodboard.calendarOpen')}</button>
                  </div>
                );
              })()}

              {/* ── CHAT */}
              {activeToolPanel === 'chat' && (
                <div className="p-2 space-y-2">
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {miniChatMessages.length === 0 && <p className="text-[10px] text-gray-400 text-center py-3">{t('moodboard.chatNoNotesYet')}</p>}
                    {miniChatMessages.map((msg, i) => <div key={i} className="bg-gray-100 dark:bg-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-300 leading-relaxed break-words">{msg}</div>)}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); if (miniChatInput.trim()) { setMiniChatMessages(prev => [...prev, miniChatInput.trim()]); setMiniChatInput(''); } }} className="flex gap-1">
                    <input value={miniChatInput} onChange={e => setMiniChatInput(e.target.value)} placeholder={t('moodboard.chatPlaceholder')} className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none focus:border-cyan-400" />
                    <button type="submit" className="px-2 py-1 text-xs rounded bg-cyan-600 hover:bg-cyan-700 text-white font-medium">+</button>
                  </form>
                </div>
              )}

              {/* ── PLANNER */}
              {activeToolPanel === 'planner' && (() => {
                const today = sessionTodayString();
                const todayItems = planItems
                  .filter((item) => item.projectId === (documentId ?? 'moodboard') && item.plannedDate === today)
                  .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
                return (
                  <div className="p-2 space-y-2">
                    <form onSubmit={(e) => { e.preventDefault(); if (miniPlannerInput.trim()) { addPlanItem(documentId ?? 'moodboard', t('moodboard.plannerProjectFallback'), { title: miniPlannerInput.trim(), plannedDate: today, plannedStart: '09:00', plannedEnd: '09:30' }); setMiniPlannerInput(''); } }} className="flex gap-1">
                      <input value={miniPlannerInput} onChange={e => setMiniPlannerInput(e.target.value)} placeholder={t('moodboard.plannerSessionPlaceholder')} className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400" />
                      <button type="submit" className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white font-medium">+</button>
                    </form>
                    {todayItems.length === 0 ? <p className="text-[10px] text-gray-400 text-center py-2">{t('moodboard.plannerNoSessionsToday')}</p> : todayItems.map(item => <div key={item.id} className="rounded bg-blue-50 px-1.5 py-1 dark:bg-blue-900/20"><div className="flex items-center gap-2"><div className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" /><span className="flex-1 truncate text-xs text-gray-700 dark:text-gray-300">{item.title}</span><span className="text-[9px] text-gray-400">{getDurationMinutes(item.plannedStart, item.plannedEnd)}m</span></div><div className="mt-0.5 text-[9px] font-mono text-blue-500 dark:text-blue-400">{item.plannedStart} → {item.plannedEnd}</div></div>)}
                    <button onClick={() => navigate('/planner')} className="w-full text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 py-1 transition-colors">{t('moodboard.plannerOpen')}</button>
                  </div>
                );
              })()}

              {/* ── IDEA */}
              {activeToolPanel === 'idea' && (
                <div className="p-2 space-y-2">
                  <form onSubmit={(e) => { e.preventDefault(); if (miniIdeaText.trim()) { addIdea(miniIdeaText.trim()); setMiniIdeaText(''); } }} className="space-y-1">
                    <textarea value={miniIdeaText} onChange={e => setMiniIdeaText(e.target.value)} placeholder={t('moodboard.ideaPlaceholder')} rows={3} className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none resize-none focus:border-yellow-400" />
                    <div className="flex gap-1">
                      <button type="submit" className="flex-1 py-1.5 text-xs rounded bg-yellow-500 hover:bg-yellow-600 text-white font-medium transition-colors">{t('moodboard.ideaSaveToIdeas')}</button>
                      <button type="button" onClick={() => { if (!miniIdeaText.trim()) return; addIdeaNode(miniIdeaText.trim(), [], undefined, screenToFlowPosition({ x: window.innerWidth/2, y: window.innerHeight/2 })); setMiniIdeaText(''); }} className="px-2 py-1.5 text-xs rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 font-medium transition-colors">{t('moodboard.ideaSaveAsNode')}</button>
                    </div>
                  </form>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {ideas.length === 0 && <p className="text-[10px] text-gray-400 text-center py-2">{t('moodboard.ideaNoSaved')}</p>}
                    {ideas.slice(0,10).map(idea => (
                      <div key={idea.id} className="flex items-start gap-1.5 group rounded px-1.5 py-1 hover:bg-yellow-50 dark:hover:bg-yellow-900/10">
                        <Lightbulb size={10} className="text-yellow-500 shrink-0 mt-0.5" />
                        <span className="flex-1 text-[10px] text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-2">{idea.content}</span>
                        <button onClick={() => removeIdea(idea.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 shrink-0 transition-opacity"><X size={9} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── BRAINSTORM */}
              {activeToolPanel === 'brainstorm' && (
                <div className="flex flex-col h-full">
                  <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
                    {brainstormTabs.map(tab => (
                      <button key={tab.id} onClick={() => setBrainstormTab(tab.id)} title={tab.title} className={`flex-1 py-2 text-sm transition-colors ${brainstormTab === tab.id ? 'border-b-2 border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>{tab.label}</button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {brainstormTab === 'ideas' && (<>
                      <form onSubmit={(e) => { e.preventDefault(); if (miniIdeaText.trim()) { addIdea(miniIdeaText.trim()); setMiniIdeaText(''); } }} className="space-y-1">
                        <textarea value={miniIdeaText} onChange={e => setMiniIdeaText(e.target.value)} placeholder={t('moodboard.brainstormIdeaPlaceholder')} rows={3} className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none resize-none focus:border-purple-400" />
                        <div className="flex gap-1">
                          <button type="submit" className="flex-1 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-700 text-white font-medium">{t('moodboard.brainstormSave')}</button>
                          <button type="button" onClick={() => { if (!miniIdeaText.trim()) return; addSpecialNode('brainstorm', getMoodboardToolLabel('brainstorm'), screenToFlowPosition({ x: window.innerWidth/2, y: window.innerHeight/2 })); setMiniIdeaText(''); }} className="px-2 py-1.5 text-xs rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 font-medium text-gray-700 dark:text-gray-300">{t('moodboard.brainstormAddNode')}</button>
                        </div>
                      </form>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {ideas.slice(0,8).map(idea => <div key={idea.id} className="flex items-start gap-1.5 group rounded px-1 py-1 hover:bg-purple-50 dark:hover:bg-purple-900/10"><span className="text-[10px] text-gray-700 dark:text-gray-300 flex-1 leading-relaxed line-clamp-2">{idea.content}</span><button onClick={() => removeIdea(idea.id)} className="opacity-0 group-hover:opacity-100 text-red-400 shrink-0"><X size={9} /></button></div>)}
                      </div>
                    </>)}
                    {brainstormTab === 'themes' && (
                      <div className="space-y-1.5">
                        {themes.length === 0 && <p className="text-[10px] text-gray-400 text-center py-3">{t('moodboard.brainstormNoThemes')}</p>}
                        {themes.slice(0,8).map(t => <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"><div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} /><div className="flex-1 min-w-0"><div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{t.title}</div>{t.description && <div className="text-[9px] text-gray-400 truncate">{t.description}</div>}</div></div>)}
                        <button onClick={() => navigate('/brainstorming?tab=themes')} className="w-full text-[10px] text-purple-500 hover:text-purple-700 py-1 transition-colors">{t('moodboard.brainstormOpenApp')}</button>
                      </div>
                    )}
                    {brainstormTab === 'prompts' && (
                      <div className="space-y-2">
                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed min-h-[72px]">{brainstormPrompt}</div>
                        <button onClick={() => setBrainstormPrompt(brainstormPrompts[Math.floor(Math.random() * brainstormPrompts.length)] ?? '')} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"><RefreshCw size={11} /> {t('moodboard.brainstormGenerate')}</button>
                        <button onClick={() => addSpecialNode('brainstorm', getMoodboardToolLabel('brainstorm'), screenToFlowPosition({ x: window.innerWidth/2, y: window.innerHeight/2 }))} className="w-full py-1.5 text-xs rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 font-medium transition-colors">{t('moodboard.brainstormAddAsNode')}</button>
                      </div>
                    )}
                    {brainstormTab === 'palettes' && (
                      <div className="space-y-2">
                        <select value={brainstormHarmony} onChange={e => setBrainstormHarmony(e.target.value as PaletteHarmony)} className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none">
                          {(['analogous','complementary','triadic','split-complementary','monochromatic','tetradic'] as PaletteHarmony[]).map(h => <option key={h} value={h}>{getPaletteHarmonyLabel(h)}</option>)}
                        </select>
                        <button onClick={() => setGeneratedPalette(generateHarmoniousPalette(brainstormHarmony))} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded bg-pink-600 hover:bg-pink-700 text-white font-medium transition-colors"><RefreshCw size={11} /> {t('moodboard.brainstormGeneratePalette')}</button>
                        {generatedPalette.length > 0 && (<><div className="flex rounded-lg overflow-hidden h-8">{generatedPalette.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} title={c} />)}</div><button onClick={() => addPalette({ id: Date.now().toString(), name: t('palette.generatedName', { harmony: getPaletteHarmonyLabel(brainstormHarmony) }), colors: generatedPalette, harmony: brainstormHarmony })} className="w-full py-1 text-[10px] rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors">{t('moodboard.brainstormSavePalette')}</button></>)}
                        <div className="text-[10px] font-bold text-gray-400 uppercase mt-2 mb-1">{t('moodboard.brainstormSaved')}</div>
                        {palettes.length === 0 && <p className="text-[10px] text-gray-400 text-center py-1">{t('moodboard.brainstormNoPalettes')}</p>}
                        {palettes.slice(0,5).map(p => <div key={p.id}><div className="text-[9px] text-gray-400 mb-0.5 truncate">{p.name}</div><div className="flex rounded overflow-hidden h-4">{p.colors.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}</div></div>)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── STORYTELLING */}
              {activeToolPanel === 'storytelling' && (
                <div className="p-3 space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('moodboard.storytellingDescription')}</p>
                  <button onClick={() => { addSpecialNode('storytelling', getMoodboardToolLabel('storytelling'), screenToFlowPosition({ x: window.innerWidth/2, y: window.innerHeight/2 })); setActiveToolPanel(null); }} className="w-full py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors">{t('moodboard.placeOnCanvas')}</button>
                  <button onClick={() => navigate('/storytelling')} className="w-full text-[10px] text-indigo-500 hover:text-indigo-700 py-1 transition-colors">{t('moodboard.storytellingOpen')}</button>
                </div>
              )}

              {/* ── IMAGE LIBRARY */}
              {activeToolPanel === 'images' && (
                <ImageLibraryPanel
                  addImageNode={(dataUrl) => addImageNode(dataUrl, screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))}
                  panelWidth={panelWidth}
                />
              )}

              {/* ── SOURCES */}
              {activeToolPanel === 'sources' && (
                <div className="p-3 space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('moodboard.sourcesDescription')}</p>
                  <button
                    onClick={() => { addSourcesNode(screenToFlowPosition({ x: window.innerWidth/2, y: window.innerHeight/2 })); setActiveToolPanel(null); }}
                    className="w-full py-2 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                  >{t('moodboard.placeOnCanvas')}</button>
                  <p className="text-[10px] text-gray-400 text-center">{t('moodboard.sourcesContextHint')}</p>
                </div>
              )}

            </div>

            <div className="px-2.5 py-1.5 border-t border-gray-200 dark:border-gray-700 text-[9px] text-gray-400 dark:text-gray-500 shrink-0 text-center">
              {t('moodboard.dragIconHint')}
            </div>
          </div>
        )}
      </div>{/* sidebar */}

      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="flex-1 relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleCanvasDrop}
      >
        {/* Empty state hint */}
        {loaded && nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 gap-4">
            <div className="w-20 h-20 rounded-3xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Palette size={36} className="text-purple-400" />
            </div>
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400 font-semibold text-lg">
                {t('moodboard.emptyDropImages')}
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                {t('moodboard.emptyDropImagesHint')}
              </p>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          deleteKeyCode={getKeybindValue('moodboard.deleteEdge', keybinds)}
          proOptions={{ hideAttribution: true }}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onPaneContextMenu={onPaneContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={onPaneClick}
          onNodeDragStop={onMoodboardNodeDragStop}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          elevateNodesOnSelect
          panOnDrag={[1]}
          panOnScroll
          selectionOnDrag
          multiSelectionKeyCode="Shift"
          zoomOnScroll={false}
          zoomActivationKeyCode="Control"
          defaultEdgeOptions={{
            type: mbEdgeType,
            style: { stroke: mbEdgeColor, strokeWidth: mbEdgeStrokeWidth, strokeDasharray: mbEdgeDasharray },
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1.2}
            color="#c4b5fd"
            className="opacity-20"
          />
          <MiniMap
            nodeColor="#a78bfa"
            maskColor="rgba(15,10,30,0.06)"
            className="opacity-80"
          />
        </ReactFlow>

        {/* Context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>{/* canvas */}
      </div>{/* sidebar + canvas row */}

      {/* ── Node hover edge format bar ────────────────────────────────────────── */}
      {edgeFormatAnchor && (
        <div
          className="fixed z-50 flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-3 py-2 pointer-events-auto"
          style={{ left: edgeFormatAnchor.x, top: edgeFormatAnchor.y, transform: 'translate(-50%, calc(-100% - 4px))' }}
          onMouseEnter={() => { if (edgeFormatTimeoutRef.current) clearTimeout(edgeFormatTimeoutRef.current); }}
          onMouseLeave={() => { edgeFormatTimeoutRef.current = setTimeout(() => setEdgeFormatAnchor(null), 400); }}
        >
          {/* Colors */}
          <div className="flex items-center gap-1">
            {['#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#f472b6','#9ca3af'].map(c => (
              <button
                key={c}
                onClick={() => {
                  setMbEdgeColor(c);
                  setEdges(eds => eds.map(e => {
                    if (e.source !== edgeFormatAnchor.nodeId && e.target !== edgeFormatAnchor.nodeId) return e;
                    return { ...e, style: { ...(e.style as any), stroke: c } };
                  }));
                }}
                className="w-5 h-5 rounded-full border-2 hover:scale-110 transition-transform shrink-0"
                style={{ backgroundColor: c, borderColor: mbEdgeColor === c ? '#3b82f6' : 'transparent' }}
              />
            ))}
            <label className="cursor-pointer shrink-0" title={t('moodboard.edgeCustomColor')}>
              <span className="block w-5 h-5 rounded-full border border-gray-300 dark:border-gray-500 hover:scale-110 transition-transform overflow-hidden" style={{ backgroundColor: mbEdgeColor }} />
              <input type="color" className="sr-only" value={mbEdgeColor} onChange={ev => {
                setMbEdgeColor(ev.target.value);
                setEdges(eds => eds.map(e => {
                  if (e.source !== edgeFormatAnchor.nodeId && e.target !== edgeFormatAnchor.nodeId) return e;
                  return { ...e, style: { ...(e.style as any), stroke: ev.target.value } };
                }));
              }} />
            </label>
          </div>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 shrink-0" />
          {/* Thickness */}
          <div className="flex items-center gap-0.5">
            {([1, 2, 4] as const).map(w => (
              <button
                key={w}
                onClick={() => {
                  setMbEdgeStrokeWidth(w);
                  setEdges(eds => eds.map(e => {
                    if (e.source !== edgeFormatAnchor.nodeId && e.target !== edgeFormatAnchor.nodeId) return e;
                    return { ...e, style: { ...(e.style as any), strokeWidth: w } };
                  }));
                }}
                className={`flex items-center justify-center w-7 h-6 rounded transition-colors ${mbEdgeStrokeWidth === w ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title={w === 1 ? t('moodboard.edgeThin') : w === 2 ? t('moodboard.edgeNormal') : t('moodboard.edgeThick')}
              >
                <span className="block rounded-full" style={{ width: 16, height: w === 1 ? 1 : w === 2 ? 2 : 4, backgroundColor: '#6b7280' }} />
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 shrink-0" />
          {/* Line style */}
          <div className="flex items-center gap-0.5">
            {([
              { label: '—', title: t('moodboard.edgeSolid'), value: undefined as string | undefined },
              { label: '- -', title: t('moodboard.edgeDashed'), value: '6,3' },
              { label: '···', title: t('moodboard.edgeDotted'), value: '2,3' },
            ]).map(ds => (
              <button
                key={ds.title}
                onClick={() => {
                  setMbEdgeDasharray(ds.value);
                  setEdges(eds => eds.map(e => {
                    if (e.source !== edgeFormatAnchor.nodeId && e.target !== edgeFormatAnchor.nodeId) return e;
                    return { ...e, style: { ...(e.style as any), strokeDasharray: ds.value } };
                  }));
                }}
                className={`text-[11px] w-7 py-1 rounded font-mono transition-colors ${mbEdgeDasharray === ds.value ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                title={ds.title}
              >
                {ds.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Delete node confirmation ────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!pendingDeleteNodes}
        onClose={() => setPendingDeleteNodes(null)}
        onConfirm={() => {
          if (!pendingDeleteNodes) return;
          const idsToDelete = new Set(pendingDeleteNodes.ids);
          // Also remove children of any group nodes being deleted
          nodes.forEach((n) => {
            if (n.parentNode && idsToDelete.has(n.parentNode)) idsToDelete.add(n.id);
          });
          setNodes((nds) => nds.filter((n) => !idsToDelete.has(n.id)));
          setEdges((eds) => eds.filter((ed) => !idsToDelete.has(ed.source) && !idsToDelete.has(ed.target)));
          setPendingDeleteNodes(null);
        }}
        title={t('moodboard.deleteNodeTitle')}
        message={
          pendingDeleteNodes
            ? pendingDeleteNodes.ids.length > 1
              ? t('moodboard.confirmDeleteSelectedNodes', { count: String(pendingDeleteNodes.ids.length) })
              : t('moodboard.confirmDeleteNamed', { label: pendingDeleteNodes.label })
            : ''
        }
        isDanger
        confirmLabel={t('mindMap.contextDelete')}
      />

      {/* ── Palette picker modal ────────────────────────────────────────────── */}
      {showShare && documentId && (
        <MindmapShareModal
          doc={{ id: documentId, title: docTitle }}
          onClose={() => setShowShare(false)}
        />
      )}

      {showPalettePicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPalettePicker(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Palette size={16} className="text-pink-500" />
                <h2 className="text-base font-bold text-gray-800 dark:text-white">{t('moodboard.palettePickerTitle')}</h2>
              </div>
              <button onClick={() => setShowPalettePicker(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>

            {/* Generator — harmony pills + generate button */}
            <div className="mb-5 p-4 bg-pink-50 dark:bg-pink-900/20 rounded-xl border border-pink-100 dark:border-pink-800">
              <p className="text-xs font-bold uppercase tracking-widest text-pink-400 mb-2">{t('moodboard.palettePickerGenerateNew')}</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {HARMONY_LIST.map((h) => (
                  <button
                    key={h}
                    onClick={() => setMbPaletteHarmony(h)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                      mbPaletteHarmony === h
                        ? 'bg-pink-600 text-white border-pink-600'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-pink-300'
                    }`}
                  >
                    {getPaletteHarmonyLabel(h)}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const colors = generateHarmoniousPalette(mbPaletteHarmony);
                  const palette = { id: `mb_gen_${Date.now()}`, harmony: mbPaletteHarmony, colors };
                  addPalette(palette);
                  addColorPaletteNode(palette, pendingPos);
                  setShowPalettePicker(false);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
              >
                <RefreshCw size={12} /> {t('moodboard.palettePickerGenerateAdd')}
              </button>
            </div>

            {/* Saved palettes */}
            {palettes.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{t('moodboard.palettePickerSaved')}</p>
                <ul className="space-y-2 max-h-60 overflow-y-auto">
                  {palettes.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 group/row">
                      <button
                        onClick={() => { addColorPaletteNode(p, pendingPos); setShowPalettePicker(false); }}
                        className="flex-1 flex items-center gap-3 p-3 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-900/20 border border-gray-200 dark:border-gray-700 hover:border-pink-300 transition-all"
                      >
                        <div className="flex gap-0.5 shrink-0">
                          {p.colors.map((c, i) => (
                            <div key={i} className="w-5 h-8 rounded-sm first:rounded-l-md last:rounded-r-md" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <span className="text-xs font-semibold capitalize text-pink-700 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/30 px-2 py-0.5 rounded-full">
                          {p.harmony}
                        </span>
                      </button>
                      <button
                        onClick={() => removePalette(p.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover/row:opacity-100"
                        title={t('moodboard.palettePickerDelete')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {palettes.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                {t('moodboard.palettePickerEmpty')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Idea picker modal ───────────────────────────────────────────────── */}
      {showIdeaPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowIdeaPicker(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} className="text-yellow-500" />
                <h2 className="text-base font-bold text-gray-800 dark:text-white">{t('moodboard.ideaPickerTitle')}</h2>
              </div>
              <button onClick={() => setShowIdeaPicker(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <button
              onClick={async () => {
                const text = await dialogs.prompt({
                  title: t('moodboard.ideaPickerNewTitle'),
                  message: t('moodboard.ideaPickerNewMessage'),
                  label: t('moodboard.ideaPickerNewLabel'),
                  placeholder: t('moodboard.ideaPickerNewPlaceholder'),
                  submitLabel: t('moodboard.ideaPickerNewSubmit'),
                });
                if (text?.trim()) { addIdeaNode(text.trim(), [], undefined, pendingPos); setShowIdeaPicker(false); }
              }}
              className="w-full mb-3 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-xl border-2 border-dashed border-yellow-300 dark:border-yellow-700 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
            >
              <Plus size={14} /> {t('moodboard.ideaPickerWriteNew')}
            </button>
            {ideas.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                {t('moodboard.ideaPickerEmpty')}
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                {ideas.map((idea) => (
                  <li key={idea.id}>
                    <button
                      onClick={() => { addIdeaNode(idea.content, idea.tags, undefined, pendingPos); setShowIdeaPicker(false); }}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-yellow-50 dark:hover:bg-yellow-900/20 border border-gray-200 dark:border-gray-700 hover:border-yellow-300 transition-all"
                    >
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{idea.content}</p>
                      {idea.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {idea.tags.map((t) => (
                            <span key={t} className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded-full">#{t}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Moodboard reference picker ──────────────────────────────────────── */}
      {showMoodboardPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowMoodboardPicker(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileImage size={16} className="text-purple-500" />
                <h2 className="text-base font-bold text-gray-800 dark:text-white">{t('moodboard.addReferenceTitle')}</h2>
              </div>
              <button onClick={() => setShowMoodboardPicker(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            {moodboards.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                {t('moodboard.noOtherMoodboards')}
              </p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {moodboards.map((mb) => (
                  <li key={mb.id}>
                    <button
                      onClick={() => { addMoodboardRefNode(mb.id, mb.title, pendingPos); setShowMoodboardPicker(false); }}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-gray-200 dark:border-gray-700 hover:border-purple-300 transition-all"
                    >
                      <FileImage size={18} className="text-purple-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-800 dark:text-white">{mb.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {/* ── Tool node picker modal ─────────────────────────────────────────── */}
      {showToolsPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowToolsPicker(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500" />
                <h2 className="text-base font-bold text-gray-800 dark:text-white">{t('moodboard.addToolNodeTitle')}</h2>
              </div>
              <button onClick={() => setShowToolsPicker(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SPECIAL_TOOLS.map((tool) => (
                <button
                  key={tool.nodeType}
                  onClick={() => { addSpecialNode(tool.nodeType, getMoodboardToolLabel(tool.nodeType), pendingPos); setShowToolsPicker(false); }}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors text-left"
                >
                  <tool.Icon size={16} className={tool.color} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{getMoodboardToolLabel(tool.nodeType)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page wrapper (must be inside ReactFlowProvider) ────────────────────────

export default function MoodboardEditorPage() {
  return (
    <ReactFlowProvider>
      <MoodboardEditorInner />
    </ReactFlowProvider>
  );
}
