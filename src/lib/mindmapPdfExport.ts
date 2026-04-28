import type { Edge, Node as FlowNode } from 'reactflow';
import { buildOutline, sanitizeFileName } from '@/lib/mindmapDocxExport';
import { resolveAppLanguage, type AppLanguageCode } from '@/lib/appLanguages';
import { buildFontFaceCss, resolveFontChoice, type CustomFontDefinition, type WordExportOptions } from '@/lib/fontSettings';

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function sanitizeNotesHtml(value: string, includeImages: boolean) {
  if (!value.trim()) return '';

  if (typeof DOMParser === 'undefined') {
    const withoutScripts = value.replace(/<script[\s\S]*?<\/script>/gi, '');
    return includeImages ? withoutScripts : withoutScripts.replace(/<img[^>]*>/gi, '');
  }

  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(value, 'text/html');

  for (const element of Array.from(documentFragment.querySelectorAll('script, style, iframe, object, embed, link'))) {
    element.remove();
  }

  if (!includeImages) {
    for (const image of Array.from(documentFragment.querySelectorAll('img'))) {
      image.remove();
    }
  }

  for (const element of Array.from(documentFragment.body.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if ((attribute.name === 'href' || attribute.name === 'src') && /^javascript:/i.test(attribute.value.trim())) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return documentFragment.body.innerHTML;
}

function buildAttachmentImageHtml(images: string[]) {
  return images.map((image, index) => `
    <figure class="attachment-image-block">
      <img src="${image}" alt="Attachment image ${index + 1}" />
    </figure>
  `).join('');
}

export async function exportMindmapToPdf(
  nodes: FlowNode[],
  edges: Edge[],
  options: WordExportOptions,
  preferredTitle: string | undefined,
  appFontId: string,
  customFonts: CustomFontDefinition[],
  appLanguage: AppLanguageCode,
) {
  const outline = buildOutline(nodes, edges);
  const title = (preferredTitle || outline.title || 'Mindmap Export').trim();
  const documentTitle = sanitizeFileName(title);
  const preset = PRESET_STYLES[options.preset];
  const resolvedFont = resolveFontChoice(appFontId, customFonts);
  const documentLanguage = resolveAppLanguage(appLanguage);
  const fontFaceCss = customFonts
    .map((font) => buildFontFaceCss(font))
    .filter((value): value is string => Boolean(value))
    .join('\n');

  const sectionMarkup = outline.sections.length > 0
    ? outline.sections.map((section) => {
        const headingLevel = Math.min(section.level, 6);
        const sanitizedNotes = options.includeNotes ? sanitizeNotesHtml(section.notesHtml, options.includeImages) : '';
        const notesHtml = sanitizedNotes
          ? `<div class="notes-html">${sanitizedNotes}</div>`
          : '';
        const attachmentsHtml = options.includeAttachmentImages && section.attachmentImages.length > 0
          ? `
            <div class="attachment-block">
              <div class="attachment-label">Attached Images</div>
              <div class="attachment-grid">${buildAttachmentImageHtml(section.attachmentImages)}</div>
            </div>
          `
          : '';

        return `
          <section class="export-section export-level-${section.level}">
            <h${headingLevel} class="section-heading">${escapeHtml(section.heading)}</h${headingLevel}>
            ${section.heading !== section.nodeLabel ? `<p class="node-label">${escapeHtml(section.nodeLabel)}</p>` : ''}
            ${notesHtml}
            ${attachmentsHtml}
          </section>
        `;
      }).join('')
    : '<p class="empty-state">No connected branches were available to export.</p>';

  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    throw new Error('Allow pop-ups in the browser to export the document as PDF.');
  }

  const html = `
    <!DOCTYPE html>
    <html lang="${escapeHtmlAttribute(documentLanguage)}" style="--document-font-family: ${escapeHtmlAttribute(resolvedFont.cssFamily)};">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(documentTitle)}</title>
        <style>
          ${fontFaceCss}

          @page {
            size: A4;
            margin: 18mm;
          }

          :root {
            color-scheme: light;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #${preset.bodyColor};
            font-family: var(--document-font-family);
            line-height: 1.55;
          }

          main {
            width: 100%;
            margin: 0 auto;
          }

          .document-header {
            margin-bottom: 1.75rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid #${preset.accentColor};
          }

          .document-title {
            margin: 0;
            font-size: 2rem;
            line-height: 1.15;
            color: #${preset.titleColor};
          }

          .document-meta {
            margin-top: 0.5rem;
            font-size: 0.85rem;
            color: #64748b;
          }

          .export-section {
            break-inside: avoid;
            margin-bottom: 1.5rem;
          }

          .section-heading {
            margin: 0 0 0.45rem;
            color: #${preset.headingColor};
            line-height: 1.2;
          }

          .node-label {
            margin: 0 0 0.75rem;
            color: #64748b;
            font-style: italic;
          }

          .notes-html {
            font-size: 0.97rem;
          }

          .notes-html > *:first-child {
            margin-top: 0;
          }

          .notes-html > *:last-child {
            margin-bottom: 0;
          }

          .notes-html h1,
          .notes-html h2,
          .notes-html h3,
          .notes-html h4,
          .notes-html h5,
          .notes-html h6 {
            color: #${preset.headingColor};
            margin-top: 1rem;
            margin-bottom: 0.35rem;
          }

          .notes-html p,
          .notes-html ul,
          .notes-html ol,
          .notes-html blockquote {
            margin: 0 0 0.75rem;
          }

          .notes-html a {
            color: #${preset.headingColor};
          }

          .notes-html blockquote {
            margin-left: 0;
            padding-left: 1rem;
            border-left: 4px solid #${preset.accentColor};
          }

          .notes-html table {
            width: 100%;
            border-collapse: collapse;
            margin: 0.9rem 0;
            break-inside: avoid;
          }

          .notes-html th,
          .notes-html td {
            border: 1px solid #cbd5e1;
            padding: 0.45rem 0.55rem;
            vertical-align: top;
            text-align: left;
          }

          .notes-html th {
            background: #${preset.accentColor};
          }

          .notes-html img,
          .attachment-grid img {
            max-width: 100%;
            height: auto;
            display: block;
            border-radius: 0.75rem;
            break-inside: avoid;
          }

          .attachment-block {
            margin-top: 1rem;
            padding: 0.85rem 1rem;
            border-radius: 1rem;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
          }

          .attachment-label {
            margin-bottom: 0.75rem;
            font-size: 0.8rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #64748b;
          }

          .attachment-grid {
            display: grid;
            gap: 0.9rem;
          }

          .attachment-image-block {
            margin: 0;
          }

          .empty-state {
            color: #64748b;
          }

          @media print {
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <header class="document-header">
            <h1 class="document-title">${escapeHtml(title)}</h1>
            <div class="document-meta">PDF export keeps the live document font and note formatting from the current document.</div>
          </header>
          ${sectionMarkup}
        </main>
        <script>
          const waitForImages = async () => {
            const images = Array.from(document.images);
            await Promise.all(images.map((image) => {
              if (image.complete) return Promise.resolve();
              return new Promise((resolve) => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
              });
            }));
          };

          window.addEventListener('load', async () => {
            try {
              if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
              }
              await waitForImages();
            } catch {}

            window.setTimeout(() => {
              window.focus();
              window.print();
            }, 180);
          });

          window.addEventListener('afterprint', () => {
            window.close();
          });
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}