export interface TableGridData {
  cells: string[][];
}

export interface TableSelectionRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

function createEmptyRow(columnCount: number) {
  return Array.from({ length: Math.max(1, columnCount) }, () => '');
}

export function createTableGrid(rowCount = 4, columnCount = 4): TableGridData {
  const rows = Math.max(1, rowCount);
  const columns = Math.max(1, columnCount);
  return {
    cells: Array.from({ length: rows }, () => createEmptyRow(columns)),
  };
}

export function normalizeTableGrid(value: unknown, fallbackRows = 4, fallbackColumns = 4): TableGridData {
  const fallback = createTableGrid(fallbackRows, fallbackColumns);
  if (!value || typeof value !== 'object' || !Array.isArray((value as TableGridData).cells)) {
    return fallback;
  }

  const rawRows = (value as TableGridData).cells.filter((row) => Array.isArray(row));
  if (rawRows.length === 0) return fallback;

  const columnCount = Math.max(1, ...rawRows.map((row) => row.length || 1));

  return {
    cells: rawRows.map((row) => Array.from({ length: columnCount }, (_, index) => String(row[index] ?? ''))),
  };
}

export function updateTableCell(grid: TableGridData, rowIndex: number, columnIndex: number, value: string): TableGridData {
  return {
    cells: grid.cells.map((row, currentRow) => (
      currentRow === rowIndex
        ? row.map((cell, currentColumn) => (currentColumn === columnIndex ? value : cell))
        : row
    )),
  };
}

export function addTableRow(grid: TableGridData, rowIndex?: number): TableGridData {
  const insertAt = typeof rowIndex === 'number' ? Math.max(0, Math.min(grid.cells.length, rowIndex)) : grid.cells.length;
  const nextRows = [...grid.cells];
  nextRows.splice(insertAt, 0, createEmptyRow(grid.cells[0]?.length || 1));
  return { cells: nextRows };
}

export function removeTableRow(grid: TableGridData, rowIndex?: number): TableGridData {
  if (grid.cells.length <= 1) return createTableGrid(1, grid.cells[0]?.length || 1);
  const removeAt = typeof rowIndex === 'number' ? Math.max(0, Math.min(grid.cells.length - 1, rowIndex)) : grid.cells.length - 1;
  return {
    cells: grid.cells.filter((_, index) => index !== removeAt),
  };
}

export function addTableColumn(grid: TableGridData, columnIndex?: number): TableGridData {
  const currentColumns = grid.cells[0]?.length || 1;
  const insertAt = typeof columnIndex === 'number' ? Math.max(0, Math.min(currentColumns, columnIndex)) : currentColumns;
  return {
    cells: grid.cells.map((row) => {
      const nextRow = [...row];
      nextRow.splice(insertAt, 0, '');
      return nextRow;
    }),
  };
}

export function removeTableColumn(grid: TableGridData, columnIndex?: number): TableGridData {
  const currentColumns = grid.cells[0]?.length || 1;
  if (currentColumns <= 1) return createTableGrid(grid.cells.length || 1, 1);
  const removeAt = typeof columnIndex === 'number' ? Math.max(0, Math.min(currentColumns - 1, columnIndex)) : currentColumns - 1;
  return {
    cells: grid.cells.map((row) => row.filter((_, index) => index !== removeAt)),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function tableGridToHtml(grid: TableGridData): string {
  const body = grid.cells
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell).replace(/\n/g, '<br />') || '&nbsp;'}</td>`).join('')}</tr>`)
    .join('');

  return `<table><tbody>${body}</tbody></table>`;
}

export function tableGridToPlainText(grid: TableGridData): string {
  return grid.cells.map((row) => row.join('\t')).join('\n');
}

export function plainTextToTableGrid(value: string): TableGridData | null {
  const trimmed = value.replace(/\r/g, '').trim();
  if (!trimmed || !trimmed.includes('\t')) return null;

  const rows = trimmed.split('\n').map((row) => row.split('\t'));
  const columnCount = Math.max(1, ...rows.map((row) => row.length || 1));

  return {
    cells: rows.map((row) => Array.from({ length: columnCount }, (_, index) => String(row[index] ?? ''))),
  };
}

export function overlayTableGrid(base: TableGridData, overlay: TableGridData, startRow: number, startColumn: number): TableGridData {
  const targetRows = Math.max(base.cells.length, startRow + overlay.cells.length);
  const targetColumns = Math.max(base.cells[0]?.length || 1, startColumn + (overlay.cells[0]?.length || 1));
  const normalizedBase = normalizeTableGrid(base, targetRows, targetColumns);
  let next = normalizedBase;

  while (next.cells.length < targetRows) next = addTableRow(next);
  while ((next.cells[0]?.length || 1) < targetColumns) next = addTableColumn(next);

  overlay.cells.forEach((row, rowOffset) => {
    row.forEach((cell, columnOffset) => {
      next = updateTableCell(next, startRow + rowOffset, startColumn + columnOffset, cell);
    });
  });

  return next;
}

export function normalizeTableSelection(range: TableSelectionRange): TableSelectionRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    endRow: Math.max(range.startRow, range.endRow),
    startColumn: Math.min(range.startColumn, range.endColumn),
    endColumn: Math.max(range.startColumn, range.endColumn),
  };
}

export function isCellInSelection(range: TableSelectionRange | null, rowIndex: number, columnIndex: number): boolean {
  if (!range) return false;
  const normalized = normalizeTableSelection(range);
  return rowIndex >= normalized.startRow
    && rowIndex <= normalized.endRow
    && columnIndex >= normalized.startColumn
    && columnIndex <= normalized.endColumn;
}

export function extractTableGridRange(grid: TableGridData, range: TableSelectionRange | null): TableGridData {
  if (!range) return normalizeTableGrid(grid);
  const normalized = normalizeTableSelection(range);
  return {
    cells: grid.cells.slice(normalized.startRow, normalized.endRow + 1).map((row) => row.slice(normalized.startColumn, normalized.endColumn + 1)),
  };
}

export function clearTableGridRange(grid: TableGridData, range: TableSelectionRange | null): TableGridData {
  if (!range) return grid;
  const normalized = normalizeTableSelection(range);
  return {
    cells: grid.cells.map((row, rowIndex) => row.map((cell, columnIndex) => (
      rowIndex >= normalized.startRow
      && rowIndex <= normalized.endRow
      && columnIndex >= normalized.startColumn
      && columnIndex <= normalized.endColumn
        ? ''
        : cell
    ))),
  };
}

export function getSelectionAnchor(range: TableSelectionRange | null): { row: number; column: number } {
  if (!range) return { row: 0, column: 0 };
  const normalized = normalizeTableSelection(range);
  return { row: normalized.startRow, column: normalized.startColumn };
}

export function getColumnLabel(columnIndex: number): string {
  let label = '';
  let value = columnIndex + 1;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}