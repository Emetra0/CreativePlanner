import React from 'react';
import { NodeProps, Handle, Position } from 'reactflow';
import { Trash2 } from 'lucide-react';
import type { StoredPalette } from '@/store/usePaletteStore';

export type MoodboardColorPaletteNodeData = StoredPalette & { label?: string };

const H = '!bg-purple-400 !w-3 !h-3 opacity-0 group-hover:opacity-100 transition-opacity';

export default function MoodboardColorPaletteNode({
  id,
  data,
  selected,
}: NodeProps<MoodboardColorPaletteNodeData>) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent('moodboard:delete-node', { detail: { nodeId: id } }),
    );
  };

  return (
    <div
      className={`group relative rounded-xl border-2 overflow-hidden transition-all select-none ${
        selected
          ? 'border-purple-500 shadow-lg shadow-purple-200/40 dark:shadow-purple-900/40'
          : 'border-gray-200 dark:border-gray-700 hover:border-pink-400 dark:hover:border-pink-500 hover:shadow-md'
      } bg-white dark:bg-gray-800`}
      style={{ width: 280 }}
    >
      <Handle type="source" position={Position.Top}    id="top"    className={H} />
      <Handle type="source" position={Position.Right}  id="right"  className={H} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={H} />
      <Handle type="source" position={Position.Left}   id="left"   className={H} />

      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleDelete}
        className="absolute top-1.5 right-1.5 z-20 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      >
        <Trash2 size={10} />
      </button>

      {/* Swatch strip */}
      <div className="flex h-20">
        {data.colors.map((c, i) => (
          <div
            key={i}
            className="flex-1 relative group/swatch"
            style={{ backgroundColor: c }}
          >
            <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5 bg-black/40 text-white opacity-0 group-hover/swatch:opacity-100 transition-opacity font-mono truncate px-0.5">
              {c}
            </span>
          </div>
        ))}
      </div>

      {/* Small dot row */}
      <div className="flex gap-1 px-3 pt-2.5">
        {data.colors.map((c, i) => (
          <div
            key={i}
            className="flex-1 h-[7px] rounded-full"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="px-3 pt-1.5 pb-2.5 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-600 dark:text-gray-300 truncate font-medium">
          {data.label || data.name || ''}
        </span>
        {data.harmony && (
          <span className="text-[10px] font-semibold capitalize px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 shrink-0">
            {data.harmony}
          </span>
        )}
      </div>
    </div>
  );
}
