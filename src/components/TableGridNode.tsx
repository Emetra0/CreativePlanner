import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, Columns, Eraser, Minus, Plus, Rows } from 'lucide-react';
import { useStore } from '@/store/useStore';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import {
  addTableColumn,
  addTableRow,
  clearTableGridRange,
  extractTableGridRange,
  getColumnLabel,
  getSelectionAnchor,
  isCellInSelection,
  normalizeTableGrid,
  normalizeTableSelection,
  overlayTableGrid,
  plainTextToTableGrid,
  removeTableColumn,
  removeTableRow,
  type TableSelectionRange,
  tableGridToHtml,
  tableGridToPlainText,
  updateTableCell,
} from '@/lib/tableGrid';

interface TableGridNodeProps {
  nodeId: string;
  data: any;
  isDark: boolean;
}

async function writeGridToClipboard(html: string, plainText: string) {
  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(plainText);
  }
}

export default function TableGridNode({ nodeId, data, isDark }: TableGridNodeProps) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const grid = useMemo(() => normalizeTableGrid(data.tableGrid, 5, 4), [data.tableGrid]);
  const [feedback, setFeedback] = useState<string>('');
  const [selection, setSelection] = useState<TableSelectionRange | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; column: number } | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [dragMode, setDragMode] = useState<'idle' | 'cells' | 'row' | 'column'>('idle');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; mode: 'cell' | 'row' | 'column'; row: number; column: number } | null>(null);
  const dragStateRef = useRef<{ mode: 'cells' | 'row' | 'column'; startRow: number; startColumn: number } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const columnCount = grid.cells[0]?.length || 0;
  const selectedRange = selection ? normalizeTableSelection(selection) : null;
  const selectionLabel = selectedRange
    ? `${getColumnLabel(selectedRange.startColumn)}${selectedRange.startRow + 1}:${getColumnLabel(selectedRange.endColumn)}${selectedRange.endRow + 1}`
    : 'No selection';
  const dragLabel = dragMode === 'cells'
    ? 'Cell drag'
    : dragMode === 'row'
      ? 'Row drag'
      : dragMode === 'column'
        ? 'Column drag'
        : 'Pointer ready';

  const saveGrid = useCallback((nextGrid: ReturnType<typeof normalizeTableGrid>) => {
    updateNodeData(nodeId, { ...data, tableGrid: nextGrid });
  }, [data, nodeId, updateNodeData]);

  const flash = useCallback((message: string) => {
    setFeedback(message);
    window.clearTimeout((flash as any)._timer);
    (flash as any)._timer = window.setTimeout(() => setFeedback(''), 1800);
  }, []);

  const stopDragging = useCallback(() => {
    dragStateRef.current = null;
    setDragMode('idle');
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', stopDragging);
    return () => window.removeEventListener('mouseup', stopDragging);
  }, [stopDragging]);

  useEffect(() => {
    if (!editingCell || !editorRef.current) return;
    editorRef.current.focus();
    editorRef.current.select();
  }, [editingCell]);

  useEffect(() => {
    if (!contextMenu) return;
    if (contextMenu.row >= grid.cells.length || contextMenu.column >= columnCount) {
      setContextMenu(null);
    }
  }, [columnCount, contextMenu, grid.cells.length]);

  const beginEditing = useCallback((row: number, column: number, initialValue?: string) => {
    setSelection({ startRow: row, endRow: row, startColumn: column, endColumn: column });
    setEditingCell({ row, column });
    setDraftValue(initialValue ?? grid.cells[row]?.[column] ?? '');
  }, [grid.cells]);

  const commitEditing = useCallback(() => {
    if (!editingCell) return;
    saveGrid(updateTableCell(grid, editingCell.row, editingCell.column, draftValue));
    setEditingCell(null);
  }, [draftValue, editingCell, grid, saveGrid]);

  const updateCellSelection = useCallback((row: number, column: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.mode !== 'cells') return;
    setSelection({
      startRow: dragState.startRow,
      endRow: row,
      startColumn: dragState.startColumn,
      endColumn: column,
    });
  }, []);

  const updateRowSelection = useCallback((row: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.mode !== 'row') return;
    setSelection({
      startRow: dragState.startRow,
      endRow: row,
      startColumn: 0,
      endColumn: Math.max(0, columnCount - 1),
    });
  }, [columnCount]);

  const updateColumnSelection = useCallback((column: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.mode !== 'column') return;
    setSelection({
      startRow: 0,
      endRow: Math.max(0, grid.cells.length - 1),
      startColumn: dragState.startColumn,
      endColumn: column,
    });
  }, [grid.cells.length]);

  const moveSelectionTo = useCallback((row: number, column: number) => {
    const safeRow = Math.max(0, Math.min(grid.cells.length - 1, row));
    const safeColumn = Math.max(0, Math.min(columnCount - 1, column));
    setSelection({
      startRow: safeRow,
      endRow: safeRow,
      startColumn: safeColumn,
      endColumn: safeColumn,
    });
  }, [columnCount, grid.cells.length]);

  const startCellSelection = useCallback((row: number, column: number) => {
    setEditingCell(null);
    dragStateRef.current = { mode: 'cells', startRow: row, startColumn: column };
    setDragMode('cells');
    setSelection({ startRow: row, endRow: row, startColumn: column, endColumn: column });
  }, []);

  const startRowSelection = useCallback((row: number) => {
    setEditingCell(null);
    dragStateRef.current = { mode: 'row', startRow: row, startColumn: 0 };
    setDragMode('row');
    setSelection({ startRow: row, endRow: row, startColumn: 0, endColumn: Math.max(0, columnCount - 1) });
  }, [columnCount]);

  const startColumnSelection = useCallback((column: number) => {
    setEditingCell(null);
    dragStateRef.current = { mode: 'column', startRow: 0, startColumn: column };
    setDragMode('column');
    setSelection({ startRow: 0, endRow: Math.max(0, grid.cells.length - 1), startColumn: column, endColumn: column });
  }, [grid.cells.length]);

  const openCellContextMenu = useCallback((x: number, y: number, row: number, column: number) => {
    setEditingCell(null);
    moveSelectionTo(row, column);
    setContextMenu({ x, y, mode: 'cell', row, column });
  }, [moveSelectionTo]);

  const openRowContextMenu = useCallback((x: number, y: number, row: number) => {
    setEditingCell(null);
    setSelection({ startRow: row, endRow: row, startColumn: 0, endColumn: Math.max(0, columnCount - 1) });
    setContextMenu({ x, y, mode: 'row', row, column: 0 });
  }, [columnCount]);

  const openColumnContextMenu = useCallback((x: number, y: number, column: number) => {
    setEditingCell(null);
    setSelection({ startRow: 0, endRow: Math.max(0, grid.cells.length - 1), startColumn: column, endColumn: column });
    setContextMenu({ x, y, mode: 'column', row: 0, column });
  }, [grid.cells.length]);

  const removeSelectedRows = useCallback(() => {
    if (!selectedRange) {
      saveGrid(removeTableRow(grid));
      return;
    }

    let nextGrid = grid;
    for (let rowIndex = selectedRange.endRow; rowIndex >= selectedRange.startRow; rowIndex -= 1) {
      nextGrid = removeTableRow(nextGrid, rowIndex);
    }
    saveGrid(nextGrid);
    setSelection(null);
  }, [grid, saveGrid, selectedRange]);

  const removeSelectedColumns = useCallback(() => {
    if (!selectedRange) {
      saveGrid(removeTableColumn(grid));
      return;
    }

    let nextGrid = grid;
    for (let columnIndex = selectedRange.endColumn; columnIndex >= selectedRange.startColumn; columnIndex -= 1) {
      nextGrid = removeTableColumn(nextGrid, columnIndex);
    }
    saveGrid(nextGrid);
    setSelection(null);
  }, [grid, saveGrid, selectedRange]);

  const copySelection = useCallback(async () => {
    const selectionGrid = extractTableGridRange(grid, selectedRange);
    await writeGridToClipboard(tableGridToHtml(selectionGrid), tableGridToPlainText(selectionGrid));
    flash(selectedRange ? `Copied ${selectionLabel}` : 'Table copied');
  }, [flash, grid, selectedRange, selectionLabel]);

  const pasteSelection = useCallback(async () => {
    if (!navigator.clipboard) return;
    const text = await navigator.clipboard.readText();
    const pasted = plainTextToTableGrid(text);
    if (!pasted) {
      flash('Clipboard has no tabular data');
      return;
    }
    const anchor = getSelectionAnchor(selectedRange);
    saveGrid(overlayTableGrid(grid, pasted, anchor.row, anchor.column));
    setSelection({
      startRow: anchor.row,
      endRow: anchor.row + pasted.cells.length - 1,
      startColumn: anchor.column,
      endColumn: anchor.column + (pasted.cells[0]?.length || 1) - 1,
    });
    flash('Table pasted');
  }, [flash, grid, saveGrid, selectedRange]);

  const clearSelection = useCallback(() => {
    if (!selectedRange) return;
    saveGrid(clearTableGridRange(grid, selectedRange));
    flash(`Cleared ${selectionLabel}`);
  }, [flash, grid, saveGrid, selectedRange, selectionLabel]);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];

    const { row, column, mode } = contextMenu;
    const cellItems: ContextMenuItem[] = [
      { label: 'Table', type: 'label' },
      { label: 'Copy selection', action: () => { void copySelection(); } },
      { label: 'Paste into selection', action: () => { void pasteSelection(); } },
      { label: 'Clear cells', action: clearSelection, shortcut: 'Delete' },
      { label: '', type: 'divider' },
      { label: 'Rows', type: 'label' },
      { label: 'Insert row above', action: () => saveGrid(addTableRow(grid, row)) },
      { label: 'Insert row below', action: () => saveGrid(addTableRow(grid, row + 1)) },
      { label: 'Delete row', action: () => saveGrid(removeTableRow(grid, row)) },
      { label: '', type: 'divider' },
      { label: 'Columns', type: 'label' },
      { label: 'Insert column before', action: () => saveGrid(addTableColumn(grid, column)) },
      { label: 'Insert column after', action: () => saveGrid(addTableColumn(grid, column + 1)) },
      { label: 'Delete column', action: () => saveGrid(removeTableColumn(grid, column)) },
    ];

    if (mode === 'row') {
      return [
        { label: 'Row', type: 'label' },
        { label: 'Insert row above', action: () => saveGrid(addTableRow(grid, row)) },
        { label: 'Insert row below', action: () => saveGrid(addTableRow(grid, row + 1)) },
        { label: 'Delete row', action: () => saveGrid(removeTableRow(grid, row)), danger: true },
        { label: '', type: 'divider' },
        { label: 'Copy selection', action: () => { void copySelection(); } },
        { label: 'Clear row', action: clearSelection, shortcut: 'Delete' },
      ];
    }

    if (mode === 'column') {
      return [
        { label: 'Column', type: 'label' },
        { label: 'Insert column before', action: () => saveGrid(addTableColumn(grid, column)) },
        { label: 'Insert column after', action: () => saveGrid(addTableColumn(grid, column + 1)) },
        { label: 'Delete column', action: () => saveGrid(removeTableColumn(grid, column)), danger: true },
        { label: '', type: 'divider' },
        { label: 'Copy selection', action: () => { void copySelection(); } },
        { label: 'Clear column', action: clearSelection, shortcut: 'Delete' },
      ];
    }

    return cellItems;
  }, [clearSelection, contextMenu, copySelection, grid, pasteSelection, saveGrid]);

  const handleGridKeyDown = useCallback(async (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingCell) return;

    if ((event.key === 'Backspace' || event.key === 'Delete') && selectedRange) {
      event.preventDefault();
      clearSelection();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      await copySelection();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      await pasteSelection();
      return;
    }

    if (!selectedRange) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      const movingBackward = event.shiftKey;
      const nextColumn = movingBackward ? selectedRange.startColumn - 1 : selectedRange.endColumn + 1;
      const wrappedColumn = movingBackward ? (nextColumn < 0 ? Math.max(0, columnCount - 1) : nextColumn) : (nextColumn >= columnCount ? 0 : nextColumn);
      const rowOffset = movingBackward ? (nextColumn < 0 ? -1 : 0) : (nextColumn >= columnCount ? 1 : 0);
      moveSelectionTo(selectedRange.startRow + rowOffset, wrappedColumn);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelectionTo(selectedRange.startRow - 1, selectedRange.startColumn);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelectionTo(selectedRange.endRow + 1, selectedRange.startColumn);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelectionTo(selectedRange.startRow, selectedRange.startColumn - 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelectionTo(selectedRange.startRow, selectedRange.endColumn + 1);
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEditing(selectedRange.startRow, selectedRange.startColumn);
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      beginEditing(selectedRange.startRow, selectedRange.startColumn, event.key);
    }
  }, [beginEditing, clearSelection, columnCount, copySelection, editingCell, moveSelectionTo, pasteSelection, selectedRange]);

  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-1.5 border-b px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] ${isDark ? 'border-gray-700 bg-gray-800/70 text-gray-400' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
        <span>{grid.cells.length} rows</span>
        <span>·</span>
        <span>{columnCount} columns</span>
        <span>·</span>
        <span>{selectionLabel}</span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 normal-case tracking-normal text-[10px] ${dragMode === 'idle' ? isDark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600' : 'border-blue-400 text-blue-600 dark:text-blue-300'}`}>
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
            {dragMode === 'row' ? '↕' : dragMode === 'column' ? '↔' : dragMode === 'cells' ? '╋' : '◻'}
          </span>
          {dragLabel}
        </span>
        <span className="ml-auto truncate normal-case tracking-normal text-[10px]">{feedback || 'Drag to select cells, or use arrows and Tab to move like a document table'}</span>
      </div>

      <div className={`flex flex-wrap items-center gap-1 border-b px-2 py-2 ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
        <button onClick={() => saveGrid(addTableRow(grid, selectedRange ? selectedRange.startRow : undefined))} className={`nodrag nopan inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><Plus size={10} /><Rows size={10} /> Before</button>
        <button onClick={() => saveGrid(addTableRow(grid, selectedRange ? selectedRange.endRow + 1 : undefined))} className={`nodrag nopan inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><Rows size={10} /><Plus size={10} /> After</button>
        <button onClick={removeSelectedRows} className={`nodrag nopan inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><Minus size={10} /><Rows size={10} /> Remove</button>
        <button onClick={() => saveGrid(addTableColumn(grid, selectedRange ? selectedRange.startColumn : undefined))} className={`nodrag nopan inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><Plus size={10} /><Columns size={10} /> Before</button>
        <button onClick={() => saveGrid(addTableColumn(grid, selectedRange ? selectedRange.endColumn + 1 : undefined))} className={`nodrag nopan inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><Columns size={10} /><Plus size={10} /> After</button>
        <button onClick={removeSelectedColumns} className={`nodrag nopan inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><Minus size={10} /><Columns size={10} /> Remove</button>
        <button onClick={clearSelection} disabled={!selectedRange} className={`nodrag nopan inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${selectedRange ? isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'}`}><Eraser size={10} /> Clear</button>
        <button
          onClick={copySelection}
          className={`nodrag nopan ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          <Clipboard size={10} /> Copy
        </button>
        <button
          onClick={pasteSelection}
          className={`nodrag nopan inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          <Plus size={10} /> Paste
        </button>
      </div>

      <div className="nowheel flex-1 overflow-auto p-2" onKeyDown={handleGridKeyDown} tabIndex={0}>
        <div className="inline-block min-w-full align-top">
          <table className="min-w-full border-separate border-spacing-1 select-none">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 min-w-[3rem]">
                  <div className={`flex h-9 items-center justify-center rounded-md border text-[10px] font-semibold ${isDark ? 'border-gray-700 bg-gray-800 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>#</div>
                </th>
                {Array.from({ length: columnCount }, (_, columnIndex) => {
                  const columnSelected = !!selectedRange && selectedRange.startColumn <= columnIndex && selectedRange.endColumn >= columnIndex && selectedRange.startRow === 0 && selectedRange.endRow === grid.cells.length - 1;
                  return (
                    <th key={`column-${columnIndex}`} className="sticky top-0 z-10 min-w-[6.25rem]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onMouseDown={(event) => { event.preventDefault(); startColumnSelection(columnIndex); }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            openColumnContextMenu(event.clientX, event.clientY, columnIndex);
                          }}
                          onMouseEnter={() => updateColumnSelection(columnIndex)}
                          className={`flex h-9 flex-1 cursor-ew-resize items-center justify-center rounded-md border text-[10px] font-semibold transition-colors ${columnSelected ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200' : isDark ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                        >
                          {getColumnLabel(columnIndex)}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveGrid(addTableColumn(grid, columnIndex + 1))}
                          className={`h-9 w-8 rounded-md border text-[10px] font-semibold ${isDark ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                          title={`Add column after ${getColumnLabel(columnIndex)}`}
                        >
                          <Plus size={11} className="mx-auto" />
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="sticky top-0 z-10 min-w-[3rem]">
                  <button
                    type="button"
                    onClick={() => saveGrid(addTableColumn(grid, columnCount))}
                    className={`flex h-9 w-full items-center justify-center rounded-md border text-[10px] font-semibold ${isDark ? 'border-emerald-700 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/30' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                    title="Add column at the end"
                  >
                    <Plus size={12} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {grid.cells.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  <th className="sticky left-0 z-10 min-w-[3rem]">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onMouseDown={(event) => { event.preventDefault(); startRowSelection(rowIndex); }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openRowContextMenu(event.clientX, event.clientY, rowIndex);
                        }}
                        onMouseEnter={() => updateRowSelection(rowIndex)}
                        className={`flex h-9 flex-1 cursor-ns-resize items-center justify-center rounded-md border text-[10px] font-semibold transition-colors ${!!selectedRange && selectedRange.startRow <= rowIndex && selectedRange.endRow >= rowIndex && selectedRange.startColumn === 0 && selectedRange.endColumn === columnCount - 1 ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200' : isDark ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                      >
                        {rowIndex + 1}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveGrid(addTableRow(grid, rowIndex + 1))}
                        className={`h-9 w-8 rounded-md border text-[10px] font-semibold ${isDark ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                        title={`Add row after ${rowIndex + 1}`}
                      >
                        <Plus size={11} className="mx-auto" />
                      </button>
                    </div>
                  </th>
                  {row.map((cell, columnIndex) => (
                    <td key={`cell-${rowIndex}-${columnIndex}`} className="min-w-[6.25rem]">
                      <div
                        onMouseDown={(event) => {
                          event.preventDefault();
                          startCellSelection(rowIndex, columnIndex);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openCellContextMenu(event.clientX, event.clientY, rowIndex, columnIndex);
                        }}
                        onMouseEnter={() => updateCellSelection(rowIndex, columnIndex)}
                        onDoubleClick={() => beginEditing(rowIndex, columnIndex)}
                        className={`nodrag nopan flex min-h-[2.25rem] w-full ${dragMode === 'cells' ? 'cursor-grabbing' : 'cursor-crosshair'} rounded-md border px-2 py-1 text-[10px] outline-none transition-colors ${isCellInSelection(selectedRange, rowIndex, columnIndex) ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)] dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-100' : isDark ? 'border-gray-600 bg-gray-700 text-gray-100 hover:border-gray-500' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
                      >
                        {editingCell?.row === rowIndex && editingCell?.column === columnIndex ? (
                          <textarea
                            ref={editorRef}
                            value={draftValue}
                            onChange={(event) => setDraftValue(event.target.value)}
                            onBlur={commitEditing}
                            onMouseDown={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === 'Escape') {
                                setEditingCell(null);
                                return;
                              }
                              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                event.preventDefault();
                                commitEditing();
                              }
                            }}
                            className={`h-20 w-full resize-none bg-transparent text-[10px] outline-none ${isDark ? 'text-gray-100' : 'text-gray-700'}`}
                            placeholder={rowIndex === 0 ? `Column ${columnIndex + 1}` : 'Type here'}
                          />
                        ) : (
                          <div className="min-h-[1.25rem] w-full whitespace-pre-wrap break-words py-1">
                            {cell || <span className={isDark ? 'text-gray-500' : 'text-gray-300'}>{rowIndex === 0 ? `Column ${columnIndex + 1}` : ' '}</span>}
                          </div>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th className="sticky left-0 z-10 min-w-[3rem]">
                  <button
                    type="button"
                    onClick={() => saveGrid(addTableRow(grid, grid.cells.length))}
                    className={`flex h-9 w-full items-center justify-center rounded-md border text-[10px] font-semibold ${isDark ? 'border-emerald-700 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/30' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                    title="Add row at the end"
                  >
                    <Plus size={12} />
                  </button>
                </th>
                <td colSpan={Math.max(1, columnCount + 1)}>
                  <div className={`flex h-9 items-center justify-center rounded-md border border-dashed text-[10px] ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                    End controls
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {contextMenu && contextMenuItems.length > 0 && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}