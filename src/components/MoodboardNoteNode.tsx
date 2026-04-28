import { useState, useCallback, useRef } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import { StickyNote, X, Palette } from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';

type NoteColorLabelKey =
  | 'moodboard.noteColorYellow'
  | 'moodboard.noteColorBlue'
  | 'moodboard.noteColorGreen'
  | 'moodboard.noteColorPink'
  | 'moodboard.noteColorPurple'
  | 'moodboard.noteColorOrange'
  | 'moodboard.noteColorGray'
  | 'moodboard.noteColorDark';

interface NoteColorOption {
  bg: string;
  border: string;
  labelKey: NoteColorLabelKey;
  dark?: boolean;
}

const NOTE_COLORS: NoteColorOption[] = [
  { bg: '#fef9c3', border: '#fde68a', labelKey: 'moodboard.noteColorYellow' },
  { bg: '#dbeafe', border: '#bfdbfe', labelKey: 'moodboard.noteColorBlue' },
  { bg: '#dcfce7', border: '#bbf7d0', labelKey: 'moodboard.noteColorGreen' },
  { bg: '#fce7f3', border: '#fbcfe8', labelKey: 'moodboard.noteColorPink' },
  { bg: '#ede9fe', border: '#ddd6fe', labelKey: 'moodboard.noteColorPurple' },
  { bg: '#ffedd5', border: '#fed7aa', labelKey: 'moodboard.noteColorOrange' },
  { bg: '#f1f5f9', border: '#e2e8f0', labelKey: 'moodboard.noteColorGray' },
  { bg: '#1e293b', border: '#334155', labelKey: 'moodboard.noteColorDark', dark: true },
];

interface MoodboardNoteNodeProps {
  id: string;
  data: {
    title?: string;
    content?: string;
    bgColor?: string;
    borderColor?: string;
    dark?: boolean;
  };
  selected?: boolean;
}

export default function MoodboardNoteNode({ id, data, selected }: MoodboardNoteNodeProps) {
  const { t } = useAppTranslation();
  const [title, setTitle] = useState(data.title ?? '');
  const [content, setContent] = useState(data.content ?? '');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [bgColor, setBgColor] = useState(data.bgColor ?? NOTE_COLORS[0].bg);
  const [borderColor, setBorderColor] = useState(data.borderColor ?? NOTE_COLORS[0].border);
  const [isDark, setIsDark] = useState(data.dark ?? false);
  const colorRef = useRef<HTMLDivElement>(null);

  const dispatch = useCallback(
    (updates: Partial<typeof data>) => {
      window.dispatchEvent(new CustomEvent('moodboard:update-node', { detail: { nodeId: id, updates } }));
    },
    [id],
  );

  const handleTitleChange = (v: string) => {
    setTitle(v);
    dispatch({ title: v });
  };

  const handleContentChange = (v: string) => {
    setContent(v);
    dispatch({ content: v });
  };

  const handleColorSelect = (c: NoteColorOption) => {
    setBgColor(c.bg);
    setBorderColor(c.border);
    setIsDark(!!c.dark);
    dispatch({ bgColor: c.bg, borderColor: c.border, dark: !!c.dark });
    setShowColorPicker(false);
  };

  const handleDelete = () => {
    window.dispatchEvent(new CustomEvent('moodboard:delete-node', { detail: { nodeId: id } }));
  };

  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const subtextColor = isDark ? '#94a3b8' : '#64748b';
  const dividerColor = isDark ? '#334155' : '#e2e8f0';

  return (
    <div
      className="relative group rounded-2xl shadow-md overflow-visible"
      style={{
        backgroundColor: bgColor,
        border: `2px solid ${selected ? '#6366f1' : borderColor}`,
        width: '100%',
        height: '100%',
        minWidth: 180,
        minHeight: 120,
        boxShadow: selected
          ? `0 0 0 2px #6366f1, 0 4px 16px rgba(99,102,241,0.15)`
          : '0 4px 16px rgba(0,0,0,0.10)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
        lineStyle={{ borderColor: '#6366f1', borderWidth: 1 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366f1', border: '2px solid white' }}
      />

      {/* Handles */}
      {(['top', 'bottom', 'left', 'right'] as Position[]).map((pos) => (
        <Handle
          key={pos}
          type="source"
          position={pos}
          id={pos}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: '#6366f1', width: 8, height: 8, border: '2px solid white' }}
        />
      ))}
      {(['top', 'bottom', 'left', 'right'] as Position[]).map((pos) => (
        <Handle
          key={`t-${pos}`}
          type="target"
          position={pos}
          id={`t-${pos}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: '#6366f1', width: 8, height: 8, border: '2px solid white' }}
        />
      ))}

      {/* Toolbar — show on hover/selected */}
      <div
        className="absolute -top-8 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ zIndex: 100 }}
      >
        <button
          onClick={() => setShowColorPicker((v) => !v)}
          className="p-1 rounded bg-white dark:bg-gray-700 shadow border border-gray-200 dark:border-gray-600 hover:bg-gray-50 transition-colors"
          title={t('moodboard.noteToolbarColor')}
        >
          <Palette size={12} color="#6366f1" />
        </button>
        <button
          onClick={handleDelete}
          className="p-1 rounded bg-white dark:bg-gray-700 shadow border border-gray-200 dark:border-gray-600 hover:bg-red-50 transition-colors"
          title={t('moodboard.noteToolbarDelete')}
        >
          <X size={12} color="#ef4444" />
        </button>

        {/* Color picker dropdown */}
        {showColorPicker && (
          <div
            ref={colorRef}
            className="absolute top-7 right-0 flex gap-1.5 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {NOTE_COLORS.map((c) => (
              <button
                key={c.labelKey}
                onClick={() => handleColorSelect(c)}
                title={t(c.labelKey)}
                className="w-5 h-5 rounded-full border-2 hover:scale-110 transition-transform"
                style={{
                  backgroundColor: c.bg,
                  borderColor: bgColor === c.bg ? '#6366f1' : c.border,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Note header */}
      <div
        className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5"
        style={{ borderBottom: `1px solid ${dividerColor}` }}
      >
        <StickyNote size={13} color={subtextColor} style={{ flexShrink: 0 }} />
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder={t('moodboard.noteTitlePlaceholder')}
          className="flex-1 text-[11px] font-bold bg-transparent border-none outline-none placeholder:opacity-50 truncate"
          style={{ color: textColor }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>

      {/* Note body */}
      <textarea
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder={t('moodboard.noteBodyPlaceholder')}
        className="w-full bg-transparent border-none outline-none resize-none text-xs leading-relaxed placeholder:opacity-40"
        style={{
          color: textColor,
          padding: '8px 12px 10px',
          height: 'calc(100% - 36px)',
          minHeight: 64,
          fontFamily: 'inherit',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
