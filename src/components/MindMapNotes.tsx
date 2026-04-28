import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useTheme } from 'next-themes';
import StarterKit from '@tiptap/starter-kit';
import CharacterCount from '@tiptap/extension-character-count';
import Color from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, ChevronDown, Clipboard, Columns, Eraser, GripVertical, Grid2x2, Heading1, Heading2, Heading3, Highlighter, Italic, Link2, Link2Off, List, ListOrdered, Minus, Palette, Pilcrow, Plus, Quote, Redo2, Rows, Search, SeparatorHorizontal, Type, Underline as UnderlineIcon, Undo2 } from 'lucide-react';
import { Node } from 'reactflow';
import { useAppTranslation } from '@/lib/appTranslations';
import { useStore } from '@/store/useStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { BUILT_IN_FONT_PRESETS, buildCustomFontCssFamily, resolveFontChoice } from '@/lib/fontSettings';
import { plainTextToTableGrid, tableGridToHtml } from '@/lib/tableGrid';
import { FontSize } from '@/components/editor/extensions/FontSize';
import { NotesImageTransfer } from '@/components/editor/extensions/NotesImageTransfer';
import { ResizableImage } from '@/components/editor/extensions/ResizableImage';
import { TableCellBackground, TableHeaderBackground } from '@/components/editor/extensions/TableCellBackground';
import FontPickerPanel, { type FontPickerSection } from '@/components/FontPickerPanel';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import ColorPicker from './ColorPicker';

interface MindMapNotesProps {
  selectedNodeId: string | null;
}

interface TableOverlayState {
  top: number;
  left: number;
  width: number;
  height: number;
  rowCenters: number[];
  columnCenters: number[];
}

interface EditorToolbarState {
  fontFamily: string;
  fontSize: string;
  textColor: string;
  highlightColor: string;
  blockStyle: string;
  isInsideTable: boolean;
  tableCellBackgroundColor: string;
}

const FONT_SIZE_OPTIONS = ['12', '14', '16', '18', '20', '24', '32'];
const BASE_RIBBON_TABS = ['home', 'insert', 'layout'] as const;
type RibbonTab = typeof RIBBON_TABS[number];
const RIBBON_TABS = [...BASE_RIBBON_TABS, 'table'] as const;
const TABLE_PICKER_ROWS = 8;
const TABLE_PICKER_COLUMNS = 10;

const RIBBON_CONTROL_CLASS = 'h-11 rounded-lg border px-3 text-[11px] font-medium transition-colors';
const RIBBON_PILL_CLASS = 'flex h-11 items-center rounded-lg border border-gray-200 bg-white px-3 text-[11px] text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200';

function IconButton({ title, active = false, disabled = false, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`${RIBBON_CONTROL_CLASS} ${disabled ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-600' : active ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/50 dark:bg-blue-500/15 dark:text-blue-200' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700'}`}
    >
      {children}
    </button>
  );
}

function ToolbarSelect({ value, onChange, title, options }: { value: string; onChange: (value: string) => void; title: string; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      title={title}
      onChange={(event) => onChange(event.target.value)}
      className={`${RIBBON_CONTROL_CLASS} border-gray-200 bg-white text-gray-700 outline-none focus:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function buildTableHtmlFromPlainText(value: string) {
  const grid = plainTextToTableGrid(value);
  return grid ? tableGridToHtml(grid) : null;
}

function RibbonSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[4.25rem] min-w-[8rem] shrink-0 flex-col justify-between border-r border-gray-200 px-2 py-1.5 last:border-r-0 dark:border-gray-700">
      <div className="flex items-center gap-1.5">{children}</div>
      <div className="pt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{title}</div>
    </div>
  );
}

function TableSizePicker({
  previewRows,
  previewColumns,
  headerRow,
  text,
  onClose,
  onPreview,
  onSelect,
  onToggleHeader,
}: {
  previewRows: number;
  previewColumns: number;
  headerRow: boolean;
  text: (value: string, params?: Record<string, string>) => string;
  onClose: () => void;
  onPreview: (rows: number, columns: number) => void;
  onSelect: (rows: number, columns: number) => void;
  onToggleHeader: (value: boolean) => void;
}) {
  return (
    <div className="flex min-w-[17rem] flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{text('Insert Table')}</div>
        <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
          {previewColumns} x {previewRows}
        </div>
      </div>
      <div className="grid grid-cols-10 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900">
        {Array.from({ length: TABLE_PICKER_ROWS * TABLE_PICKER_COLUMNS }, (_, index) => {
          const row = Math.floor(index / TABLE_PICKER_COLUMNS) + 1;
          const column = (index % TABLE_PICKER_COLUMNS) + 1;
          const active = row <= previewRows && column <= previewColumns;

          return (
            <button
              key={`${row}-${column}`}
              type="button"
              onMouseEnter={() => onPreview(row, column)}
              onFocus={() => onPreview(row, column)}
              onClick={() => {
                onSelect(row, column);
                onClose();
              }}
              className={`h-5 w-5 rounded-[4px] border transition-colors ${active ? 'border-orange-400 bg-orange-50 dark:border-orange-400 dark:bg-orange-500/10' : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-orange-400/50 dark:hover:bg-orange-500/10'}`}
              aria-label={text('Insert {{columns}} by {{rows}} table', { columns: String(column), rows: String(row) })}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <span>{text('Drag across the grid to choose the starting size.')}</span>
        <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <input className="accent-blue-500" type="checkbox" checked={headerRow} onChange={(event) => onToggleHeader(event.target.checked)} />
          {text('Header row')}
        </label>
      </div>
      <div className="space-y-1 border-t border-gray-200 pt-2 dark:border-gray-700">
        <button
          type="button"
          onClick={() => {
            onSelect(previewRows, previewColumns);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Grid2x2 size={14} />
          {text('Insert {{columns}} x {{rows}} table', { columns: String(previewColumns), rows: String(previewRows) })}
        </button>
        <button
          type="button"
          onClick={() => {
            onSelect(2, 2);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Rows size={14} />
          {text('Quick 2 x 2 table')}
        </button>
      </div>
    </div>
  );
}

function scheduleNodeSave(
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  nodeId: string | null,
  editor: Editor | null,
  updateNodeData: (nodeId: string, data: any) => void,
) {
  if (!nodeId || !editor) return;
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    updateNodeData(nodeId, { notes: editor.getHTML() });
  }, 400);
}

export default function MindMapNotes({ selectedNodeId }: MindMapNotesProps) {
  const { resolvedTheme } = useTheme();
  const { language, text } = useAppTranslation();
  const { nodes, updateNodeData } = useStore((state) => ({
    nodes: state.nodes as Node[],
    updateNodeData: state.updateNodeData,
  }));
  const appFontId = useSettingsStore((state) => state.appFontId);
  const customFonts = useSettingsStore((state) => state.customFonts);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNodeIdRef = useRef<string | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);
  const tableMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const fontMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const fontMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [linkDraft, setLinkDraft] = useState('https://');
  const [activeTab, setActiveTab] = useState<RibbonTab>('home');
  const [tableDraftRows, setTableDraftRows] = useState(3);
  const [tableDraftColumns, setTableDraftColumns] = useState(3);
  const [tableDraftHeader, setTableDraftHeader] = useState(true);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [tableContextMenu, setTableContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [tableMenuPosition, setTableMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [fontMenuPosition, setFontMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [tableOverlay, setTableOverlay] = useState<TableOverlayState | null>(null);
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  const [fontSearchQuery, setFontSearchQuery] = useState('');
  const deferredFontSearchQuery = useDeferredValue(fontSearchQuery);

  const selectedNode = selectedNodeId
    ? (nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null;
  const tabLabels: Record<RibbonTab, string> = {
    home: text('Write'),
    insert: text('Insert'),
    layout: text('Layout'),
    table: text('Table'),
  };
  const blockStyleOptions = [
    { value: 'paragraph', label: text('Paragraph') },
    { value: 'heading-1', label: text('Heading 1') },
    { value: 'heading-2', label: text('Heading 2') },
    { value: 'heading-3', label: text('Heading 3') },
    { value: 'blockquote', label: text('Quote') },
  ];

  const fontSections = useMemo<FontPickerSection[]>(() => {
    const normalizedFontSearchQuery = deferredFontSearchQuery.trim().toLowerCase();
    const builtInFontLabel = text('Built-in font');
    const savedOnDeviceLabel = text('Saved on this device');
    const addedFromUrlLabel = text('Added from URL');
    const uploadedFontLabel = text('Uploaded font');
    const matchesQuery = (label: string, description: string) => {
      if (!normalizedFontSearchQuery) return true;
      return `${label} ${description}`.toLowerCase().includes(normalizedFontSearchQuery);
    };

    const defaultFonts = BUILT_IN_FONT_PRESETS
      .filter((font) => matchesQuery(font.label, builtInFontLabel))
      .map((font) => ({
        id: font.cssFamily,
        label: font.label,
        description: builtInFontLabel,
        previewFamily: font.cssFamily,
      }));

    const addedFonts = customFonts
      .filter((font) => matchesQuery(font.name, font.source === 'local' ? savedOnDeviceLabel : font.source === 'url' ? addedFromUrlLabel : uploadedFontLabel))
      .map((font) => ({
        id: buildCustomFontCssFamily(font),
        label: font.name,
        description: font.source === 'local' ? savedOnDeviceLabel : font.source === 'url' ? addedFromUrlLabel : uploadedFontLabel,
        previewFamily: buildCustomFontCssFamily(font),
      }));

    return [
      {
        id: 'defaults',
        title: text('Default Fonts'),
        emptyMessage: normalizedFontSearchQuery ? text('No default fonts match this search.') : text('Default note fonts appear here.'),
        items: defaultFonts,
      },
      {
        id: 'fonts',
        title: text('Fonts'),
        emptyMessage: normalizedFontSearchQuery ? text('No added fonts match this search.') : text('Saved fonts for this workspace and device appear here.'),
        items: addedFonts,
      },
    ];
  }, [customFonts, deferredFontSearchQuery, text]);
  const availableFonts = useMemo(() => fontSections.flatMap((section) => section.items), [fontSections]);
  const defaultCssFont = resolveFontChoice(appFontId, customFonts).cssFamily;
  const defaultTextColor = resolvedTheme === 'dark' ? '#e2e8f0' : '#1e293b';
  const defaultHighlightColor = resolvedTheme === 'dark' ? '#854d0e' : '#fde68a';
  const getToolbarState = useCallback((currentEditor: Editor | null): EditorToolbarState => {
    const isInsideTable = !!currentEditor?.isActive('tableCell') || !!currentEditor?.isActive('tableHeader');
    const currentBlockStyle = currentEditor?.isActive('heading', { level: 1 })
      ? 'heading-1'
      : currentEditor?.isActive('heading', { level: 2 })
        ? 'heading-2'
        : currentEditor?.isActive('heading', { level: 3 })
          ? 'heading-3'
          : currentEditor?.isActive('blockquote')
            ? 'blockquote'
            : 'paragraph';
    const activeTableNode = currentEditor?.isActive('tableHeader') ? 'tableHeader' : 'tableCell';

    return {
      fontFamily: currentEditor?.getAttributes('textStyle').fontFamily || defaultCssFont,
      fontSize: String(currentEditor?.getAttributes('textStyle').fontSize || '16'),
      textColor: currentEditor?.getAttributes('textStyle').color || defaultTextColor,
      highlightColor: currentEditor?.getAttributes('highlight').color || defaultHighlightColor,
      blockStyle: currentBlockStyle,
      isInsideTable,
      tableCellBackgroundColor: isInsideTable
        ? currentEditor?.getAttributes(activeTableNode).backgroundColor || '#00000000'
        : '#00000000',
    };
  }, [defaultCssFont, defaultHighlightColor, defaultTextColor]);
  const [toolbarState, setToolbarState] = useState<EditorToolbarState>(() => getToolbarState(null));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      CharacterCount,
      Underline,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: text('Write notes here…') }),
      Color.configure({ types: ['textStyle'] }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      TextStyle,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize,
      ResizableImage.configure({ allowBase64: true }),
      NotesImageTransfer.configure({
        imageNodeType: 'resizableImage',
        imageWidth: '100',
        onDragStateChange: setIsImageDragOver,
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeaderBackground,
      TableCellBackground,
    ],
    editorProps: {
      attributes: {
        class:
          'min-h-full bg-white px-5 py-4 outline-none text-sm leading-relaxed text-gray-700 dark:bg-gray-900 dark:text-gray-200 ' +
          '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 ' +
          '[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-gray-200 dark:[&_img]:border-gray-700 ' +
          '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic dark:[&_blockquote]:border-gray-600 ' +
          '[&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400 ' +
          '[&_table]:my-3 [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:border [&_table]:border-gray-200 dark:[&_table]:border-gray-700 ' +
          '[&_td]:min-w-[5rem] [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1.5 dark:[&_td]:border-gray-700 ' +
          '[&_th]:min-w-[5rem] [&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1.5 dark:[&_th]:border-gray-700 ' +
          '[&_td.selectedCell]:bg-blue-100/80 dark:[&_td.selectedCell]:bg-blue-900/30 [&_th.selectedCell]:bg-blue-100/80 dark:[&_th.selectedCell]:bg-blue-900/30 ',
      },
      handlePaste(view, event) {
        const html = event.clipboardData?.getData('text/html');
        if (html) return false;

        const plain = event.clipboardData?.getData('text/plain') || '';
        const tableHtml = buildTableHtmlFromPlainText(plain);
        if (!tableHtml) return false;

        event.preventDefault();
        const { from, to } = view.state.selection;
        editor?.chain().focus().insertContentAt({ from, to }, tableHtml).run();
        return true;
      },
      handleDOMEvents: {
        contextmenu(view, event) {
          const mouseEvent = event as MouseEvent;
          const target = mouseEvent.target as HTMLElement | null;
          if (!target?.closest('td, th')) return false;

          const position = view.posAtCoords({ left: mouseEvent.clientX, top: mouseEvent.clientY });
          if (position) {
            const transaction = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos)));
            view.dispatch(transaction);
          }

          setTableContextMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY });
          mouseEvent.preventDefault();
          return true;
        },
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      scheduleNodeSave(saveTimerRef, selectedNodeId, currentEditor, updateNodeData);
    },
    content: selectedNode?.data?.notes ?? '',
    immediatelyRender: false,
  }, [language, selectedNodeId]);

  useEffect(() => {
    if (!editor) return;

    const nextContent = selectedNode?.data?.notes ?? '';
    if (lastNodeIdRef.current !== selectedNode?.id) {
      editor.commands.setContent(nextContent, false);
      editor.commands.setFontFamily(defaultCssFont);
      lastNodeIdRef.current = selectedNode?.id ?? null;
      return;
    }

    if (selectedNode && editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, false);
    }
  }, [defaultCssFont, editor, selectedNode]);

  useEffect(() => {
    if (!editor) {
      setToolbarState(getToolbarState(null));
      return;
    }

    const syncToolbarState = () => {
      setToolbarState(getToolbarState(editor));
    };

    syncToolbarState();
    editor.on('selectionUpdate', syncToolbarState);
    editor.on('transaction', syncToolbarState);
    editor.on('update', syncToolbarState);
    editor.on('focus', syncToolbarState);
    editor.on('blur', syncToolbarState);

    return () => {
      editor.off('selectionUpdate', syncToolbarState);
      editor.off('transaction', syncToolbarState);
      editor.off('update', syncToolbarState);
      editor.off('focus', syncToolbarState);
      editor.off('blur', syncToolbarState);
    };
  }, [editor, getToolbarState]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isTableMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as globalThis.Node;
      if (
        tableMenuRef.current &&
        !tableMenuRef.current.contains(target) &&
        !tableMenuPanelRef.current?.contains(target)
      ) {
        setIsTableMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isTableMenuOpen]);

  useEffect(() => {
    if (!isFontMenuOpen) {
      setFontSearchQuery('');
      return;
    }

    const updateFontMenuPosition = () => {
      if (!fontMenuButtonRef.current) return;
      const rect = fontMenuButtonRef.current.getBoundingClientRect();
      const width = Math.min(420, Math.max(320, rect.width + 120));
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      setFontMenuPosition({
        top: rect.bottom + 8,
        left,
        width,
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as globalThis.Node;
      if (
        fontMenuButtonRef.current &&
        !fontMenuButtonRef.current.contains(target) &&
        !fontMenuPanelRef.current?.contains(target)
      ) {
        setIsFontMenuOpen(false);
      }
    };

    updateFontMenuPosition();
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', updateFontMenuPosition);
    window.addEventListener('scroll', updateFontMenuPosition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', updateFontMenuPosition);
      window.removeEventListener('scroll', updateFontMenuPosition, true);
    };
  }, [isFontMenuOpen]);

  const {
    fontFamily: currentFontFamily,
    fontSize: currentFontSize,
    textColor: currentTextColor,
    highlightColor: currentHighlightColor,
    blockStyle: currentBlockStyle,
    isInsideTable,
    tableCellBackgroundColor,
  } = toolbarState;
  const wordCount = editor?.storage.characterCount?.words?.() ?? 0;
  const characterCount = editor?.storage.characterCount?.characters?.() ?? 0;
  const currentFontLabel = availableFonts.find((font) => font.id === currentFontFamily)?.label || text('Font');
  const visibleFontCount = fontSections.reduce((total, section) => total + section.items.length, 0);
  const fileActionsDisabled = !editor;
  const visibleTabs: RibbonTab[] = isInsideTable ? ['home', 'insert', 'layout', 'table'] : ['home', 'insert', 'layout'];

  useEffect(() => {
    if (!isInsideTable && activeTab === 'table') {
      setActiveTab('home');
    }
  }, [activeTab, isInsideTable]);

  useEffect(() => {
    if (!isInsideTable) {
      setTableContextMenu(null);
    }
  }, [isInsideTable]);

  const getSelectedTableElement = useCallback(() => {
    if (!editor) return null;
    const selectedCell = editor.view.dom.querySelector('td.selectedCell, th.selectedCell') as HTMLElement | null;
    return selectedCell?.closest('table') as HTMLTableElement | null;
  }, [editor]);

  const focusTableCell = useCallback((rowIndex: number, columnIndex: number) => {
    if (!editor) return false;
    const table = getSelectedTableElement();
    if (!table) return false;

    const rows = Array.from(table.querySelectorAll('tr'));
    const row = rows[rowIndex];
    if (!row) return false;

    const cells = Array.from(row.children).filter((child): child is HTMLElement => child instanceof HTMLElement && /^(TD|TH)$/i.test(child.tagName));
    const cell = cells[Math.min(columnIndex, Math.max(cells.length - 1, 0))];
    if (!cell) return false;

    const pos = editor.view.posAtDOM(cell, 0);
    const transaction = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos)));
    editor.view.dispatch(transaction);
    editor.commands.focus();
    return true;
  }, [editor, getSelectedTableElement]);

  const moveSelectedTable = useCallback((direction: 'up' | 'down') => {
    if (!editor) return false;

    const { state, view } = editor;
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== 'table') continue;

      const parentDepth = depth - 1;
      const parent = $from.node(parentDepth);
      const index = $from.index(parentDepth);
      const nodePos = $from.before(depth);

      if (direction === 'up') {
        if (index <= 0) return false;
        const previousNode = parent.child(index - 1);
        const insertPos = nodePos - previousNode.nodeSize;
        const transaction = state.tr.delete(nodePos, nodePos + node.nodeSize).insert(insertPos, node);
        view.dispatch(transaction);
        editor.commands.focus(insertPos + 1);
        return true;
      }

      if (index >= parent.childCount - 1) return false;
      const nextNode = parent.child(index + 1);
      const insertPos = nodePos + nextNode.nodeSize;
      const transaction = state.tr.delete(nodePos, nodePos + node.nodeSize).insert(insertPos, node);
      view.dispatch(transaction);
      editor.commands.focus(insertPos + 1);
      return true;
    }

    return false;
  }, [editor]);

  useEffect(() => {
    if (!editor || !isInsideTable) {
      setTableOverlay(null);
      return;
    }

    const updateTableOverlay = () => {
      const table = getSelectedTableElement();
      if (!table) {
        setTableOverlay(null);
        return;
      }

      const tableRect = table.getBoundingClientRect();
      const rows = Array.from(table.querySelectorAll('tr'));
      const firstRowCells = rows[0]
        ? Array.from(rows[0].children).filter((child): child is HTMLElement => child instanceof HTMLElement && /^(TD|TH)$/i.test(child.tagName))
        : [];

      setTableOverlay({
        top: tableRect.top,
        left: tableRect.left,
        width: tableRect.width,
        height: tableRect.height,
        rowCenters: rows.map((row) => {
          const rowRect = row.getBoundingClientRect();
          return rowRect.top + rowRect.height / 2;
        }),
        columnCenters: firstRowCells.map((cell) => {
          const cellRect = cell.getBoundingClientRect();
          return cellRect.left + cellRect.width / 2;
        }),
      });
    };

    updateTableOverlay();
    editor.on('selectionUpdate', updateTableOverlay);
    editor.on('transaction', updateTableOverlay);
    window.addEventListener('resize', updateTableOverlay);
    window.addEventListener('scroll', updateTableOverlay, true);

    return () => {
      editor.off('selectionUpdate', updateTableOverlay);
      editor.off('transaction', updateTableOverlay);
      window.removeEventListener('resize', updateTableOverlay);
      window.removeEventListener('scroll', updateTableOverlay, true);
    };
  }, [editor, getSelectedTableElement, isInsideTable]);

  useEffect(() => {
    if (activeTab !== 'insert') {
      setIsTableMenuOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!isTableMenuOpen) return;

    const updatePosition = () => {
      if (!tableMenuRef.current) return;
      const rect = tableMenuRef.current.getBoundingClientRect();
      const panelWidth = 272;
      const maxLeft = Math.max(12, window.innerWidth - panelWidth - 12);
      setTableMenuPosition({
        top: rect.bottom + 8,
        left: Math.min(rect.left, maxLeft),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isTableMenuOpen]);

  const insertConfiguredTable = useCallback((rows?: number, columns?: number) => {
    const nextRows = rows ?? tableDraftRows;
    const nextColumns = columns ?? tableDraftColumns;
    editor?.chain().focus().insertTable({ rows: nextRows, cols: nextColumns, withHeaderRow: tableDraftHeader }).run();
  }, [editor, tableDraftColumns, tableDraftHeader, tableDraftRows]);

  const convertSelectionToTable = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;

    const selectedText = editor.state.doc.textBetween(from, to, '\n');
    const tableHtml = buildTableHtmlFromPlainText(selectedText);
    if (!tableHtml) return;

    editor.chain().focus().insertContentAt({ from, to }, tableHtml).run();
  }, [editor]);

  const tableContextItems = useMemo<ContextMenuItem[]>(() => {
    if (!editor || !isInsideTable) return [];

    return [
      { label: text('Table'), type: 'label' },
      { label: text('Select next cell'), action: () => editor.chain().focus().goToNextCell().run(), shortcut: 'Tab' },
      { label: text('Select previous cell'), action: () => editor.chain().focus().goToPreviousCell().run(), shortcut: 'Shift+Tab' },
      { label: text('Fix table layout'), action: () => editor.chain().focus().fixTables().run() },
      { label: '', type: 'divider' },
      { label: text('Rows'), type: 'label' },
      { label: text('Insert row above'), action: () => editor.chain().focus().addRowBefore().run() },
      { label: text('Insert row below'), action: () => editor.chain().focus().addRowAfter().run() },
      { label: text('Delete row'), action: () => editor.chain().focus().deleteRow().run() },
      { label: '', type: 'divider' },
      { label: text('Columns'), type: 'label' },
      { label: text('Insert column before'), action: () => editor.chain().focus().addColumnBefore().run() },
      { label: text('Insert column after'), action: () => editor.chain().focus().addColumnAfter().run() },
      { label: text('Delete column'), action: () => editor.chain().focus().deleteColumn().run() },
      { label: '', type: 'divider' },
      { label: text('Cells'), type: 'label' },
      { label: text('Merge selected cells'), action: () => editor.chain().focus().mergeCells().run() },
      { label: text('Split current cell'), action: () => editor.chain().focus().splitCell().run() },
      { label: text('Merge or split'), action: () => editor.chain().focus().mergeOrSplit().run() },
      { label: text('Toggle header cell'), action: () => editor.chain().focus().toggleHeaderCell().run() },
      { label: text('Toggle header row'), action: () => editor.chain().focus().toggleHeaderRow().run() },
      { label: text('Toggle header column'), action: () => editor.chain().focus().toggleHeaderColumn().run() },
      { label: text('Clear cell fill'), action: () => editor.chain().focus().setCellAttribute('backgroundColor', null).run() },
      { label: '', type: 'divider' },
      { label: text('Delete table'), action: () => editor.chain().focus().deleteTable().run(), danger: true },
    ];
  }, [editor, isInsideTable, text]);

  const applyBlockStyle = (value: string) => {
    const chain = editor?.chain().focus();
    if (!chain) return;
    switch (value) {
      case 'heading-1':
        chain.setParagraph().toggleHeading({ level: 1 }).run();
        break;
      case 'heading-2':
        chain.setParagraph().toggleHeading({ level: 2 }).run();
        break;
      case 'heading-3':
        chain.setParagraph().toggleHeading({ level: 3 }).run();
        break;
      case 'blockquote':
        chain.setParagraph().toggleBlockquote().run();
        break;
      default:
        chain.clearNodes().setParagraph().run();
    }
  };

  const applyLink = () => {
    if (!editor) return;
    const existing = editor.getAttributes('link').href || linkDraft || 'https://';
    const next = window.prompt(text('Enter link URL'), existing);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    setLinkDraft(trimmed);
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  };

  const clearFormatting = () => {
    editor?.chain().focus().unsetAllMarks().clearNodes().run();
  };

  const insertDateStamp = () => {
    editor?.chain().focus().insertContent(new Date().toLocaleDateString(language)).run();
  };

  const copyPlainText = async () => {
    if (!editor) return;
    await navigator.clipboard.writeText(editor.getText());
  };

  const copyHtml = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([editor.getText()], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return;
    }
    await navigator.clipboard.writeText(editor.getText());
  };

  if (!selectedNode) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-gray-400 dark:text-gray-500">
        <Pilcrow size={36} strokeWidth={1.2} />
        <p className="text-sm text-center">{text('Select a node to view and edit its notes')}</p>
      </div>
    );
  }

  const renderHomeTab = () => (
    <div className="flex min-w-max items-stretch gap-0">
      <RibbonSection title={text('Clipboard')}>
        <IconButton title={text('Undo')} disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={13} /></IconButton>
        <IconButton title={text('Redo')} disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={13} /></IconButton>
        <IconButton title={text('Copy plain text')} disabled={fileActionsDisabled} onClick={() => { void copyPlainText(); }}><Clipboard size={13} /> {text('Plain')}</IconButton>
        <IconButton title={text('Copy rich text')} disabled={fileActionsDisabled} onClick={() => { void copyHtml(); }}><Clipboard size={13} /> {text('Rich')}</IconButton>
      </RibbonSection>
      <RibbonSection title={text('Font')}>
        <button
          ref={fontMenuButtonRef}
          type="button"
          onClick={() => setIsFontMenuOpen((open) => !open)}
          className={`flex h-11 min-w-[14rem] items-center justify-between gap-3 rounded-lg border px-3 text-left transition-colors ${isFontMenuOpen ? 'border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500 dark:hover:bg-gray-700'}`}
          title={text('Font')}
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{text('Font')}</span>
            <span className="mt-0.5 block truncate text-[12px] font-medium text-gray-700 dark:text-gray-200" style={{ fontFamily: currentFontFamily }}>
              {currentFontLabel}
            </span>
          </span>
          <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${isFontMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        <ToolbarSelect
          value={currentFontSize}
          onChange={(value) => editor?.chain().focus().setFontSize(value).run()}
          title={text('Font size')}
          options={FONT_SIZE_OPTIONS.map((size) => ({ value: size, label: `${size}px` }))}
        />
      </RibbonSection>
      <RibbonSection title={text('Character')}>
        <IconButton title={text('Bold')} active={!!editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={13} /></IconButton>
        <IconButton title={text('Italic')} active={!!editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={13} /></IconButton>
        <IconButton title={text('Underline')} active={!!editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={13} /></IconButton>
        <ColorPicker color={currentTextColor} onChange={(color) => editor?.chain().focus().setColor(color).run()} compact buttonLabel={text('Text')} className="min-w-[7rem]" paletteMode="office" commitMode="confirm" automaticColor={defaultTextColor} automaticLabel={text('Automatic')} />
        <ColorPicker color={currentHighlightColor} onChange={(color) => editor?.chain().focus().setHighlight({ color }).run()} compact buttonLabel={text('Highlight')} className="min-w-[7rem]" paletteMode="office" commitMode="confirm" automaticColor={defaultHighlightColor} automaticLabel={text('Automatic')} />
      </RibbonSection>
      <RibbonSection title={text('Paragraph')}>
        <IconButton title={text('Bullet list')} active={!!editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={13} /></IconButton>
        <IconButton title={text('Numbered list')} active={!!editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={13} /></IconButton>
        <IconButton title={text('Select all')} onClick={() => editor?.chain().focus().selectAll().run()}><Search size={13} /></IconButton>
        <IconButton title={text('Clear formatting')} onClick={clearFormatting}><Eraser size={13} /></IconButton>
      </RibbonSection>
    </div>
  );

  const renderInsertTab = () => (
    <div className="flex min-w-max items-stretch gap-0">
      <RibbonSection title={text('Tables')}>
        <div ref={tableMenuRef} className="relative flex min-w-[13rem] flex-col gap-2">
          <button
            type="button"
            onClick={() => setIsTableMenuOpen((open) => !open)}
            className={`flex h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left transition-colors ${isTableMenuOpen ? 'border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500 dark:hover:bg-gray-700'}`}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
                <Grid2x2 size={15} />
              </span>
              <span className="flex flex-col">
                <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-100">{text('Table')}</span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{text('{{columns}} x {{rows}} starter grid', { columns: String(tableDraftColumns), rows: String(tableDraftRows) })}</span>
              </span>
            </span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${isTableMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <IconButton title={text('Convert selected text to table')} onClick={convertSelectionToTable}><Columns size={13} /> {text('Convert')}</IconButton>
      </RibbonSection>
      <RibbonSection title={text('Links')}>
        <IconButton title={text('Add or edit link')} active={!!editor?.isActive('link')} onClick={applyLink}><Link2 size={13} /></IconButton>
        <IconButton title={text('Remove link')} onClick={() => editor?.chain().focus().extendMarkRange('link').unsetLink().run()}><Link2Off size={13} /></IconButton>
      </RibbonSection>
      <RibbonSection title={text('Objects')}>
        <IconButton title={text('Insert horizontal line')} onClick={() => editor?.chain().focus().setHorizontalRule().run()}><SeparatorHorizontal size={13} /></IconButton>
        <IconButton title={text('Insert quote')} active={!!editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={13} /></IconButton>
        <IconButton title={text('Insert date')} onClick={insertDateStamp}><Type size={13} /></IconButton>
      </RibbonSection>
    </div>
  );

  const renderLayoutTab = () => (
    <div className="flex min-w-max items-stretch gap-0">
      <RibbonSection title={text('Styles')}>
        <ToolbarSelect value={currentBlockStyle} onChange={applyBlockStyle} title={text('Block style')} options={blockStyleOptions} />
        <IconButton title={text('Heading 1')} active={currentBlockStyle === 'heading-1'} onClick={() => applyBlockStyle('heading-1')}><Heading1 size={13} /></IconButton>
        <IconButton title={text('Heading 2')} active={currentBlockStyle === 'heading-2'} onClick={() => applyBlockStyle('heading-2')}><Heading2 size={13} /></IconButton>
        <IconButton title={text('Heading 3')} active={currentBlockStyle === 'heading-3'} onClick={() => applyBlockStyle('heading-3')}><Heading3 size={13} /></IconButton>
        <IconButton title={text('Paragraph')} active={currentBlockStyle === 'paragraph'} onClick={() => applyBlockStyle('paragraph')}><Pilcrow size={13} /></IconButton>
      </RibbonSection>
      <RibbonSection title={text('Alignment')}>
        <IconButton title={text('Align left')} active={!!editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()}><AlignLeft size={13} /></IconButton>
        <IconButton title={text('Align center')} active={!!editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()}><AlignCenter size={13} /></IconButton>
        <IconButton title={text('Align right')} active={!!editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()}><AlignRight size={13} /></IconButton>
        <IconButton title={text('Justify')} active={!!editor?.isActive({ textAlign: 'justify' })} onClick={() => editor?.chain().focus().setTextAlign('justify').run()}><AlignJustify size={13} /></IconButton>
      </RibbonSection>
      <RibbonSection title={text('Document')}>
        <div className={RIBBON_PILL_CLASS}>{text('{{count}} words', { count: String(wordCount) })}</div>
        <div className={RIBBON_PILL_CLASS}>{text('{{count}} chars', { count: String(characterCount) })}</div>
        <IconButton title={text('Remove links')} onClick={() => editor?.chain().focus().extendMarkRange('link').unsetLink().run()}><Link2Off size={13} /></IconButton>
        <IconButton title={text('Clear text color')} onClick={() => editor?.chain().focus().unsetColor().run()}><Minus size={11} /><Palette size={13} /></IconButton>
      </RibbonSection>
    </div>
  );

  const renderTableTab = () => (
    <div className="flex min-w-max items-stretch gap-0">
      <RibbonSection title={text('Rows')}>
        <IconButton title={text('Insert row above')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().addRowBefore().run()}><Plus size={11} /><Rows size={13} /> {text('Above')}</IconButton>
        <IconButton title={text('Insert row below')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().addRowAfter().run()}><Rows size={13} /><Plus size={11} /> {text('Below')}</IconButton>
        <IconButton title={text('Delete current row')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().deleteRow().run()}><Minus size={11} /><Rows size={13} /> {text('Delete')}</IconButton>
      </RibbonSection>
      <RibbonSection title={text('Columns')}>
        <IconButton title={text('Insert column before')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().addColumnBefore().run()}><Plus size={11} /><Columns size={13} /> {text('Before')}</IconButton>
        <IconButton title={text('Insert column after')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().addColumnAfter().run()}><Columns size={13} /><Plus size={11} /> {text('After')}</IconButton>
        <IconButton title={text('Delete current column')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().deleteColumn().run()}><Minus size={11} /><Columns size={13} /> {text('Delete')}</IconButton>
      </RibbonSection>
      <RibbonSection title={text('Structure')}>
        <IconButton title={text('Merge selected cells')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().mergeCells().run()}><Rows size={13} /><Columns size={13} /> {text('Merge')}</IconButton>
        <IconButton title={text('Split current cell')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().splitCell().run()}><Columns size={13} /><Minus size={11} /> {text('Split')}</IconButton>
        <IconButton title={text('Toggle header row')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().toggleHeaderRow().run()}><Type size={13} /><Rows size={13} /> {text('Header Row')}</IconButton>
        <IconButton title={text('Toggle header column')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().toggleHeaderColumn().run()}><Type size={13} /><Columns size={13} /> {text('Header Col')}</IconButton>
      </RibbonSection>
      <RibbonSection title={text('Cell Format')}>
        <ColorPicker color={currentTextColor} onChange={(color) => editor?.chain().focus().setColor(color).run()} compact buttonLabel={text('Text')} className="min-w-[7rem]" paletteMode="office" commitMode="confirm" automaticColor={defaultTextColor} automaticLabel={text('Automatic')} />
        <ColorPicker color={tableCellBackgroundColor} onChange={(color) => editor?.chain().focus().setCellAttribute('backgroundColor', color).run()} compact buttonLabel={text('Shading')} className="min-w-[7rem]" paletteMode="office" commitMode="confirm" automaticColor="#00000000" automaticLabel={text('Automatic')} />
        <IconButton title={text('Clear cell shading')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().setCellAttribute('backgroundColor', null).run()}><Minus size={11} /><Highlighter size={13} /> {text('Clear Shading')}</IconButton>
      </RibbonSection>
      <RibbonSection title={text('Navigate')}>
        <IconButton title={text('Go to previous cell')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().goToPreviousCell().run()}>{text('Prev Cell')}</IconButton>
        <IconButton title={text('Go to next cell')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().goToNextCell().run()}>{text('Next Cell')}</IconButton>
        <IconButton title={text('Delete table')} disabled={!isInsideTable} onClick={() => editor?.chain().focus().deleteTable().run()}><Minus size={11} /><Type size={13} /> {text('Delete Table')}</IconButton>
      </RibbonSection>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'insert':
        return renderInsertTab();
      case 'layout':
        return renderLayoutTab();
      case 'table':
        return renderTableTab();
      case 'home':
      default:
        return renderHomeTab();
    }
  };

  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative z-30 shrink-0 border-b border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
        <div className="flex items-center justify-between px-3 py-2">
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{text('Document')}</p>
            <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-gray-800 dark:text-white">{selectedNode.data?.label || text('Untitled Node')}</h3>
          </div>
          <div className="text-right text-[10px] text-gray-500 dark:text-gray-400">
            <div>{text('{{count}} words', { count: String(wordCount) })}</div>
            <div>{text('{{count}} characters', { count: String(characterCount) })}</div>
          </div>
        </div>
        <div className="border-t border-gray-200 px-3 pt-1 dark:border-gray-700">
          <div className="overflow-x-auto overflow-y-hidden">
            <div className="flex min-w-max items-end gap-1">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-t-lg border border-b-0 px-3 py-1.5 text-[11px] font-medium transition-colors ${isActive ? 'border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white' : 'border-transparent bg-transparent text-gray-500 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-900/80 dark:hover:text-white'}`}
              >
                {tabLabels[tab]}
              </button>
            );
          })}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-20 shrink-0 border-b border-gray-200 bg-gray-50 px-1.5 py-0 dark:border-gray-700 dark:bg-gray-900">
        <div className="overflow-x-auto overflow-y-hidden">
          {renderActiveTab()}
        </div>
      </div>

      <div className="relative z-0 min-h-0 flex-1 overflow-hidden bg-white dark:bg-gray-800">
        {isImageDragOver ? (
          <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/80 text-sm font-medium text-blue-700 backdrop-blur-sm dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-200">
            {text('Drop image to insert into notes')}
          </div>
        ) : null}
        <EditorContent editor={editor} className="h-full overflow-y-auto" />
      </div>
      {isMounted && tableOverlay ? createPortal(
        <div className="pointer-events-none fixed inset-0 z-[205]">
          <div className="pointer-events-auto absolute flex items-center gap-1 rounded-md border border-gray-200 bg-white/95 px-1 py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800/95" style={{ top: tableOverlay.top - 34, left: tableOverlay.left - 4 }}>
            <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200" title={text('Table controls')}><GripVertical size={12} /></span>
            <button type="button" className="rounded border border-gray-200 bg-white p-1 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700" title={text('Move table up')} onClick={() => { void moveSelectedTable('up'); }}><ArrowUp size={12} /></button>
            <button type="button" className="rounded border border-gray-200 bg-white p-1 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700" title={text('Move table down')} onClick={() => { void moveSelectedTable('down'); }}><ArrowDown size={12} /></button>
          </div>
          {tableOverlay.columnCenters.map((center, columnIndex) => (
            <button
              key={`table-col-${columnIndex}`}
              type="button"
              className="pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition-colors hover:bg-blue-50 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-blue-500/15 dark:hover:text-blue-200"
              style={{ top: tableOverlay.top - 12, left: center }}
              title={text('Insert column after')}
              onClick={() => {
                if (focusTableCell(0, columnIndex)) {
                  editor?.chain().focus().addColumnAfter().run();
                }
              }}
            >
              <Plus size={12} />
            </button>
          ))}
          {tableOverlay.rowCenters.map((center, rowIndex) => (
            <button
              key={`table-row-${rowIndex}`}
              type="button"
              className="pointer-events-auto absolute flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition-colors hover:bg-blue-50 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-blue-500/15 dark:hover:text-blue-200"
              style={{ top: center, left: tableOverlay.left - 12 }}
              title={text('Insert row below')}
              onClick={() => {
                if (focusTableCell(rowIndex, 0)) {
                  editor?.chain().focus().addRowAfter().run();
                }
              }}
            >
              <Plus size={12} />
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
      {isMounted && isTableMenuOpen && tableMenuPosition
        ? createPortal(
            <div ref={tableMenuPanelRef} className="fixed z-[210]" style={{ top: tableMenuPosition.top, left: tableMenuPosition.left }}>
              <TableSizePicker
                previewRows={tableDraftRows}
                previewColumns={tableDraftColumns}
                headerRow={tableDraftHeader}
                text={text}
                onClose={() => setIsTableMenuOpen(false)}
                onPreview={(rows, columns) => {
                  setTableDraftRows(rows);
                  setTableDraftColumns(columns);
                }}
                onSelect={(rows, columns) => {
                  setTableDraftRows(rows);
                  setTableDraftColumns(columns);
                  insertConfiguredTable(rows, columns);
                }}
                onToggleHeader={setTableDraftHeader}
              />
            </div>,
            document.body,
          )
        : null}
      {isMounted && isFontMenuOpen && fontMenuPosition
        ? createPortal(
            <div ref={fontMenuPanelRef} className="fixed z-[210]" style={{ top: fontMenuPosition.top, left: fontMenuPosition.left, width: fontMenuPosition.width }}>
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                <FontPickerPanel
                  sections={fontSections}
                  selectedId={currentFontFamily}
                  onSelect={(fontFamily) => {
                    editor?.chain().focus().setFontFamily(fontFamily).run();
                    setIsFontMenuOpen(false);
                  }}
                  searchValue={fontSearchQuery}
                  onSearchValueChange={setFontSearchQuery}
                  searchPlaceholder={text('Search note fonts')}
                  listClassName="max-h-[18rem]"
                  toolbar={<span className="text-xs text-gray-500 dark:text-gray-400">{text('{{count}} shown', { count: String(visibleFontCount) })}</span>}
                  noMatchesMessage={text('No note fonts match "{{query}}".', { query: fontSearchQuery.trim() })}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
      {tableContextMenu && tableContextItems.length > 0 && (
        <ContextMenu
          x={tableContextMenu.x}
          y={tableContextMenu.y}
          items={tableContextItems}
          onClose={() => setTableContextMenu(null)}
        />
      )}
      <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-1.5 text-[10px] text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>{selectedNode.data?.label || text('Untitled Node')}</span>
          <span>{text('{{count}} words', { count: String(wordCount) })}</span>
          <span>{text('{{count}} characters', { count: String(characterCount) })}</span>
          <span>{isInsideTable ? text('Table tools ready') : text('Text flow ready')}</span>
          <span>{text('Active tab: {{tab}}', { tab: tabLabels[activeTab] })}</span>
        </div>
      </div>
    </div>
  );
}
