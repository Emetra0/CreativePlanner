import React, { useState, useRef, useCallback, useEffect } from 'react';
import { NodeProps, Handle, Position } from 'reactflow';
import { Image as ImageIcon, Trash2, RefreshCw } from 'lucide-react';
import MindmapNodePresence from './MindmapNodePresence';
import { useAppTranslation } from '@/lib/appTranslations';

export interface MoodboardNodeData {
  imageUrl?: string;
  caption?: string;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const H = '!bg-purple-400 !w-3 !h-3 opacity-0 group-hover:opacity-100 transition-opacity';

export default function MoodboardNode({ id, data, selected }: NodeProps<MoodboardNodeData>) {
  const { t } = useAppTranslation();
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionVal, setCaptionVal] = useState(data.caption || '');
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setCaptionVal(data.caption || ''); }, [data.caption]);

  const triggerUpdate = useCallback((updates: Partial<MoodboardNodeData>) => {
    window.dispatchEvent(new CustomEvent('moodboard:update-node', { detail: { nodeId: id, updates } }));
  }, [id]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('moodboard:delete-node', { detail: { nodeId: id } }));
  };

  const openFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        const url = await readFile(file);
        triggerUpdate({ imageUrl: url });
      }
    };
    input.click();
  };

  const handleImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const url = await readFile(file);
      triggerUpdate({ imageUrl: url });
    }
  };

  const commitCaption = useCallback(() => {
    triggerUpdate({ caption: captionVal });
    setIsEditingCaption(false);
  }, [captionVal, triggerUpdate]);

  useEffect(() => {
    if (isEditingCaption && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditingCaption]);

  return (
    <div
      className={`group relative flex flex-col transition-all select-none ${
        selected
          ? 'drop-shadow-[0_0_0_2px_#a855f7]'
          : ''
      }`}
      style={{ width: 240 }}
    >
      <MindmapNodePresence nodeId={id} className="top-2 left-2" />
      {/* Handles — all source, one per side, visible on hover */}
      <Handle
        type="source" position={Position.Top} id="top"
        style={{ top: -6, left: '50%', transform: 'translateX(-50%)' }}
        className={H}
      />
      <Handle
        type="source" position={Position.Right} id="right"
        style={{ right: -6, top: '50%', transform: 'translateY(-50%)' }}
        className={H}
      />
      <Handle
        type="source" position={Position.Bottom} id="bottom"
        style={{ bottom: -6, left: '50%', transform: 'translateX(-50%)' }}
        className={H}
      />
      <Handle
        type="source" position={Position.Left} id="left"
        style={{ left: -6, top: '50%', transform: 'translateY(-50%)' }}
        className={H}
      />

      {/* Card */}
      <div
        className={`relative flex flex-col rounded-xl overflow-hidden border-2 bg-white dark:bg-gray-800 transition-all ${
          selected
            ? 'border-purple-500 shadow-[0_8px_32px_rgba(168,85,247,0.25)]'
            : 'border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-500 shadow-md hover:shadow-xl'
        }`}
      >
        {/* Toolbar: replace + delete — visible on hover, top-right */}
        <div className="absolute top-1.5 right-1.5 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); openFilePicker(); }}
            className="w-6 h-6 bg-gray-700/80 hover:bg-purple-600 text-white rounded-full flex items-center justify-center shadow-md"
            title={t('moodboard.nodeReplaceImage')}
          >
            <RefreshCw size={10} />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
            className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md"
            title={t('moodboard.nodeDelete')}
          >
            <Trash2 size={10} />
          </button>
        </div>

      {/*  Image area  natural aspect ratio  */}
      <div
        className={`relative overflow-hidden transition-colors ${
          isDragOver
            ? 'bg-purple-50 dark:bg-purple-900/20 ring-2 ring-inset ring-purple-400'
            : 'bg-gray-100 dark:bg-gray-700'
        }`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.stopPropagation(); setIsDragOver(false); }}
        onDrop={handleImageDrop}
        onClick={data.imageUrl ? undefined : openFilePicker}
        style={{ cursor: data.imageUrl ? 'default' : 'pointer' }}
      >
        {data.imageUrl ? (
          <img
            src={data.imageUrl}
            alt={data.caption || ''}
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 480 }}
            draggable={false}
          />
        ) : (
          <div
            className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 pointer-events-none px-4 text-center py-10"
          >
            <ImageIcon size={32} className={isDragOver ? 'text-purple-400' : ''} />
            <span className="text-xs leading-relaxed">
              {isDragOver ? t('moodboard.nodeDropToAddImage') : t('moodboard.nodeClickOrDropImage')}
            </span>
          </div>
        )}
      </div>

      {/*  Caption  */}
      <div className="px-3 py-2.5 min-h-[40px] bg-white dark:bg-gray-800">
        {isEditingCaption ? (
          <textarea
            ref={textareaRef}
            value={captionVal}
            onChange={(e) => setCaptionVal(e.target.value)}
            onBlur={commitCaption}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitCaption(); }
              if (e.key === 'Escape') { setCaptionVal(data.caption || ''); setIsEditingCaption(false); }
            }}
            rows={2}
            placeholder={t('moodboard.nodeCaptionPlaceholder')}
            className="w-full text-xs text-gray-700 dark:text-gray-300 bg-transparent outline-none resize-none border-b border-purple-400 pb-0.5 leading-relaxed"
          />
        ) : (
          <p
            className="text-xs text-gray-600 dark:text-gray-300 cursor-text leading-relaxed"
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditingCaption(true); }}
            title={t('moodboard.nodeEditCaptionTitle')}
          >
            {data.caption
              ? data.caption
              : <span className="text-gray-300 dark:text-gray-600 italic">{t('moodboard.nodeEmptyCaption')}</span>}
          </p>
        )}
      </div>
      </div>{/* /card */}
    </div>
  );
}