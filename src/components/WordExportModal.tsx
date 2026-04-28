import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Modal } from '@/components/Modal';
import FontPickerPanel, { type FontPickerSection } from '@/components/FontPickerPanel';
import { useAppTranslation } from '@/lib/appTranslations';
import type { WordExportOptions } from '@/lib/fontSettings';

interface FontChoice {
  id: string;
  label: string;
  cssFamily: string;
  description: string;
  group: 'defaults' | 'fonts';
}

interface WordExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: WordExportOptions) => void;
  onExportPdf?: (options: WordExportOptions) => void;
  initialOptions: WordExportOptions;
  availableFonts: FontChoice[];
}

export default function WordExportModal({
  isOpen,
  onClose,
  onExport,
  onExportPdf,
  initialOptions,
  availableFonts,
}: WordExportModalProps) {
  const { t } = useAppTranslation();
  const [options, setOptions] = useState<WordExportOptions>(initialOptions);
  const [fontSearchQuery, setFontSearchQuery] = useState('');
  const deferredFontSearchQuery = useDeferredValue(fontSearchQuery);

  const presetOptions: { value: WordExportOptions['preset']; label: string; description: string }[] = [
    { value: 'modern', label: t('wordExportModal.presetModern'), description: t('wordExportModal.presetModernDescription') },
    { value: 'classic', label: t('wordExportModal.presetClassic'), description: t('wordExportModal.presetClassicDescription') },
    { value: 'minimal', label: t('wordExportModal.presetMinimal'), description: t('wordExportModal.presetMinimalDescription') },
  ];

  useEffect(() => {
    if (!isOpen) return;

    const availableFontIds = new Set(availableFonts.map((font) => font.id));
    setOptions({
      ...initialOptions,
      fontId: availableFontIds.has(initialOptions.fontId) ? initialOptions.fontId : availableFonts[0]?.id || initialOptions.fontId,
    });
  }, [availableFonts, initialOptions, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setFontSearchQuery('');
  }, [isOpen]);

  const selectedFont = availableFonts.find((font) => font.id === options.fontId) || availableFonts[0];
  const normalizedFontSearchQuery = deferredFontSearchQuery.trim().toLowerCase();
  const fontSections = useMemo<FontPickerSection[]>(() => {
    const matchesQuery = (font: FontChoice) => {
      if (!normalizedFontSearchQuery) return true;
      return `${font.label} ${font.description}`.toLowerCase().includes(normalizedFontSearchQuery);
    };

    const defaultItems = availableFonts
      .filter((font) => font.group === 'defaults' && matchesQuery(font))
      .map((font) => ({
        id: font.id,
        label: font.label,
        description: font.description,
        previewFamily: font.cssFamily,
      }));

    const extraItems = availableFonts
      .filter((font) => font.group === 'fonts' && matchesQuery(font))
      .map((font) => ({
        id: font.id,
        label: font.label,
        description: font.description,
        previewFamily: font.cssFamily,
      }));

    const sections: FontPickerSection[] = [
      {
        id: 'defaults',
        title: t('wordExportModal.defaultFonts'),
        emptyMessage: normalizedFontSearchQuery ? t('wordExportModal.defaultFontsNoMatch') : t('wordExportModal.defaultFontsEmpty'),
        items: defaultItems,
      },
    ];

    if (availableFonts.some((font) => font.group === 'fonts')) {
      sections.push({
        id: 'fonts',
        title: t('wordExportModal.fonts'),
        emptyMessage: normalizedFontSearchQuery ? t('wordExportModal.fontsNoMatch') : t('wordExportModal.fontsEmpty'),
        items: extraItems,
      });
    }

    return sections;
  }, [availableFonts, normalizedFontSearchQuery, t]);
  const visibleFontCount = fontSections.reduce((total, section) => total + section.items.length, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('wordExportModal.title')}
      icon={<FileText className="text-blue-500" size={24} />}
      description={t('wordExportModal.description')}
      widthClassName="w-[42rem]"
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t('wordExportModal.cancel')}
          </button>
          {onExportPdf ? (
            <button
              type="button"
              onClick={() => onExportPdf(options)}
              className="px-5 py-2.5 text-sm font-medium rounded-lg transition-colors border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {t('wordExportModal.exportPdf')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onExport(options)}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30 rounded-lg transition-all transform active:scale-95"
          >
            {t('wordExportModal.exportDocx')}
          </button>
        </>
      )}
    >
      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('wordExportModal.documentStyle')}</label>
            <div className="grid gap-2">
              {presetOptions.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setOptions((current) => ({ ...current, preset: preset.value }))}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${options.preset === preset.value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}`}
                >
                  <div className="text-sm font-semibold">{preset.label}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('wordExportModal.font')}</label>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <FontPickerPanel
                sections={fontSections}
                selectedId={options.fontId}
                onSelect={(fontId) => setOptions((current) => ({ ...current, fontId }))}
                searchValue={fontSearchQuery}
                onSearchValueChange={setFontSearchQuery}
                searchPlaceholder={t('wordExportModal.searchFontsPlaceholder')}
                listClassName="max-h-[17rem]"
                toolbar={<span className="text-xs text-gray-500 dark:text-gray-400">{t('wordExportModal.shownCount', { count: String(visibleFontCount) })}</span>}
                noMatchesMessage={t('wordExportModal.noMatches', { query: fontSearchQuery.trim() })}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('wordExportModal.fontHelp')}</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('wordExportModal.includeInExport')}</label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={options.includeNotes}
                onChange={(event) => setOptions((current) => ({ ...current, includeNotes: event.target.checked }))}
              />
              {t('wordExportModal.includeNotes')}
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={options.includeImages}
                onChange={(event) => setOptions((current) => ({ ...current, includeImages: event.target.checked }))}
              />
              {t('wordExportModal.includeImages')}
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={options.includeAttachmentImages}
                onChange={(event) => setOptions((current) => ({ ...current, includeAttachmentImages: event.target.checked }))}
              />
              {t('wordExportModal.includeAttachmentImages')}
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{t('wordExportModal.preview')}</p>
          <div className="mt-4 rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800" style={{ fontFamily: selectedFont?.cssFamily }}>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-white">{t('wordExportModal.previewTitle')}</h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('wordExportModal.previewSubtitle')}</p>
            <div className="mt-5 space-y-3">
              <div>
                <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t('wordExportModal.previewBranch')}</p>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{t('wordExportModal.previewBody')}</p>
              </div>
              <div className={`rounded-lg px-3 py-2 text-sm ${options.preset === 'modern' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : options.preset === 'classic' ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>
                {options.includeNotes ? t('wordExportModal.previewNotesIncluded') : t('wordExportModal.previewNotesOmitted')}
              </div>
              {options.includeImages && (
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-400 dark:border-gray-600">
                  {t('wordExportModal.previewImagesIncluded')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}