import { X } from 'lucide-react';
import { KEYBIND_DEFINITIONS, type KeybindScope, formatKeybindCombo } from '@/lib/keybinds';

type ShortcutHelpItem = {
  combo: string;
  description: string;
};

interface ShortcutHelpPanelProps {
  scope: KeybindScope;
  keybinds: Record<string, string>;
  badge: string;
  title: string;
  description: string;
  footerText: string;
  manageLabel: string;
  onClose: () => void;
  onManage: () => void;
  className?: string;
  extraItems?: ShortcutHelpItem[];
}

export default function ShortcutHelpPanel({
  scope,
  keybinds,
  badge,
  title,
  description,
  footerText,
  manageLabel,
  onClose,
  onManage,
  className,
  extraItems = [],
}: ShortcutHelpPanelProps) {
  const items: ShortcutHelpItem[] = [
    ...KEYBIND_DEFINITIONS
      .filter((definition) => definition.scope === scope)
      .map((definition) => ({
        combo: formatKeybindCombo(definition.action, keybinds),
        description: definition.description,
      })),
    ...extraItems,
  ];

  return (
    <div
      className={className ?? 'rounded-2xl border border-stone-200 bg-white/96 p-4 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/96'}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-gray-500">{badge}</div>
          <h3 className="mt-1 text-base font-semibold text-stone-900 dark:text-gray-100">{title}</h3>
          <p className="mt-1 text-xs text-stone-500 dark:text-gray-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          title={manageLabel}
        >
          <X size={16} />
        </button>
      </div>
      <div className="max-h-[min(50vh,28rem)] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={`${item.combo}-${item.description}`} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
            <span className="text-sm font-medium text-stone-700 dark:text-gray-200">{item.description}</span>
            <span className="shrink-0 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">{item.combo}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-stone-500 dark:text-gray-400">{footerText}</div>
        <button
          type="button"
          onClick={onManage}
          className="shrink-0 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {manageLabel}
        </button>
      </div>
    </div>
  );
}