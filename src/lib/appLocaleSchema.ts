export interface AppLocaleMeta {
  language: string;
  label: string;
  version: number | string;
  fallback?: string[];
}

export interface AppLocaleMessageMetadata {
  context?: string;
  placeholders?: Record<string, string>;
}

export type AppLocaleMessageDefinition = string | ({ value: string } & AppLocaleMessageMetadata);

export interface AppGlossaryTerm {
  term: string;
  partOfSpeech?: string;
  notes?: string;
  context?: string;
}

export type AppGlossaryTermDefinition = string | AppGlossaryTerm;

export interface AppLocaleMessagesFile {
  meta: AppLocaleMeta;
  messages: Record<string, AppLocaleMessageDefinition>;
}

export interface AppLocaleGlossaryFile {
  meta: AppLocaleMeta;
  terms: Record<string, AppGlossaryTermDefinition>;
}

export interface AppLanguagePackFile {
  language?: string;
  label?: string;
  version?: number | string;
  meta?: Partial<AppLocaleMeta>;
  messages?: Record<string, AppLocaleMessageDefinition>;
  text?: Record<string, string>;
  glossary?: {
    terms?: Record<string, AppGlossaryTermDefinition>;
  } | Record<string, AppGlossaryTermDefinition>;
  terms?: Record<string, AppGlossaryTermDefinition>;
}

export interface NormalizedAppLocaleBundle {
  meta: AppLocaleMeta;
  messages: Record<string, string>;
  messageMeta: Record<string, AppLocaleMessageMetadata>;
  glossary: Record<string, AppGlossaryTerm>;
  text: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLanguage(value: unknown, fallback = 'en') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeLabel(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeVersion(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? value : 1;
}

function normalizeFallback(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim()).map((entry) => entry.trim());
}

export function normalizeLocaleMeta(input: Partial<AppLocaleMeta> | undefined, fallbackLanguage = 'en', fallbackLabel?: string): AppLocaleMeta {
  const language = normalizeLanguage(input?.language, fallbackLanguage);
  return {
    language,
    label: normalizeLabel(input?.label, fallbackLabel ?? language),
    version: normalizeVersion(input?.version),
    fallback: normalizeFallback(input?.fallback),
  };
}

export function normalizeMessageEntries(messages: unknown) {
  const normalizedMessages: Record<string, string> = {};
  const normalizedMeta: Record<string, AppLocaleMessageMetadata> = {};

  if (!isRecord(messages)) {
    return { messages: normalizedMessages, messageMeta: normalizedMeta };
  }

  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') {
      normalizedMessages[key] = value;
      continue;
    }

    if (!isRecord(value) || typeof value.value !== 'string') continue;

    normalizedMessages[key] = value.value;
    normalizedMeta[key] = {
      context: typeof value.context === 'string' ? value.context : undefined,
      placeholders: isRecord(value.placeholders)
        ? Object.fromEntries(Object.entries(value.placeholders).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
        : undefined,
    };
  }

  return {
    messages: normalizedMessages,
    messageMeta: normalizedMeta,
  };
}

export function normalizeGlossaryTerms(terms: unknown) {
  const normalizedTerms: Record<string, AppGlossaryTerm> = {};

  if (!isRecord(terms)) return normalizedTerms;

  for (const [key, value] of Object.entries(terms)) {
    if (typeof value === 'string') {
      normalizedTerms[key] = { term: value };
      continue;
    }

    if (!isRecord(value) || typeof value.term !== 'string') continue;

    normalizedTerms[key] = {
      term: value.term,
      partOfSpeech: typeof value.partOfSpeech === 'string' ? value.partOfSpeech : undefined,
      notes: typeof value.notes === 'string' ? value.notes : undefined,
      context: typeof value.context === 'string' ? value.context : undefined,
    };
  }

  return normalizedTerms;
}

export function normalizeMessagesFile(file: AppLocaleMessagesFile) {
  const meta = normalizeLocaleMeta(file.meta, 'en');
  const { messages, messageMeta } = normalizeMessageEntries(file.messages);
  return {
    meta,
    messages,
    messageMeta,
  };
}

export function normalizeGlossaryFile(file: AppLocaleGlossaryFile) {
  return {
    meta: normalizeLocaleMeta(file.meta, 'en'),
    terms: normalizeGlossaryTerms(file.terms),
  };
}

export function createNormalizedLocaleBundle(meta: AppLocaleMeta, messages: Record<string, string>, messageMeta: Record<string, AppLocaleMessageMetadata>, glossary: Record<string, AppGlossaryTerm>, text: Record<string, string> = {}): NormalizedAppLocaleBundle {
  return {
    meta,
    messages,
    messageMeta,
    glossary,
    text,
  };
}

export function mergeNormalizedLocaleBundles(base: NormalizedAppLocaleBundle, override?: Partial<NormalizedAppLocaleBundle> | null): NormalizedAppLocaleBundle {
  if (!override) return base;

  return {
    meta: override.meta ? { ...base.meta, ...override.meta } : base.meta,
    messages: { ...base.messages, ...(override.messages ?? {}) },
    messageMeta: { ...base.messageMeta, ...(override.messageMeta ?? {}) },
    glossary: { ...base.glossary, ...(override.glossary ?? {}) },
    text: { ...base.text, ...(override.text ?? {}) },
  };
}

export function normalizeAppLanguagePackFile(file: AppLanguagePackFile): NormalizedAppLocaleBundle | null {
  const language = normalizeLanguage(file.meta?.language ?? file.language, '');
  if (!language) return null;

  const meta = normalizeLocaleMeta({
    language,
    label: file.meta?.label ?? file.label,
    version: file.meta?.version ?? file.version,
    fallback: file.meta?.fallback,
  }, language, language);

  const { messages, messageMeta } = normalizeMessageEntries(file.messages);
  const glossarySource = isRecord(file.glossary) && isRecord(file.glossary.terms)
    ? file.glossary.terms
    : file.terms ?? file.glossary;

  const glossary = normalizeGlossaryTerms(glossarySource);
  const text = isRecord(file.text)
    ? Object.fromEntries(Object.entries(file.text).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {};

  return createNormalizedLocaleBundle(meta, messages, messageMeta, glossary, text);
}

export function buildLanguagePackExportPayload(bundle: NormalizedAppLocaleBundle) {
  const messageEntries = Object.fromEntries(
    Object.entries(bundle.messages).map(([key, value]) => {
      const metadata = bundle.messageMeta[key];
      if (!metadata?.context && !metadata?.placeholders) {
        return [key, { value }];
      }

      return [key, {
        value,
        ...(metadata.context ? { context: metadata.context } : {}),
        ...(metadata.placeholders ? { placeholders: metadata.placeholders } : {}),
      }];
    }),
  );

  const glossaryEntries = Object.fromEntries(
    Object.entries(bundle.glossary).map(([key, value]) => [key, {
      term: value.term,
      ...(value.partOfSpeech ? { partOfSpeech: value.partOfSpeech } : {}),
      ...(value.notes ? { notes: value.notes } : {}),
      ...(value.context ? { context: value.context } : {}),
    }]),
  );

  return {
    language: bundle.meta.language,
    label: bundle.meta.label,
    version: bundle.meta.version,
    meta: bundle.meta,
    messages: messageEntries,
    text: bundle.text,
    glossary: {
      terms: glossaryEntries,
    },
  };
}