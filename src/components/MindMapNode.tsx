import React, { memo, useRef, useState, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeResizer } from 'reactflow';
import { Plus, Trash2, StickyNote, Paperclip, GitMerge, Minus as MinusIcon, CornerDownRight, Waves, CheckSquare, Lightbulb, RefreshCw, ClipboardList, MessageSquare, CalendarDays, type LucideIcon } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useTheme } from 'next-themes';
import { adaptColorForTheme, getColorAlpha, withOpacity } from '@/lib/colors';
import MindmapNodePresence from './MindmapNodePresence';

// ─── Shape types ─────────────────────────────────────────────────────────────

export type NodeShape = 'ellipse' | 'stadium' | 'rounded' | 'rectangle' | 'diamond' | 'hexagon' | 'parallelogram';

export const NODE_SHAPES: { id: NodeShape; label: string }[] = [
  { id: 'ellipse',       label: 'Ellipse' },
  { id: 'stadium',       label: 'Stadium (Pill)' },
  { id: 'rounded',       label: 'Rounded' },
  { id: 'rectangle',     label: 'Rectangle' },
  { id: 'diamond',       label: 'Diamond' },
  { id: 'hexagon',       label: 'Hexagon' },
  { id: 'parallelogram', label: 'Parallelogram' },
];

export const NODE_TYPE_META: Record<string, { icon: LucideIcon; label: string }> = {
  todo:        { icon: CheckSquare,   label: 'Todo List' },
  idea:        { icon: Lightbulb,     label: 'Idea' },
  brainstorm:  { icon: RefreshCw,     label: 'Brainstorm' },
  planner:     { icon: ClipboardList, label: 'Planner' },
  chat:        { icon: MessageSquare, label: 'Chat Note' },
  calendar:    { icon: CalendarDays,  label: 'Calendar Note' },
};

const SVG_SHAPES: NodeShape[] = ['diamond', 'hexagon', 'parallelogram'];

// ─── SVG shape overlay ────────────────────────────────────────────────────────

function ShapeSVG({ shape, bg, strokeColor, strokeW, w, h }: {
  shape: NodeShape; bg: string; strokeColor: string; strokeW: number; w: number; h: number;
}) {
  const pad = 4;
  const cx = w / 2, cy = h / 2;
  const rx = (w - pad * 2) / 2, ry = (h - pad * 2) / 2;

  if (shape === 'diamond') {
    const pts = `${cx},${pad} ${w - pad},${cy} ${cx},${h - pad} ${pad},${cy}`;
    return (
      <svg width={w} height={h} className="absolute inset-0 pointer-events-none overflow-visible">
        <polygon points={pts} fill={bg} stroke={strokeColor} strokeWidth={strokeW} />
      </svg>
    );
  }
  if (shape === 'hexagon') {
    const pts = [
      [cx - rx * 0.5, cy - ry], [cx + rx * 0.5, cy - ry],
      [cx + rx, cy],
      [cx + rx * 0.5, cy + ry], [cx - rx * 0.5, cy + ry],
      [cx - rx, cy],
    ].map(([x, y]) => `${x},${y}`).join(' ');
    return (
      <svg width={w} height={h} className="absolute inset-0 pointer-events-none overflow-visible">
        <polygon points={pts} fill={bg} stroke={strokeColor} strokeWidth={strokeW} />
      </svg>
    );
  }
  if (shape === 'parallelogram') {
    const skew = rx * 0.35;
    const pts = `${pad + skew},${pad} ${w - pad},${pad} ${w - pad - skew},${h - pad} ${pad},${h - pad}`;
    return (
      <svg width={w} height={h} className="absolute inset-0 pointer-events-none overflow-visible">
        <polygon points={pts} fill={bg} stroke={strokeColor} strokeWidth={strokeW} />
      </svg>
    );
  }
  return null;
}

function ShapeSVGWrapper({ shape, bg, strokeColor, strokeW }: {
  shape: NodeShape; bg: string; strokeColor: string; strokeW: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 140, h: 52 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    setSize({ w: el.offsetWidth, h: el.offsetHeight });
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none z-0">
      <ShapeSVG shape={shape} bg={bg} strokeColor={strokeColor} strokeW={strokeW} w={size.w} h={size.h} />
    </div>
  );
}

// ─── SVG L-bracket for underline nodes ──────────────────────────────────────────────
function BracketSVG({ side, color, w, h }: { side: 'left' | 'right'; color: string; w: number; h: number }) {
  const r = 6;   // corner radius (matches reference: C 6.686...)
  const sw = 3;  // stroke width (matches reference: stroke-width="3")

  // Reference SVG path for left bracket: M197 24 H10 C6.686 24 4 21.314 4 18 V0
  // That is: right→left horizontal, rounded corner, vertical up (no top rounding)
  // In our coordinate system with (0,0) at top-left:
  const path = side === 'left'
    // Left bracket: vertical bar on left, horizontal bar on bottom
    ? `M ${sw/2},0 V ${h - sw/2 - r} C ${sw/2},${h - sw/2 - r + r*0.552} ${sw/2 + r - r*0.552},${h - sw/2} ${sw/2 + r},${h - sw/2} H ${w}`
    // Right bracket: vertical bar on right, horizontal bar on bottom (mirrored)
    : `M ${w - sw/2},0 V ${h - sw/2 - r} C ${w - sw/2},${h - sw/2 - r + r*0.552} ${w - sw/2 - r + r*0.552},${h - sw/2} ${w - sw/2 - r},${h - sw/2} H 0`;

  return (
    <svg
      width={w} height={h}
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: 'visible', zIndex: 0 }}
    >
      <path d={path} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BracketSVGWrapper({ side, color }: { side: 'left' | 'right'; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 160, h: 40 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(el);
    setSize({ w: el.offsetWidth, h: el.offsetHeight });
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none z-0">
      <BracketSVG side={side} color={color} w={size.w} h={size.h} />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const MindMapNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const HOVER_RADIUS = 44;
  const deleteNode = useStore((state) => state.deleteNode);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const setEdges = useStore((state: any) => state.setEdges);
  const categories = useStore((state) => state.categories);
  const mindMapTheme = useStore((state) => state.mindMapTheme);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const category = categories.find((c) => c.id === data.category);
  const customStyle = data.style || {};
  // Color system: data.color is the single source of truth (same as GroupNode)
  const nodeColor: string = data.color || category?.color || '#a78bfa';
  // Theme-adaptive accent: adjusts lightness so the colour stays visible
  // against the canvas regardless of light/dark mode.
  const accent = adaptColorForTheme(nodeColor, isDark);
  const accentOpacity = getColorAlpha(accent);
  // bg = light tint — slightly more opaque in dark mode for visibility
  const bg = withOpacity(accent, accentOpacity * (isDark ? 0.2 : 0.13), accent);
  const shape: NodeShape = data.shape || 'ellipse';
  const isRoot = !!(data._isRoot);
  const themeRadius = mindMapTheme?.node?.borderRadius || '9999px';
  const themeBorder = customStyle.border || mindMapTheme?.node?.border || '2px solid transparent';
  const themeShadow = mindMapTheme?.node?.shadow || '0 4px 6px -1px rgb(0 0 0 / 0.1)';
  const isSVGShape = SVG_SHAPES.includes(shape);

  // Detect which side this node sits on relative to its parent
  const edges = useStore((state) => state.edges);
  const incomingEdge = (edges as any[]).find((e: any) => e.target === id);
  const parentSourceHandle = incomingEdge?.sourceHandle;
  // Depth detection from edge structure (no _isRoot dependency on raw store nodes):
  // parent is root = parent has no incoming edge
  const parentIsRoot = !!incomingEdge && !(edges as any[]).some((e: any) => e.target === incomingEdge.source);
  const isDepth1 = !isRoot && parentIsRoot;
  // sourceHandle 'left'  → parent outputs on left  → child is to the LEFT  → bracket on RIGHT
  // sourceHandle 'right' → parent outputs on right → child is to the RIGHT → bracket on LEFT
  // default: bracket on left
  const bracketSide: 'left' | 'right' = parentSourceHandle === 'left' ? 'right' : 'left';

  const borderRadiusMap: Partial<Record<NodeShape, string>> = {
    ellipse: themeRadius,
    stadium: '9999px',
    rounded: '10px',
    rectangle: '6px',
  };
  const cssRadius = borderRadiusMap[shape] ?? themeRadius;

  const strokeColor = selected ? '#3b82f6' : (themeBorder.split(' ').slice(2).join(' ') || 'transparent');
  const strokeW = selected ? 2 : 2;
  // Root: full padding. Depth-1: thin box. Depth-2+: underline (no padClass needed)
  // For SVG shapes we use inline padding (shape-specific polygon-aware values), not Tailwind
  const padClass = isSVGShape
    ? '' // SVG shapes use inline padding in the style block
    : isRoot ? 'px-5 py-3' : isDepth1 ? 'px-4 py-1' : 'px-4 py-2';
  // SVG shapes need more room so text stays inside the polygon's inscribed area
  const minWidth = isSVGShape
    ? (isRoot ? '210px' : '170px')
    : (isRoot ? '140px' : '100px');
  const fontWeight = isRoot ? '700' : isDepth1 ? '500' : '500';
  const fontSize = isRoot ? '0.9rem' : '0.8125rem'; // ~14.4px vs 13px

  // ── Ctrl-key resize mode ─────────────────────────────────────────────────────
  const [ctrlHeld, setCtrlHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(true); };
    const up   = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── Inline editing ───────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label as string);
  const inputRef = useRef<HTMLInputElement>(null);

  // When someone dispatches mindmap:start-edit-node for this node, enter edit mode
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail.nodeId !== id) return;
      setEditValue(data.label as string);
      setIsEditing(true);
    };
    window.addEventListener('mindmap:start-edit-node', handler as EventListener);
    return () => window.removeEventListener('mindmap:start-edit-node', handler as EventListener);
  }, [id, data.label]);

  // Focus + select all when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    updateNodeData(id, { label: trimmed || 'Untitled' });
    setIsEditing(false);
  }, [editValue, id, updateNodeData]);

  const cancelEdit = useCallback(() => {
    setEditValue(data.label as string);
    setIsEditing(false);
  }, [data.label]);

  const handleLabelDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(data.label as string);
    setIsEditing(true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // don't let ReactFlow intercept Delete/Backspace
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  };

  // ── Toolbar handlers ─────────────────────────────────────────────────────────
  const [isHovered, setIsHovered] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hoverTrackingRef = useRef(false);
  const isWithinHoverRadius = useCallback((x: number, y: number) => {
    const isInsideRect = (element: HTMLElement | null) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return x >= rect.left - HOVER_RADIUS && x <= rect.right + HOVER_RADIUS && y >= rect.top - HOVER_RADIUS && y <= rect.bottom + HOVER_RADIUS;
    };
    return isInsideRect(nodeRef.current) || isInsideRect(toolbarRef.current);
  }, [HOVER_RADIUS]);
  const stopHoverTracking = useCallback(() => {
    if (!hoverTrackingRef.current) return;
    hoverTrackingRef.current = false;
    window.removeEventListener('mousemove', handleWindowMouseMove);
  }, []);
  const handleWindowMouseMove = useCallback((event: MouseEvent) => {
    if (isWithinHoverRadius(event.clientX, event.clientY)) {
      setIsHovered(true);
      return;
    }
    setIsHovered(false);
    hoverTrackingRef.current = false;
    window.removeEventListener('mousemove', handleWindowMouseMove);
  }, [isWithinHoverRadius]);
  const handleMouseEnter = useCallback(() => {
    stopHoverTracking();
    setIsHovered(true);
  }, [stopHoverTracking]);
  const handleMouseLeave = useCallback((event: React.MouseEvent) => {
    const nextTarget = event.relatedTarget as globalThis.Node | null;
    if (nextTarget && (nodeRef.current?.contains(nextTarget) || toolbarRef.current?.contains(nextTarget))) return;
    if (!isWithinHoverRadius(event.clientX, event.clientY)) {
      setIsHovered(false);
      stopHoverTracking();
      return;
    }
    if (!hoverTrackingRef.current) {
      hoverTrackingRef.current = true;
      window.addEventListener('mousemove', handleWindowMouseMove);
    }
  }, [handleWindowMouseMove, isWithinHoverRadius, stopHoverTracking]);
  useEffect(() => () => stopHoverTracking(), [stopHoverTracking]);
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('mindmap:confirm-delete-node', { detail: { nodeId: id, label: data.label } }));
  };
  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('mindmap:add-child', { detail: { parentId: id } }));
  };
  const handleOpenNotes = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('mindmap:open-notes', { detail: { nodeId: id } }));
  };
  const handleOpenAttachments = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('mindmap:open-attachments', { detail: { nodeId: id } }));
  };

  // Change outgoingEdgeType on this node AND update all existing edges from it
  const handleEdgeTypeChange = useCallback((et: string) => {
    updateNodeData(id, { outgoingEdgeType: et });
    const currentEdges = useStore.getState().edges as any[];
    setEdges(currentEdges.map((e: any) =>
      e.source === id ? { ...e, data: { ...e.data, pathType: et } } : e
    ));
  }, [id, updateNodeData, setEdges]);

  // Open the full gradient color picker (rendered in MindMap.tsx to avoid ReactFlow clipping)
  const handleOpenColorPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Use the button's bounding rect so MindMap.tsx can position the picker near here
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('mindmap:open-color-picker', {
      detail: { nodeId: id, color: nodeColor, x: rect.left, y: rect.top },
    }));
  };

  // Compact shape symbol map (small inline SVGs – no emoji)
  const shapeSymbol: Record<string, React.ReactNode> = {
    ellipse:       <svg viewBox="0 0 14 10" width="14" height="10"><ellipse cx="7" cy="5" rx="6" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,
    stadium:       <svg viewBox="0 0 16 10" width="16" height="10"><rect x="1" y="1" width="14" height="8" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,
    rounded:       <svg viewBox="0 0 12 12" width="12" height="12"><rect x="1" y="1" width="10" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,
    rectangle:     <svg viewBox="0 0 14 10" width="14" height="10"><rect x="1" y="1" width="12" height="8" rx="0" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,
    diamond:       <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="6,1 11,6 6,11 1,6" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,
    hexagon:       <svg viewBox="0 0 14 12" width="14" height="12"><polygon points="7,1 13,4 13,8 7,11 1,8 1,4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,
    parallelogram: <svg viewBox="0 0 16 10" width="16" height="10"><polygon points="4,1 15,1 12,9 1,9" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,
  };
  const currentShape = (data.shape as string) || 'ellipse';
  const currentEdgeType = (data.outgoingEdgeType as string) || mindMapTheme?.edge?.type || 'bezier';
  const EDGE_TYPES: { value: string; title: string; icon: React.ReactNode }[] = [
    { value: 'bezier',     title: 'Bezier',        icon: <GitMerge size={11} /> },
    { value: 'straight',   title: 'Straight',      icon: <MinusIcon size={11} /> },
    { value: 'step',       title: 'Step',          icon: <CornerDownRight size={11} /> },
    { value: 'smoothstep', title: 'Smooth Step',   icon: <Waves size={11} /> },
  ];

  const hasNotes = !!(data.notes && data.notes.replace(/<[^>]*>/g, '').trim());
  const attachments: any[] = Array.isArray(data.attachments) ? (data.attachments as any[]) : [];
  const attachmentCount: number = attachments.length;

  // Depth-2+ children become underline. Depth-1 (direct children of root) = thin box. Root nodes stay as box.
  const isUnderlineMode = !data._isRoot && !isDepth1;
  // underlineColor = same theme-adapted accent defined above
  const underlineColor = accent;

  return (
    <div
      ref={nodeRef}
      className={`group relative transition-all flex flex-col ${customStyle.color ? '' : 'text-gray-800 dark:text-gray-200'}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={isUnderlineMode
        ? {
            width: 'fit-content',
            minWidth: '100px',
            alignItems: bracketSide === 'right' ? 'flex-end' : 'flex-start',
          }
        : { minWidth, alignItems: 'center' }}
    >
      {/* Ctrl+drag corner resize — only active when Ctrl is held */}
      <NodeResizer
        isVisible={selected && ctrlHeld}
        minWidth={80}
        minHeight={30}
        color="#3b82f6"
        handleStyle={{ width: 10, height: 10, borderRadius: 3 }}
      />
      {/* Main node box */}
      <div
        className={`relative transition-all flex items-center w-full ${!isUnderlineMode ? padClass : ''}`}
        style={
          isUnderlineMode
            ? {
                // CSS L-bracket: vertical bar + horizontal underline + rounded corner
                backgroundColor: 'transparent',
                boxShadow: 'none',
                borderLeft: bracketSide === 'left' ? `3px solid ${selected ? '#3b82f6' : accent}` : 'none',
                borderRight: bracketSide === 'right' ? `3px solid ${selected ? '#3b82f6' : accent}` : 'none',
                borderBottom: `3px solid ${selected ? '#3b82f6' : accent}`,
                borderTop: 'none',
                borderBottomLeftRadius: bracketSide === 'left' ? '6px' : '0px',
                borderBottomRightRadius: bracketSide === 'right' ? '6px' : '0px',
                borderTopLeftRadius: '0px',
                borderTopRightRadius: '0px',
                padding: '4px 8px 4px',
                paddingLeft: bracketSide === 'left' ? '12px' : '8px',
                paddingRight: bracketSide === 'right' ? '12px' : '8px',
                ...(customStyle.color ? { color: customStyle.color } : {}),
                fontWeight,
                fontSize,
                textAlign: 'left' as const,
                justifyContent: 'flex-start',
                overflow: 'visible',
              }
          : isDepth1
            ? {
                // Thin box: same look as root but slimmer vertically
                backgroundColor: bg,
                ...(customStyle.color ? { color: customStyle.color } : {}),
                borderRadius: cssRadius,
                boxShadow: themeShadow,
                border: selected
                  ? `2px solid #3b82f6`
                  : `1.5px solid ${withOpacity(accent, accentOpacity * 0.53, accent)}`,
                fontWeight,
                fontSize,
                justifyContent: 'center',
                textAlign: 'center' as const,
              }
          : isSVGShape
            ? {
                ...(customStyle.color ? { color: customStyle.color } : {}),
                fontWeight,
                fontSize,
                justifyContent: 'center',
                textAlign: 'center' as const,
                // Polygon-aware padding: text must stay inside inscribed rectangle
                // Diamond: inscribed rect ≈ 50% of bounding box each axis
                // Hexagon: safe area ≈ 70% wide, 80% tall
                // Parallelogram: needs wide horizontal clearance for the skew
                padding: shape === 'diamond'
                  ? (isRoot ? '32px 52px' : '24px 44px')
                  : shape === 'hexagon'
                  ? (isRoot ? '20px 32px' : '16px 26px')
                  : /* parallelogram */ (isRoot ? '16px 56px' : '12px 48px'),
                minHeight: shape === 'diamond'
                  ? (isRoot ? '130px' : '96px')
                  : (isRoot ? '84px' : '66px'),
              }
            : {
                backgroundColor: bg,
                ...(customStyle.color ? { color: customStyle.color } : {}),
                borderRadius: cssRadius,
                boxShadow: isRoot
                  ? `0 6px 16px -2px rgb(0 0 0 / 0.18), ${themeShadow}`
                  : themeShadow,
                border: selected
                  ? `2px solid #3b82f6`
                  : isRoot
                    ? `3px solid ${accent}`
                    : `2px solid ${withOpacity(accent, accentOpacity * 0.53, accent)}`,
                fontWeight,
                fontSize,
                justifyContent: 'center',
                textAlign: 'center' as const,
              }
        }
      >
        <MindmapNodePresence nodeId={id} className="-top-3 -right-3" />
        {!isUnderlineMode && isSVGShape && (
          <ShapeSVGWrapper shape={shape} bg={bg} strokeColor={strokeColor} strokeW={strokeW} />
        )}

        {/* Node type icon badge */}
        {data.nodeType && NODE_TYPE_META[(data.nodeType as string)] && (() => {
          const NodeTypeIcon = NODE_TYPE_META[(data.nodeType as string)].icon;
          return (
            <span
              className="absolute top-1 left-1.5 leading-none z-20 pointer-events-none select-none text-gray-500 dark:text-gray-300"
              title={NODE_TYPE_META[(data.nodeType as string)].label}
            >
              <NodeTypeIcon size={10} />
            </span>
          );
        })()}

      {/* Handles */}
      {isUnderlineMode ? (
        // Underline nodes:
        //  - bracket-side: source (parent edge comes in here via ConnectionMode.Loose)
        //  - opposite side: source (children branch off here)
        bracketSide === 'left' ? (
          <>
            <Handle type="source" position={Position.Left}  id="left"  isConnectable={isConnectable}
              className="w-3 h-3 !bg-white border-2 z-50 rounded-full !opacity-0 group-hover:!opacity-100 transition-opacity"
              style={{ borderColor: underlineColor }} />
            <Handle type="source" position={Position.Right} id="right" isConnectable={isConnectable}
              className="w-3 h-3 !bg-white border-2 z-50 rounded-full !opacity-0 group-hover:!opacity-100 transition-opacity"
              style={{ borderColor: underlineColor }} />
          </>
        ) : (
          <>
            <Handle type="source" position={Position.Right} id="right" isConnectable={isConnectable}
              className="w-3 h-3 !bg-white border-2 z-50 rounded-full !opacity-0 group-hover:!opacity-100 transition-opacity"
              style={{ borderColor: underlineColor }} />
            <Handle type="source" position={Position.Left}  id="left"  isConnectable={isConnectable}
              className="w-3 h-3 !bg-white border-2 z-50 rounded-full !opacity-0 group-hover:!opacity-100 transition-opacity"
              style={{ borderColor: underlineColor }} />
          </>
        )
      ) : (
        // Box/SVG nodes: all 4 handles, hidden until hover
        <>
          <Handle type="source" position={Position.Top}    id="top"    isConnectable={isConnectable} className="w-3 h-3 !bg-gray-400 border-2 border-white z-50 !opacity-0 group-hover:!opacity-100 transition-opacity" />
          <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={isConnectable} className="w-3 h-3 !bg-gray-400 border-2 border-white z-50 !opacity-0 group-hover:!opacity-100 transition-opacity" />
          <Handle type="source" position={Position.Left}   id="left"   isConnectable={isConnectable} className="w-3 h-3 !bg-gray-400 border-2 border-white z-50 !opacity-0 group-hover:!opacity-100 transition-opacity" />
          <Handle type="source" position={Position.Right}  id="right"  isConnectable={isConnectable} className="w-3 h-3 !bg-gray-400 border-2 border-white z-50 !opacity-0 group-hover:!opacity-100 transition-opacity" />
        </>
      )}

        {/* Label / inline editor */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleInputKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 font-medium bg-transparent border-0 border-b-2 border-blue-400 outline-none w-full min-w-[80px] max-w-[220px]"
            style={{ ...(customStyle.color ? { color: customStyle.color } : {}), fontSize, fontWeight }}
          />
        ) : (
          <div
            className="relative z-10 select-none cursor-text inline-block"
            onDoubleClick={handleLabelDoubleClick}
            onClick={(e) => {
              if (hasNotes) { e.stopPropagation(); handleOpenNotes(e as any); }
            }}
            title={hasNotes ? 'Click to open notes — double-click to rename' : 'Double-click to rename'}
            style={{
              // No gradient underline needed — border-bottom IS the line in underline mode
            }}
          >
            {data.label}
          </div>
        )}

        {/* Unified single-row toolbar */}
        {(selected || isHovered) && !isEditing && (
          <div
            ref={toolbarRef}
            className="absolute left-1/2 -translate-x-1/2 z-50"
            style={{ bottom: '100%', marginBottom: '6px', whiteSpace: 'nowrap' }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-md px-1 py-0.5">
              {!isUnderlineMode && (
                <>
                  {NODE_SHAPES.map((s) => (
                    <button
                      key={s.id}
                      onClick={(e) => { e.stopPropagation(); updateNodeData(id, { shape: s.id }); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={`text-[11px] px-1 py-0.5 rounded transition-colors ${
                        currentShape === s.id
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                      title={s.label}
                    >{shapeSymbol[s.id]}</button>
                  ))}
                  <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
                </>
              )}
              {EDGE_TYPES.map((et) => (
                <button
                  key={et.value}
                  onClick={(e) => { e.stopPropagation(); handleEdgeTypeChange(et.value); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`p-1 rounded transition-colors ${
                    currentEdgeType === et.value
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                  title={`Edge: ${et.title}`}
                >{et.icon}</button>
              ))}
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
              <button onClick={handleOpenNotes} className={`p-1 rounded transition-colors ${hasNotes ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20' : 'text-gray-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 hover:text-yellow-500'}`} title="Notes"><StickyNote size={13} /></button>
              <button onClick={handleOpenAttachments} className={`p-1 rounded transition-colors ${attachmentCount > 0 ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-500'}`} title="Attachments"><Paperclip size={13} /></button>
              <button onClick={handleAddChild} className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors" title="Add Child"><Plus size={13} /></button>
              <button
                onClick={handleOpenColorPicker}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title="Node Color"
              >
                <span className="block w-3 h-3 rounded-full border border-gray-300 dark:border-gray-500 shadow-sm" style={{ backgroundColor: accent }} />
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
              <button onClick={handleDelete} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-colors" title="Delete (Del) / Ctrl+Del = instant"><Trash2 size={13} /></button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
              <span className="px-1 text-[9px] text-gray-400 dark:text-gray-500 select-none" title="Hold Ctrl then drag a corner handle to resize this node">⌃ scale</span>
            </div>
          </div>
        )}
      </div>

      {/* ── U-shaped tabs (notes + attachments) ─────────────── */}
      {(hasNotes || attachmentCount > 0) && (
        <div
          className="nodrag nowheel flex items-start"
          style={{
            pointerEvents: 'none',
            gap: '3px',
            justifyContent: bracketSide === 'right' ? 'flex-end' : 'flex-start',
            paddingLeft: isUnderlineMode && bracketSide === 'left' ? '10px' : undefined,
            paddingRight: isUnderlineMode && bracketSide === 'right' ? '10px' : undefined,
            marginTop: '0px',
          }}
        >
          {hasNotes && (
            <button
              className="flex items-center justify-center transition-colors hover:opacity-80"
              style={{
                pointerEvents: 'auto',
                borderLeft: `3px solid ${accent}`,
                borderRight: `3px solid ${accent}`,
                borderBottom: `3px solid ${accent}`,
                borderTop: 'none',
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px',
                padding: '4px 6px 5px',
                background: 'transparent',
              }}
              onClick={handleOpenNotes}
              onMouseDown={(e) => e.stopPropagation()}
              title="Notes"
            >
              <StickyNote size={12} style={{ color: accent }} className="shrink-0" />
            </button>
          )}
          {(attachments as any[]).map((att: any) => (
            <button
              key={att.id}
              className="flex items-center gap-1.5 transition-colors hover:opacity-80"
              style={{
                pointerEvents: 'auto',
                borderLeft: `3px solid ${accent}`,
                borderRight: `3px solid ${accent}`,
                borderBottom: `3px solid ${accent}`,
                borderTop: 'none',
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px',
                padding: '4px 8px 5px',
                background: 'transparent',
              }}
              onClick={handleOpenAttachments}
              onMouseDown={(e) => e.stopPropagation()}
              title={att.name}
            >
              <Paperclip size={12} className="shrink-0" style={{ color: accent }} />
              <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: accent }}>{att.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(MindMapNode);
