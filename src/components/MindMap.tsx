import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  type BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  NodeTypes,
  EdgeTypes,
  Connection,
  ConnectionMode,
  useOnSelectionChange,
  Node,
  OnConnectStartParams,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useStore, MindMapTheme } from '@/store/useStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Plus, Trash2, Layers, Download, FolderPlus, Group, Circle, Square, GitBranch, Sun, Minus, StickyNote, Save, X, Paperclip, CheckSquare, Lightbulb, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calendar, MessageSquare, ClipboardList, Sparkles, RefreshCw, BookOpen, BookMarked, MapPin, Play, ListPlus, Clock3, Hash, User, Users, Send, LayoutGrid, type LucideIcon } from 'lucide-react';
import { layoutTreeTB, layoutTreeLR, layoutRadial, layoutMindMap, layoutFishbone, LayoutResult } from '@/lib/mindmapLayout';
import MindMapNode, { NODE_SHAPES } from './MindMapNode';
import MindMapNotes from './MindMapNotes';
import MindMapAttachments from './MindMapAttachments';
import MindMapEdge from './MindMapEdge';
import GroupNode from './GroupNode';
import MoodboardNode from './MoodboardNode';
import SpecialNode from './SpecialNode';
import SourcesNode from './SourcesNode';
import { InputModal, ConfirmModal } from './Modal';
import ContextMenu from './ContextMenu';
import GroupDetails from './GroupDetails';
import { useTheme } from 'next-themes';
import ColorPicker from './ColorPicker';
import ShortcutHelpPanel from './ShortcutHelpPanel';
import WordExportModal from './WordExportModal';

import { usePluginStore } from '@/store/usePluginStore';
import { useMindmapStore } from '@/store/useMindmapStore';
import { useMindmapCollabStore } from '@/store/useMindmapCollabStore';
import { useTodoStore, todayString } from '@/store/useTodoStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useIdeaStore } from '@/store/useIdeaStore';
import { usePlannerStore, sessionTodayString, getDurationMinutes } from '@/store/usePlannerStore';
import { useThemeStore } from '@/store/useThemeStore';
import { usePaletteStore, type PaletteHarmony } from '@/store/usePaletteStore';
import { useChatStore } from '@/store/useChatStore';
import type { ChatMessage } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { exportMindmapToDocx } from '@/lib/mindmapDocxExport';
import { exportMindmapToPdf } from '@/lib/mindmapPdfExport';
import { BUILT_IN_FONT_PRESETS, resolveFontChoice } from '@/lib/fontSettings';
import { eventMatchesKeybind, formatKeybindCombo, getKeybindValue, normalizeKeybindKey } from '@/lib/keybinds';
import { useAppTranslation } from '@/lib/appTranslations';

// Brainstorm palette generator (mirrors brainstorming page logic)
function generateHarmoniousPalette(harmony: PaletteHarmony): string[] {
  const hue = Math.floor(Math.random() * 360);
  const sat = 58 + Math.floor(Math.random() * 18);
  const h = (deg: number, s = sat, l = 50) =>
    `hsl(${Math.round(((hue + deg) % 360 + 360) % 360)},${Math.round(s)}%,${Math.round(l)}%)`;
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

const MINDMAP_BACKGROUND_OPTIONS = [
  { value: 'clean', labelKey: 'mindMap.backgroundClean' },
  { value: 'dots', labelKey: 'mindMap.backgroundDots' },
  { value: 'lines', labelKey: 'mindMap.backgroundLines' },
  { value: 'cross', labelKey: 'mindMap.backgroundCross' },
] as const;

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

// Avatar colour helper for sidebar chat/planner panels
const _SB_AVATAR_COLORS = ['bg-rose-500','bg-orange-500','bg-amber-500','bg-lime-600','bg-teal-500','bg-cyan-600','bg-blue-600','bg-violet-600','bg-purple-600','bg-pink-600'];
function sbAvatarBg(uid: string): string {
  let h = 0; for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return _SB_AVATAR_COLORS[h % _SB_AVATAR_COLORS.length];
}

// Sidebar tool definitions — pluginId null = always available
const SIDEBAR_TOOLS: {
  id: string;
  pluginId: string | null;
  Icon: LucideIcon;
  label: string;
  nodeType: string;
  color: string;
}[] = [
  { id: 'todo',       pluginId: 'todo-app',    Icon: CheckSquare,   label: 'Todo List',  nodeType: 'todo',       color: 'text-green-500'  },
  { id: 'planner',    pluginId: 'planner',     Icon: ClipboardList, label: 'Planner',    nodeType: 'planner',    color: 'text-blue-500'   },
  { id: 'brainstorm', pluginId: 'storytelling', Icon: Sparkles,     label: 'Brainstorm', nodeType: 'brainstorm', color: 'text-purple-500' },
  { id: 'calendar',     pluginId: null,           Icon: Calendar,      label: 'Calendar',     nodeType: 'calendar',     color: 'text-red-500'    },
  { id: 'chat',         pluginId: null,           Icon: MessageSquare, label: 'Chat Note',    nodeType: 'chat',         color: 'text-cyan-500'   },
  { id: 'idea',         pluginId: null,           Icon: Lightbulb,     label: 'Idea',         nodeType: 'idea',         color: 'text-yellow-500' },
  { id: 'table',        pluginId: null,           Icon: LayoutGrid,    label: 'Table Grid',   nodeType: 'table',        color: 'text-slate-500'  },
  { id: 'storytelling', pluginId: 'storytelling', Icon: BookOpen,      label: 'Storytelling', nodeType: 'storytelling', color: 'text-indigo-500' },
  { id: 'sources',      pluginId: null,            Icon: BookMarked,    label: 'Sources',      nodeType: 'sources',      color: 'text-blue-500'  },
];

  const selector = (state: any) => ({
  nodes: state.nodes,
  edges: state.edges,
  categories: state.categories,
  mindMapTheme: state.mindMapTheme,
  setMindMapTheme: state.setMindMapTheme,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onConnect: state.onConnect,
  addNode: state.addNode,
  deleteNode: state.deleteNode,
  deleteEdge: state.deleteEdge,
  updateEdgeData: state.updateEdgeData,
  updateNodeLabel: state.updateNodeLabel,
  updateNodeCategory: state.updateNodeCategory,
  addCategory: state.addCategory,
  deleteCategory: state.deleteCategory,
  groupNodes: state.groupNodes,
  ungroupNode: state.ungroupNode,
  createGroup: state.createGroup,
  assignNodeParent: state.assignNodeParent,
  updateNodeData: state.updateNodeData,
  setNodes: state.setNodes,
  setEdges: state.setEdges,
  undo: state.undo,
  redo: state.redo,
  snapshot: state.snapshot,
});

interface MindMapProps {
  documentId?: string;
  onSaveAsTemplate?: (nodes: any[], edges: any[], categories: any[]) => void;
}

export default function MindMap({ documentId, onSaveAsTemplate }: MindMapProps = {}) {
  const { 
    nodes, edges, categories, mindMapTheme, setMindMapTheme,
    onNodesChange, onEdgesChange, onConnect, 
    addNode, deleteNode, deleteEdge, updateEdgeData, updateNodeLabel, updateNodeCategory,
    addCategory, deleteCategory,
    groupNodes, ungroupNode, createGroup, assignNodeParent, updateNodeData,
    setNodes, setEdges, undo, redo, snapshot,
  } = useStore(selector);

  const { keybinds } = useSettingsStore();
  const appFontId = useSettingsStore((state) => state.appFontId);
  const appLanguage = useSettingsStore((state) => state.appLanguage);
  const customFonts = useSettingsStore((state) => state.customFonts);
  const wordExportDefaults = useSettingsStore((state) => state.wordExportDefaults);
  const setWordExportDefaults = useSettingsStore((state) => state.setWordExportDefaults);
  const { language, t, text } = useAppTranslation();

  // Plugin gates
  const categoriesPlugin = usePluginStore((s) => s.plugins.find((p) => p.id === 'mindmap-categories'));
  const categoriesEnabled = !!(categoriesPlugin?.installed && categoriesPlugin?.enabled);
  const plugins = usePluginStore((s) => s.plugins);
  const navigate = useNavigate();

  // Sidebar tool panel — which mini panel is currently open (null = closed)
  const [activeToolPanel, setActiveToolPanel] = useState<string | null>(null);

  // Real store connections for mini panels
  const { documents } = useMindmapStore();
  const projectTitle = documents.find(d => d.id === documentId)?.title;
  const { todos, addTodo, toggleTodo, deleteTodo } = useTodoStore();
  const { events: calEvents, addEvent: addCalEvent } = useCalendarStore();
  const { ideas, addIdea, removeIdea } = useIdeaStore();
  const planItems = usePlannerStore(s => s.planItems);
  const addPlanItem = usePlannerStore(s => s.addPlanItem);
  const { themes } = useThemeStore();
  const { palettes, addPalette } = usePaletteStore();

  const { user, isAuthenticated } = useAuthStore();
  // Sidebar chat — real chat store with selective subscriptions
  const sidebarChannels = useChatStore(s => s.channels);
  const [sbChatChannelId, setSbChatChannelId] = useState<string | null>(null);
  const [sbChatPickerOpen, setSbChatPickerOpen] = useState(false);
  const [sbChatInput, setSbChatInput] = useState('');
  const sbChatScrollRef = useRef<HTMLDivElement>(null);
  const sbChatMsgs = useChatStore(
    useCallback((s: any): ChatMessage[] => sbChatChannelId ? (s.messages[sbChatChannelId] ?? []) : [], [sbChatChannelId])
  );
  // Sidebar planner new-session inputs
  const [sbSessionDate, setSbSessionDate] = useState('');
  const [sbSessionStartTime, setSbSessionStartTime] = useState('');
  const [sbSessionEndTime, setSbSessionEndTime] = useState('');

  // Mini panel UI-only state (not persisted to stores)
  const [miniTodoInput, setMiniTodoInput] = useState('');
  const [miniIdeaText, setMiniIdeaText] = useState('');
  const [miniCalTitle, setMiniCalTitle] = useState('');
  // Brainstorm — 4 sub-tabs
  const [brainstormTab, setBrainstormTab] = useState<'themes' | 'ideas' | 'prompts' | 'palettes'>('ideas');
  const [brainstormPrompt, setBrainstormPrompt] = useState('');
  const [brainstormHarmony, setBrainstormHarmony] = useState<PaletteHarmony>('analogous');
  const [generatedPalette, setGeneratedPalette] = useState<string[]>([]);

  // Grid snap — 'none' = free movement, others snap to the matching pixel grid
  type SnapOption = 'none' | 'fine' | 'normal' | 'coarse' | 'large';
  const snapSizeMap: Record<SnapOption, number> = { none: 0, fine: 10, normal: 20, coarse: 40, large: 80 };
  const [snapOption, setSnapOption] = useState<SnapOption>('none');

  // Navbar collapsed state (like Word ribbon minimize)
  const [navbarHidden, setNavbarHidden] = useState(false);
  // Word-style dropdown menu open state
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Close menu when clicking outside the menu bar
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-menubar]')) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);


  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('default');
  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#bfdbfe');
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sidebar chat — lifecycle: fetch + poll when a channel is selected
  useEffect(() => {
    if (!isAuthenticated || !sbChatChannelId) return;
    useChatStore.getState().fetchMessages(sbChatChannelId);
    useChatStore.getState().startPolling(sbChatChannelId);
    return () => useChatStore.getState().stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sbChatChannelId]);

  // Sidebar chat — auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (sbChatScrollRef.current) sbChatScrollRef.current.scrollTop = sbChatScrollRef.current.scrollHeight;
  }, [sbChatMsgs.length]);

  // Sidebar chat — auto-select first project channel when panel opens
  useEffect(() => {
    if (!isAuthenticated || sbChatChannelId || !sidebarChannels.length) return;
    const projectCh = sidebarChannels.find(c => c.type === 'project');
    if (projectCh) setSbChatChannelId(projectCh.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sbChatChannelId, sidebarChannels.length]);

  // Notes panel state (replaces NodeDetails)
  const [notesNodeId, setNotesNodeId] = useState<string | null>(null);
  const [attachmentsNodeId, setAttachmentsNodeId] = useState<string | null>(null);

  // Refs so callbacks can see whether panels are open without stale closures
  const notesOpenRef = useRef<string | null>(null);
  const attachmentsOpenRef = useRef<string | null>(null);
  useEffect(() => { notesOpenRef.current = notesNodeId; }, [notesNodeId]);
  useEffect(() => { attachmentsOpenRef.current = attachmentsNodeId; }, [attachmentsNodeId]);

  // Resizable notes panel
  const [notesWidth, setNotesWidth] = useState(380);
  const notesResizingRef = useRef(false);
  const notesResizeStartX = useRef(0);
  const notesResizeStartW = useRef(380);

  const onNotesResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    notesResizingRef.current = true;
    notesResizeStartX.current = e.clientX;
    notesResizeStartW.current = notesWidth;
    const onMove = (ev: MouseEvent) => {
      if (!notesResizingRef.current) return;
      const delta = notesResizeStartX.current - ev.clientX;
      setNotesWidth(Math.max(260, Math.min(Math.floor(window.innerWidth / 2), notesResizeStartW.current + delta)));
    };
    const onUp = () => {
      notesResizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [notesWidth]);

  // Modal States
  const [showDeleteCatConfirm, setShowDeleteCatConfirm] = useState<string | null>(null);
  // Pending node delete — stores { ids: string[], label: string } 
  const [pendingDeleteNodes, setPendingDeleteNodes] = useState<{ ids: string[]; label: string } | null>(null);
  
  // Rename Modal State
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [nodeToRename, setNodeToRename] = useState<{id: string, label: string} | null>(null);
  const [edgeToRename, setEdgeToRename] = useState<{ id: string; headline: string } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: any[] } | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // Selected Node for Details Panel
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Floating color picker state — opened by MindMapNode dispatching 'mindmap:open-color-picker'
  const [colorPicker, setColorPicker] = useState<{ nodeId: string; color: string; x: number; y: number } | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // React Flow Instance and Connection State
  const [rfInstance, setRfInstance] = useState<any>(null);
  const connectionStart = useRef<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const nodeTypes = useMemo(() => ({ mindMap: MindMapNode, groupNode: GroupNode, moodboardNode: MoodboardNode, specialNode: SpecialNode, sourcesNode: SourcesNode }), []);
  const isStandardMindMapNode = useCallback((nodeId: string | null | undefined) => {
    if (!nodeId) return false;
    return nodes.find((node: Node) => node.id === nodeId)?.type === 'mindMap';
  }, [nodes]);
  const edgeTypes = useMemo(() => ({ mindMap: MindMapEdge }), []);
  const availableExportFonts = useMemo(() => {
    return BUILT_IN_FONT_PRESETS.map((font) => ({
      id: font.id,
      label: font.label,
      cssFamily: font.cssFamily,
      description: t('mindMap.exportFontDescription'),
      group: 'defaults' as const,
    }));
  }, [t]);
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
  const getSidebarToolLabel = useCallback((toolId: string) => {
    switch (toolId) {
      case 'todo':
        return t('mindMap.specialNodeTodoList');
      case 'planner':
        return t('mindMap.specialNodePlanner');
      case 'brainstorm':
        return t('mindMap.specialNodeBrainstorm');
      case 'calendar':
        return t('mindMap.sidebarCalendar');
      case 'chat':
        return t('mindMap.specialNodeChatNote');
      case 'idea':
        return t('mindMap.specialNodeIdea');
      case 'table':
        return t('mindMap.specialNodeTableGrid');
      case 'storytelling':
        return t('mindMap.sidebarStorytelling');
      case 'sources':
        return t('mindMap.sidebarSources');
      default:
        return toolId;
    }
  }, [t]);
  const mindmapShortcutItems = useMemo(() => {
    return [
      { combo: `Ctrl/Cmd + ${formatKeybindCombo('mindmap.delete', keybinds)}`, description: t('mindMap.shortcutDeleteImmediate') },
      { combo: 'Esc', description: t('mindMap.shortcutClosePanel') },
    ];
  }, [keybinds, t]);
  const helpToggleCombo = useMemo(() => formatKeybindCombo('mindmap.help', keybinds), [keybinds]);

  useEffect(() => {
    setBrainstormPrompt((current) => (current && brainstormPrompts.includes(current) ? current : (brainstormPrompts[0] ?? '')));
  }, [brainstormPrompts]);

  const getCanvasViewportCenter = useCallback(() => {
    if (rfInstance && canvasAreaRef.current) {
      const rect = canvasAreaRef.current.getBoundingClientRect();
      const notesOffset = notesNodeId ? notesWidth : 0;
      const attachmentsOffset = attachmentsNodeId ? (notesNodeId ? 292 : 296) : 0;
      const visibleWidth = Math.max(160, rect.width - notesOffset - attachmentsOffset);

      return rfInstance.screenToFlowPosition({
        x: rect.left + visibleWidth / 2,
        y: rect.top + rect.height / 2,
      });
    }

    if (rfInstance) {
      return rfInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }

    return { x: 300, y: 200 };
  }, [attachmentsNodeId, notesNodeId, notesWidth, rfInstance]);

  // Enrich nodes with _isRoot flag (no incoming edges = root/main node)
  const enrichedNodes = useMemo(() => {
    const targetIds = new Set(edges.map((e: any) => e.target));
    return nodes.map((n: Node) => ({
      ...n,
      data: { ...n.data, _isRoot: !targetIds.has(n.id) },
    }));
  }, [nodes, edges]);

  // Layout functions
  const applyLayout = useCallback((fn: (n: Node[], e: any[]) => LayoutResult) => {
    const currentNodes = useStore.getState().nodes;
    const currentEdges = useStore.getState().edges;
    const result = fn(currentNodes, currentEdges);
    setNodes(result.nodes);
    setEdges(result.edges);
    setTimeout(() => rfInstance?.fitView({ padding: 0.15, duration: 600 }), 50);
  }, [rfInstance, setNodes, setEdges]);

  useEffect(() => {
    const handleOpenNotes = (e: CustomEvent) => {
      if (!isStandardMindMapNode(e.detail.nodeId)) return;
      setSelectedNodeId(e.detail.nodeId);
      setNotesNodeId(e.detail.nodeId);
    };
    window.addEventListener('mindmap:open-notes', handleOpenNotes as EventListener);
    return () => window.removeEventListener('mindmap:open-notes', handleOpenNotes as EventListener);
  }, [isStandardMindMapNode]);

  useEffect(() => {
    const handleOpenAttachments = (e: CustomEvent) => {
      if (!isStandardMindMapNode(e.detail.nodeId)) return;
      setSelectedNodeId(e.detail.nodeId);
      setAttachmentsNodeId(e.detail.nodeId);
    };
    window.addEventListener('mindmap:open-attachments', handleOpenAttachments as EventListener);
    return () => window.removeEventListener('mindmap:open-attachments', handleOpenAttachments as EventListener);
  }, [isStandardMindMapNode]);

  useEffect(() => {
    if (notesNodeId && !isStandardMindMapNode(notesNodeId)) {
      setNotesNodeId(null);
    }
    if (attachmentsNodeId && !isStandardMindMapNode(attachmentsNodeId)) {
      setAttachmentsNodeId(null);
    }
  }, [attachmentsNodeId, isStandardMindMapNode, notesNodeId]);

  // Open full-gradient color picker (dispatched from MindMapNode toolbar)
  useEffect(() => {
    const handler = (e: CustomEvent) => setColorPicker(e.detail);
    window.addEventListener('mindmap:open-color-picker', handler as EventListener);
    return () => window.removeEventListener('mindmap:open-color-picker', handler as EventListener);
  }, []);

  const quickAddNode = useCallback((parentId?: string, position?: { x: number; y: number }, sourceHandle?: string) => {
    const newId = Math.random().toString(36).substr(2, 9);
    const finalPosition = position || getCanvasViewportCenter();
    addNode(t('mindmapTemplateModal.untitled'), categoriesEnabled ? activeCategory : 'default', parentId, finalPosition, sourceHandle, newId);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mindmap:start-edit-node', { detail: { nodeId: newId } }));
    }, 50);
  }, [addNode, getCanvasViewportCenter, categoriesEnabled, activeCategory, t]);

  // Add a special-typed node (Todo, Idea, Brainstorm, Planner, Chat, Calendar)
  const quickAddSpecialNode = useCallback((nodeType: string, label: string) => {
    const newId = Math.random().toString(36).substr(2, 9);
    const position = getCanvasViewportCenter();
    addNode(label, categoriesEnabled ? activeCategory : 'default', undefined, position, undefined, newId, { nodeType });
    setOpenMenu(null);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mindmap:start-edit-node', { detail: { nodeId: newId } }));
    }, 50);
  }, [addNode, getCanvasViewportCenter, categoriesEnabled, activeCategory]);

  // Add a Sources/References node
  const quickAddSourcesNode = useCallback((position?: { x: number; y: number }) => {
    const newId = `sources-${Math.random().toString(36).substr(2, 9)}`;
    const pos = position ?? getCanvasViewportCenter();
    const newNode = {
      id: newId,
      type: 'sourcesNode',
      position: pos,
      style: { width: 260, height: 240 },
      data: { title: t('mindMap.sourcesNodeTitle'), items: [] },
    };
    setNodes([...useStore.getState().nodes, newNode]);
    setOpenMenu(null);
  }, [getCanvasViewportCenter, setNodes, t]);

  // Export current map as JSON file
  const exportAsJSON = useCallback(() => {
    const payload = JSON.stringify({ nodes, edges, categories }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindmap-${documentId || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpenMenu(null);
  }, [nodes, edges, categories, documentId]);

  const exportAsDocx = useCallback(async (options = wordExportDefaults) => {
    const resolvedFont = resolveFontChoice(options.fontId || appFontId, customFonts);
    setWordExportDefaults(options);
    await exportMindmapToDocx(nodes, edges, { ...options, fontId: resolvedFont.docxFamily }, projectTitle);
    setShowExportModal(false);
    setOpenMenu(null);
  }, [appFontId, customFonts, edges, nodes, projectTitle, setWordExportDefaults, wordExportDefaults]);

  const exportAsPdf = useCallback(async (options = wordExportDefaults) => {
    setWordExportDefaults(options);
    await exportMindmapToPdf(nodes, edges, options, projectTitle, appFontId, customFonts, appLanguage);
    setShowExportModal(false);
    setOpenMenu(null);
  }, [appFontId, appLanguage, customFonts, edges, nodes, projectTitle, setWordExportDefaults, wordExportDefaults]);

  // Handle drops from the Node Palette onto the canvas
  const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/mindmap-node');
    if (!raw || !rfInstance) return;
    let payload: { nodeType?: string; shape?: string; label: string };
    try { payload = JSON.parse(raw); } catch { return; }
    const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (payload.nodeType === 'sources') { quickAddSourcesNode(position); return; }
    const newId = Math.random().toString(36).substr(2, 9);
    const category = categoriesEnabled ? activeCategory : 'default';
    const extraData: Record<string, any> = {};
    if (payload.nodeType) extraData.nodeType = payload.nodeType;
    if (payload.shape) extraData.shape = payload.shape;
    addNode(payload.label, category, undefined, position, undefined, newId, extraData);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mindmap:start-edit-node', { detail: { nodeId: newId } }));
    }, 60);
  }, [rfInstance, addNode, categoriesEnabled, activeCategory, quickAddSourcesNode]);

  useEffect(() => {
    const handleAddChildEvent = (e: CustomEvent) => {
      quickAddNode(e.detail.parentId);
    };
    window.addEventListener('mindmap:add-child', handleAddChildEvent as EventListener);
    return () => window.removeEventListener('mindmap:add-child', handleAddChildEvent as EventListener);
  }, [quickAddNode]);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setPendingDeleteNodes({ ids: [e.detail.nodeId], label: e.detail.label });
    };
    window.addEventListener('mindmap:confirm-delete-node', handler as EventListener);
    return () => window.removeEventListener('mindmap:confirm-delete-node', handler as EventListener);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const tag = (activeElement?.tagName ?? '').toLowerCase();
      const isTypingTarget = tag === 'input' || tag === 'textarea' || !!activeElement?.isContentEditable;

      if (!isTypingTarget && eventMatchesKeybind('mindmap.help', e, keybinds)) {
        e.preventDefault();
        setShowShortcutHelp((current) => !current);
        return;
      }

      if (e.key === 'Escape' && showShortcutHelp) {
        e.preventDefault();
        setShowShortcutHelp(false);
        return;
      }

      // Undo
      if (!isTypingTarget && eventMatchesKeybind('mindmap.undo', e, keybinds)) {
        if (!isTypingTarget) {
          e.preventDefault();
          undo();
          return;
        }
      }

      // Redo
      if (!isTypingTarget && eventMatchesKeybind('mindmap.redo', e, keybinds)) {
        if (!isTypingTarget) {
          e.preventDefault();
          redo();
          return;
        }
      }

      // Delete selected nodes — Del = show confirm, Ctrl+Del = instant
      if (normalizeKeybindKey(e.key) === getKeybindValue('mindmap.delete', keybinds)) {
        if (isTypingTarget) return;
        const selected = useStore.getState().nodes.filter((n: any) => n.selected);
        if (selected.length === 0) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Instant — no confirm dialog
          selected.forEach((n: any) => useStore.getState().deleteNode(n.id));
        } else {
          // Show confirm modal
          setPendingDeleteNodes({ ids: selected.map((n: any) => n.id), label: selected[0].data?.label || t('mindMap.fallbackNode') });
        }
        return;
      }

      // Grouping
      if (eventMatchesKeybind('mindmap.group', e, keybinds)) {
        if (isTypingTarget) return;
        e.preventDefault();
        
        const currentNodes = useStore.getState().nodes;
        const selected = currentNodes.filter(n => n.selected);

        if (selected.length > 0) {
             // If nodes are selected, group them (auto-sized)
             groupNodes(selected.map(n => n.id));
        } else {
            // If nothing selected, create empty group at center
            if (rfInstance) {
                createGroup(getCanvasViewportCenter());
            } else {
                createGroup();
            }
        }
      }

      // Add Node
      if (eventMatchesKeybind('mindmap.addNode', e, keybinds)) {
        if (isTypingTarget) return;
        e.preventDefault();
        quickAddNode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createGroup, getCanvasViewportCenter, groupNodes, keybinds, quickAddNode, redo, rfInstance, showShortcutHelp, undo]);

  const handleRenameNode = (label: string) => {
    if (label && nodeToRename) {
      updateNodeLabel(nodeToRename.id, label);
      setNodeToRename(null);
    }
  };

  const handleRenameEdge = (headline: string) => {
    if (!edgeToRename) return;
    updateEdgeData(edgeToRename.id, { headline: headline.trim() });
    setEdgeToRename(null);
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCatName) {
      addCategory(newCatName, newCatColor);
      setNewCatName('');
      setShowCatForm(false);
    }
  };

  // Connection Handlers
  const onConnectStart = useCallback((_: any, { nodeId, handleType, handleId }: OnConnectStartParams) => {
    connectionStart.current = { nodeId, handleType, handleId };
    setIsConnecting(true);
  }, []);

  const onConnectEnd = useCallback(
    (event: any) => {
      setIsConnecting(false);
      if (!connectionStart.current) return;

      const targetIsPane = event.target.classList.contains('react-flow__pane');
      const targetIsGroup = event.target.closest('.react-flow__node-groupNode');
      
      if ((targetIsPane || targetIsGroup) && rfInstance) {
        // Calculate position
        const position = rfInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const parentId = connectionStart.current.nodeId;
        const sourceHandle = connectionStart.current.handleId;

        quickAddNode(parentId, position, sourceHandle);
      }
      
      connectionStart.current = null;
    },
    [rfInstance, quickAddNode]
  );

  // Context Menu Handlers
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      
      let position = { x: 0, y: 0 };
      if (rfInstance) {
         position = rfInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
      }

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          { 
            label: t('mindMap.contextAddNodeHere'), 
            action: () => quickAddNode(undefined, position)
          },
          {
            label: t('mindMap.contextAddSourcesNode'),
            action: () => quickAddSourcesNode(position),
          },
        ],
      });
    },
    [rfInstance, quickAddNode, quickAddSourcesNode, t]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();

      if (node.type === 'groupNode') {
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          items: [
            { 
              label: t('mindMap.contextAddNodeInside'), 
              action: () => { 
                if (rfInstance) {
                    const position = rfInstance.screenToFlowPosition({
                        x: event.clientX,
                        y: event.clientY,
                    });
                    quickAddNode(undefined, position);
                }
              } 
            },
            { 
              label: t('mindMap.contextRenameGroup'), 
              action: () => { 
                setNodeToRename({ id: node.id, label: node.data.label }); 
                setShowRenameModal(true); 
              } 
            },
            {
                label: t('mindMap.contextGroupColor'),
                type: 'color-picker',
                currentColor: node.data.color,
                onColorChange: (color: string) => updateNodeData(node.id, { color })
            },
            {
              label: t('mindMap.contextUngroup'),
              action: () => ungroupNode(node.id)
            },
            { 
              label: t('mindMap.contextDeleteGroup'), 
              action: () => setPendingDeleteNodes({ ids: [node.id], label: node.data.label || t('mindMap.contextThisGroup') }), 
              danger: true 
            },
          ]
        });
        return;
      }

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: node.type === 'mindMap'
          ? [
              { 
                label: t('mindMap.contextRename'), 
                action: () => { 
                  setNodeToRename({ id: node.id, label: node.data.label }); 
                  setShowRenameModal(true); 
                } 
              },
              { 
                label: t('mindMap.contextAddChildNode'), 
                action: () => quickAddNode(node.id)
              },
              {
                label: t('mindMap.contextNotes'),
                action: () => { setNotesNodeId(node.id); setSelectedNodeId(node.id); }
              },
              { 
                label: t('mindMap.contextDelete'), 
                action: () => setPendingDeleteNodes({ ids: [node.id], label: node.data.label || t('mindMap.contextThisNode') }), 
                danger: true 
              },
              ...(categoriesEnabled ? [{
                label: t('mindMap.contextCategory'),
                type: 'category-picker',
                currentCategoryId: node.data.category,
                categories: categories,
                onCategoryChange: (catId: string) => updateNodeCategory(node.id, catId)
              }] : []),
              {
                label: t('mindMap.contextShape'),
                type: 'shape-picker',
                currentShape: node.data.shape || 'ellipse',
                shapes: NODE_SHAPES,
                onShapeChange: (shape: string) => updateNodeData(node.id, { shape })
              },
              {
                label: t('mindMap.contextColor'),
                type: 'color-picker',
                currentColor: node.data.color || node.data.style?.backgroundColor || '#a78bfa',
                onColorChange: (color: string) => updateNodeData(node.id, { color })
              },
            ]
          : [
              {
                label: t('mindMap.contextRename'),
                action: () => {
                  setNodeToRename({ id: node.id, label: node.data.label || node.data.title || t('mindMap.contextUntitledNode') });
                  setShowRenameModal(true);
                }
              },
              {
                label: t('mindMap.contextDelete'),
                action: () => setPendingDeleteNodes({ ids: [node.id], label: node.data.label || node.data.title || t('mindMap.contextThisNode') }),
                danger: true,
              },
            ],
      });
    },
    [categories, categoriesEnabled, quickAddNode, rfInstance, t, updateNodeCategory, ungroupNode, updateNodeData]
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: any) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          {
            label: t('mindMap.edgeEditConnectionHeadline'),
            action: () => setEdgeToRename({ id: edge.id, headline: edge.data?.headline || '' }),
          },
          ...(edge.data?.headline
            ? [{ label: t('mindMap.edgeClearHeadline'), action: () => updateEdgeData(edge.id, { headline: '' }) }]
            : []),
          { label: t('mindMap.edgeDeleteConnection'), action: () => deleteEdge(edge.id), danger: true },
        ],
      });
    },
    [deleteEdge, t, updateEdgeData]
  );

  const onPaneClick = useCallback(() => setContextMenu(null), []);

  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    useMindmapCollabStore.getState().setLocalSelectedNodeIds(nodes.map((node) => node.id));
    if (nodes.length === 1) {
      const selectedNode = nodes[0];
      const id = selectedNode.id;
      const canUseNodePanels = selectedNode.type === 'mindMap';
      setSelectedNodeId(id);
      // If a panel is already open, follow the selection automatically
      if (canUseNodePanels) {
        if (notesOpenRef.current !== null) setNotesNodeId(id);
        if (attachmentsOpenRef.current !== null) setAttachmentsNodeId(id);
      } else {
        setNotesNodeId(null);
        setAttachmentsNodeId(null);
      }
      // Auto-open notes panel if this node already has notes
      const hasNotes = canUseNodePanels && !!(selectedNode.data?.notes && (selectedNode.data.notes as string).replace(/<[^>]*>/g, '').trim());
      if (hasNotes && notesOpenRef.current === null) setNotesNodeId(id);
    } else {
      setSelectedNodeId(null);
      setNotesNodeId(null);
      setAttachmentsNodeId(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      useMindmapCollabStore.getState().setLocalSelectedNodeIds([]);
      useMindmapCollabStore.getState().setLocalEditingNodeIds([]);
    };
  }, []);

  useEffect(() => {
    const editingNodeIds = [selectedNodeId, notesNodeId, attachmentsNodeId].filter((value): value is string => !!value);
    useMindmapCollabStore.getState().setLocalEditingNodeIds(editingNodeIds);
  }, [selectedNodeId, notesNodeId, attachmentsNodeId]);

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, draggedNode: Node) => {
        if (!rfInstance) return;
        
        // Get latest state directly from store to avoid closure staleness
        const state = useStore.getState();
        const currentNodes = state.nodes;
        const assignNodeParent = state.assignNodeParent;
        
        // Helper to check if a node is a descendant of another
        const isDescendant = (potentialDescendantId: string, ancestorId: string) => {
            let currentId: string | undefined = potentialDescendantId;
            while (currentId) {
                const currentNode = currentNodes.find((n: Node) => n.id === currentId);
                if (!currentNode) return false;
                if (currentNode.parentNode === ancestorId) return true;
                currentId = currentNode.parentNode;
            }
            return false;
        };

        // Determine nodes to process
        let nodesToProcess: Node[] = [];
        
        // Check if the dragged node is selected. 
        // If so, we process all selected nodes in the store.
        // We use the store's state because it's the single source of truth.
        const isDraggedNodeSelected = currentNodes.find(n => n.id === draggedNode.id)?.selected;
        const selectedNodesFromStore = currentNodes.filter(n => n.selected);

        if (isDraggedNodeSelected && selectedNodesFromStore.length > 0) {
             nodesToProcess = selectedNodesFromStore;
        } else {
             const current = currentNodes.find((n: Node) => n.id === draggedNode.id);
             if (current) nodesToProcess = [current];
        }

        // Filter out nodes whose parents are also in the selection to preserve hierarchy
        const rootsToProcess = nodesToProcess.filter(node => {
            if (!node.parentNode) return true;
            return !nodesToProcess.find(p => p.id === node.parentNode);
        });

        rootsToProcess.forEach(node => {
            // Let's find all group nodes that are NOT descendants of the dragged node
            const groupNodes = currentNodes.filter((n: Node) => 
                n.type === 'groupNode' && 
                n.id !== node.id && 
                !isDescendant(n.id, node.id)
            );
            
            // Sort by area ascending to prioritize inner groups
            groupNodes.sort((a: Node, b: Node) => {
                const areaA = (a.width || 0) * (a.height || 0);
                const areaB = (b.width || 0) * (b.height || 0);
                return areaA - areaB;
            });
            
            // Calculate absolute position of the dragged node
            let nodeAbsX = node.position.x;
            let nodeAbsY = node.position.y;
            
            if (node.parentNode) {
                const parent = currentNodes.find((n: Node) => n.id === node.parentNode);
                if (parent) {
                    nodeAbsX += parent.position.x;
                    nodeAbsY += parent.position.y;
                }
            }
            
            // Use Center Point for intersection
            // Prefer measured dimensions if available (ReactFlow 11+)
            const nodeWidth = (node as any).measured?.width || node.width || 150;
            const nodeHeight = (node as any).measured?.height || node.height || 50;
            
            const nodeCenter = {
                x: nodeAbsX + nodeWidth / 2,
                y: nodeAbsY + nodeHeight / 2
            };
            
            // Find intersecting group
            const intersectingGroup = groupNodes.find((group: Node) => {
                const groupRect = {
                    x: group.position.x,
                    y: group.position.y,
                    width: group.width || 400,
                    height: group.height || 400
                };
                
                return (
                    nodeCenter.x >= groupRect.x &&
                    nodeCenter.x <= groupRect.x + groupRect.width &&
                    nodeCenter.y >= groupRect.y &&
                    nodeCenter.y <= groupRect.y + groupRect.height
                );
            });
            
            if (intersectingGroup) {
                // If found, assign parent
                if (node.parentNode !== intersectingGroup.id) {
                    assignNodeParent(node.id, intersectingGroup.id);
                }
            } else {
                // If not found, and it has a parent, detach
                if (node.parentNode) {
                    assignNodeParent(node.id, undefined);
                }
            }
        });
    },
    [rfInstance] // Removed 'nodes' and 'assignNodeParent' from deps
  );

  // Determine background color based on App Theme
  const currentTheme = theme === 'system' ? systemTheme : theme;
  const isDark = mounted && currentTheme === 'dark';
  const backgroundColor = isDark ? '#111827' : '#f9fafb'; // gray-900 : gray-50
  const backgroundPattern = mindMapTheme.background.pattern;
  const showCanvasPattern = backgroundPattern !== 'clean';

  if (!mounted) return null;

  return (
    <div className="h-full w-full flex">
      {/* NodeCreationModal removed — nodes are created inline */}

      <InputModal
        isOpen={showRenameModal}
        onClose={() => { setShowRenameModal(false); setNodeToRename(null); }}
        onSubmit={handleRenameNode}
        title={t('mindMap.renameNodeTitle')}
        label={t('mindMap.renameNodeLabel')}
        placeholder={t('mindMap.renameNodePlaceholder')}
        submitLabel={t('mindMap.contextRename')}
        initialValue={nodeToRename?.label}
      />

      <InputModal
        isOpen={!!edgeToRename}
        onClose={() => setEdgeToRename(null)}
        onSubmit={handleRenameEdge}
        title={t('mindMap.connectionHeadlineTitle')}
        label={t('mindMap.connectionHeadlineLabel')}
        placeholder={t('mindMap.connectionHeadlinePlaceholder')}
        submitLabel={t('mindMap.save')}
        initialValue={edgeToRename?.headline}
      />

      <WordExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={(options) => { void exportAsDocx(options); }}
        onExportPdf={(options) => { void exportAsPdf(options); }}
        initialOptions={{ ...wordExportDefaults, fontId: wordExportDefaults.fontId || appFontId }}
        availableFonts={availableExportFonts}
      />

      <ConfirmModal
        isOpen={!!showDeleteCatConfirm}
        onClose={() => setShowDeleteCatConfirm(null)}
        onConfirm={() => { if (showDeleteCatConfirm) deleteCategory(showDeleteCatConfirm); }}
        title={t('mindMap.deleteCategoryTitle')}
        message={t('mindMap.deleteCategoryMessage')}
        isDanger
        confirmLabel={t('mindMap.contextDelete')}
      />

      <ConfirmModal
        isOpen={!!pendingDeleteNodes}
        onClose={() => setPendingDeleteNodes(null)}
        onConfirm={() => {
          if (pendingDeleteNodes) pendingDeleteNodes.ids.forEach((nid) => deleteNode(nid));
          setPendingDeleteNodes(null);
        }}
        title={t('mindMap.deleteNodeTitle')}
        message={pendingDeleteNodes
          ? pendingDeleteNodes.ids.length > 1
            ? t('mindMap.confirmDeleteSelectedNodes', { count: String(pendingDeleteNodes.ids.length) })
            : t('mindMap.confirmDeleteNamed', { label: pendingDeleteNodes.label })
          : ''}
        isDanger
        confirmLabel={t('mindMap.contextDelete')}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Sidebar — Icon Rail + Mini Tool Panels */}
      <div className="flex z-20 shadow-sm shrink-0">

        {/* Icon Rail — always visible, icons only */}
        <div className="flex flex-col items-center w-11 py-2 gap-0.5 border-r bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shrink-0">
          {/* Quick add: node + group */}
          <button
            onClick={() => quickAddNode()}
            title={t('mindMap.addNode')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => {
              createGroup(getCanvasViewportCenter());
            }}
            title={t('mindMap.addGroup')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <Group size={16} />
          </button>

          <div className="w-7 h-px bg-gray-200 dark:bg-gray-700 my-1 shrink-0" />

          {/* Tool icons — filtered by plugin availability */}
          {SIDEBAR_TOOLS.filter(tool =>
            !tool.pluginId || plugins.some(p => p.id === tool.pluginId && p.installed && p.enabled)
          ).map(tool => (
            <button
              key={tool.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/mindmap-node', JSON.stringify({ nodeType: tool.nodeType, label: getSidebarToolLabel(tool.id) }));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => setActiveToolPanel(prev => prev === tool.id ? null : tool.id)}
              title={getSidebarToolLabel(tool.id)}
              className={`p-2 rounded-lg transition-colors cursor-grab active:cursor-grabbing ${
                activeToolPanel === tool.id
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              <tool.Icon size={17} />
            </button>
          ))}
        </div>

        {/* Mini tool panel — slides out when a tool icon is clicked */}
        {activeToolPanel && (() => {
          const tool = SIDEBAR_TOOLS.find(t => t.id === activeToolPanel);
          if (!tool) return null;
          return (
            <div className="w-52 flex flex-col border-r bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-full overflow-hidden">
              {/* Panel header */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <tool.Icon size={13} className={tool.color} />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{getSidebarToolLabel(tool.id)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/mindmap-node', JSON.stringify({ nodeType: tool.nodeType, label: getSidebarToolLabel(tool.id) }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    title={t('mindMap.dragToCanvas')}
                    className="p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <Plus size={11} />
                  </button>
                  <button
                    onClick={() => setActiveToolPanel(null)}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-y-auto">

                {/* ── TODO — real useTodoStore ── */}
                {activeToolPanel === 'todo' && (() => {
                  const today = todayString();
                  const projectTodos = documentId ? todos.filter(t => t.mindmapId === documentId) : [];
                  const otherTodos = todos.filter(t =>
                    (t.scheduledDate === today || t.status !== 'done') && t.mindmapId !== documentId
                  );
                  const renderTodoRow = (item: (typeof todos)[0]) => (
                    <label key={item.id} className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={item.status === 'done'}
                        onChange={() => toggleTodo(item.id)}
                        className="mt-0.5 rounded border-gray-300 accent-green-500 shrink-0"
                      />
                      <span className={`text-xs leading-tight flex-1 break-words ${item.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        {item.title}
                        {item.priority === 'high' && <span className="ml-1 text-red-400 text-[9px] font-bold">{t('mindMap.todoHigh')}</span>}
                      </span>
                      <button
                        onClick={(e) => { e.preventDefault(); deleteTodo(item.id); }}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity shrink-0"
                      >
                        <X size={10} />
                      </button>
                    </label>
                  );
                  return (
                    <div className="p-2 space-y-2">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (miniTodoInput.trim()) {
                            addTodo(miniTodoInput.trim(), undefined, 'medium', documentId, undefined, today);
                            setMiniTodoInput('');
                          }
                        }}
                        className="flex gap-1"
                      >
                        <input
                          value={miniTodoInput}
                          onChange={e => setMiniTodoInput(e.target.value)}
                          placeholder={t('mindMap.todoPlaceholder')}
                          className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none focus:border-green-400"
                        />
                        <button type="submit" className="px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white font-medium">+</button>
                      </form>

                      {/* ── Project tasks section ── */}
                      {documentId && (
                        <>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <div className="flex-1 h-px bg-green-200 dark:bg-green-800" />
                            <span className="text-[9px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wide shrink-0 truncate max-w-[100px] flex items-center gap-1">
                              <MapPin size={9} className="shrink-0" />{projectTitle || t('mindMap.todoProjectFallback')}
                            </span>
                            <div className="flex-1 h-px bg-green-200 dark:bg-green-800" />
                          </div>
                          {projectTodos.length === 0
                            ? <p className="text-[10px] text-gray-400 text-center py-1">{t('mindMap.todoNoProjectTasks')}</p>
                            : projectTodos.map(renderTodoRow)
                          }
                        </>
                      )}

                      {/* ── Today / other tasks section ── */}
                      {otherTodos.length > 0 && (
                        <>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide shrink-0">{t('mindMap.todoToday')}</span>
                            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                          </div>
                          {otherTodos.map(renderTodoRow)}
                        </>
                      )}

                      {projectTodos.length === 0 && otherTodos.length === 0 && !documentId && (
                        <p className="text-[10px] text-gray-400 text-center py-3">{t('mindMap.todoNoTasksToday')}</p>
                      )}

                      <button
                        onClick={() => navigate('/todo')}
                        className="w-full text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 py-1 transition-colors"
                      >
                        {t('mindMap.todoOpenFullApp')}
                      </button>
                    </div>
                  );
                })()}

                {/* ── CALENDAR — real useCalendarStore ── */}
                {activeToolPanel === 'calendar' && (() => {
                  const now = new Date();
                  const yr = now.getFullYear();
                  const mo = now.getMonth();
                  const dim = new Date(yr, mo + 1, 0).getDate();
                  const fd = new Date(yr, mo, 1).getDay();
                  const td = now.getDate();
                  const monthLabel = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(now);
                  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
                    const day = new Date(2024, 0, 7 + index);
                    return new Intl.DateTimeFormat(language, { weekday: 'short' }).format(day);
                  });
                  const todayStr = todayString();
                  const upcomingEvents = calEvents
                    .filter(e => e.date >= todayStr)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .slice(0, 5);
                  const typeColors: Record<string, string> = {
                    deadline: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    recording: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    editing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                    release: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    task: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                    other: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
                  };
                  return (
                    <div className="p-2 space-y-3">
                      {/* Mini calendar grid */}
                      <div>
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 text-center mb-1.5">{monthLabel}</div>
                        <div className="grid grid-cols-7 gap-0.5 text-center">
                          {weekdayLabels.map((dayLabel, i) => (
                            <div key={i} className="text-[9px] text-gray-400 font-medium py-0.5">{dayLabel}</div>
                          ))}
                          {Array(fd).fill(null).map((_, i) => <div key={`e-${i}`} />)}
                          {Array(dim).fill(null).map((_, i) => {
                            const dayStr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
                            const hasEvent = calEvents.some(e => e.date === dayStr);
                            return (
                              <div key={i+1} className={`text-[10px] rounded-full w-5 h-5 flex items-center justify-center mx-auto relative ${i+1===td ? 'bg-blue-600 text-white font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {i+1}
                                {hasEvent && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-400" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Upcoming events */}
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">{t('mindMap.calendarUpcoming')}</div>
                        {upcomingEvents.length === 0
                          ? <p className="text-[10px] text-gray-400 text-center py-2">{t('mindMap.calendarNoEvents')}</p>
                          : upcomingEvents.map(ev => (
                            <div key={ev.id} className={`text-[10px] rounded px-1.5 py-1 mb-1 ${typeColors[ev.type] ?? typeColors.other}`}>
                              <div className="font-medium truncate">{ev.title}</div>
                              <div className="opacity-70">{ev.date}</div>
                            </div>
                          ))
                        }
                      </div>
                      {/* Quick add */}
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        if (miniCalTitle.trim()) {
                          addCalEvent({ id: Date.now().toString(), title: miniCalTitle.trim(), date: todayStr, type: 'other' });
                          setMiniCalTitle('');
                        }
                      }} className="flex gap-1">
                        <input value={miniCalTitle} onChange={e => setMiniCalTitle(e.target.value)} placeholder={t('mindMap.calendarQuickEventPlaceholder')}
                          className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none focus:border-red-400" />
                        <button type="submit" className="px-2 py-1 text-xs rounded bg-red-500 hover:bg-red-600 text-white font-medium">+</button>
                      </form>
                      <button onClick={() => navigate('/calendar')} className="w-full text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 py-1 transition-colors">
                        {t('mindMap.calendarOpen')}
                      </button>
                    </div>
                  );
                })()}

                {/* ── CHAT — real chat store, grouped by type, avatars ── */}
                {activeToolPanel === 'chat' && (
                  <div className="flex flex-col h-full min-h-0">
                    {!isAuthenticated ? (
                      <p className="text-xs text-gray-400 text-center py-6">{t('mindMap.chatSignIn')}</p>
                    ) : !sbChatChannelId || sbChatPickerOpen ? (
                      /* Channel picker */
                      <div className="flex flex-col h-full min-h-0">
                        {sbChatPickerOpen && (
                          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
                            <span className="flex-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{t('mindMap.chatSwitchChannel')}</span>
                            <button onClick={() => setSbChatPickerOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={12} /></button>
                          </div>
                        )}
                        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                          {sidebarChannels.length === 0 && (
                            <div className="text-center py-4 space-y-2">
                              <p className="text-xs text-gray-400">{t('mindMap.chatNoChannels')}</p>
                              <button onClick={() => useChatStore.getState().fetchChannels()} className="text-xs text-cyan-500 hover:text-cyan-600">{t('mindMap.chatRefresh')}</button>
                            </div>
                          )}
                          {/* This Project */}
                          {sidebarChannels.filter(c => c.type === 'project').length > 0 && (() => {
                            const pChs = sidebarChannels.filter(c => c.type === 'project');
                            return (
                              <>
                                <div className="flex items-center gap-1 px-1 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                  <Hash size={9} /> {t('mindMap.chatThisProject')}
                                </div>
                                {pChs.slice(0, 1).map(ch => (
                                  <button key={ch.id} onClick={() => { setSbChatChannelId(ch.id); setSbChatPickerOpen(false); }}
                                    className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20 ${sbChatChannelId === ch.id ? 'bg-cyan-100 dark:bg-cyan-900/30' : ''}`}>
                                    <div className="w-6 h-6 rounded shrink-0 bg-cyan-600 flex items-center justify-center"><Hash size={11} className="text-white" /></div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{ch.channel_label ?? ch.name}</p>
                                      {ch.project_name && <p className="text-[9px] text-gray-400 truncate">{ch.project_name}</p>}
                                    </div>
                                  </button>
                                ))}
                                {pChs.length > 1 && (
                                  <>
                                    <div className="flex items-center gap-1 px-1 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400"><Hash size={9} /> {t('mindMap.chatOtherProjects')}</div>
                                    {pChs.slice(1).map(ch => (
                                      <button key={ch.id} onClick={() => { setSbChatChannelId(ch.id); setSbChatPickerOpen(false); }}
                                        className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20 ${sbChatChannelId === ch.id ? 'bg-cyan-100 dark:bg-cyan-900/30' : ''}`}>
                                        <div className="w-6 h-6 rounded shrink-0 bg-blue-500 flex items-center justify-center"><Hash size={11} className="text-white" /></div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ch.channel_label ?? ch.name}</p>
                                          {ch.project_name && <p className="text-[9px] text-gray-400 truncate">{ch.project_name}</p>}
                                        </div>
                                      </button>
                                    ))}
                                  </>
                                )}
                              </>
                            );
                          })()}
                          {/* DMs */}
                          {sidebarChannels.filter(c => c.type === 'dm').length > 0 && (
                            <>
                              <div className="flex items-center gap-1 px-1 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400"><User size={9} /> {t('mindMap.chatDirectMessages')}</div>
                              {sidebarChannels.filter(c => c.type === 'dm').map(ch => (
                                <button key={ch.id} onClick={() => { setSbChatChannelId(ch.id); setSbChatPickerOpen(false); }}
                                  className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20 ${sbChatChannelId === ch.id ? 'bg-cyan-100 dark:bg-cyan-900/30' : ''}`}>
                                  <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold overflow-hidden ${sbAvatarBg(ch.other_user_id ?? ch.id)}`}>
                                    {ch.other_avatar_url ? <img src={ch.other_avatar_url} className="w-full h-full object-cover" alt="" /> : (ch.other_username ?? '?')[0].toUpperCase()}
                                  </div>
                                  <p className="flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ch.other_username ?? ch.channel_label}</p>
                                </button>
                              ))}
                            </>
                          )}
                          {/* Groups */}
                          {sidebarChannels.filter(c => c.type === 'group').length > 0 && (
                            <>
                              <div className="flex items-center gap-1 px-1 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400"><Users size={9} /> {t('mindMap.chatGroups')}</div>
                              {sidebarChannels.filter(c => c.type === 'group').map(ch => (
                                <button key={ch.id} onClick={() => { setSbChatChannelId(ch.id); setSbChatPickerOpen(false); }}
                                  className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20 ${sbChatChannelId === ch.id ? 'bg-cyan-100 dark:bg-cyan-900/30' : ''}`}>
                                  <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[8px] font-bold overflow-hidden ${ch.avatar_url ? '' : sbAvatarBg(ch.id)}`}>
                                    {ch.avatar_url ? <img src={ch.avatar_url} className="w-full h-full object-cover" alt="" /> : <Users size={9} />}
                                  </div>
                                  <p className="flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ch.channel_label ?? ch.name}</p>
                                </button>
                              ))}
                            </>
                          )}
                          {/* Global */}
                          {sidebarChannels.filter(c => c.type === 'global').length > 0 && (
                            <>
                              <div className="flex items-center gap-1 px-1 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400"><MessageSquare size={9} /> {t('mindMap.chatGlobalChat')}</div>
                              {sidebarChannels.filter(c => c.type === 'global').map(ch => (
                                <button key={ch.id} onClick={() => { setSbChatChannelId(ch.id); setSbChatPickerOpen(false); }}
                                  className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20 ${sbChatChannelId === ch.id ? 'bg-cyan-100 dark:bg-cyan-900/30' : ''}`}>
                                  <div className="w-6 h-6 rounded shrink-0 bg-cyan-600 flex items-center justify-center"><MessageSquare size={11} className="text-white" /></div>
                                  <p className="flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ch.channel_label ?? ch.name ?? t('mindMap.chatGlobalFallback')}</p>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                        <div className="p-2 shrink-0 border-t border-gray-200 dark:border-gray-700">
                          <button onClick={() => useChatStore.getState().fetchChannels()} className="w-full py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">{t('mindMap.chatRefreshChannels')}</button>
                        </div>
                      </div>
                    ) : (
                      /* Active channel */
                      <>
                        {/* Header */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
                          {(() => {
                            const ch = sidebarChannels.find(c => c.id === sbChatChannelId);
                            if (!ch) return <span className="flex-1 text-xs text-gray-500">{t('mindMap.chatLoading')}</span>;
                            const isDmCh = ch.type === 'dm';
                            return (
                              <>
                                {isDmCh ? (
                                  <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold overflow-hidden ${sbAvatarBg(ch.other_user_id ?? ch.id)}`}>
                                    {ch.other_avatar_url ? <img src={ch.other_avatar_url} className="w-full h-full object-cover" alt="" /> : (ch.other_username ?? '?')[0].toUpperCase()}
                                  </div>
                                ) : (
                                  <Hash size={13} className="text-gray-400 dark:text-gray-500 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                                    {isDmCh ? (ch.other_username ?? ch.channel_label) : (ch.channel_label ?? ch.name)}
                                  </p>
                                  {ch.project_name && <p className="text-[9px] text-gray-400 truncate">{ch.project_name}</p>}
                                </div>
                              </>
                            );
                          })()}
                          <button onClick={() => setSbChatPickerOpen(true)} className="text-[10px] text-gray-400 hover:text-cyan-500 shrink-0 transition-colors">{t('mindMap.chatChange')}</button>
                        </div>
                        {/* Messages */}
                        <div ref={sbChatScrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
                          {sbChatMsgs.length === 0 && <p className="text-xs text-gray-400 text-center py-4">{t('mindMap.chatNoMessagesYet')}</p>}
                          {sbChatMsgs.map(msg => {
                            const isMe = !!user?.id && String(msg.sender_id) === String(user.id);
                            return (
                              <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                                {!isMe && (
                                  <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold overflow-hidden ${sbAvatarBg(String(msg.sender_id))}`}>
                                    {msg.sender_avatar_url ? <img src={msg.sender_avatar_url} className="w-full h-full object-cover" alt="" /> : (msg.sender_username ?? '?')[0].toUpperCase()}
                                  </div>
                                )}
                                <div className={`flex flex-col max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                                  {!isMe && <span className="text-[9px] text-gray-400 px-1 mb-0.5">{msg.sender_username}</span>}
                                  <div className={`rounded-2xl px-3 py-1.5 text-xs leading-relaxed break-words ${isMe ? 'rounded-br-sm bg-cyan-600 text-white' : `rounded-bl-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200`}`}>
                                    {msg.content}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Input */}
                        <div className="flex gap-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700 shrink-0">
                          <input value={sbChatInput} onChange={e => setSbChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && sbChatInput.trim()) { e.preventDefault(); useChatStore.getState().sendMessage(sbChatChannelId!, sbChatInput.trim()); setSbChatInput(''); }}}
                            placeholder={t('mindMap.chatMessagePlaceholder')}
                            className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none focus:border-cyan-400" />
                          <button onClick={() => { if (sbChatInput.trim()) { useChatStore.getState().sendMessage(sbChatChannelId!, sbChatInput.trim()); setSbChatInput(''); }}}
                            className="p-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white shrink-0 transition-colors"><Send size={13} /></button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── PLANNER */}
                {activeToolPanel === 'planner' && (() => {
                  const today = sessionTodayString();
                  const todaysItems = planItems
                    .filter((item) => item.projectId === (documentId ?? 'mindmap') && item.plannedDate === today)
                    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));

                  return (
                    <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-0">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const inp = e.currentTarget.querySelector('input[name=st]') as HTMLInputElement | null;
                          if (!inp?.value.trim()) return;
                          addPlanItem(documentId ?? 'mindmap', projectTitle ?? t('mindMap.plannerProjectFallback'), {
                            title: inp.value.trim(),
                            plannedDate: sbSessionDate || today,
                            plannedStart: sbSessionStartTime || '09:00',
                            plannedEnd: sbSessionEndTime || '09:30',
                          });
                          inp.value = '';
                          setSbSessionDate('');
                          setSbSessionStartTime('');
                          setSbSessionEndTime('');
                        }}
                        className="space-y-1"
                      >
                        <div className="flex gap-1">
                          <input
                            name="st"
                            placeholder={t('mindMap.plannerSessionPlaceholder')}
                            className="flex-1 min-w-0 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                          />
                          <button type="submit" className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">+</button>
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="shrink-0 text-[9px] text-gray-400">{t('mindMap.plannerDate')}</label>
                          <input type="date" value={sbSessionDate} onChange={e => setSbSessionDate(e.target.value)} className="flex-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-[10px] text-gray-700 outline-none focus:border-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300" />
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="w-7 shrink-0 text-[9px] text-gray-400">{t('mindMap.plannerFrom')}</label>
                          <input type="time" value={sbSessionStartTime} onChange={e => setSbSessionStartTime(e.target.value)} className="flex-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-[10px] text-gray-700 outline-none focus:border-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300" />
                          <label className="shrink-0 text-[9px] text-gray-400">{t('mindMap.plannerTo')}</label>
                          <input type="time" value={sbSessionEndTime} onChange={e => setSbSessionEndTime(e.target.value)} className="flex-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-[10px] text-gray-700 outline-none focus:border-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300" />
                        </div>
                      </form>

                      {todaysItems.length === 0 ? (
                        <p className="py-2 text-center text-[10px] text-gray-400">{t('mindMap.plannerNoSessionsYet')}</p>
                      ) : (
                        todaysItems.map((item) => {
                          const plannedMinutes = getDurationMinutes(item.plannedStart, item.plannedEnd);
                          return (
                            <div key={item.id} className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-2 dark:border-blue-800/40 dark:bg-blue-900/20">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                                <span className="flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-300">{item.title}</span>
                                <span className="shrink-0 text-[9px] text-gray-400">{plannedMinutes}m</span>
                              </div>
                              <div className="mt-1 text-[9px] font-mono text-blue-500 dark:text-blue-400">{item.plannedStart} → {item.plannedEnd}</div>
                              {item.notes && <div className="mt-1 line-clamp-2 text-[9px] text-gray-500 dark:text-gray-400">{item.notes}</div>}
                            </div>
                          );
                        })
                      )}

                      <button onClick={() => navigate('/planner')} className="w-full py-1 text-[10px] text-blue-500 transition-colors hover:text-blue-700 dark:text-blue-400">
                        {text('Open Planner')}
                      </button>
                    </div>
                  );
                })()}

                {/* ── BRAINSTORM */}
                {activeToolPanel === 'brainstorm' && (
                  <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                    <div className="flex shrink-0 overflow-x-auto border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
                      {brainstormTabs.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setBrainstormTab(tab.id as 'themes' | 'ideas' | 'prompts' | 'palettes')}
                          className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-2 text-[10px] font-semibold transition-colors ${brainstormTab === tab.id ? 'bg-white text-gray-900 dark:bg-gray-800 dark:text-white' : 'border-transparent text-gray-400 hover:bg-white/50 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700/40 dark:hover:text-gray-300'}`}
                          style={brainstormTab === tab.id ? { borderBottomColor: '#a855f7' } : undefined}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                      {brainstormTab === 'ideas' && (
                        <>
                          <form onSubmit={(e) => { e.preventDefault(); if (!miniIdeaText.trim()) return; addIdea(miniIdeaText.trim()); setMiniIdeaText(''); }} className="space-y-1.5">
                            <textarea value={miniIdeaText} onChange={e => setMiniIdeaText(e.target.value)}
                              placeholder={t('mindMap.brainstormIdeaPlaceholder')} rows={3}
                              className="w-full resize-none rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-purple-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300" />
                            <div className="flex gap-1">
                              <button type="submit" className="flex-1 rounded bg-purple-600 py-1.5 text-xs font-medium text-white hover:bg-purple-700">{t('mindMap.brainstormSave')}</button>
                              <button type="button"
                                onClick={() => {
                                  if (!miniIdeaText.trim()) return;
                                  const center = getCanvasViewportCenter();
                                  addNode(miniIdeaText.trim(), categoriesEnabled ? activeCategory : 'default', undefined, center, undefined, Math.random().toString(36).substr(2,9), { nodeType: 'brainstorm' });
                                  setMiniIdeaText('');
                                }}
                                className="rounded bg-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300"
                              >
                                {t('mindMap.brainstormAddNode')}
                              </button>
                            </div>
                          </form>
                          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                            {ideas.slice(0, 8).map((idea) => (
                              <div key={idea.id} className="group flex items-start gap-1.5 rounded px-1 py-1 hover:bg-purple-50 dark:hover:bg-purple-900/10">
                                <span className="flex-1 line-clamp-2 text-[10px] leading-relaxed text-gray-700 dark:text-gray-300">{idea.content}</span>
                                <button onClick={() => removeIdea(idea.id)} className="shrink-0 text-red-400 opacity-0 group-hover:opacity-100"><X size={9} /></button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Themes tab */}
                      {brainstormTab === 'themes' && (
                        <div className="space-y-1.5">
                          {themes.length === 0 && <p className="text-[10px] text-gray-400 text-center py-3">{t('mindMap.brainstormNoThemes')}</p>}
                          {themes.slice(0,8).map(t => (
                            <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{t.title}</div>
                                {t.description && <div className="text-[9px] text-gray-400 truncate">{t.description}</div>}
                              </div>
                            </div>
                          ))}
                          <button onClick={() => navigate('/brainstorming?tab=themes')} className="w-full text-[10px] text-purple-500 hover:text-purple-700 py-1 transition-colors">
                            {t('mindMap.brainstormOpenApp')}
                          </button>
                        </div>
                      )}

                      {/* Prompts tab */}
                      {brainstormTab === 'prompts' && (
                        <div className="space-y-2">
                          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed min-h-[72px]">
                            {brainstormPrompt}
                          </div>
                          <button
                            onClick={() => setBrainstormPrompt(brainstormPrompts[Math.floor(Math.random() * brainstormPrompts.length)] ?? '')}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
                          >
                            <RefreshCw size={11} /> {t('mindMap.brainstormGenerate')}
                          </button>
                          <button
                            onClick={() => {
                              const center = getCanvasViewportCenter();
                              addNode(brainstormPrompt, categoriesEnabled ? activeCategory : 'default', undefined, center, undefined, Math.random().toString(36).substr(2,9), { nodeType: 'brainstorm' });
                            }}
                            className="w-full py-1.5 text-xs rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 font-medium transition-colors"
                          >
                            {t('mindMap.brainstormAddAsNode')}
                          </button>
                        </div>
                      )}

                      {/* Palettes tab */}
                      {brainstormTab === 'palettes' && (
                        <div className="space-y-2">
                          <select
                            value={brainstormHarmony}
                            onChange={e => setBrainstormHarmony(e.target.value as PaletteHarmony)}
                            className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none"
                          >
                            {(['analogous','complementary','triadic','split-complementary','monochromatic','tetradic'] as PaletteHarmony[]).map(h => (
                              <option key={h} value={h}>{getPaletteHarmonyLabel(h)}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setGeneratedPalette(generateHarmoniousPalette(brainstormHarmony))}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded bg-pink-600 hover:bg-pink-700 text-white font-medium transition-colors"
                          >
                            <RefreshCw size={11} /> {t('mindMap.brainstormGeneratePalette')}
                          </button>
                          {generatedPalette.length > 0 && (
                            <>
                              <div className="flex rounded-lg overflow-hidden h-8">
                                {generatedPalette.map((c, i) => (
                                  <div key={i} className="flex-1" style={{ background: c }} title={c} />
                                ))}
                              </div>
                              <button
                                onClick={() => addPalette({ id: Date.now().toString(), name: t('palette.generatedName', { harmony: getPaletteHarmonyLabel(brainstormHarmony) }), colors: generatedPalette, harmony: brainstormHarmony })}
                                className="w-full py-1 text-[10px] rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                              >
                                {t('mindMap.brainstormSavePalette')}
                              </button>
                            </>
                          )}
                          <div className="text-[10px] font-bold text-gray-400 uppercase mt-2 mb-1">{t('mindMap.brainstormSaved')}</div>
                          {palettes.length === 0 && <p className="text-[10px] text-gray-400 text-center py-1">{t('mindMap.brainstormNoPalettes')}</p>}
                          {palettes.slice(0,5).map(p => (
                            <div key={p.id}>
                              <div className="text-[9px] text-gray-400 mb-0.5 truncate">{p.name}</div>
                              <div className="flex rounded overflow-hidden h-4">
                                {p.colors.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    </div>
                  </div>
                )}

                {/* ── SOURCES */}
                {activeToolPanel === 'sources' && (
                  <div className="p-3 space-y-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('mindMap.sourcesDescription')}</p>
                    <button
                      onClick={() => { quickAddSourcesNode(); setActiveToolPanel(null); }}
                      className="w-full py-2 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                    >{t('mindMap.placeOnCanvas')}</button>
                    <p className="text-[10px] text-gray-400 text-center">{t('mindMap.sourcesContextHint')}</p>
                  </div>
                )}

              </div>

              {/* Footer drag hint */}
              <div className="px-2.5 py-1.5 border-t border-gray-200 dark:border-gray-700 text-[9px] text-gray-400 dark:text-gray-500 shrink-0 text-center">
                {t('mindMap.dragIconHint')}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Mindmap Area */}
      <div className={`flex-1 flex flex-col overflow-hidden ${isConnecting ? 'mindmap-connecting' : ''}`}>
        {/* ── Word-style menu bar ── */}
        <div className="relative z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm shrink-0" data-menubar>
          {navbarHidden ? (
            <div className="flex items-center justify-center py-0.5">
              <button
                onClick={() => setNavbarHidden(false)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronDown size={12} /><span>{text('Show Menu')}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center px-1 py-0.5 gap-0">

              {/* ── File ── */}
              <div className="relative">
                <button onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')} className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${openMenu === 'file' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{t('mindMap.menuFile')}</button>
                {openMenu === 'file' && (
                  <div className="absolute top-full left-0 mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-[200] py-1 min-w-[200px]">
                    {onSaveAsTemplate && (
                      <button onClick={() => { onSaveAsTemplate(nodes, edges, categories); setOpenMenu(null); }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <Save size={13} className="text-green-500 shrink-0" />{text('Save as Template...')}
                      </button>
                    )}
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <button onClick={() => setShowExportModal(true)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <Download size={13} className="text-blue-500 shrink-0" />{text('Export Document...')}
                    </button>
                    <button onClick={exportAsJSON} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <Download size={13} className="text-gray-400 shrink-0" />{t('mindMap.exportJson')}
                    </button>
                  </div>
                )}
              </div>

              {/* ── Edit ── */}
              <div className="relative">
                <button onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')} className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${openMenu === 'edit' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{t('mindMap.menuEdit')}</button>
                {openMenu === 'edit' && (
                  <div className="absolute top-full left-0 mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-[200] py-1 min-w-[200px]">
                    <button onClick={() => { undo(); setOpenMenu(null); }} className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <span className="flex items-center gap-2"><span className="text-gray-400">↩</span> {t('mindMap.undo')}</span><span className="text-gray-400">{formatKeybindCombo('mindmap.undo', keybinds)}</span>
                    </button>
                    <button onClick={() => { redo(); setOpenMenu(null); }} className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <span className="flex items-center gap-2"><span className="text-gray-400">↪</span> {t('mindMap.redo')}</span><span className="text-gray-400">{formatKeybindCombo('mindmap.redo', keybinds)}</span>
                    </button>
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <button onClick={() => { const sel = nodes.filter((n: Node) => n.selected); if (sel.length > 0) setPendingDeleteNodes({ ids: sel.map((n: Node) => n.id), label: sel[0].data?.label || t('mindMap.fallbackNode') }); setOpenMenu(null); }} className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <span className="flex items-center gap-2"><Trash2 size={12} className="shrink-0" /> {t('mindMap.deleteSelected')}</span><span className="text-gray-400">{formatKeybindCombo('mindmap.delete', keybinds)}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ── Insert ── */}
              <div className="relative">
                <button onClick={() => setOpenMenu(openMenu === 'insert' ? null : 'insert')} className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${openMenu === 'insert' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{t('mindMap.menuInsert')}</button>
                {openMenu === 'insert' && (
                  <div className="absolute top-full left-0 mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-[200] py-1 min-w-[210px]">
                    <button onClick={() => { quickAddNode(); setOpenMenu(null); }} className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <span className="flex items-center gap-2"><Plus size={13} className="text-blue-500 shrink-0" /> {t('mindMap.addNode')}</span><span className="text-gray-400">{formatKeybindCombo('mindmap.addNode', keybinds)}</span>
                    </button>
                    <button onClick={() => { const sel = nodes.filter((n: Node) => n.selected); if (sel.length > 0) { groupNodes(sel.map((n: Node) => n.id)); } else { createGroup(getCanvasViewportCenter()); } setOpenMenu(null); }} className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <span className="flex items-center gap-2"><Group size={13} className="text-purple-500 shrink-0" /> {t('mindMap.addGroup')}</span><span className="text-gray-400">{formatKeybindCombo('mindmap.group', keybinds)}</span>
                    </button>
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <div className="px-3 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('mindMap.specialNodes')}</div>
                    {([
                      { type: 'todo' as const,       label: t('mindMap.specialNodeTodoList'),    Icon: CheckSquare },
                      { type: 'idea' as const,       label: t('mindMap.specialNodeIdea'),        Icon: Lightbulb },
                      { type: 'brainstorm' as const, label: t('mindMap.specialNodeBrainstorm'),  Icon: Sparkles },
                      { type: 'planner' as const,    label: t('mindMap.specialNodePlanner'),     Icon: ClipboardList },
                      { type: 'chat' as const,       label: t('mindMap.specialNodeChatNote'),    Icon: MessageSquare },
                      { type: 'calendar' as const,   label: t('mindMap.specialNodeCalendarNote'), Icon: Calendar },
                      { type: 'table' as const,      label: t('mindMap.specialNodeTableGrid'),   Icon: LayoutGrid },
                    ]).map((nt) => (
                      <button key={nt.type} onClick={() => quickAddSpecialNode(nt.type, nt.label)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <nt.Icon size={11} className="shrink-0 text-gray-500 dark:text-gray-400" />{nt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── View ── */}
              <div className="relative">
                <button onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')} className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${openMenu === 'view' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{t('mindMap.menuView')}</button>
                {openMenu === 'view' && (
                  <div className="absolute top-full left-0 mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-[200] py-1 min-w-[220px]">
                    <div className="px-3 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('mindMap.layout')}</div>
                    {([
                      { label: t('mindMap.layoutBalanced'), action: () => applyLayout(layoutMindMap), icon: <Sun size={12} /> },
                      { label: t('mindMap.layoutTreeTopBottom'), action: () => applyLayout(layoutTreeTB), icon: <GitBranch size={12} /> },
                      { label: t('mindMap.layoutTreeLeftRight'), action: () => applyLayout(layoutTreeLR), icon: <GitBranch size={12} style={{ transform: 'rotate(-90deg)' }} /> },
                      { label: t('mindMap.layoutRadial'), action: () => applyLayout(layoutRadial), icon: <Circle size={12} /> },
                      { label: t('mindMap.layoutFishbone'), action: () => applyLayout(layoutFishbone), icon: <Minus size={12} /> },
                    ]).map((l) => (
                      <button key={l.label} onClick={() => { l.action(); setOpenMenu(null); }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <span className="text-gray-400 w-4 shrink-0">{l.icon}</span>{l.label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <div className="px-3 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('mindMap.background')}</div>
                    {MINDMAP_BACKGROUND_OPTIONS.map((option) => (
                      <button key={option.value} onClick={() => setMindMapTheme({ ...mindMapTheme, background: { ...mindMapTheme.background, pattern: option.value } })} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${backgroundPattern === option.value ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <span className="w-4 shrink-0 text-center text-[10px]">{backgroundPattern === option.value ? '✓' : ''}</span>
                        {t(option.labelKey)}
                      </button>
                    ))}
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <div className="px-3 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('mindMap.snapToGrid')}</div>
                    {([{ value: 'none', label: t('mindMap.snapFreeMovement') }, { value: 'fine', label: t('mindMap.snap10') }, { value: 'normal', label: t('mindMap.snap20') }, { value: 'coarse', label: t('mindMap.snap40') }, { value: 'large', label: t('mindMap.snap80') }] as const).map((s) => (
                      <button key={s.value} onClick={() => setSnapOption(s.value as SnapOption)} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${snapOption === s.value ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <span className="w-4 shrink-0 text-center text-[10px]">{snapOption === s.value ? '✓' : ''}</span>{s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Format ── */}
              <div className="relative">
                <button onClick={() => setOpenMenu(openMenu === 'format' ? null : 'format')} className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${openMenu === 'format' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{t('mindMap.menuFormat')}</button>
                {openMenu === 'format' && (
                  <div className="absolute top-full left-0 mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-[200] py-1 min-w-[220px]">
                    <div className="px-3 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('mindMap.nodeCorners')}</div>
                    {([{ label: t('mindMap.nodeCornersPill'), radius: '9999px' }, { label: t('mindMap.nodeCornersRounded'), radius: '10px' }, { label: t('mindMap.nodeCornersSquare'), radius: '0px' }]).map((n) => (
                      <button key={n.radius} onClick={() => setMindMapTheme({ ...mindMapTheme, node: { ...mindMapTheme.node, borderRadius: n.radius } })} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${mindMapTheme.node.borderRadius === n.radius ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <span className="w-4 shrink-0 text-center text-[10px]">{mindMapTheme.node.borderRadius === n.radius ? '✓' : ''}</span>{n.label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <div className="px-3 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('mindMap.edgeStyle')}</div>
                    {([{ value: 'bezier', label: t('mindMap.edgeStyleBezier') }, { value: 'straight', label: t('mindMap.edgeStyleStraight') }, { value: 'step', label: t('mindMap.edgeStyleStep') }, { value: 'smoothstep', label: t('mindMap.edgeStyleSmoothStep') }]).map((e) => (
                      <button key={e.value} onClick={() => setMindMapTheme({ ...mindMapTheme, edge: { ...mindMapTheme.edge, type: e.value as any } })} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${mindMapTheme.edge.type === e.value ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <span className="w-4 shrink-0 text-center text-[10px]">{mindMapTheme.edge.type === e.value ? '✓' : ''}</span>{e.label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <div className="px-3 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('mindMap.lineThickness')}</div>
                    <div className="flex items-center gap-1 px-3 py-1.5">
                      {([1, 2, 4] as const).map((w) => (
                        <button key={w} onClick={() => setMindMapTheme({ ...mindMapTheme, edge: { ...mindMapTheme.edge, strokeWidth: w } })} className={`flex-1 flex items-center justify-center p-1.5 rounded transition-colors ${mindMapTheme.edge.strokeWidth === w ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`} title={w === 1 ? t('mindMap.lineThicknessThin') : w === 2 ? t('mindMap.lineThicknessNormal') : t('mindMap.lineThicknessThick')}>
                          <span className="block rounded-full bg-current" style={{ width: 22, height: w === 1 ? 1 : w === 2 ? 2 : 4 }} />
                        </button>
                      ))}
                    </div>
                    <div className="px-3 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('mindMap.lineStyle')}</div>
                    <div className="flex items-center gap-1 px-3 py-1.5">
                      {([{ label: '—', title: t('mindMap.lineStyleSolid'), value: undefined }, { label: '- -', title: t('mindMap.lineStyleDashed'), value: '6,3' }, { label: '···', title: t('mindMap.lineStyleDotted'), value: '2,3' }]).map((ds) => (
                        <button key={ds.title} onClick={() => setMindMapTheme({ ...mindMapTheme, edge: { ...mindMapTheme.edge, strokeDasharray: ds.value } })} className={`flex-1 text-[11px] px-1 py-1 rounded font-mono transition-colors ${mindMapTheme.edge.strokeDasharray === ds.value ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`} title={ds.title}>{ds.label}</button>
                      ))}
                    </div>
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <div className="px-3 py-1.5">
                      <ColorPicker
                        color={mindMapTheme.edge.stroke || '#b1b1b7'}
                        onChange={(color) => setMindMapTheme({ ...mindMapTheme, edge: { ...mindMapTheme.edge, stroke: color } })}
                        label={t('mindMap.edgeColor')}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Spacer + quick delete + collapse */}
              <div className="ml-auto flex items-center gap-0.5 pl-2">
                {nodes.some((n: Node) => n.selected) && (
                  <button
                    onClick={() => { const sel = nodes.filter((n: Node) => n.selected); if (sel.length > 0) setPendingDeleteNodes({ ids: sel.map((n: Node) => n.id), label: sel[0].data?.label || t('mindMap.fallbackNode') }); }}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-colors"
                    title={t('mindMap.deleteSelectedShortcut')}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <button onClick={() => setNavbarHidden(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors" title={t('mindMap.collapseMenu')}>
                  <ChevronUp size={13} />
                </button>
              </div>

            </div>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={canvasAreaRef}
          className="flex-1 relative"
          style={{ backgroundColor: backgroundColor }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={handleCanvasDrop}
        >
        <ReactFlow
          nodes={enrichedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onInit={setRfInstance}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={mindMapTheme.edge}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={onPaneClick}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            if (node.type === 'mindMap') {
              if (notesOpenRef.current !== null) setNotesNodeId(node.id);
              if (attachmentsOpenRef.current !== null) setAttachmentsNodeId(node.id);
            } else {
              setNotesNodeId(null);
              setAttachmentsNodeId(null);
            }
            // Auto-open notes panel if the node has existing notes
            const hasNotes = node.type === 'mindMap' && !!(node.data?.notes && (node.data.notes as string).replace(/<[^>]*>/g, '').trim());
            if (hasNotes && notesOpenRef.current === null) setNotesNodeId(node.id);
          }}
          onSelectionChange={onSelectionChange}
          onNodeDragStart={() => snapshot()}
          onNodeDragStop={onNodeDragStop}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={null}
          fitView
          elevateNodesOnSelect={false}
          selectionOnDrag={true}
          selectionKeyCode={null}
          multiSelectionKeyCode="Shift"
          panOnDrag={[1]}
          panOnScroll={true}
          panActivationKeyCode={keybinds['mindmap.pan'] || "Space"}
          zoomOnScroll={false}
          zoomActivationKeyCode="Control"
          snapToGrid={snapOption !== 'none'}
          snapGrid={[snapSizeMap[snapOption], snapSizeMap[snapOption]]}
        >
          <MiniMap />
          {showCanvasPattern && (
            <Background
              variant={backgroundPattern as BackgroundVariant}
              gap={12}
              size={1}
              color={isDark ? '#374151' : '#e5e7eb'}
            />
          )}
        </ReactFlow>

        {/* Notes panel — docked right, resizable */}
        {notesNodeId && (
          <div
            className="absolute top-0 right-0 bottom-0 shadow-2xl border-l flex flex-col z-50 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 animate-in slide-in-from-right-10"
            style={{ width: notesWidth }}
          >
            {/* Left drag-resize handle */}
            <div
              onMouseDown={onNotesResizeStart}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 z-10 transition-colors group"
              title={text('Drag to resize')}
            >
              {/* Visual grip dots */}
              <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1.5 flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="w-0.5 h-0.5 rounded-full bg-blue-400" />
                ))}
              </div>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between pl-5 pr-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <StickyNote size={15} className="text-yellow-500 shrink-0" />
                <span className="font-semibold text-sm text-gray-700 dark:text-gray-200 truncate">
                  {nodes.find((n: Node) => n.id === notesNodeId)?.data?.label || text('Notes')}
                </span>
              </div>
              <button onClick={() => setNotesNodeId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors ml-2 shrink-0">
                <X size={16} />
              </button>
            </div>

            <MindMapNotes selectedNodeId={notesNodeId} />
          </div>
        )}

        {/* Attachments floating panel — sits to the left of the notes panel */}
        {attachmentsNodeId && (
          <div
            className="absolute top-4 shadow-xl rounded-xl border flex flex-col z-50 max-h-[calc(100vh-2rem)] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 animate-in slide-in-from-right-10"
            style={{
              right: notesNodeId ? notesWidth + 12 : 16,
              width: 280,
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-xl shrink-0">
              <div className="flex items-center gap-2">
                <Paperclip size={15} className="text-blue-500" />
                <span className="font-semibold text-sm text-gray-700 dark:text-gray-200 truncate max-w-[160px]">
                  {nodes.find((n: Node) => n.id === attachmentsNodeId)?.data?.label || text('Attachments')}
                </span>
              </div>
              <button onClick={() => setAttachmentsNodeId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={16} />
              </button>
            </div>
            <MindMapAttachments selectedNodeId={attachmentsNodeId} />
          </div>
        )}

        {/* Group Details panel (kept) */}
        {selectedNodeId && nodes.find((n: any) => n.id === selectedNodeId)?.type === 'groupNode' && (
          <GroupDetails nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
        )}

        {showShortcutHelp && (
          <ShortcutHelpPanel
            scope="mindmap"
            keybinds={keybinds}
            badge={t('mindMap.helpBadge')}
            title={t('mindMap.keyboardShortcutsTitle')}
            description={t('mindMap.keyboardShortcutsDescription')}
            footerText={t('mindMap.shortcutCloseHint', { combo: helpToggleCombo })}
            manageLabel={t('mindMap.editKeybinds')}
            extraItems={mindmapShortcutItems}
            onClose={() => setShowShortcutHelp(false)}
            onManage={() => {
              setShowShortcutHelp(false);
              navigate('/settings?section=section-mindmap', {
                state: {
                  from: `${window.location.pathname}${window.location.search}${window.location.hash}`,
                },
              });
            }}
            className="absolute bottom-4 left-4 z-[70] w-[min(30rem,calc(100%-2rem))] rounded-2xl border border-stone-200 bg-white/96 p-4 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/96"
          />
        )}

        {/* Floating full-gradient color picker — rendered here to avoid ReactFlow clipping */}
        {colorPicker && (
          <>
            {/* Invisible backdrop to close on click-outside */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setColorPicker(null)}
            />
            <div
              className="fixed z-[9999] shadow-2xl rounded-xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              style={{
                left: Math.min(colorPicker.x, Math.max(16, window.innerWidth - 304)),
                top: Math.min(colorPicker.y, Math.max(16, window.innerHeight - 440)),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{text('Mindmap Color')}</span>
                  <button onClick={() => setColorPicker(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={14} /></button>
                </div>
                <ColorPicker
                  color={colorPicker.color || '#a78bfa'}
                  onChange={(color) => {
                    updateNodeData(colorPicker.nodeId, { color });
                    setColorPicker((prev) => (prev ? { ...prev, color } : null));
                  }}
                  inline
                  paletteMode="office"
                  commitMode="confirm"
                />
              </div>
            </div>
          </>
        )}
        </div>{/* canvas */}
      </div>{/* mindmap area flex-col */}
    </div>
  );
}
