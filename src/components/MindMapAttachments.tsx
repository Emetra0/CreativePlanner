import { useCallback, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Paperclip, Download, Trash2, FileText, FileImage, FileAudio, FileVideo, File, Upload } from 'lucide-react';
import { Node } from 'reactflow';
import { compressImageFile } from '@/lib/imageCompression';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NodeAttachment {
  id: string;
  name: string;
  type: string;   // MIME type
  size: number;   // bytes
  data: string;   // base64 data URL
  addedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ type, size = 16 }: { type: string; size?: number }) {
  if (type.startsWith('image/'))  return <FileImage  size={size} className="text-purple-500" />;
  if (type.startsWith('audio/'))  return <FileAudio  size={size} className="text-pink-500" />;
  if (type.startsWith('video/'))  return <FileVideo  size={size} className="text-red-500" />;
  if (type === 'application/pdf' || type.includes('text')) return <FileText size={size} className="text-blue-500" />;
  return <File size={size} className="text-gray-400" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MindMapAttachmentsProps {
  selectedNodeId: string | null;
}

export default function MindMapAttachments({ selectedNodeId }: MindMapAttachmentsProps) {
  const { nodes, updateNodeData } = useStore((s) => ({
    nodes: s.nodes as Node[],
    updateNodeData: s.updateNodeData,
  }));

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedNode = selectedNodeId
    ? (nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null;

  const attachments: NodeAttachment[] = Array.isArray(selectedNode?.data?.attachments)
    ? (selectedNode!.data.attachments as NodeAttachment[])
    : [];

  // ── Add files ───────────────────────────────────────────────────────────────

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!selectedNodeId) return;

      const newAttachments = await Promise.all(
        files.map(
          async (file) => {
            const imageAsset = await compressImageFile(file, { maxDimension: 1600, jpegQuality: 0.8 });

            return {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name,
              type: imageAsset.type,
              size: imageAsset.size,
              data: imageAsset.dataUrl,
              addedAt: Date.now(),
            };
          }
        )
      );

      updateNodeData(selectedNodeId, {
        attachments: [...attachments, ...newAttachments],
      });
    },
    [selectedNodeId, attachments, updateNodeData]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length) addFiles(files);
    },
    [addFiles]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const deleteAttachment = useCallback(
    (id: string) => {
      if (!selectedNodeId) return;
      updateNodeData(selectedNodeId, {
        attachments: attachments.filter((a) => a.id !== id),
      });
    },
    [selectedNodeId, attachments, updateNodeData]
  );

  // ── Download ─────────────────────────────────────────────────────────────────

  const downloadAttachment = (att: NodeAttachment) => {
    const a = document.createElement('a');
    a.href = att.data;
    a.download = att.name;
    a.click();
  };

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (!selectedNode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-6 gap-3">
        <Paperclip size={36} strokeWidth={1.2} />
        <p className="text-sm text-center">Select a node to manage its attachments</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Node title */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
          Attachments for
        </p>
        <h3 className="font-bold text-gray-800 dark:text-white text-sm leading-tight line-clamp-2">
          {selectedNode.data?.label || 'Untitled Node'}
        </h3>
      </div>

      {/* Drop zone / file list */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 min-h-0"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {attachments.length === 0 ? (
          /* Empty drop zone */
          <div
            className="h-full min-h-[120px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-pointer hover:border-blue-400 hover:text-blue-400 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={24} strokeWidth={1.5} />
            <p className="text-xs text-center leading-relaxed px-4">
              Drop files here or click to add an attachment
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((att) => (
              <li
                key={att.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 group"
              >
                <AttachmentIcon type={att.type} size={18} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate leading-tight">
                    {att.name}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    {formatBytes(att.size)}{att.type.startsWith('image/') ? ' · optimized' : ''}
                  </p>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-500 transition-all"
                  title="Download"
                  onClick={() => downloadAttachment(att)}
                >
                  <Download size={12} />
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-red-400 transition-all"
                  title="Remove"
                  onClick={() => deleteAttachment(att.id)}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}

            {/* Drop-more zone at the bottom */}
            <li
              className="flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 text-xs cursor-pointer hover:border-blue-400 hover:text-blue-400 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={12} />
              Add more files
            </li>
          </ul>
        )}
      </div>

      {/* Add button at bottom */}
      <div className="px-3 pb-3 pt-1 shrink-0 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          <Paperclip size={12} />
          Add Attachment
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
