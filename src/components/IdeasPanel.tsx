import React, { useState } from 'react';
import { useAppTranslation } from '@/lib/appTranslations';
import { useIdeaStore } from '@/store/useIdeaStore';
import { Plus, Trash2, Lightbulb, X } from 'lucide-react';

export default function IdeasPanel({ className = "" }: { className?: string }) {
  const { t, language } = useAppTranslation();
  const { ideas, addIdea, removeIdea } = useIdeaStore();
  const [newIdea, setNewIdea] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdea.trim()) return;
    addIdea(newIdea);
    setNewIdea('');
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Lightbulb size={18} className="text-yellow-500" />
          {t('ideasPanel.title')}
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
          {ideas.length}
        </span>
      </div>

      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newIdea}
            onChange={(e) => setNewIdea(e.target.value)}
            placeholder={t('ideasPanel.placeholder')}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500/50 text-sm text-gray-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={!newIdea.trim()}
            className="p-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={18} />
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {ideas.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            {t('ideasPanel.empty')}
          </div>
        ) : (
          ideas.map((idea) => (
            <div
              key={idea.id}
              className="group relative bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-yellow-200 dark:hover:border-yellow-900/30 transition-colors"
            >
              <p className="text-sm text-gray-700 dark:text-gray-300 pr-6 break-words">
                {idea.content}
              </p>
              <button
                onClick={() => removeIdea(idea.id)}
                className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
              <div className="mt-2 text-[10px] text-gray-400">
                {new Intl.DateTimeFormat(language).format(new Date(idea.createdAt))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
