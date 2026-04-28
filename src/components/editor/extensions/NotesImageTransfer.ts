import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

type ImageTransferSnapshot = {
  files: File[];
  sources: string[];
};

export interface NotesImageTransferOptions {
  imageNodeType: string;
  imageWidth: string;
  onDragStateChange?: (isOver: boolean) => void;
}

const notesImageTransferKey = new PluginKey('notesImageTransfer');

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read image file.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function getDroppedImageSources(dataTransfer: DataTransfer) {
  const sources = new Set<string>();
  const uriList = dataTransfer.getData('text/uri-list');
  const html = dataTransfer.getData('text/html');
  const plainText = dataTransfer.getData('text/plain').trim();

  uriList
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith('#'))
    .forEach((entry) => sources.add(entry));

  const imageMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of imageMatches) {
    if (match[1]) sources.add(match[1]);
  }

  if (/^(https?:|data:image\/)/i.test(plainText)) {
    sources.add(plainText);
  }

  return Array.from(sources).filter((source) => /^(https?:|data:image\/)/i.test(source));
}

function getTransferImageFiles(dataTransfer: DataTransfer) {
  const files = new Map<string, File>();

  for (const file of Array.from(dataTransfer.files)) {
    if (!file.type.startsWith('image/')) continue;
    files.set(`${file.name}:${file.size}:${file.lastModified}:${file.type}`, file);
  }

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (!file || !file.type.startsWith('image/')) continue;
    files.set(`${file.name}:${file.size}:${file.lastModified}:${file.type}`, file);
  }

  return Array.from(files.values());
}

function snapshotImageTransfer(dataTransfer: DataTransfer | null | undefined): ImageTransferSnapshot | null {
  if (!dataTransfer) return null;

  const files = getTransferImageFiles(dataTransfer);
  const sources = getDroppedImageSources(dataTransfer);
  if (files.length === 0 && sources.length === 0) {
    return null;
  }

  return { files, sources };
}

async function buildImageContent(snapshot: ImageTransferSnapshot, imageNodeType: string, imageWidth: string) {
  const fileNodes = await Promise.all(
    snapshot.files.map(async (file) => ({
      type: imageNodeType,
      attrs: {
        src: await readFileAsDataUrl(file),
        alt: file.name || 'Dropped image',
        title: file.name || 'Dropped image',
        width: imageWidth,
      },
    })),
  );

  const sourceNodes = snapshot.sources.map((source, index) => ({
    type: imageNodeType,
    attrs: {
      src: source,
      alt: `Dropped image ${index + 1}`,
      title: `Dropped image ${index + 1}`,
      width: imageWidth,
    },
  }));

  return [...fileNodes, ...sourceNodes].flatMap((node) => [node, { type: 'paragraph' }]);
}

export const NotesImageTransfer = Extension.create<NotesImageTransferOptions>({
  name: 'notesImageTransfer',

  addOptions() {
    return {
      imageNodeType: 'resizableImage',
      imageWidth: '100',
      onDragStateChange: undefined,
    };
  },

  addProseMirrorPlugins() {
    const setDragState = (isOver: boolean) => {
      this.options.onDragStateChange?.(isOver);
    };

    const insertSnapshot = async (snapshot: ImageTransferSnapshot, position?: number) => {
      const content = await buildImageContent(snapshot, this.options.imageNodeType, this.options.imageWidth);
      const editor = this.editor;

      if (!editor || editor.isDestroyed) {
        return false;
      }

      editor.chain().focus().insertContentAt(position ?? editor.state.selection.from, content).run();
      return true;
    };

    return [
      new Plugin({
        key: notesImageTransferKey,
        props: {
          handlePaste: (view, event) => {
            const snapshot = snapshotImageTransfer(event.clipboardData);
            if (!snapshot) return false;

            event.preventDefault();
            setDragState(false);
            void insertSnapshot(snapshot, view.state.selection.from);
            return true;
          },
          handleDrop: (view, event, _slice, moved) => {
            if (moved) return false;

            const snapshot = snapshotImageTransfer(event.dataTransfer);
            if (!snapshot) return false;

            event.preventDefault();
            setDragState(false);
            const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
            void insertSnapshot(snapshot, position);
            return true;
          },
          handleDOMEvents: {
            dragenter: (_view, event) => {
              const dragEvent = event as DragEvent;
              if (!snapshotImageTransfer(dragEvent.dataTransfer)) return false;
              setDragState(true);
              return false;
            },
            dragover: (_view, event) => {
              const dragEvent = event as DragEvent;
              if (!snapshotImageTransfer(dragEvent.dataTransfer)) return false;

              dragEvent.preventDefault();
              if (dragEvent.dataTransfer) {
                dragEvent.dataTransfer.dropEffect = 'copy';
              }
              setDragState(true);
              return true;
            },
            dragleave: (_view, event) => {
              const dragEvent = event as DragEvent;
              const nextTarget = dragEvent.relatedTarget as globalThis.Node | null;
              if (nextTarget && (dragEvent.currentTarget as HTMLElement | null)?.contains(nextTarget)) {
                return false;
              }

              setDragState(false);
              return false;
            },
            drop: () => {
              setDragState(false);
              return false;
            },
          },
        },
      }),
    ];
  },
});