import React, { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { X, Type, Palette, Layers, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import ColorPicker from './ColorPicker';
import { ConfirmModal } from './Modal';

interface GroupDetailsProps {
  nodeId: string;
  onClose: () => void;
}

export default function GroupDetails({ nodeId, onClose }: GroupDetailsProps) {
  const nodes = useStore((state) => state.nodes);
  const updateNodeLabel = useStore((state) => state.updateNodeLabel);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const deleteNode = useStore((state) => state.deleteNode);
  const { theme } = useTheme();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isDarkTheme = theme === 'dark';

  const node = nodes.find((n) => n.id === nodeId);

  if (!node) return null;

  return (
    <div className={`absolute right-4 top-4 w-80 shadow-xl rounded-lg border flex flex-col z-50 animate-in slide-in-from-right-10 max-h-[calc(100vh-2rem)] ${isDarkTheme ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b rounded-t-lg ${isDarkTheme ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
        <h3 className={`font-bold flex items-center gap-2 ${isDarkTheme ? 'text-gray-200' : 'text-gray-700'}`}>
          <Layers size={18} className="text-blue-500" />
          Group Details
        </h3>
        <button 
          onClick={onClose}
          className={`transition-colors ${isDarkTheme ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-4 space-y-6 overflow-y-auto pb-8">
        {/* Title Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Type size={12} />
            Group Name
          </label>
          <input
            value={node.data.label}
            onChange={(e) => updateNodeLabel(nodeId, e.target.value)}
            className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-all ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
            placeholder="Enter group name..."
          />
        </div>

        {/* Color Picker */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Palette size={12} /> Color Theme
          </label>
          <ColorPicker 
            color={node.data.color || '#ffffff'} 
            onChange={(color) => updateNodeData(nodeId, { color })}
          />
        </div>

        {/* Info */}
        <div className={`p-3 rounded text-xs ${isDarkTheme ? 'bg-blue-900/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
          Items inside this group will be organized together in the Document view.
        </div>

        {/* Delete Button */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
                <Trash2 size={16} />
                Delete Group
            </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => { deleteNode(nodeId); onClose(); }}
        title="Delete Group"
        message="Are you sure you want to delete this group? This cannot be undone."
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}
