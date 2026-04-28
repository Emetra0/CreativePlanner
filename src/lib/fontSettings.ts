export interface CustomFontDefinition {
  id: string;
  name: string;
  cssFamily: string;
  docxFamily: string;
  source: 'upload' | 'url' | 'local';
  dataUrl?: string;
  url?: string;
  format?: string;
  fallbackFontId?: string;
  postscriptName?: string;
}

export type WordExportPreset = 'modern' | 'classic' | 'minimal';

export interface WordExportOptions {
  preset: WordExportPreset;
  includeNotes: boolean;
  includeImages: boolean;
  includeAttachmentImages: boolean;
  fontId: string;
}

export interface BuiltInFontPreset {
  id: string;
  label: string;
  cssFamily: string;
  docxFamily: string;
}

export const DEFAULT_FONT_ID = 'system-ui';

export const BUILT_IN_FONT_PRESETS: BuiltInFontPreset[] = [
  {
    id: 'system-ui',
    label: 'System UI',
    cssFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    docxFamily: 'Segoe UI',
  },
  {
    id: 'segoe-ui',
    label: 'Segoe UI',
    cssFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    docxFamily: 'Segoe UI',
  },
  {
    id: 'trebuchet-ms',
    label: 'Trebuchet MS',
    cssFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
    docxFamily: 'Trebuchet MS',
  },
  {
    id: 'palatino',
    label: 'Palatino',
    cssFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    docxFamily: 'Palatino Linotype',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    cssFamily: "Georgia, 'Times New Roman', serif",
    docxFamily: 'Georgia',
  },
  {
    id: 'verdana',
    label: 'Verdana',
    cssFamily: "Verdana, Geneva, sans-serif",
    docxFamily: 'Verdana',
  },
];

export const DEFAULT_WORD_EXPORT_OPTIONS: WordExportOptions = {
  preset: 'modern',
  includeNotes: true,
  includeImages: true,
  includeAttachmentImages: true,
  fontId: DEFAULT_FONT_ID,
};

export function inferFontFormat(fileNameOrMime: string): string | undefined {
  const value = fileNameOrMime.toLowerCase();
  if (value.includes('woff2') || value.endsWith('.woff2')) return 'woff2';
  if (value.includes('woff') || value.endsWith('.woff')) return 'woff';
  if (value.includes('opentype') || value.endsWith('.otf')) return 'opentype';
  if (value.includes('truetype') || value.endsWith('.ttf')) return 'truetype';
  return undefined;
}

export function normalizeFontFamily(value: string) {
  return value.trim().replace(/^['"]+|['"]+$/g, '').toLowerCase();
}

export function escapeFontFaceName(value: string) {
  return value.replace(/["\\]/g, '\\$&');
}

export function buildFontFaceSource(font: Pick<CustomFontDefinition, 'cssFamily' | 'dataUrl' | 'url' | 'format' | 'source' | 'name' | 'postscriptName'>) {
  const remoteSource = font.dataUrl || font.url;
  if (remoteSource) {
    const descriptor = font.format ? ` format('${font.format}')` : '';
    return `url(${remoteSource})${descriptor}`;
  }

  if (font.source !== 'local') return null;

  const localSources = Array.from(new Set([
    font.postscriptName,
    font.name,
    font.cssFamily,
  ].filter(Boolean).map((name) => `local("${escapeFontFaceName(name as string)}")`)));

  return localSources.length > 0 ? localSources.join(', ') : null;
}

export function buildFontFaceCss(font: Pick<CustomFontDefinition, 'cssFamily' | 'dataUrl' | 'url' | 'format' | 'source' | 'name' | 'postscriptName'>) {
  const source = buildFontFaceSource(font);
  if (!source) return null;
  return `@font-face { font-family: '${escapeFontFaceName(font.cssFamily)}'; src: ${source}; font-display: swap; }`;
}

export function getFallbackFontChoice(fontId?: string) {
  return BUILT_IN_FONT_PRESETS.find((font) => font.id === fontId) || BUILT_IN_FONT_PRESETS[0];
}

export function buildCustomFontCssFamily(font: CustomFontDefinition) {
  const fallback = getFallbackFontChoice(font.fallbackFontId);
  return `'${font.cssFamily}', ${fallback.cssFamily}`;
}

export function isLocalOnlyFont(fontId: string, customFonts: CustomFontDefinition[]) {
  return customFonts.find((font) => font.id === fontId)?.source === 'local';
}

export function resolveFontChoice(fontId: string, customFonts: CustomFontDefinition[]) {
  const builtIn = BUILT_IN_FONT_PRESETS.find((font) => font.id === fontId);
  if (builtIn) {
    return {
      id: builtIn.id,
      label: builtIn.label,
      cssFamily: builtIn.cssFamily,
      docxFamily: builtIn.docxFamily,
      localOnly: false,
      fallbackLabel: builtIn.label,
      source: 'built-in',
    };
  }

  const custom = customFonts.find((font) => font.id === fontId);
  if (custom) {
    const fallback = getFallbackFontChoice(custom.fallbackFontId);
    return {
      id: custom.id,
      label: custom.name,
      cssFamily: buildCustomFontCssFamily(custom),
      docxFamily: custom.source === 'local' ? fallback.docxFamily : custom.docxFamily,
      localOnly: custom.source === 'local',
      fallbackLabel: fallback.label,
      source: custom.source,
    };
  }

  const fallback = BUILT_IN_FONT_PRESETS[0];
  return {
    id: fallback.id,
    label: fallback.label,
    cssFamily: fallback.cssFamily,
    docxFamily: fallback.docxFamily,
    localOnly: false,
    fallbackLabel: fallback.label,
    source: 'built-in',
  };
}