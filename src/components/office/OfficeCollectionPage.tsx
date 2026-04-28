import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Layout, Layers, Plus, Search, Clock3, Share2 } from 'lucide-react';
import { useOfficeDocumentStore, type OfficeDocument, type OfficeDocumentKind } from '@/store/useOfficeDocumentStore';
import { useAppTranslation } from '@/lib/appTranslations';
import OfficeShareModal from '@/components/office/OfficeShareModal';

const KIND_COPY: Record<OfficeDocumentKind, { title: string; description: string }> = {
  document: {
    title: 'Documents',
    description: 'Create and launch Collabora word-processing documents inside the existing workspace.',
  },
  spreadsheet: {
    title: 'Spreadsheets',
    description: 'Keep tables, trackers, and calculations in the same app shell as the rest of your planning tools.',
  },
  presentation: {
    title: 'Presentations',
    description: 'Build slide decks through the same document flow used elsewhere in the planner.',
  },
};

const KIND_ICONS = {
  document: FileText,
  spreadsheet: Layout,
  presentation: Layers,
} satisfies Record<OfficeDocumentKind, typeof FileText>;

interface OfficeCollectionPageProps {
  kind: OfficeDocumentKind;
}

export default function OfficeCollectionPage({ kind }: OfficeCollectionPageProps) {
  const navigate = useNavigate();
  const { text, language } = useAppTranslation();
  const { documents, loadDocuments, createDocument } = useOfficeDocumentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [shareDocument, setShareDocument] = useState<OfficeDocument | null>(null);
  const Icon = KIND_ICONS[kind];
  const copy = KIND_COPY[kind];

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => {
    return documents
      .filter((document) => document.kind === kind)
      .filter((document) => document.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [documents, kind, searchQuery]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const documentId = await createDocument(newTitle || `Untitled ${copy.title.slice(0, -1)}`, kind);
    setNewTitle('');
    navigate(`/office/editor?id=${documentId}`);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 p-8 overflow-hidden">
      <header className="flex justify-between items-start gap-6 mb-8 shrink-0">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 text-xs font-semibold mb-3">
            <Icon size={14} /> Collabora Online
          </div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{text(copy.title)}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">{text(copy.description)}</p>
        </div>
        <form onSubmit={handleCreate} className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {text('New')} {text(copy.title.slice(0, -1))}
          </label>
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={text('Give this file a name')}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400"
          />
          <button type="submit" className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
            <Plus size={16} /> {text('Create')} {text(copy.title.slice(0, -1))}
          </button>
        </form>
      </header>

      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="relative w-full max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={text('Search documents...')}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400"
          />
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{filteredDocuments.length} {text(filteredDocuments.length === 1 ? 'item' : 'items')}</div>
      </div>

      <div className="flex-1 overflow-auto">
        {filteredDocuments.length === 0 ? (
          <div className="h-full rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-800/50 flex flex-col items-center justify-center text-center px-6">
            <Icon size={36} className="text-gray-300 dark:text-gray-600 mb-4" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">{text('No files here yet')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">{text('Create a Collabora file here, or double-click an office file in Files to register and open it through the same editor flow.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredDocuments.map((document) => (
              <article
                key={document.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
                    <Icon size={22} />
                  </div>
                  <div className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    <Clock3 size={12} />
                    {new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(document.lastModified))}
                  </div>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{document.title}</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 break-all">{document.filePath}</p>
                {document.createdBy && (
                  <p className="mt-4 text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">{text('Created by')} {document.createdBy}</p>
                )}
                <div className="mt-5 flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/office/editor?id=${document.id}`)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                  >
                    <Plus size={14} /> {text('Open')}
                  </button>
                  <button
                    onClick={() => setShareDocument(document)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Share2 size={14} /> {text('Share')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {shareDocument && <OfficeShareModal doc={shareDocument} onClose={() => setShareDocument(null)} />}
    </div>
  );
}