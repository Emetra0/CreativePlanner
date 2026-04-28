import React from 'react';
import { NodeProps, Handle, Position } from 'reactflow';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppTranslation } from '@/lib/appTranslations';

export interface MoodboardRefNodeData {
  moodboardId: string;
  title: string;
}

const H = '!bg-purple-400 !w-3 !h-3 opacity-0 group-hover:opacity-100 transition-opacity';

export default function MoodboardRefNode({
  id,
  data,
  selected,
}: NodeProps<MoodboardRefNodeData>) {
  const navigate = useNavigate();
  const { t } = useAppTranslation();

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
          : 'border-purple-200 dark:border-purple-800 hover:border-purple-400 hover:shadow-md'
      } bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800`}
      style={{ width: 230 }}
    >
      <Handle type="source" position={Position.Top}    id="top"    className={H} />
      <Handle type="source" position={Position.Right}  id="right"  className={H} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={H} />
      <Handle type="source" position={Position.Left}   id="left"   className={H} />

      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleDelete}
        className="absolute top-1.5 right-1.5 z-20 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
        title={t('moodboard.referenceDelete')}
      >
        <Trash2 size={10} />
      </button>

      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🖼️</span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500 dark:text-purple-400">
              {t('moodboard.referenceBadge')}
            </p>
            <p className="text-sm font-bold text-gray-800 dark:text-white truncate">
              {data.title}
            </p>
          </div>
        </div>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/mindmap/moodboard?id=${data.moodboardId}`);
          }}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-800/50 rounded-lg py-1.5 transition-colors font-medium mt-1"
        >
          <ExternalLink size={11} />
          {t('moodboard.referenceOpen')}
        </button>
      </div>
    </div>
  );
}
