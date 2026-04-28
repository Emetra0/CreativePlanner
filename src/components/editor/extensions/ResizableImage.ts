import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import ResizableImageView from '@/components/editor/ResizableImageView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setImageWidth: (width: string) => ReturnType;
    };
  }
}

export const ResizableImage = Image.extend({
  name: 'resizableImage',

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100',
        parseHTML: (element) => {
          const widthAttr = element.getAttribute('data-width') || element.getAttribute('width');
          if (widthAttr) return widthAttr.replace('%', '');

          const styleWidth = (element as HTMLElement).style.width;
          if (styleWidth?.endsWith('%')) return styleWidth.replace('%', '');

          return '100';
        },
        renderHTML: (attributes) => ({
          'data-width': attributes.width || '100',
          style: `width:${attributes.width || '100'}%;height:auto;display:block;margin:8px 0;`,
        }),
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageWidth: (width) => ({ commands }) => commands.updateAttributes(this.name, { width }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});