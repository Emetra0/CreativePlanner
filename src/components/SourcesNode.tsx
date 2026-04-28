import React, { useState, useCallback, useRef } from 'react';
import { NodeProps, Handle, Position, NodeResizer, useReactFlow } from 'reactflow';
import { Link, Plus, Trash2, ExternalLink, BookOpen, GripVertical } from 'lucide-react';
import MindmapNodePresence from './MindmapNodePresence';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SourceItem {
  id: string;
  text: string;
}

export interface SourcesNodeData {
  title?: string;
  items?: SourceItem[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function makeId() {
  return `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const H_STYLE = '!bg-blue-400 !w-3 !h-3 opacity-0 group-hover:opacity-100 transition-opacity';

// ─── Component ───────────────────────────────────────────────────────────────
export default function SourcesNode({ id, data, selected }: NodeProps<SourcesNodeData>) {
  const { setNodes } = useReactFlow();

  const [title, setTitle] = useState(data.title ?? 'Sources & References');
  const [items, setItems] = useState<SourceItem[]>(data.items ?? []);
  const [newText, setNewText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Persist changes back to the node data
  const persist = useCallback(
    (nextTitle: string, nextItems: SourceItem[]) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, title: nextTitle, items: nextItems } }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleTitleBlur = () => persist(title, items);

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    const next = [...items, { id: makeId(), text }];
    setItems(next);
    setNewText('');
    persist(title, next);
    addInputRef.current?.focus();
  };

  const deleteItem = (itemId: string) => {
    const next = items.filter((i) => i.id !== itemId);
    setItems(next);
    persist(title, next);
  };

  const updateItemText = (itemId: string, text: string) => {
    const next = items.map((i) => (i.id === itemId ? { ...i, text } : i));
    setItems(next);
    persist(title, next);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Works for both moodboard (custom event) and mindmap (parent component listens to ReactFlow selection)
    window.dispatchEvent(new CustomEvent('moodboard:delete-node', { detail: { nodeId: id } }));
    // Also directly remove via ReactFlow for mindmap context
    setNodes((nds) => nds.filter((n) => n.id !== id));
  };

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border-2 bg-white dark:bg-gray-800 transition-all select-none ${
        selected
          ? 'border-blue-500 shadow-lg shadow-blue-200/40 dark:shadow-blue-900/40'
          : 'border-blue-200 dark:border-blue-700 hover:border-blue-400 hover:shadow-md'
      }`}
      style={{ minWidth: 220, minHeight: 140, width: '100%', height: '100%' }}
    >
      <MindmapNodePresence nodeId={id} className="top-2 right-2" />
      {/* Resize handle */}
      <NodeResizer
        minWidth={220}
        minHeight={140}
        isVisible={selected}
        lineClassName="border-blue-400"
        handleClassName="w-2 h-2 bg-blue-400 border border-white rounded-sm"
      />

      {/* Handles */}
      <Handle type="source" position={Position.Top}    id="top"    className={H_STYLE} />
      <Handle type="target" position={Position.Top}    id="top-t"  className={H_STYLE} />
      <Handle type="source" position={Position.Right}  id="right"  className={H_STYLE} />
      <Handle type="target" position={Position.Right}  id="right-t" className={H_STYLE} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={H_STYLE} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" className={H_STYLE} />
      <Handle type="source" position={Position.Left}   id="left"   className={H_STYLE} />
      <Handle type="target" position={Position.Left}   id="left-t" className={H_STYLE} />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 shrink-0">
        <BookOpen size={13} className="text-blue-500 dark:text-blue-400 shrink-0" />
        <input
          className="nodrag nopan flex-1 min-w-0 text-xs font-bold bg-transparent text-blue-700 dark:text-blue-300 outline-none placeholder-blue-300 dark:placeholder-blue-600 truncate"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Sources & References"
          maxLength={60}
        />
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          className="nodrag nopan w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm shrink-0"
        >
          <Trash2 size={9} />
        </button>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {items.length === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-3 italic">
            No references yet — add one below
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="group/item flex items-start gap-1.5 rounded-lg px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
          >
            <Link size={10} className="text-blue-400 shrink-0 mt-0.5" />
            {editingItemId === item.id ? (
              <input
                autoFocus
                className="nodrag nopan flex-1 min-w-0 text-xs bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 rounded px-1.5 py-0.5 outline-none text-gray-700 dark:text-gray-300"
                value={item.text}
                onChange={(e) => updateItemText(item.id, e.target.value)}
                onBlur={() => setEditingItemId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') setEditingItemId(null);
                }}
              />
            ) : (
              <span
                className="flex-1 min-w-0 text-xs text-gray-700 dark:text-gray-300 break-all leading-relaxed cursor-text"
                onDoubleClick={() => setEditingItemId(item.id)}
                title="Double-click to edit"
              >
                {item.text}
              </span>
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
              {isUrl(item.text) && (
                <a
                  href={item.text}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nodrag nopan w-4 h-4 flex items-center justify-center text-blue-500 hover:text-blue-700 transition-colors"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={9} />
                </a>
              )}
              <button
                className="nodrag nopan w-4 h-4 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
              >
                <Trash2 size={9} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add new item */}
      <div className="px-2 py-2 border-t border-blue-100 dark:border-blue-800 shrink-0 bg-blue-50/50 dark:bg-blue-900/10">
        <form
          onSubmit={(e) => { e.preventDefault(); addItem(); }}
          className="flex gap-1"
        >
          <input
            ref={addInputRef}
            className="nodrag nopan flex-1 min-w-0 text-[11px] px-2 py-1 rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 placeholder-gray-400"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Paste link or reference…"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button
            type="submit"
            className="nodrag nopan w-6 h-6 flex items-center justify-center rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors shrink-0"
          >
            <Plus size={11} />
          </button>
        </form>
      </div>
    </div>
  );
}
