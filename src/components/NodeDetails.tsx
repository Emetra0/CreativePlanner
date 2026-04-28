import React, { useState } from 'react';
import { X, BookOpen, AlignLeft, Tag, Heart, Type, Palette, Square, Circle, Box, Activity, Trash2, StickyNote } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useTheme } from 'next-themes';
import { useAppDialogs } from '@/components/AppDialogs';
import ColorPicker from './ColorPicker';
import MindMapNotes from './MindMapNotes';

interface NodeDetailsProps {
  nodeId: string;
  onClose: () => void;
  initialTab?: 'details' | 'notes';
}

export default function NodeDetails({ nodeId, onClose, initialTab = 'details' }: NodeDetailsProps) {
  const dialogs = useAppDialogs();
  const node = useStore((state) => state.nodes.find((n) => n.id === nodeId));
  const categories = useStore((state) => state.categories);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const updateNodeCategory = useStore((state) => state.updateNodeCategory);
  const updateNodeEdgeType = useStore((state) => state.updateNodeEdgeType);
  const deleteNode = useStore((state) => state.deleteNode);
  const themes = useThemeStore((state) => state.themes);
  const { theme } = useTheme();

  const isDarkTheme = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'details' | 'notes'>(initialTab);

  // Sync to external initialTab changes (e.g., sticky-note icon click while panel is open)
  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (!node) return null;

  const handleChange = (field: string, value: string) => {
    updateNodeData(nodeId, { [field]: value });
  };

  const handleStyleChange = (styleUpdate: any) => {
    updateNodeData(nodeId, { 
        style: { 
            ...(node.data.style || {}), 
            ...styleUpdate 
        } 
    });
  };

  return (
    <div className={`absolute right-4 top-4 w-80 shadow-xl rounded-lg border flex flex-col z-50 animate-in slide-in-from-right-10 max-h-[calc(100vh-2rem)] ${isDarkTheme ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 pt-3 pb-0 rounded-t-lg ${isDarkTheme ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <h3 className={`font-bold flex items-center gap-2 text-sm ${isDarkTheme ? 'text-gray-200' : 'text-gray-700'}`}>
          <AlignLeft size={16} className="text-blue-500" />
          {node.data.label}
        </h3>
        <button 
          onClick={onClose}
          className={`transition-colors ${isDarkTheme ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className={`flex border-b ${isDarkTheme ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'details'
              ? 'border-b-2 border-blue-500 text-blue-500'
              : isDarkTheme ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <AlignLeft size={13} />
          Details
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'notes'
              ? 'border-b-2 border-yellow-500 text-yellow-500'
              : isDarkTheme ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <StickyNote size={13} />
          Notes
        </button>
      </div>

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <MindMapNotes selectedNodeId={nodeId} />
        </div>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && <div className="p-4 space-y-6 overflow-y-auto pb-8">
        {/* Label */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Type size={12} />
            Title
          </label>
          <input
            className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-all ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
            value={node.data.label}
            onChange={(e) => handleChange('label', e.target.value)}
            placeholder="Node Title"
          />
        </div>

        {/* Appearance */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Palette size={12} /> Appearance
          </label>
          <div className="flex gap-2 mb-2">
             <button 
               onClick={() => handleStyleChange({ borderRadius: '9999px' })}
               className={`flex-1 py-2 rounded border flex items-center justify-center gap-2 transition-colors ${
                   node.data.style?.borderRadius === '9999px' 
                   ? (isDarkTheme ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-blue-50 border-blue-500 text-blue-600')
                   : (isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
               }`}
               title="Circle"
             >
               <Circle size={14} />
             </button>
             <button 
               onClick={() => handleStyleChange({ borderRadius: '10px' })}
               className={`flex-1 py-2 rounded border flex items-center justify-center gap-2 transition-colors ${
                   node.data.style?.borderRadius === '10px' 
                   ? (isDarkTheme ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-blue-50 border-blue-500 text-blue-600')
                   : (isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
               }`}
               title="Rounded"
             >
               <Square size={14} className="rounded-sm" />
             </button>
             <button 
               onClick={() => handleStyleChange({ borderRadius: '0px' })}
               className={`flex-1 py-2 rounded border flex items-center justify-center gap-2 transition-colors ${
                   node.data.style?.borderRadius === '0px' 
                   ? (isDarkTheme ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-blue-50 border-blue-500 text-blue-600')
                   : (isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
               }`}
               title="Square"
             >
               <Square size={14} />
             </button>
          </div>
          <ColorPicker 
            color={node.data.style?.backgroundColor || '#ffffff'} 
            onChange={(color) => handleStyleChange({ backgroundColor: color })}
          />
        </div>

        {/* Connections */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Activity size={12} /> Connections
          </label>
          <select
            className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-all ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
            value={node.data.outgoingEdgeType || ''}
            onChange={(e) => updateNodeEdgeType(nodeId, e.target.value)}
          >
            <option value="" className={isDarkTheme ? 'bg-gray-900' : 'bg-white'}>Default (Theme)</option>
            <option value="bezier" className={isDarkTheme ? 'bg-gray-900' : 'bg-white'}>Bezier</option>
            <option value="straight" className={isDarkTheme ? 'bg-gray-900' : 'bg-white'}>Straight</option>
            <option value="step" className={isDarkTheme ? 'bg-gray-900' : 'bg-white'}>Step</option>
            <option value="smoothstep" className={isDarkTheme ? 'bg-gray-900' : 'bg-white'}>Smooth</option>
          </select>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Tag size={12} /> Category
          </label>
          <select
            className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-all ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
            value={node.data.category || 'default'}
            onChange={(e) => updateNodeCategory(nodeId, e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id} className={isDarkTheme ? 'bg-gray-900' : 'bg-white'}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
             Description / Lore
          </label>
          <textarea
            className={`w-full p-2 border rounded h-32 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
            placeholder="Add details, lore, or notes here..."
            value={node.data.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
          />
        </div>

        {/* Bible Reference */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <BookOpen size={12} /> Bible Reference
          </label>
          <input
            className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all ${isDarkTheme ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
            placeholder="e.g. Genesis 1:1"
            value={node.data.reference || ''}
            onChange={(e) => handleChange('reference', e.target.value)}
          />
        </div>

        {/* Delete Button */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={async () => {
                if (await dialogs.confirm({
                  title: 'Delete node',
                  message: 'Are you sure you want to delete this node?',
                  confirmLabel: 'Delete',
                  isDanger: true,
                })) {
                        deleteNode(nodeId);
                        onClose();
                    }
                }}
                className="w-full py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
                <Trash2 size={16} />
                Delete Node
            </button>
        </div>
      </div>}
    </div>
  );
}
