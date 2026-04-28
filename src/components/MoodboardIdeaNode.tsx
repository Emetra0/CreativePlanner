import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeProps, Handle, Position } from 'reactflow';
import { Lightbulb, Trash2 } from 'lucide-react';
import { withOpacity } from '@/lib/colors';
import { useAppTranslation } from '@/lib/appTranslations';

export interface MoodboardIdeaNodeData {
  content: string;
  tags?: string[];
  color?: string;
}

const H = '!bg-purple-400 !w-3 !h-3 opacity-0 group-hover:opacity-100 transition-opacity';

export default function MoodboardIdeaNode({
  id,
  data,
  selected,
}: NodeProps<MoodboardIdeaNodeData>) {
  const { t } = useAppTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(data.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setVal(data.content); }, [data.content]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('moodboard:update-node', {
        detail: { nodeId: id, updates: { content: val } },
      }),
    );
    setIsEditing(false);
  }, [id, val]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent('moodboard:delete-node', { detail: { nodeId: id } }),
    );
  };

  const accent = data.color || '#eab308';

  return (
    <div
      className={`group relative rounded-xl border-2 border-l-[3px] transition-all select-none ${
        selected
          ? 'border-purple-500 shadow-lg shadow-purple-200/40 dark:shadow-purple-900/40'
          : 'border-gray-200 dark:border-gray-700 hover:border-purple-400 hover:shadow-md'
      } bg-white dark:bg-gray-800`}
      style={{ width: 240, borderLeftColor: accent }}
    >
      <Handle type="source" position={Position.Top}    id="top"    className={H} />
      <Handle type="source" position={Position.Right}  id="right"  className={H} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={H} />
      <Handle type="source" position={Position.Left}   id="left"   className={H} />

      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleDelete}
        className="absolute top-1.5 right-1.5 z-20 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
        title={t('moodboard.ideaDelete')}
      >
        <Trash2 size={10} />
      </button>

      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Lightbulb size={13} className="shrink-0" style={{ color: accent }} />
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: accent }}
          >
            {t('moodboard.toolIdea')}
          </span>
        </div>

        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setVal(data.content); setIsEditing(false); }
            }}
            rows={3}
            className="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent outline-none resize-none border-b border-purple-400 leading-relaxed"
          />
        ) : (
          <p
            className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed cursor-text min-h-[44px]"
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            title={t('moodboard.ideaEditTitle')}
          >
            {data.content
              ? data.content
              : <span className="text-gray-300 dark:text-gray-600 italic">{t('moodboard.ideaEmptyHint')}</span>
            }
          </p>
        )}

        {data.tags && data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {data.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: withOpacity(accent, 0.13, accent),
                  color: accent,
                  border: `1px solid ${withOpacity(accent, 0.27, accent)}`,
                }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
