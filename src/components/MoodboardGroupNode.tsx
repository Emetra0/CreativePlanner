import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeProps, Handle, Position, NodeResizer } from 'reactflow';
import { FolderOpen, Trash2 } from 'lucide-react';
import { withOpacity } from '@/lib/colors';

export interface MoodboardGroupNodeData {
  label: string;
  color?: string;
}

const H = '!bg-purple-400 !w-3 !h-3 opacity-0 group-hover:opacity-100 transition-opacity';

export default function MoodboardGroupNode({
  id,
  data,
  selected,
}: NodeProps<MoodboardGroupNodeData>) {
  const [isEditing, setIsEditing] = useState(false);
  const [labelVal, setLabelVal] = useState(data.label || 'Group');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLabelVal(data.label || 'Group'); }, [data.label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('moodboard:update-node', {
        detail: { nodeId: id, updates: { label: labelVal } },
      }),
    );
    setIsEditing(false);
  }, [id, labelVal]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent('moodboard:delete-node', { detail: { nodeId: id } }),
    );
  };

  const accent = data.color || '#a78bfa';

  return (
    <div
      className={`group relative h-full w-full rounded-2xl border-2 border-dashed transition-all ${
        selected
          ? 'border-purple-500 bg-purple-50/30 dark:bg-purple-900/10'
          : 'bg-white/20 dark:bg-gray-800/20'
      }`}
      style={{ borderColor: selected ? undefined : withOpacity(accent, 0.53, accent), pointerEvents: 'none' }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={selected}
        lineClassName="!border-purple-400"
        handleClassName="pointer-events-auto !w-3 !h-3 !rounded-sm !border-2 !border-purple-400 !bg-white dark:!bg-gray-800"
      />

      <Handle type="source" position={Position.Top}    id="top"    className={H} />
      <Handle type="source" position={Position.Right}  id="right"  className={H} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={H} />
      <Handle type="source" position={Position.Left}   id="left"   className={H} />

      {/* Header bar */}
      <div
        className="pointer-events-auto absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-1.5 rounded-t-2xl"
        style={{ backgroundColor: withOpacity(accent, 0.13, accent) }}
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
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          className="w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <Trash2 size={9} />
        </button>
      </div>
    </div>
  );
}
