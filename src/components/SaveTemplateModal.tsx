import { useState } from 'react';
import { useAppTranslation } from '@/lib/appTranslations';
import { Save, X } from 'lucide-react';

interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, category: 'general' | 'planning' | 'analysis' | 'story' | 'personal' | 'custom') => void;
}

const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'planning', label: 'Planning' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'story', label: 'Story' },
  { id: 'personal', label: 'Personal' },
  { id: 'custom', label: 'Custom' },
] as const;

export default function SaveTemplateModal({ isOpen, onClose, onSave }: SaveTemplateModalProps) {
  const { t } = useAppTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<typeof CATEGORIES[number]['id']>('general');

  const categoryLabels: Record<typeof CATEGORIES[number]['id'], string> = {
    general: t('saveTemplateModal.categoryGeneral'),
    planning: t('saveTemplateModal.categoryPlanning'),
    analysis: t('saveTemplateModal.categoryAnalysis'),
    story: t('saveTemplateModal.categoryStory'),
    personal: t('saveTemplateModal.categoryPersonal'),
    custom: t('saveTemplateModal.categoryCustom'),
  };

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, description.trim(), category);
    setName('');
    setDescription('');
    setCategory('general');
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Save size={18} className="text-green-500" />
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">{t('saveTemplateModal.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {t('saveTemplateModal.templateName')} <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder={t('saveTemplateModal.templateNamePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {t('saveTemplateModal.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              placeholder={t('saveTemplateModal.descriptionPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {t('saveTemplateModal.category')}
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    category === cat.id
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {categoryLabels[cat.id]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {t('saveTemplateModal.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('saveTemplateModal.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
