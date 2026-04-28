import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table as DocxTable, TableCell as DocxTableCell, TableRow as DocxTableRow, TextRun, WidthType } from 'docx';
import type { Edge, Node as FlowNode } from 'reactflow';
import type { WordExportOptions } from '@/lib/fontSettings';

export type OutlineSection = {
  heading: string;
  nodeLabel: string;
  notesHtml: string;
  attachmentImages: string[];
  level: number;
};

type ContentBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'image'; dataUrl: string; alt: string }
  | { kind: 'table'; rows: string[][] };

const MAX_HEADING_LEVEL = 6;

const PRESET_STYLES: Record<WordExportOptions['preset'], {
  titleColor: string;
  headingColor: string;
  bodyColor: string;
  accentColor: string;
}> = {
  modern: {
    titleColor: '0f172a',
    headingColor: '0369a1',
    bodyColor: '334155',
    accentColor: 'e0f2fe',
  },
  classic: {
    titleColor: '3f2d1d',
    headingColor: '7c4a03',
    bodyColor: '3f3f46',
    accentColor: 'fef3c7',
  },
  minimal: {
    titleColor: '111827',
    headingColor: '111827',
    bodyColor: '374151',
    accentColor: 'f3f4f6',
  },
};

function stripHtml(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, '').trim() || 'mindmap-export';
}

function getHeadingLevel(level: number) {
  switch (Math.min(level, MAX_HEADING_LEVEL)) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}

function makeRun(text: string, fontFamily: string, options?: { bold?: boolean; size?: number; color?: string; italics?: boolean }) {
  return new TextRun({
    text,
    font: fontFamily,
    bold: options?.bold,
    italics: options?.italics,
    size: options?.size,
    color: options?.color,
  });
}

function parseNoteContent(html: string): ContentBlock[] {
  if (!html.trim()) return [];
  if (typeof DOMParser === 'undefined') return [{ kind: 'paragraph', text: stripHtml(html) }];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: ContentBlock[] = [];

  const pushText = (value: string, prefix = '') => {
    const text = `${prefix}${value}`.replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ kind: 'paragraph', text });
  };

  for (const child of Array.from(doc.body.childNodes)) {
    if (child.nodeType === 3) {
      pushText(child.textContent || '');
      continue;
    }

    if (!(child instanceof HTMLElement)) continue;

    if (child.tagName === 'IMG') {
      const dataUrl = child.getAttribute('src');
      if (dataUrl) blocks.push({ kind: 'image', dataUrl, alt: child.getAttribute('alt') || 'Note image' });
      continue;
    }

    if (child.tagName === 'UL' || child.tagName === 'OL') {
      for (const item of Array.from(child.children)) {
        pushText(item.textContent || '', child.tagName === 'OL' ? '1. ' : '• ');
        for (const image of Array.from(item.querySelectorAll('img'))) {
          const dataUrl = image.getAttribute('src');
          if (dataUrl) blocks.push({ kind: 'image', dataUrl, alt: image.getAttribute('alt') || 'List image' });
        }
      }
      continue;
    }

    if (child.tagName === 'TABLE') {
      const rows = Array.from(child.querySelectorAll('tr')).map((row) => (
        Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() || '')
      ));
      if (rows.length > 0) blocks.push({ kind: 'table', rows });
      continue;
    }

    pushText(child.textContent || '');
    for (const image of Array.from(child.querySelectorAll('img'))) {
      const dataUrl = image.getAttribute('src');
      if (dataUrl) blocks.push({ kind: 'image', dataUrl, alt: image.getAttribute('alt') || 'Embedded image' });
    }
  }

  return blocks;
}

function extractAttachmentImages(node: FlowNode): string[] {
  const attachments = Array.isArray(node.data?.attachments) ? node.data.attachments : [];
  return attachments
    .filter((attachment: any) => typeof attachment?.type === 'string' && attachment.type.startsWith('image/') && typeof attachment?.data === 'string')
    .map((attachment: any) => attachment.data as string);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Only data URL images are supported for export.');
  }

  const [, base64] = dataUrl.split(',');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getImageType(dataUrl: string): 'png' | 'jpg' | 'gif' | 'bmp' {
  const header = dataUrl.slice(0, dataUrl.indexOf(';')).toLowerCase();
  if (header.includes('image/jpeg') || header.includes('image/jpg')) return 'jpg';
  if (header.includes('image/gif')) return 'gif';
  if (header.includes('image/bmp')) return 'bmp';
  return 'png';
}

async function getImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 520;
      const maxHeight = 320;
      const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
      resolve({
        width: Math.max(1, Math.round(image.naturalWidth * scale)),
        height: Math.max(1, Math.round(image.naturalHeight * scale)),
      });
    };
    image.onerror = () => resolve({ width: 360, height: 220 });
    image.src = dataUrl;
  });
}

export function buildOutline(nodes: FlowNode[], edges: Edge[]): { title: string; sections: OutlineSection[] } {
  const visibleNodes = nodes.filter((node) => node.type !== 'groupNode');
  const nodeMap = new Map(visibleNodes.map((node) => [node.id, node]));
  const incomingIds = new Set(edges.map((edge) => edge.target));
  const root = visibleNodes.find((node) => !incomingIds.has(node.id)) || visibleNodes[0];

  if (!root) {
    return { title: 'Mindmap Export', sections: [] };
  }

  const edgesBySource = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = edgesBySource.get(edge.source) || [];
    list.push(edge);
    edgesBySource.set(edge.source, list);
  }

  for (const [source, list] of edgesBySource.entries()) {
    list.sort((left, right) => {
      const leftTarget = nodeMap.get(left.target);
      const rightTarget = nodeMap.get(right.target);
      if (!leftTarget || !rightTarget) return 0;
      if (leftTarget.position.y !== rightTarget.position.y) return leftTarget.position.y - rightTarget.position.y;
      return leftTarget.position.x - rightTarget.position.x;
    });
    edgesBySource.set(source, list);
  }

  const visited = new Set<string>();
  const sections: OutlineSection[] = [];

  const visit = (nodeId: string, depth: number) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const branchEdges = edgesBySource.get(nodeId) || [];
    for (const edge of branchEdges) {
      const child = nodeMap.get(edge.target);
      if (!child) continue;

      const headline = typeof edge.data?.headline === 'string' ? edge.data.headline.trim() : '';
      const childLabel = typeof child.data?.label === 'string' ? child.data.label.trim() : 'Untitled Node';

      sections.push({
        heading: headline || childLabel,
        nodeLabel: childLabel,
        notesHtml: typeof child.data?.notes === 'string' ? child.data.notes : '',
        attachmentImages: extractAttachmentImages(child),
        level: depth,
      });

      visit(child.id, depth + 1);
    }
  };

  visit(root.id, 2);

  return {
    title: typeof root.data?.label === 'string' && root.data.label.trim() ? root.data.label.trim() : 'Mindmap Export',
    sections,
  };
}

export async function exportMindmapToDocx(
  nodes: FlowNode[],
  edges: Edge[],
  options: WordExportOptions,
  preferredTitle?: string,
) {
  const outline = buildOutline(nodes, edges);
  const title = (preferredTitle || outline.title || 'Mindmap Export').trim();
  const preset = PRESET_STYLES[options.preset];

  const paragraphs: Array<Paragraph | DocxTable> = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [makeRun(title, options.fontId, { bold: true, size: 34, color: preset.titleColor })],
      spacing: { after: 320 },
    }),
  ];

  if (outline.sections.length === 0) {
    paragraphs.push(
      new Paragraph({
        children: [makeRun('No connected branches were available to export.', options.fontId, { color: preset.bodyColor })],
      })
    );
  } else {
    for (const section of outline.sections) {
      paragraphs.push(
        new Paragraph({
          heading: getHeadingLevel(section.level),
          children: [makeRun(section.heading, options.fontId, { bold: true, size: 24 - Math.min(section.level, 5) * 2, color: preset.headingColor })],
          spacing: { before: 180, after: 80 },
        })
      );

      if (section.heading !== section.nodeLabel) {
        paragraphs.push(
          new Paragraph({
            children: [makeRun(section.nodeLabel, options.fontId, { italics: true, color: preset.bodyColor })],
            spacing: { after: 120 },
          })
        );
      }

      if (options.includeNotes) {
        for (const block of parseNoteContent(section.notesHtml)) {
          if (block.kind === 'paragraph') {
            paragraphs.push(
              new Paragraph({
                children: [makeRun(block.text, options.fontId, { color: preset.bodyColor })],
                spacing: { after: 120 },
              })
            );
            continue;
          }

          if (block.kind === 'table') {
            paragraphs.push(
              new DocxTable({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: block.rows.map((row, rowIndex) => new DocxTableRow({
                  children: row.map((cell) => new DocxTableCell({
                    shading: rowIndex === 0 ? { fill: preset.accentColor } : undefined,
                    children: [
                      new Paragraph({
                        children: [makeRun(cell || ' ', options.fontId, { bold: rowIndex === 0, color: preset.bodyColor })],
                      }),
                    ],
                  })),
                })),
              })
            );
            continue;
          }

          if (options.includeImages) {
            const dimensions = await getImageDimensions(block.dataUrl);
            paragraphs.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: dataUrlToBytes(block.dataUrl),
                    type: getImageType(block.dataUrl),
                    transformation: dimensions,
                    altText: { name: block.alt },
                  }),
                ],
                spacing: { after: 160 },
              })
            );
          }
        }
      }

      if (options.includeAttachmentImages && section.attachmentImages.length > 0) {
        paragraphs.push(
          new Paragraph({
            children: [makeRun('Attached Images', options.fontId, { bold: true, color: preset.headingColor })],
            shading: { fill: preset.accentColor },
            spacing: { before: 120, after: 100 },
          })
        );

        for (const image of section.attachmentImages) {
          const dimensions = await getImageDimensions(image);
          paragraphs.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: dataUrlToBytes(image),
                  type: getImageType(image),
                  transformation: dimensions,
                  altText: { name: 'Attachment image' },
                }),
              ],
              spacing: { after: 160 },
            })
          );
        }
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: options.fontId,
            color: preset.bodyColor,
          },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFileName(title)}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}