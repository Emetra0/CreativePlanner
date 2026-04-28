import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { NodeProps, NodeResizer } from 'reactflow';
import { useStore } from '@/store/useStore';
import { FolderOpen, Trash2 } from 'lucide-react';
import MindmapNodePresence from './MindmapNodePresence';
import { withOpacity } from '@/lib/colors';

const GroupNode = ({ id, data, selected }: NodeProps) => {
  const HOVER_RADIUS = 40;
  const updateNodeLabel = useStore((state) => state.updateNodeLabel);
  const ungroupNode    = useStore((state) => state.ungroupNode);
  const updateNodeData = useStore((state: any) => state.updateNodeData);

  const [isEditing, setIsEditing] = useState(false);
  const [labelVal,  setLabelVal]  = useState(data.label || 'Group');
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hoverTrackingRef = useRef(false);

  const accent = data.color || '#a78bfa';

  useEffect(() => { setLabelVal(data.label || 'Group'); }, [data.label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => {
    updateNodeLabel(id, labelVal);
    setIsEditing(false);
  }, [id, labelVal, updateNodeLabel]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('mindmap:confirm-delete-node', { detail: { nodeId: id, label: data.label || 'Group' } }));
  };

  const handleOpenColorPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('mindmap:open-color-picker', {
      detail: { nodeId: id, color: accent, x: rect.left, y: rect.top },
    }));
  };

  const isWithinHoverRadius = useCallback((x: number, y: number) => {
    const isInsideRect = (element: HTMLElement | null) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return x >= rect.left - HOVER_RADIUS && x <= rect.right + HOVER_RADIUS && y >= rect.top - HOVER_RADIUS && y <= rect.bottom + HOVER_RADIUS;
    };
    return isInsideRect(containerRef.current) || isInsideRect(toolbarRef.current);
  }, [HOVER_RADIUS]);
  const handleWindowMouseMove = useCallback((event: MouseEvent) => {
    if (isWithinHoverRadius(event.clientX, event.clientY)) {
      setIsHovered(true);
      return;
    }
    setIsHovered(false);
    hoverTrackingRef.current = false;
    window.removeEventListener('mousemove', handleWindowMouseMove);
  }, [isWithinHoverRadius]);
  const stopHoverTracking = useCallback(() => {
    if (!hoverTrackingRef.current) return;
    hoverTrackingRef.current = false;
    window.removeEventListener('mousemove', handleWindowMouseMove);
  }, [handleWindowMouseMove]);
  const handleHeaderEnter = useCallback(() => {
    stopHoverTracking();
    setIsHovered(true);
  }, [stopHoverTracking]);
  const handleHeaderLeave = useCallback((event: React.MouseEvent) => {
    const nextTarget = event.relatedTarget as globalThis.Node | null;
    if (nextTarget && (containerRef.current?.contains(nextTarget) || toolbarRef.current?.contains(nextTarget))) return;
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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full rounded-2xl border-2 border-dashed transition-all"
      style={{
        width: '100%',
        height: '100%',
        borderColor: selected ? accent : withOpacity(accent, 0.53, accent),
        backgroundColor: selected ? withOpacity(accent, 0.09, accent) : 'rgba(255,255,255,0.07)',
        pointerEvents: 'none',
      }}
    >
      <MindmapNodePresence nodeId={id} className="top-2 right-2" />
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={selected}
        lineClassName="!border-purple-400"
        handleClassName="pointer-events-auto !w-3 !h-3 !rounded-sm !border-2 !border-purple-400 !bg-white dark:!bg-gray-800"
      />

      {/* Header bar */}
      <div
        className="pointer-events-auto absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-1.5 rounded-t-2xl"
        style={{ backgroundColor: withOpacity(accent, 0.13, accent) }}
        onMouseEnter={handleHeaderEnter}
        onMouseLeave={handleHeaderLeave}
      >
        <FolderOpen size={12} style={{ color: accent }} className="shrink-0" />
        {isEditing ? (
          <input
            ref={inputRef}
            value={labelVal}
            onChange={(e) => setLabelVal(e.target.value)}
            onBlur={commit}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setLabelVal(data.label || 'Group'); setIsEditing(false); }
            }}
            className="text-xs font-bold bg-transparent outline-none border-b flex-1 min-w-0"
            style={{ borderColor: accent, color: accent }}
          />
        ) : (
          <span
            className="text-xs font-bold flex-1 min-w-0 truncate cursor-text"
            style={{ color: accent }}
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
          >
            {labelVal}
          </span>
        )}

        {/* Hover mini toolbar: color + delete */}
        <div
          ref={toolbarRef}
          className="flex items-center gap-0.5 ml-auto transition-opacity duration-150"
          style={{ opacity: isHovered ? 1 : 0 }}
          onMouseEnter={handleHeaderEnter}
          onMouseLeave={handleHeaderLeave}
        >
          {/* Color swatch button */}
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleOpenColorPicker}
            className="w-4 h-4 rounded-full border-2 border-white/60 shadow hover:scale-110 transition-transform shrink-0"
            style={{ backgroundColor: accent }}
            title="Group Color"
          />
          {/* Delete */}
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
            className="w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shrink-0"
            title="Delete Group"
          >
            <Trash2 size={9} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(GroupNode);
