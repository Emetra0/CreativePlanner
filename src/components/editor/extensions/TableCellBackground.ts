import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

const backgroundAttribute = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
    renderHTML: (attributes: Record<string, string | null>) => {
      if (!attributes.backgroundColor) return {};
      return {
        style: `background-color: ${attributes.backgroundColor};`,
      };
    },
  },
};

export const TableCellBackground = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...backgroundAttribute,
    };
  },
});

export const TableHeaderBackground = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...backgroundAttribute,
    };
  },
});