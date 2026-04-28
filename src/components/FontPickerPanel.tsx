import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface FontPickerOption {
  id: string;
  label: string;
  description?: string;
  previewFamily: string;
}

export interface FontPickerSection {
  id: string;
  title: string;
  items: FontPickerOption[];
  emptyMessage?: string;
}

interface FontPickerPanelProps {
  sections: FontPickerSection[];
  selectedId: string;
  onSelect: (id: string) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  searchPlaceholder: string;
  toolbar?: React.ReactNode;
  listClassName?: string;
  noMatchesMessage?: string;
}

export default function FontPickerPanel({
  sections,
  selectedId,
  onSelect,
  searchValue,
  onSearchValueChange,
  searchPlaceholder,
  toolbar,
  listClassName = 'max-h-[22rem]',
  noMatchesMessage,
}: FontPickerPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const trimmedSearchValue = searchValue.trim();
  const visibleItemCount = sections.reduce((total, section) => total + section.items.length, 0);
  const selectedOption = useMemo(
    () => sections.flatMap((section) => section.items).find((font) => font.id === selectedId) ?? null,
    [sections, selectedId],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      onSearchValueChange('');
    }
  }, [isOpen, onSearchValueChange]);

  return (
    <div ref={panelRef} className="relative space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Font</div>
          <div className="mt-1 truncate text-base font-semibold text-gray-900 dark:text-white" style={{ fontFamily: selectedOption?.previewFamily }}>
            {selectedOption?.label ?? 'Select a font'}
          </div>
          {selectedOption?.description ? (
            <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{selectedOption.description}</div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 text-right">
          <div className="truncate text-sm text-gray-700 dark:text-gray-200" style={{ fontFamily: selectedOption?.previewFamily }}>
            Aa Bb Cc 123
          </div>
          <div className="mt-1 text-[11px] text-gray-400">{visibleItemCount} fonts</div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 z-40 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={searchValue}
                onChange={(event) => onSearchValueChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-700 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
            </div>
            {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
          </div>

          <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
            Font List
          </div>

          {visibleItemCount > 0 ? (
            <div className={`mt-3 space-y-4 overflow-y-auto pr-1 ${listClassName}`}>
              {sections.map((section) => (
                <div key={section.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{section.title}</h5>
                    <span className="text-xs text-gray-400">{section.items.length}</span>
                  </div>

                  {section.items.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                      {section.items.map((font) => {
                        const isActive = font.id === selectedId;

                        return (
                          <button
                            type="button"
                            key={`${section.id}-${font.id}`}
                            onClick={() => {
                              onSelect(font.id);
                              setIsOpen(false);
                            }}
                            className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors last:border-b-0 dark:border-gray-700 ${
                              isActive
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}
                          >
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                              {isActive ? <Check className="h-4 w-4" /> : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{font.label}</div>
                              {font.description ? (
                                <div className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{font.description}</div>
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1 text-right">
                              <div className="truncate text-sm text-gray-800 dark:text-gray-100" style={{ fontFamily: font.previewFamily }}>
                                Aa Bb Cc 123
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : section.emptyMessage && (!trimmedSearchValue || visibleItemCount > 0) ? (
                    <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                      {section.emptyMessage}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
              {noMatchesMessage || `No fonts match "${trimmedSearchValue}".`}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}