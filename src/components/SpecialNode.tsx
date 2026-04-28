/**
 * SpecialNode  Custom ReactFlow node that embeds live tool content.
 *
 * Supported nodeTypes:
 *   todo | planner | calendar | idea | brainstorm | chat | storytelling
 *
 * Data strategy:
 *   Nodes show ALL items from the relevant Zustand store.
 *   Adding an item via the node updates the global store and syncs with full app.
 */

import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from 'reactflow';
import {
  CheckSquare, ClipboardList, Calendar, MessageSquare, Lightbulb, Sparkles, BookOpen,
  Plus, X, RefreshCw, Send, Trash2, Palette, LayoutGrid,
  Feather, User, Layers, MapPin, TrendingUp,
  Play, Square, ListPlus, Clock3, Hash, Users,
  Minimize2, ChevronDown, ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useTodoStore, todayString } from '@/store/useTodoStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useIdeaStore } from '@/store/useIdeaStore';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useChatStore } from '@/store/useChatStore';
import type { ChatMessage } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import MindmapNodePresence from './MindmapNodePresence';
import { useThemeStore } from '@/store/useThemeStore';
import { usePaletteStore } from '@/store/usePaletteStore';
import type { PaletteHarmony } from '@/store/usePaletteStore';
import { useMindmapStore } from '@/store/useMindmapStore';
import { useTheme } from 'next-themes';
import TableGridNode from './TableGridNode';
import { useAppTranslation } from '@/lib/appTranslations';
import PlannerBoard from './planner/PlannerBoard';

// ---------------------------------------------------------------------------
// Node Type Metadata
// ---------------------------------------------------------------------------

const TYPE_META: Record<string, {
  label: string; Icon: LucideIcon; headerBg: string; headerText: string; accent: string;
}> = {
  todo:         { label: 'Todo List',    Icon: CheckSquare,   headerBg: 'bg-green-600',  headerText: 'text-white', accent: '#16a34a' },
  planner:      { label: 'Planner',      Icon: ClipboardList, headerBg: 'bg-blue-600',   headerText: 'text-white', accent: '#2563eb' },
  calendar:     { label: 'Calendar',     Icon: Calendar,      headerBg: 'bg-red-600',    headerText: 'text-white', accent: '#dc2626' },
  idea:         { label: 'Ideas',        Icon: Lightbulb,     headerBg: 'bg-yellow-500', headerText: 'text-white', accent: '#eab308' },
  brainstorm:   { label: 'Brainstorm',   Icon: Sparkles,      headerBg: 'bg-purple-600', headerText: 'text-white', accent: '#9333ea' },
  chat:         { label: 'Chat',         Icon: MessageSquare, headerBg: 'bg-cyan-600',   headerText: 'text-white', accent: '#0891b2' },
  storytelling: { label: 'Storytelling', Icon: BookOpen,      headerBg: 'bg-indigo-600', headerText: 'text-white', accent: '#4f46e5' },
  table:        { label: 'Table Grid',   Icon: LayoutGrid,    headerBg: 'bg-slate-700',  headerText: 'text-white', accent: '#475569' },
};

// ---------------------------------------------------------------------------
// Colour-Palette Generator (also used by brainstorm node)
// ---------------------------------------------------------------------------

function generateHarmoniousPalette(harmony: PaletteHarmony, hue?: number): string[] {
  const h = hue ?? Math.floor(Math.random() * 360);
  const sat = 58 + Math.floor(Math.random() * 18);
  const mk = (deg: number, s = sat, l = 50) =>
    `hsl(${Math.round(((h + deg) % 360 + 360) % 360)},${Math.round(s)}%,${Math.round(l)}%)`;
  switch (harmony) {
    case 'analogous':           return [mk(-40,sat,38),mk(-20,sat,50),mk(0,sat,62),mk(20,sat,50),mk(40,sat,38)];
    case 'complementary':       return [mk(0,sat,30),mk(0,sat,50),mk(0,sat-8,70),mk(180,sat,43),mk(180,sat-8,62)];
    case 'triadic':             return [mk(0,sat,50),mk(120,sat,55),mk(240,sat,50),mk(0,sat-14,72),mk(120,sat-14,72)];
    case 'split-complementary': return [mk(0,sat,50),mk(150,sat,50),mk(210,sat,50),mk(0,sat-10,70),mk(150,sat-10,70)];
    case 'monochromatic':       return [mk(0,sat,20),mk(0,sat,36),mk(0,sat,52),mk(0,sat-12,68),mk(0,sat-20,82)];
    case 'tetradic':            return [mk(0,sat,50),mk(90,sat,50),mk(180,sat,50),mk(270,sat,50),mk(45,sat-10,68)];
    default:                    return Array(5).fill(0).map((_,i) => mk(i*60));
  }
}

// ---------------------------------------------------------------------------
// Storytelling Data
// ---------------------------------------------------------------------------

const STORY_PROMPTS: Record<string, string[]> = {
  adventure: [
    'A lone traveller discovers a map tattooed on the back of a stranger  one that leads to a place that should not exist.',
    'Two rivals are forced to team up after a catastrophic event wipes out every other option.',
    'A forgotten prophecy resurfaces, naming someone who has no idea they were part of it.',
    'The bridge between two warring kingdoms collapses  and the only survivors are enemies.',
  ],
  mystery: [
    'Every morning, a new object appears on the detective\'s doorstep  each one belonging to a missing person.',
    'A detective is hired to investigate her own disappearance.',
    'The murder happened in a room with no doors and no windows  yet someone got out.',
    'The suspect has an airtight alibi: they were dead at the time of the murder.',
  ],
  romance: [
    'Two rival bakers compete in a contest  but neither expected to fall for the judge.',
    'They have exchanged letters for years without ever meeting. What happens when they finally do?',
    'A time traveller keeps ending up in the same person\'s life  at all the wrong moments.',
    'He kept leaving one-star reviews at her shop. She never expected to like him.',
  ],
  scifi: [
    'Humans colonise a planet only to find themselves as the invasive species.',
    'An AI becomes sentient and the first thing it does is file for divorce.',
    'A crew wakes from cryo-sleep to find Earth no longer exists  and their mission log has been deleted.',
    'Time travel is real, but only for exactly seven seconds.',
  ],
  fantasy: [
    'A dragon who is afraid of fire must protect a village from an arsonist.',
    'Magic is powered by memories  and the most powerful wizard has forgotten everything.',
    'The chosen one refuses the call, and fate has to scramble for a backup plan.',
    'A world where music is the source of all magic goes silent.',
  ],
};
const STORY_GENRES = Object.keys(STORY_PROMPTS) as Array<keyof typeof STORY_PROMPTS>;
const STORY_GENRE_LABELS: Record<keyof typeof STORY_PROMPTS, string> = {
  adventure: 'Adventure',
  mystery: 'Mystery',
  romance: 'Romance',
  scifi: 'Sci-Fi',
  fantasy: 'Fantasy',
};

const STORY_ARCS = [
  { name: "The Hero's Journey", icon: <Feather size={9} className="inline" />, acts: ['Ordinary World','Call to Adventure','Refusal of the Call','Meeting the Mentor','Crossing the Threshold','Tests, Allies & Enemies','Ordeal','Reward','The Road Back','Resurrection','Return with the Elixir'] },
  { name: 'Three-Act Structure', icon: <Layers size={9} className="inline" />, acts: ['Act 1 — Setup','Inciting Incident (Plot Point 1)','Act 2 — Confrontation','Midpoint reversal or revelation','All Seems Lost (Plot Point 2)','Act 3 — Resolution'] },
  { name: 'Save the Cat',        icon: <BookOpen size={9} className="inline" />, acts: ['Opening Image','Theme Stated','Set-Up','Catalyst','Debate','Break into Two','B Story','Fun and Games','Midpoint','Bad Guys Close In','All Is Lost','Dark Night of the Soul','Break into Three','Finale','Final Image'] },
  { name: 'The Fichtean Curve',  icon: <TrendingUp size={9} className="inline" />, acts: ['Immediate conflict — throw the reader in','Rising action — crisis after crisis','Climax — most intense confrontation','Falling action — aftermath','Final resolution'] },
];

const CHAR_ARCHETYPES = ['The Hero','The Mentor','The Trickster','The Shadow','The Herald','The Shapeshifter','The Guardian','The Ally'];
const CHAR_TRAITS     = ['stubborn','curious','haunted','optimistic','cynical','reckless','calculating','compassionate','ambitious','loyal'];
const CHAR_FLAWS      = ['pride','fear of abandonment','inability to trust','ruthless pragmatism','naivety','obsession','cowardice'];
const CHAR_WANTS      = ['revenge','belonging','freedom','power','truth','redemption','love','survival','recognition'];
const CHAR_BACKS      = ['raised in exile','orphaned young','trained as a weapon','born into royalty they rejected','a reformed villain'];

const WORLD_SETTINGS  = ['A city carved inside a mountain','An archipelago of floating fortresses','Earth 200 years after first contact','A society that runs on bartered memories','A generation ship that forgot it was a ship'];
const WORLD_CONFLICTS = ['A scarce resource is running out','Two factions misunderstand each other\'s core belief','An ancient law was just invoked for the first time','A discovery that rewrites history'];
const WORLD_TWISTS    = ['The protagonist is the villain of an older story','The "safe haven" is the source of the problem','The rule of this world is about to break for the first time'];

function getRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

interface StoryCharacter { archetype: string; trait: string; flaw: string; want: string; background: string; }

// ---------------------------------------------------------------------------
// Avatar helpers (used by the Chat node)
// ---------------------------------------------------------------------------
const NODE_AVATAR_COLORS = [
  'bg-rose-500','bg-orange-500','bg-amber-500','bg-lime-600',
  'bg-teal-500','bg-cyan-600','bg-blue-600','bg-violet-600','bg-purple-600','bg-pink-600',
];
function nodeAvatarBg(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return NODE_AVATAR_COLORS[h % NODE_AVATAR_COLORS.length];
}

// ---------------------------------------------------------------------------
// Shared Mini Tab Bar
// ---------------------------------------------------------------------------

interface TabDef { id: string; label: string; icon: React.ReactNode; }

function MiniTabBar({ tabs, active, onSelect, accentBorder }: {
  tabs: TabDef[]; active: string; onSelect: (id: string) => void; accentBorder?: string;
}) {
  return (
    <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 overflow-x-auto">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onSelect(tab.id)}
          className={`nodrag nopan flex items-center gap-1 px-2 py-2 text-[10px] font-semibold whitespace-nowrap transition-colors flex-1 justify-center border-b-2
            ${active === tab.id
              ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800'
              : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/40'}`}
          style={active === tab.id && accentBorder ? { borderBottomColor: accentBorder } : {}}>
          {tab.icon}{tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const SpecialNode = ({ id, data, selected }: NodeProps) => {
  const updateNodeData = useStore(s => s.updateNodeData);
  const deleteNode     = useStore(s => s.deleteNode);
  const { resolvedTheme } = useTheme();
  const { text } = useAppTranslation();
  const isDark = resolvedTheme === 'dark';
  const { setNodes } = useReactFlow();

  const nodeType: string = data.nodeType ?? 'idea';
  const meta = TYPE_META[nodeType] ?? TYPE_META.idea;
  const displayLabel = !data.label || data.label === meta.label ? text(meta.label) : data.label;

  // ── Derive current project ID + title from URL ────────────────────────────
  const location = useLocation();
  const documentId = new URLSearchParams(location.search).get('id') ?? '';
  const { documents } = useMindmapStore();
  const currentDoc = documents.find(d => d.id === documentId);
  const projectTitle = currentDoc?.title ?? '';

  // All stores ----------------------------------------------------------------
  const { todos, addTodo, toggleTodo, deleteTodo }                = useTodoStore();
  const { events: calEvents, addEvent: addCalEvent, removeEvent } = useCalendarStore();
  const { ideas, addIdea, removeIdea }                            = useIdeaStore();
  const { themes, addTheme, removeTheme }                         = useThemeStore();
  const { palettes, addPalette, removePalette }                   = usePaletteStore();
  // Selective subscriptions — only re-render when THIS channel's messages change,
  // not on every 150 ms poll tick for every other channel.
  const channels    = useChatStore(s => s.channels);
  const { user, isAuthenticated }                                 = useAuthStore();

  // Local UI state ------------------------------------------------------------
  const [input, setInput]           = useState('');
  const [titleEdit, setTitleEdit]   = useState(false);
  const [titleVal, setTitleVal]     = useState<string>(data.label ?? meta.label);

  // Brainstorm tabs: Themes | Ideas | Prompts | Palettes
  const [bsTab, setBsTab]               = useState<'themes'|'ideas'|'prompts'|'palettes'>('themes');
  const [bsPrompt, setBsPrompt]         = useState('Click generate to get a writing prompt!');
  const [bsHarmony, setBsHarmony]       = useState<PaletteHarmony>('analogous');
  const [bsThemeTitle, setBsThemeTitle] = useState('');

  // Storytelling tabs: Prompts | Character | Arc | World
  const [stTab, setStTab]                     = useState<'prompts'|'character'|'arc'|'world'>('prompts');
  const [stGenre, setStGenre]                 = useState<keyof typeof STORY_PROMPTS>('fantasy');
  const [stPrompt, setStPrompt]               = useState('');
  const [stCharacter, setStCharacter]         = useState<StoryCharacter | null>(null);
  const [stArcIdx, setStArcIdx]               = useState(0);
  const [stWorldSetting, setStWorldSetting]   = useState('');
  const [stWorldConflict, setStWorldConflict] = useState('');
  const [stWorldTwist, setStWorldTwist]       = useState('');

  // Hover / resize / collapse state
  const [hovered, setHovered]     = useState(false);
  const [ctrlHeld, setCtrlHeld]   = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [scaleDrag, setScaleDrag] = useState<{ startX: number; startY: number; startScale: number } | null>(null);

  // Chat
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [chatInput, setChatInput]         = useState('');
  const [chatChannelId, setChatChannelId] = useState<string | null>(data.channelId ?? null);
  // Scroll container ref — we scrollTop manually to avoid scrollIntoView moving the ReactFlow canvas
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // Selective subscription: only re-renders this node when THIS channel's messages change
  const channelMsgs = useChatStore(
    useCallback((s: any): ChatMessage[] => chatChannelId ? (s.messages[chatChannelId] ?? []) : [], [chatChannelId])
  );

  // Chat lifecycle ------------------------------------------------------------
  useEffect(() => {
    if (nodeType !== 'chat' || !isAuthenticated) return;
    const store = useChatStore.getState();
    if (chatChannelId) {
      store.fetchMessages(chatChannelId);
      store.startPolling(chatChannelId);
    } else {
      store.fetchChannels();
    }
    return () => { if (chatChannelId) useChatStore.getState().stopPolling(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeType, isAuthenticated, chatChannelId]);

  // Scroll to bottom inside the node's own container (NOT scrollIntoView which moves the RF canvas)
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [channelMsgs.length]);

  // Ctrl key tracking for scale-drag mode
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(true); };
    const up   = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Chat: auto-select ONLY if a channel explicitly matches the current document title
  useEffect(() => {
    if (nodeType !== 'chat' || !isAuthenticated || chatChannelId || !channels.length) return;
    const projectChs = channels.filter(c => c.type === 'project');
    if (!projectChs.length || !projectTitle) return;
    // Only auto-join if there's an exact project match — otherwise stay on picker
    const matchedCh = projectChs.find(c =>
      (c.project_name && c.project_name.toLowerCase() === projectTitle.toLowerCase()) ||
      (c.channel_label && c.channel_label.toLowerCase() === projectTitle.toLowerCase())
    );
    if (!matchedCh) return; // no match → show picker
    setChatChannelId(matchedCh.id);
    updateNodeData(id, { ...data, channelId: matchedCh.id });
    useChatStore.getState().fetchMessages(matchedCh.id);
    useChatStore.getState().startPolling(matchedCh.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeType, isAuthenticated, chatChannelId, channels.length, projectTitle]);

  // Helpers -------------------------------------------------------------------
  const handleAddTodo = useCallback(() => {
    if (!input.trim()) return;
    addTodo(input.trim(), undefined, 'medium', undefined, undefined, todayString());
    setInput('');
  }, [input, addTodo]);

  const handleAddIdea = useCallback((text?: string) => {
    const t = (text ?? input).trim();
    if (!t) return;
    addIdea(t);
    setInput('');
  }, [input, addIdea]);

  const handleAddEvent = useCallback(() => {
    if (!input.trim()) return;
    addCalEvent({ id: `ev-${Date.now()}`, title: input.trim(), date: todayString(), type: 'other' });
    setInput('');
  }, [input, addCalEvent]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || !chatChannelId || !user) return;
    await useChatStore.getState().sendMessage(chatChannelId, chatInput.trim());
    setChatInput('');
  }, [chatInput, chatChannelId, user]);

  const saveTitle = useCallback(() => {
    setTitleEdit(false);
    if (titleVal.trim()) updateNodeData(id, { ...data, label: titleVal.trim() });
    else setTitleVal(data.label ?? meta.label);
  }, [titleVal, id, data, meta.label, updateNodeData]);

  // Scale / resize helpers
  const isWide   = nodeType === 'brainstorm' || nodeType === 'storytelling' || nodeType === 'table';
  // Fixed natural (un-scaled) content box
  const BASE_W   = isWide ? 340 : 280;
  const BASE_H   = 300;
  // Legacy: ignore any minW / defaultH that was previously separate
  const minW     = BASE_W;
  const defaultH = BASE_H;
  // Current CSS scale stored in node data — default 0.75 (smaller spawn)
  const nodeScale = typeof data.nodeScale === 'number' ? data.nodeScale : 0.75;

  // Approx collapsed header height in natural px
  const HEADER_H = 38;

  // Apply scale: save both the scale value AND matching style.width/height
  const applyScale = (newScale: number) => {
    const s = Math.max(0.35, Math.min(1.5, newScale));
    const w = Math.round(BASE_W * s);
    const h = Math.round((collapsed ? HEADER_H : BASE_H) * s);
    setNodes(nodes => nodes.map(n => n.id === id
      ? { ...n, style: { ...n.style, width: w, height: h }, data: { ...n.data, nodeScale: s } }
      : n));
    updateNodeData(id, { ...data, nodeScale: s });
  };

  const resetNodeSize = () => applyScale(0.75);

  // Toggle collapse — also resizes the RF layout box so the footprint matches
  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    const newH = Math.round((next ? HEADER_H : BASE_H) * nodeScale);
    setNodes(nodes => nodes.map(n => n.id === id
      ? { ...n, style: { ...n.style, height: newH } }
      : n));
  };

  // Scale presets — pure scale levels, relative to the fixed content box
  const scalePresets = [
    { label: 'XS', scale: 0.5  },
    { label: 'S',  scale: 0.75 },
    { label: 'M',  scale: 1.0  },
    { label: 'L',  scale: 1.3  },
  ];
  const setPreset = (scale: number) => applyScale(scale);
  const activePreset = scalePresets.find(p => Math.abs(p.scale - nodeScale) < 0.04)?.label;

  // Ctrl + corner drag → CSS scale
  const startScaleDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setScaleDrag({ startX: e.clientX, startY: e.clientY, startScale: nodeScale });
  };
  const onScaleDrag = (e: React.PointerEvent) => {
    if (!scaleDrag) return;
    const dx = e.clientX - scaleDrag.startX;
    const dy = e.clientY - scaleDrag.startY;
    // Diagonal movement: down-right = bigger, up-left = smaller
    const delta    = (dx + dy) / 320;
    const newScale = Math.max(0.35, Math.min(1.5, scaleDrag.startScale + delta));
    const w = Math.round(BASE_W * newScale);
    const h = Math.round(BASE_H * newScale);
    setNodes(nodes => nodes.map(n => n.id === id
      ? { ...n, style: { ...n.style, width: w, height: h }, data: { ...n.data, nodeScale: newScale } }
      : n));
  };
  // Persist the final scale when drag ends
  const endScaleDrag = () => {
    if (scaleDrag) {
      updateNodeData(id, { ...data, nodeScale });
    }
    setScaleDrag(null);
  };

  // Styles --------------------------------------------------------------------
  const cardBg   = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const bodyText = isDark ? 'text-gray-300' : 'text-gray-700';
  const subText  = isDark ? 'text-gray-500' : 'text-gray-400';
  const divider  = `border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`;
  const inputCls = `nodrag nopan w-full text-[11px] px-2 py-1.5 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400'} outline-none`;
  // Handles: hidden by default, appear on group hover  matching MindMapNode style
  const handleCls = '!w-3 !h-3 !bg-gray-400 border-2 !border-white z-50 !opacity-0 group-hover:!opacity-100 transition-opacity rounded-full';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="group relative w-full h-full" style={{ minWidth: BASE_W * nodeScale, minHeight: BASE_H * nodeScale }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerMove={onScaleDrag}
      onPointerUp={endScaleDrag}>
      <MindmapNodePresence nodeId={id} className="top-2 right-2" />
      {/* Normal drag-to-resize: larger handles, always shown when selected */}
      <NodeResizer
        color={meta.accent}
        isVisible={!ctrlHeld && (selected || hovered)}
        minWidth={BASE_W * 0.35}
        minHeight={60}
        handleStyle={{
          width: selected ? 14 : 10,
          height: selected ? 14 : 10,
          borderRadius: 3,
          background: selected ? meta.accent : '#9ca3af',
          border: '2px solid white',
          boxShadow: selected ? `0 0 0 2px ${meta.accent}55` : 'none',
          opacity: 1,
        }}
        lineStyle={{
          borderColor: selected ? meta.accent : '#9ca3af',
          borderWidth: selected ? 2 : 1,
          opacity: selected ? 0.8 : 0.4,
        }}
      />

      {/* Ctrl-mode corner drag handles for CSS scaling — larger, easier to grab */}
      {ctrlHeld && (hovered || selected) && (['nw','ne','se','sw'] as const).map(corner => (
        <div key={corner} onPointerDown={startScaleDrag}
          title="Drag to scale node"
          className="nodrag nopan absolute z-50 rounded-sm bg-indigo-500 border-2 border-white shadow-md cursor-nwse-resize"
          style={{
            width: 18, height: 18,
            top:    corner.startsWith('n') ? -6 : undefined,
            bottom: corner.startsWith('s') ? -6 : undefined,
            left:   corner.endsWith('w')   ? -6 : undefined,
            right:  corner.endsWith('e')   ? -6 : undefined,
          }} />
      ))}

      {/* Hover toolbar */}
      <div className={`nodrag nopan absolute -top-9 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1 rounded-lg shadow-lg border transition-all duration-150 pointer-events-auto
        ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}
        ${hovered || selected ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
        <button title="Reset size and scale" onClick={resetNodeSize}
          className={`nodrag nopan flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors
            ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          <Minimize2 size={11} /> Reset
        </button>
        <div className={`w-px h-3 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
        <span className={`text-[9px] select-none ${ ctrlHeld ? 'text-indigo-500 font-bold' : isDark ? 'text-gray-500' : 'text-gray-400'}`}
          title="Hold Ctrl then drag a corner handle to scale everything">⤡ {ctrlHeld ? 'scale mode' : '⌃+drag'}</span>
        <div className={`w-px h-3 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
        {scalePresets.map(p => (
          <button key={p.label} title={`Scale ${Math.round(p.scale * 100)}%`} onClick={() => setPreset(p.scale)}
            className={`nodrag nopan px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors
              ${ activePreset === p.label
                ? 'bg-blue-600 text-white'
                : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              }`}>
            {p.label}
          </button>
        ))}
        {nodeScale < 0.99 || nodeScale > 1.01 ? (
          <>
            <div className={`w-px h-3 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
            <span className="nodrag nopan text-[9px] text-indigo-400 font-mono">{Math.round(nodeScale * 100)}%</span>
          </>
        ) : null}
      </div>

      {/* Connection handles  hidden until hover */}
      <Handle type="source" position={Position.Top}    id="top"    isConnectable className={handleCls} />
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectable className={handleCls} />
      <Handle type="source" position={Position.Left}   id="left"   isConnectable className={handleCls} />
      <Handle type="source" position={Position.Right}  id="right"  isConnectable className={handleCls} />

      {/* Card — CSS-scaled so text/icons/padding all shrink proportionally */}
      <div style={{
        transform: `scale(${nodeScale})`,
        transformOrigin: 'top left',
        width:  `${100 / nodeScale}%`,
        height: collapsed ? `${HEADER_H}px` : `${100 / nodeScale}%`,
        minHeight: collapsed ? `${HEADER_H}px` : `${BASE_H}px`,
      }}>
      <div className={`flex flex-col rounded-xl border shadow-lg overflow-hidden ${cardBg} w-full h-full`}
        style={{
          outline: selected ? `2.5px solid ${meta.accent}` : 'none',
          outlineOffset: 2,
          boxShadow: selected ? `0 0 0 4px ${meta.accent}22, 0 4px 24px 0 ${meta.accent}18` : undefined,
        }}>

        {/* Header */}
        <div className={`flex items-center gap-2 px-3 py-2 shrink-0 ${meta.headerBg}`}>
          <meta.Icon size={13} className={`${meta.headerText} shrink-0`} />
          {collapsed ? (
            /* Collapsed: show node-type name + project title */
            <span className={`flex-1 min-w-0 text-[11px] font-semibold truncate ${meta.headerText}`}>
              {text(meta.label)}{projectTitle ? <span className="opacity-70 font-normal"> · {projectTitle}</span> : null}
            </span>
          ) : titleEdit ? (
            <input autoFocus value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleEdit(false); setTitleVal(data.label ?? meta.label); }}}
              className={`nodrag nopan flex-1 min-w-0 text-[11px] font-semibold bg-white/20 rounded px-1 outline-none ${meta.headerText}`}
            />
          ) : (
            <span className={`flex-1 min-w-0 text-[11px] font-semibold truncate ${meta.headerText} cursor-text`}
              onDoubleClick={() => setTitleEdit(true)} title="Double-click to rename">
              {displayLabel}
            </span>
          )}
          {/* Collapse / expand toggle */}
          <button className={`nodrag nopan p-0.5 rounded ${meta.headerText} hover:bg-white/20 transition-colors`}
            title={collapsed ? 'Expand node' : 'Collapse node'}
            onClick={toggleCollapse}>
            {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
          <button className={`nodrag nopan p-0.5 rounded ${meta.headerText} hover:bg-white/20 transition-colors`}
            title="Delete node" onClick={() => deleteNode(id)}>
            <X size={11} />
          </button>
        </div>

        {/* Body — hidden when collapsed */}
        {!collapsed && <div className="nowheel flex-1 overflow-hidden flex flex-col nodrag nopan">

          {/* Project context banner — shown whenever we know the parent document */}
          {projectTitle && nodeType !== 'planner' && (
            <div className={`px-3 py-1 shrink-0 border-b ${isDark ? 'border-gray-700 bg-gray-700/40' : 'border-gray-100 bg-gray-50'}`}>
              <p className={`text-[9px] font-semibold tracking-wide truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                📁 {projectTitle}
              </p>
            </div>
          )}

          {/* ================================================================
              TODO
          ================================================================ */}
          {nodeType === 'todo' && (
            <div className="flex flex-col h-full">
              <div className="flex gap-1 p-2 shrink-0">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
                  placeholder="Add task" className={inputCls} />
                <button onClick={handleAddTodo}
                  className="nodrag nopan px-2 py-1 text-[10px] rounded bg-green-600 hover:bg-green-700 text-white font-bold shrink-0">+</button>
              </div>
              <div className={`nowheel flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 ${divider}`}>
                {todos.length === 0 && <p className={`text-[10px] text-center py-3 ${subText}`}>No tasks yet  add one above</p>}
                {todos.map(item => (
                  <label key={item.id} className="flex items-start gap-2 cursor-pointer group/item py-0.5 nodrag nopan">
                    <input type="checkbox" checked={item.status === 'done'} onChange={() => toggleTodo(item.id)}
                      className="mt-0.5 accent-green-500 shrink-0 nodrag" />
                    <span className={`flex-1 text-[11px] leading-tight break-words ${item.status === 'done' ? 'line-through text-gray-400' : bodyText}`}>
                      {item.title}
                      {item.priority === 'high' && <span className="ml-1 text-red-400 text-[9px] font-bold uppercase">HIGH</span>}
                    </span>
                    <button onClick={e => { e.preventDefault(); deleteTodo(item.id); }}
                      className="nodrag opacity-0 group-hover/item:opacity-100 text-red-400 hover:text-red-600 shrink-0 transition-opacity"><X size={10} /></button>
                  </label>
                ))}
              </div>
              {todos.length > 0 && (
                <div className={`px-2 py-1.5 shrink-0 ${divider}`}>
                  <span className={`text-[9px] ${subText}`}>{todos.filter(t => t.status === 'done').length}/{todos.length} done</span>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              PLANNER  — project title, date picker, date-grouped sessions
          ================================================================ */}
          {nodeType === 'planner' && (
            <div className="flex h-full flex-col overflow-hidden">
              <PlannerBoard
                projectId={documentId || id}
                projectName={projectTitle || data.label || text('Planner')}
                compact
              />
            </div>
          )}

          {/* ================================================================
              CALENDAR
          ================================================================ */}
          {nodeType === 'calendar' && (() => {
            const now = new Date(), yr = now.getFullYear(), mo = now.getMonth();
            const dim = new Date(yr, mo + 1, 0).getDate(), fd = new Date(yr, mo, 1).getDay(), td = now.getDate();
            const monthLabel = now.toLocaleString('default', { month: 'short', year: 'numeric' });
            const typeColors: Record<string, string> = { deadline: 'text-red-600 dark:text-red-400', recording: 'text-blue-600 dark:text-blue-400', release: 'text-green-600 dark:text-green-400', task: 'text-yellow-600 dark:text-yellow-400', other: subText };
            return (
              <div className="flex flex-col h-full">
                <div className="p-2 shrink-0">
                  <div className={`text-[10px] font-semibold text-center mb-1 ${subText}`}>{monthLabel}</div>
                  <div className="grid grid-cols-7 gap-px text-center">
                    {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} className={`text-[8px] font-medium ${subText}`}>{d}</div>)}
                    {Array(fd).fill(null).map((_,i) => <div key={`e${i}`} />)}
                    {Array(dim).fill(null).map((_,i) => {
                      const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
                      const hasEv = calEvents.some(e => e.date === ds);
                      return (
                        <div key={i+1} className={`text-[9px] rounded-full w-4 h-4 flex items-center justify-center mx-auto relative ${i+1===td ? 'bg-red-600 text-white font-bold' : bodyText}`}>
                          {i+1}{hasEv && <span className="absolute -bottom-px left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-red-400" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className={`shrink-0 ${divider}`} />
                <div className="flex gap-1 p-2 shrink-0">
                  <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddEvent()} placeholder="Add event" className={inputCls} />
                  <button onClick={handleAddEvent} className="nodrag nopan px-2 py-1 text-[10px] rounded bg-red-600 hover:bg-red-700 text-white font-bold shrink-0">+</button>
                </div>
                <div className="nowheel flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                  {calEvents.length === 0 && <p className={`text-[10px] text-center py-1 ${subText}`}>No events yet</p>}
                  {calEvents.map(ev => (
                    <div key={ev.id} className="flex items-center gap-1.5 group/ev">
                      <span className={`text-[9px] px-1 rounded font-medium shrink-0 ${typeColors[ev.type] ?? subText}`}>{ev.type}</span>
                      <span className={`flex-1 text-[11px] truncate ${bodyText}`}>{ev.title}</span>
                      <span className={`text-[9px] shrink-0 ${subText}`}>{ev.date.slice(5)}</span>
                      <button onClick={() => removeEvent(ev.id)} className="nodrag opacity-0 group-hover/ev:opacity-100 text-red-400 shrink-0"><X size={9} /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ================================================================
              IDEA
          ================================================================ */}
          {nodeType === 'idea' && (
            <div className="flex flex-col h-full">
              <div className="p-2 shrink-0 space-y-1">
                <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Capture an idea" rows={2} className={`${inputCls} resize-none`} />
                <button onClick={() => handleAddIdea()} className="nodrag nopan w-full py-1 text-[10px] rounded bg-yellow-500 hover:bg-yellow-600 text-white font-semibold">Save Idea</button>
              </div>
              <div className={`shrink-0 ${divider}`} />
              <div className="nowheel flex-1 overflow-y-auto px-2 pb-2 mt-1 space-y-1">
                {ideas.length === 0 && <p className={`text-[10px] text-center py-2 ${subText}`}>No ideas saved yet</p>}
                {ideas.map(idea => (
                  <div key={idea.id} className="flex items-start gap-1.5 group/idea rounded px-1.5 py-1 hover:bg-yellow-50 dark:hover:bg-yellow-900/10">
                    <Lightbulb size={9} className="text-yellow-500 mt-0.5 shrink-0" />
                    <span className={`flex-1 text-[10px] leading-relaxed line-clamp-3 ${bodyText}`}>{idea.content}</span>
                    <button onClick={() => removeIdea(idea.id)} className="nodrag opacity-0 group-hover/idea:opacity-100 text-red-400 shrink-0"><X size={9} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================
              BRAINSTORM  4 tabs matching Brainstorming page
              Tabs: Themes | Ideas | Prompts | Color Palettes
          ================================================================ */}
          {nodeType === 'brainstorm' && (
            <div className="flex flex-col h-full">
              <MiniTabBar active={bsTab} onSelect={id => setBsTab(id as typeof bsTab)} accentBorder={meta.accent}
                tabs={[
                  { id: 'themes',   label: 'Themes',         icon: <LayoutGrid size={10} className="mr-0.5" /> },
                  { id: 'ideas',    label: 'Ideas',          icon: <Lightbulb  size={10} className="mr-0.5" /> },
                  { id: 'prompts',  label: 'Prompts',        icon: <Sparkles   size={10} className="mr-0.5" /> },
                  { id: 'palettes', label: 'Color Palettes', icon: <Palette    size={10} className="mr-0.5" /> },
                ]}
              />
              <div className="nowheel flex-1 overflow-y-auto p-2 space-y-2">

                {bsTab === 'themes' && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      <input value={bsThemeTitle} onChange={e => setBsThemeTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && bsThemeTitle.trim()) { addTheme({ id: Date.now().toString(), title: bsThemeTitle.trim(), description: '', color: 'purple', createdAt: new Date().toISOString() }); setBsThemeTitle(''); }}}
                        placeholder="New theme" className={inputCls} />
                      <button onClick={() => { if (!bsThemeTitle.trim()) return; addTheme({ id: Date.now().toString(), title: bsThemeTitle.trim(), description: '', color: 'purple', createdAt: new Date().toISOString() }); setBsThemeTitle(''); }}
                        className="nodrag nopan px-2 py-1 text-[10px] rounded bg-purple-600 hover:bg-purple-700 text-white font-bold shrink-0">+</button>
                    </div>
                    {themes.length === 0 && <p className={`text-[10px] text-center py-2 ${subText}`}>No themes yet</p>}
                    {themes.map(theme => {
                      const isCustom = theme.color.startsWith('hsl') || theme.color.startsWith('#') || theme.color.startsWith('rgb');
                      return (
                        <div key={theme.id} className={`flex items-start gap-2 p-2 rounded-lg border-l-4 border ${isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'} group/th`}
                          style={isCustom ? { borderLeftColor: theme.color } : {}}>
                          {!isCustom && <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 bg-${theme.color}-500`} />}
                          <div className="flex-1 min-w-0">
                            <p className={`text-[11px] font-semibold truncate ${bodyText}`}>{theme.title}</p>
                            {theme.description && <p className={`text-[9px] leading-tight ${subText} line-clamp-2`}>{theme.description}</p>}
                          </div>
                          <button onClick={() => removeTheme(theme.id)} className="nodrag opacity-0 group-hover/th:opacity-100 text-red-400 shrink-0"><X size={9} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {bsTab === 'ideas' && (
                  <div className="space-y-1.5">
                    <div className="space-y-1">
                      <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Write idea" rows={2} className={`${inputCls} resize-none`} />
                      <button onClick={() => handleAddIdea()} className="nodrag nopan w-full py-1 text-[10px] rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold">Save Idea</button>
                    </div>
                    {ideas.length === 0 && <p className={`text-[10px] text-center py-1 ${subText}`}>No ideas saved</p>}
                    {ideas.map(idea => (
                      <div key={idea.id} className="flex items-start gap-1.5 group/id2 rounded px-1 py-1 hover:bg-purple-50 dark:hover:bg-purple-900/10">
                        <Lightbulb size={9} className="text-purple-400 mt-0.5 shrink-0" />
                        <span className={`flex-1 text-[10px] leading-relaxed line-clamp-2 ${bodyText}`}>{idea.content}</span>
                        <button onClick={() => removeIdea(idea.id)} className="nodrag opacity-0 group-hover/id2:opacity-100 text-red-400 shrink-0"><X size={9} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {bsTab === 'prompts' && (
                  <div className="space-y-2">
                    <div className={`rounded-lg border px-3 py-3 text-[11px] ${bodyText} leading-relaxed min-h-[56px] italic ${isDark ? 'bg-purple-900/20 border-purple-800' : 'bg-purple-50 border-purple-100'}`}>
                      "{bsPrompt}"
                    </div>
                    <button onClick={() => {
                      const WRITING_PROMPTS = ["A character discovers a secret door that wasn't there yesterday.","The villain is trying to save the world from a greater threat.","Two strangers realise they've been dreaming about each other for years.","A map leads to a place that shouldn't exist.","The last human on Earth receives a phone call.","The cure is worse than the disease  but the disease is immortality.","Every lie told in this city appears as a visible mark on the speaker.","The time traveller arrives one day too late. Again.","A magical artefact grants wishes, but with a terrible ironic twist.","An ordinary object gains the ability to record memories."];
                      setBsPrompt(getRandom(WRITING_PROMPTS));
                    }} className="nodrag nopan w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold">
                      <RefreshCw size={10} /> Generate Prompt
                    </button>
                    <button onClick={() => handleAddIdea(bsPrompt)} className="nodrag nopan w-full py-1 text-[10px] rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 font-semibold">
                      Save as Idea
                    </button>
                  </div>
                )}

                {bsTab === 'palettes' && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {(['analogous','complementary','triadic','monochromatic'] as PaletteHarmony[]).map(h => (
                        <button key={h} onClick={() => setBsHarmony(h)} className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border capitalize transition-all ${bsHarmony === h ? 'bg-pink-600 text-white border-pink-600' : `${isDark ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-white text-gray-500 border-gray-200'} hover:border-pink-300`}`}>{h}</button>
                      ))}
                    </div>
                    <button onClick={() => { const colors = generateHarmoniousPalette(bsHarmony); addPalette({ id: Date.now().toString(), harmony: bsHarmony, colors }); }}
                      className="nodrag nopan w-full flex items-center justify-center gap-1 py-1.5 text-[10px] rounded bg-pink-600 hover:bg-pink-700 text-white font-semibold">
                      <Plus size={10} /> Generate Palette
                    </button>
                    <div className="space-y-1.5">
                      {palettes.length === 0 && <p className={`text-[10px] text-center py-1 ${subText}`}>No palettes yet</p>}
                      {palettes.map(palette => (
                        <div key={palette.id} className={`group/pal rounded-lg border p-1.5 ${isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex h-6 rounded overflow-hidden mb-1">
                            {palette.colors.map((c, i) => <div key={i} className="flex-1" style={{ backgroundColor: c }} title={c} />)}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] capitalize font-medium ${subText}`}>{palette.harmony}</span>
                            <button onClick={() => removePalette(palette.id)} className="nodrag opacity-0 group-hover/pal:opacity-100 text-red-400"><Trash2 size={9} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              STORYTELLING  4 tabs matching Storytelling page
              Tabs: Story Prompts | Character | Story Arc | World
          ================================================================ */}
          {nodeType === 'storytelling' && (
            <div className="flex flex-col h-full">
              <MiniTabBar active={stTab} onSelect={id => setStTab(id as typeof stTab)} accentBorder={meta.accent}
                tabs={[
                  { id: 'prompts',   label: text('Story Prompts'), icon: <Feather size={10} className="mr-0.5" /> },
                  { id: 'character', label: text('Character'),     icon: <User    size={10} className="mr-0.5" /> },
                  { id: 'arc',       label: text('Story Arc'),     icon: <Layers  size={10} className="mr-0.5" /> },
                  { id: 'world',     label: text('World'),         icon: <MapPin  size={10} className="mr-0.5" /> },
                ]}
              />
              <div className="nowheel flex-1 overflow-y-auto p-2 space-y-2">

                {stTab === 'prompts' && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {STORY_GENRES.map(g => (
                        <button key={g} onClick={() => setStGenre(g)}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border capitalize transition-all ${stGenre === g
                            ? ({ adventure:'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300',mystery:'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-300',romance:'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 border-pink-300',scifi:'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-300',fantasy:'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300' } as Record<string,string>)[g]
                            : `${isDark ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-white text-gray-500 border-gray-200'} hover:border-indigo-300`}`}>
                          {text(STORY_GENRE_LABELS[g])}
                        </button>
                      ))}
                    </div>
                    <div className={`rounded-lg border px-3 py-3 text-[11px] ${bodyText} leading-relaxed min-h-[56px] italic ${isDark ? 'bg-indigo-900/20 border-indigo-800' : 'bg-indigo-50 border-indigo-100'}`}>
                      {stPrompt ? `"${stPrompt}"` : text('Click Generate to get a story prompt')}
                    </div>
                    <button onClick={() => setStPrompt(getRandom(STORY_PROMPTS[stGenre]))}
                      className="nodrag nopan w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                      <RefreshCw size={10} /> {text('Generate Prompt')}
                    </button>
                    {stPrompt && <button onClick={() => handleAddIdea(stPrompt)} className="nodrag nopan w-full py-1 text-[10px] rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 text-gray-700 dark:text-gray-300 font-semibold">{text('Save as Idea')}</button>}
                  </div>
                )}

                {stTab === 'character' && (
                  <div className="space-y-2">
                    <button onClick={() => setStCharacter({ archetype: getRandom(CHAR_ARCHETYPES), trait: getRandom(CHAR_TRAITS), flaw: getRandom(CHAR_FLAWS), want: getRandom(CHAR_WANTS), background: getRandom(CHAR_BACKS) })}
                      className="nodrag nopan w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                      <RefreshCw size={10} /> {text('Generate Character')}
                    </button>
                    {stCharacter && (
                      <div className={`rounded-lg border p-3 space-y-1.5 ${isDark ? 'bg-indigo-900/20 border-indigo-800' : 'bg-indigo-50 border-indigo-100'}`}>
                        {([['Archetype',stCharacter.archetype],['Core Trait',stCharacter.trait],['Flaw',stCharacter.flaw],['Wants',stCharacter.want],['Background',stCharacter.background]] as [string,string][]).map(([k,v]) => (
                          <div key={k} className="flex gap-1.5">
                            <span className={`text-[9px] font-bold uppercase shrink-0 w-16 leading-tight pt-0.5 ${subText}`}>{text(k)}</span>
                            <span className={`text-[10px] leading-relaxed ${bodyText}`}>{text(v)}</span>
                          </div>
                        ))}
                        <button onClick={() => handleAddIdea(`${stCharacter.archetype}  ${stCharacter.trait}; flaw: ${stCharacter.flaw}; wants: ${stCharacter.want}; ${stCharacter.background}.`)}
                          className="nodrag nopan w-full mt-1 py-1 text-[9px] rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 text-gray-700 dark:text-gray-300 font-semibold">{text('Save as Idea')}</button>
                      </div>
                    )}
                  </div>
                )}

                {stTab === 'arc' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1">
                      {STORY_ARCS.map((arc, i) => (
                        <button key={arc.name} onClick={() => setStArcIdx(i)}
                          className={`nodrag nopan text-left px-2 py-1.5 rounded-lg border text-[9px] font-semibold transition-all ${stArcIdx === i ? 'bg-indigo-600 text-white border-indigo-600' : `${isDark ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-white text-gray-600 border-gray-200'} hover:border-indigo-300`}`}>
                          {arc.icon} {arc.name}
                        </button>
                      ))}
                    </div>
                    <div className={`rounded-lg border p-2 ${isDark ? 'bg-indigo-900/20 border-indigo-800' : 'bg-indigo-50 border-indigo-100'}`}>
                      <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${subText}`}>{STORY_ARCS[stArcIdx].icon} {STORY_ARCS[stArcIdx].name}</p>
                      <ol className="space-y-0.5">
                        {STORY_ARCS[stArcIdx].acts.map((act, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className={`text-[9px] font-bold shrink-0 ${subText}`}>{i+1}.</span>
                            <span className={`text-[10px] leading-relaxed ${bodyText}`}>{act}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}

                {stTab === 'world' && (
                  <div className="space-y-2">
                    <button onClick={() => { setStWorldSetting(getRandom(WORLD_SETTINGS)); setStWorldConflict(getRandom(WORLD_CONFLICTS)); setStWorldTwist(getRandom(WORLD_TWISTS)); }}
                      className="nodrag nopan w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                      <RefreshCw size={10} /> {text('Generate World Spark')}
                    </button>
                    {(stWorldSetting || stWorldConflict || stWorldTwist) && (
                      <div className={`rounded-lg border p-3 space-y-2 ${isDark ? 'bg-indigo-900/20 border-indigo-800' : 'bg-indigo-50 border-indigo-100'}`}>
                        {stWorldSetting  && <div><p className={`text-[9px] font-bold uppercase ${subText} mb-0.5`}>{text('Setting')}</p><p className={`text-[10px] leading-relaxed ${bodyText}`}>{text(stWorldSetting)}</p></div>}
                        {stWorldConflict && <div><p className={`text-[9px] font-bold uppercase ${subText} mb-0.5`}>{text('Conflict')}</p><p className={`text-[10px] leading-relaxed ${bodyText}`}>{text(stWorldConflict)}</p></div>}
                        {stWorldTwist    && <div><p className={`text-[9px] font-bold uppercase ${subText} mb-0.5`}>{text('Twist')}</p><p className={`text-[10px] leading-relaxed ${bodyText}`}>{text(stWorldTwist)}</p></div>}
                        <button onClick={() => handleAddIdea(`Setting: ${stWorldSetting} | Conflict: ${stWorldConflict} | Twist: ${stWorldTwist}`)}
                          className="nodrag nopan w-full py-1 text-[9px] rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 text-gray-700 dark:text-gray-300 font-semibold">{text('Save as Idea')}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {nodeType === 'table' && (
            <TableGridNode nodeId={id} data={data} isDark={isDark} />
          )}

          {/* ================================================================
              CHAT  — project-aware split-view, avatars, grouped picker
          ================================================================ */}
          {nodeType === 'chat' && (
            <div className="flex flex-col h-full">
              {!isAuthenticated ? (
                <div className="flex-1 flex items-center justify-center p-3">
                  <p className={`text-[10px] text-center ${subText}`}>Sign in to use real-time chat</p>
                </div>
              ) : !chatChannelId || chatPickerOpen ? (
                /* ── Channel Picker ── */
                <div className="flex flex-col h-full">
                  {chatPickerOpen && (
                    <div className={`flex items-center gap-1 px-2 py-1.5 shrink-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                      <span className={`flex-1 text-[9px] font-bold uppercase tracking-wide ${subText}`}>{text('Switch channel')}</span>
                      <button onClick={() => setChatPickerOpen(false)} className="nodrag nopan text-gray-400 hover:text-gray-600 transition-colors"><X size={10} /></button>
                    </div>
                  )}
                  <div className="nowheel flex-1 overflow-y-auto p-2 space-y-0.5">
                    {channels.length === 0 && (
                      <p className={`text-[10px] text-center py-3 ${subText}`}>Loading channels…</p>
                    )}
                    {/* ── This Project ── only channels that actually match this doc */}
                    {(() => {
                      const allProjChs = channels.filter(c => c.type === 'project');
                      const thisProjChs = allProjChs.filter(c =>
                        projectTitle &&
                        ((c.project_name && c.project_name.toLowerCase() === projectTitle.toLowerCase()) ||
                         (c.channel_label && c.channel_label.toLowerCase() === projectTitle.toLowerCase()))
                      );
                      const otherProjChs = allProjChs.filter(c => !thisProjChs.includes(c));
                      const selectCh = (ch: typeof allProjChs[0]) => {
                        setChatChannelId(ch.id);
                        setChatPickerOpen(false);
                        updateNodeData(id, { ...data, channelId: ch.id });
                        useChatStore.getState().fetchMessages(ch.id);
                        useChatStore.getState().startPolling(ch.id);
                      };
                      return (
                        <>
                          {/* This Project */}
                          {thisProjChs.length > 0 ? (
                            <>
                              <div className={`flex items-center gap-1 px-1 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-wide ${subText}`}>
                                <Hash size={8} /> {text('This Project')}
                              </div>
                              {thisProjChs.map(ch => (
                                <button key={ch.id} onClick={() => selectCh(ch)}
                                  className={`nodrag nopan w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-cyan-900/20' : 'hover:bg-cyan-50'} ${chatChannelId === ch.id ? (isDark ? 'bg-cyan-900/30' : 'bg-cyan-100') : ''}`}>
                                  <div className="w-5 h-5 rounded shrink-0 bg-cyan-600 flex items-center justify-center"><Hash size={9} className="text-white" /></div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[11px] font-semibold truncate ${bodyText}`}>{ch.channel_label ?? ch.name}</p>
                                    {ch.project_name && <p className={`text-[9px] ${subText} truncate`}>{ch.project_name}</p>}
                                  </div>
                                </button>
                              ))}
                            </>
                          ) : projectTitle ? (
                            <div className={`mx-1 my-1.5 px-2 py-2 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-700/30' : 'border-gray-100 bg-gray-50'}`}>
                              <p className={`text-[10px] font-semibold ${subText}`}>📌 {projectTitle}</p>
                              <p className={`text-[9px] mt-0.5 ${subText} opacity-70`}>{text('This document is not shared — no project channel available.')}</p>
                            </div>
                          ) : null}
                          {/* Other Projects */}
                          {otherProjChs.length > 0 && (
                            <>
                              <div className={`flex items-center gap-1 px-1 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-wide ${subText}`}>
                                <Hash size={8} /> {text('Other Projects')}
                              </div>
                              {otherProjChs.map(ch => (
                                <button key={ch.id} onClick={() => selectCh(ch)}
                                  className={`nodrag nopan w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-cyan-900/20' : 'hover:bg-cyan-50'} ${chatChannelId === ch.id ? (isDark ? 'bg-cyan-900/30' : 'bg-cyan-100') : ''}`}>
                                  <div className="w-5 h-5 rounded shrink-0 bg-blue-500 flex items-center justify-center"><Hash size={9} className="text-white" /></div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[11px] font-medium truncate ${bodyText}`}>{ch.channel_label ?? ch.name}</p>
                                    {ch.project_name && <p className={`text-[9px] ${subText} truncate`}>{ch.project_name}</p>}
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                        </>
                      );
                    })()}
                    {/* ── Direct Messages ── */}
                    {channels.filter(c => c.type === 'dm').length > 0 && (
                      <>
                        <div className={`flex items-center gap-1 px-1 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-wide ${subText}`}>
                          <User size={8} /> Direct Messages
                        </div>
                        {channels.filter(c => c.type === 'dm').map(ch => (
                          <button key={ch.id} onClick={() => { setChatChannelId(ch.id); setChatPickerOpen(false); updateNodeData(id, { ...data, channelId: ch.id }); useChatStore.getState().fetchMessages(ch.id); useChatStore.getState().startPolling(ch.id); }}
                            className={`nodrag nopan w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-cyan-900/20' : 'hover:bg-cyan-50'} ${chatChannelId === ch.id ? (isDark ? 'bg-cyan-900/30' : 'bg-cyan-100') : ''}`}>
                            <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-[7px] font-bold overflow-hidden ${nodeAvatarBg(ch.other_user_id ?? ch.id)}`}>
                              {ch.other_avatar_url
                                ? <img src={ch.other_avatar_url} className="w-full h-full object-cover" alt="" />
                                : (ch.other_username ?? '?')[0].toUpperCase()}
                            </div>
                            <p className={`flex-1 text-[11px] font-medium truncate ${bodyText}`}>{ch.other_username ?? ch.channel_label}</p>
                          </button>
                        ))}
                      </>
                    )}
                    {/* ── Groups ── */}
                    {channels.filter(c => c.type === 'group').length > 0 && (
                      <>
                        <div className={`flex items-center gap-1 px-1 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-wide ${subText}`}>
                          <Users size={8} /> Groups
                        </div>
                        {channels.filter(c => c.type === 'group').map(ch => (
                          <button key={ch.id} onClick={() => { setChatChannelId(ch.id); setChatPickerOpen(false); updateNodeData(id, { ...data, channelId: ch.id }); useChatStore.getState().fetchMessages(ch.id); useChatStore.getState().startPolling(ch.id); }}
                            className={`nodrag nopan w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-cyan-900/20' : 'hover:bg-cyan-50'} ${chatChannelId === ch.id ? (isDark ? 'bg-cyan-900/30' : 'bg-cyan-100') : ''}`}>
                            <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-[7px] font-bold overflow-hidden ${ch.avatar_url ? '' : nodeAvatarBg(ch.id)}`}>
                              {ch.avatar_url ? <img src={ch.avatar_url} className="w-full h-full object-cover" alt="" /> : <Users size={9} />}
                            </div>
                            <p className={`flex-1 text-[11px] font-medium truncate ${bodyText}`}>{ch.channel_label ?? ch.name}</p>
                          </button>
                        ))}
                      </>
                    )}
                    {/* ── Global Chat ── */}
                    {channels.filter(c => c.type === 'global').length > 0 && (
                      <>
                        <div className={`flex items-center gap-1 px-1 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-wide ${subText}`}>
                          <MessageSquare size={8} /> Global Chat
                        </div>
                        {channels.filter(c => c.type === 'global').map(ch => (
                          <button key={ch.id} onClick={() => { setChatChannelId(ch.id); setChatPickerOpen(false); updateNodeData(id, { ...data, channelId: ch.id }); useChatStore.getState().fetchMessages(ch.id); useChatStore.getState().startPolling(ch.id); }}
                            className={`nodrag nopan w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-cyan-900/20' : 'hover:bg-cyan-50'} ${chatChannelId === ch.id ? (isDark ? 'bg-cyan-900/30' : 'bg-cyan-100') : ''}`}>
                            <div className="w-5 h-5 rounded shrink-0 bg-cyan-600 flex items-center justify-center"><MessageSquare size={9} className="text-white" /></div>
                            <p className={`flex-1 text-[11px] font-medium truncate ${bodyText}`}>{ch.channel_label ?? ch.name ?? 'Global'}</p>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                  <div className={`p-2 shrink-0 ${divider}`}>
                    <button onClick={() => useChatStore.getState().fetchChannels()} className={`nodrag nopan w-full py-1 text-[10px] rounded border ${isDark ? 'border-gray-600 text-gray-400 hover:bg-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>Refresh channels</button>
                  </div>
                </div>
              ) : (
                /* ── Active channel view ── */
                <>
                  {/* Header */}
                  <div className={`flex items-center gap-1.5 px-2 py-1.5 shrink-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                    {(() => {
                      const ch = channels.find(c => c.id === chatChannelId);
                      if (!ch) return <span className={`flex-1 text-[9px] ${subText}`}>#{chatChannelId}</span>;
                      const isDmCh = ch.type === 'dm';
                      return (
                        <>
                          {isDmCh ? (
                            <div className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-white text-[7px] font-bold overflow-hidden ${nodeAvatarBg(ch.other_user_id ?? ch.id)}`}>
                              {ch.other_avatar_url
                                ? <img src={ch.other_avatar_url} className="w-full h-full object-cover" alt="" />
                                : (ch.other_username ?? '?')[0].toUpperCase()}
                            </div>
                          ) : (
                            <Hash size={9} className={`shrink-0 ${subText}`} />
                          )}
                          <span className={`flex-1 text-[9px] font-semibold truncate ${bodyText}`}>
                            {isDmCh ? (ch.other_username ?? ch.channel_label) : (ch.channel_label ?? ch.name)}
                          </span>
                          {ch.project_name && (
                            <span className={`text-[8px] ${subText} truncate max-w-[64px] shrink-0`}>{ch.project_name}</span>
                          )}
                        </>
                      );
                    })()}
                    <button onClick={() => setChatPickerOpen(true)} className={`nodrag nopan ml-auto text-[9px] ${subText} hover:text-cyan-500 shrink-0 transition-colors`}>change</button>
                  </div>
                  {/* Messages */}
                  <div ref={chatScrollRef} className="nowheel flex-1 overflow-y-auto px-2 py-1.5 space-y-2">
                    {channelMsgs.length === 0 && <p className={`text-[10px] text-center py-3 ${subText}`}>No messages yet</p>}
                    {channelMsgs.map(msg => {
                      const isMe = !!user?.id && String(msg.sender_id) === String(user.id);
                      const initials = (msg.sender_username ?? '?')[0].toUpperCase();
                      return (
                        <div key={msg.id} className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                          {!isMe && (
                            <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-[7px] font-bold overflow-hidden ${nodeAvatarBg(String(msg.sender_id))}`}>
                              {msg.sender_avatar_url
                                ? <img src={msg.sender_avatar_url} className="w-full h-full object-cover" alt="" />
                                : initials}
                            </div>
                          )}
                          <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                            {!isMe && <span className={`text-[8px] ${subText} px-1 mb-0.5`}>{msg.sender_username}</span>}
                            <div className={`rounded-2xl px-2.5 py-1.5 text-[11px] leading-relaxed break-words ${isMe ? 'rounded-br-sm bg-cyan-600 text-white' : `rounded-bl-sm ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800'}`}`}>
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Input */}
                  <div className={`flex gap-1 p-2 shrink-0 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); }}}
                      placeholder="Message…" className={inputCls} />
                    <button onClick={handleSendChat} className="nodrag nopan p-1.5 rounded bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"><Send size={11} /></button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>}

      </div>{/* end card */}
      </div>{/* end scale wrapper */}
    </div>
  );
};

export default memo(SpecialNode);
