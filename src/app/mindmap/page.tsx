import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Lightbulb, Trash2, Search, LayoutGrid, List as ListIcon,
  Star, Users, Share2, Palette, User, X,
} from 'lucide-react';
import { useMindmapStore, MindmapDocument } from '@/store/useMindmapStore';
import { useProjectStore } from '@/store/useProjectStore';
import MindmapTemplateModal from '@/components/MindmapTemplateModal';
import MindmapShareModal from '@/components/MindmapShareModal';
import { useAppDialogs } from '@/components/AppDialogs';
import { useAppTranslation } from '@/lib/appTranslations';

// â”€â”€â”€ New Moodboard Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function NewMoodboardModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string) => void }) {
  const { text } = useAppTranslation();
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) onCreate(title.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[400px] p-6 border border-gray-100 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
            <Palette size={18} className="text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 dark:text-white text-sm">{text('New Moodboard')}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{text('A free-form image canvas for visual inspiration')}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              {text('Name')}
            </label>
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={text('e.g. Character Aesthetics, Colour Palette…')}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              maxLength={60}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              {text('Cancel')}
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-xl transition-colors"
            >
              {text('Create Moodboard')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function MindmapListPage() {
  const dialogs = useAppDialogs();
  const { language, text } = useAppTranslation();
  const navigate = useNavigate();
  const { documents, loadDocuments, createDocument, deleteDocument, toggleFavorite } = useMindmapStore();
  const { projects, fetchProjects, projectResources, fetchProjectResources } = useProjectStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateMoodboardModal, setShowCreateMoodboardModal] = useState(false);
  const [shareDoc, setShareDoc] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    loadDocuments();
    fetchProjects();
  }, [loadDocuments]);

  useEffect(() => {
    if (projects.length === 0) return;
    for (const p of projects) {
      fetchProjectResources(p.id);
    }
  }, [projects]);

  // Build shared-doc maps from projectResources
  const sharedDocIds = new Set<string>();
  const sharedDocProjectNames: Record<string, string[]> = {};
  for (const project of projects) {
    for (const r of (projectResources[project.id] || [])) {
      if (r.resource_type === 'mindmap') {
        sharedDocIds.add(r.resource_id);
        sharedDocProjectNames[r.resource_id] = [...(sharedDocProjectNames[r.resource_id] || []), project.name];
      }
    }
  }

  const handleCreate = async (title: string, templateId: string) => {
    const duplicate = documents.find((d) => d.title.toLowerCase() === title.toLowerCase());
    if (duplicate) {
      await dialogs.alert({
        title: text('Duplicate name'),
        message: text('A mindmap with this name already exists. Please choose a different name.'),
      });
      return;
    }
    const newId = await createDocument(title, templateId, 'mindmap');
    setShowCreateModal(false);
    navigate(`/mindmap/editor?id=${newId}`);
  };

  const handleCreateMoodboard = async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const duplicate = documents.find((d) => d.title.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      await dialogs.alert({
        title: text('Duplicate name'),
        message: text('A document with this name already exists. Please choose a different name.'),
      });
      return;
    }
    const newId = await createDocument(trimmed, undefined, 'moodboard');
    setShowCreateMoodboardModal(false);
    navigate(`/mindmap/moodboard?id=${newId}`);
  };

  const filteredDocs = documents.filter((d) => d.title.toLowerCase().includes(searchQuery.toLowerCase()));
  // Split by type
  const mindmapDocs = filteredDocs.filter((d) => !d.type || d.type === 'mindmap');
  const moodboardDocs = filteredDocs.filter((d) => d.type === 'moodboard');
  const favoriteDocs = mindmapDocs.filter((d) => d.isFavorite);
  const otherDocs = mindmapDocs.filter((d) => !d.isFavorite);
  const sharedDocs = mindmapDocs.filter((d) => sharedDocIds.has(d.id));

  const handleDragStart = (e: React.DragEvent, docId: string) => {
    setTimeout(() => setDraggedDocId(docId), 0);
    e.dataTransfer.setData('text/plain', docId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragEnd = () => setDraggedDocId(null);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (e: React.DragEvent, targetIsFavorite: boolean) => {
    e.preventDefault();
    const docId = e.dataTransfer.getData('text/plain');
    if (docId) {
      const doc = documents.find((d) => d.id === docId);
      if (doc && doc.isFavorite !== targetIsFavorite) toggleFavorite(docId);
    }
    setDraggedDocId(null);
  };

  const gridClass = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6';
  const listClass = 'flex flex-col gap-3';

  const DocumentCard = ({ doc }: { doc: MindmapDocument }) => {
    const isMoodboard = doc.type === 'moodboard';
    const isShared = sharedDocIds.has(doc.id);
    const projectNames = sharedDocProjectNames[doc.id] || [];
    const handleClick = () =>
      navigate(isMoodboard ? `/mindmap/moodboard?id=${doc.id}` : `/mindmap/editor?id=${doc.id}`);
    return (
      <div
        draggable={!isMoodboard}
        onDragStart={isMoodboard ? undefined : (e) => handleDragStart(e, doc.id)}
        onDragEnd={isMoodboard ? undefined : handleDragEnd}
        onClick={handleClick}
        className={`
          group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
          hover:shadow-md transition-all cursor-pointer
          ${isMoodboard
            ? 'hover:border-purple-400 dark:hover:border-purple-500'
            : 'hover:border-yellow-400 dark:hover:border-yellow-500'}
          ${viewMode === 'grid' ? 'rounded-xl p-6 flex flex-col min-h-[220px]' : 'rounded-lg p-4 flex items-center justify-between'}
          ${draggedDocId === doc.id ? 'opacity-50 border-dashed border-yellow-400' : 'opacity-100'}
        `}
      >
        <div className={viewMode === 'grid' ? 'flex-1' : 'flex items-center gap-4'}>
          <div className={`rounded-lg flex items-center justify-center relative ${
            isMoodboard
              ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-500 dark:text-purple-400'
              : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400'
          } ${
            viewMode === 'grid' ? 'w-12 h-12 mb-4' : 'w-10 h-10'
          }`}>
            {isMoodboard ? <Palette size={viewMode === 'grid' ? 24 : 20} /> : <Lightbulb size={viewMode === 'grid' ? 24 : 20} />}
            {doc.isFavorite && (
              <div className="absolute -top-1 -right-1 bg-yellow-400 text-white rounded-full w-4 h-4 flex items-center justify-center border-2 border-white dark:border-gray-800">
                <Star size={8} fill="currentColor" />
              </div>
            )}
            {isShared && (
              <div className="absolute -top-1 -left-1 bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center border-2 border-white dark:border-gray-800"
                title={`${text('Shared in:')} ${projectNames.join(', ')}`}>
                <Users size={8} />
              </div>
            )}
          </div>
          <div>
            <h3 className={`font-bold text-gray-800 dark:text-white transition-colors ${
              isMoodboard ? 'group-hover:text-purple-600' : 'group-hover:text-yellow-600'
            }`}>{doc.title}</h3>
            <p className="text-xs text-gray-500 mt-1">
              {text('Last edited')}{' '}
              {doc.lastModified ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(doc.lastModified)) : text('Never')}
              {doc.lastEditedBy && (
                <span className="text-gray-400">{' · '}<span className="font-medium">{doc.lastEditedBy}</span></span>
              )}
            </p>
            {doc.createdBy && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                <User size={9} /> {doc.createdBy}
              </p>
            )}
            {isShared && projectNames.length > 0 && (
              <p className="text-[10px] text-blue-500 mt-0.5 flex items-center gap-1">
                <Users size={9} /> {projectNames.join(', ')}
              </p>
            )}
          </div>
        </div>

        {viewMode === 'grid' && (
          <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <button onClick={(e) => { e.stopPropagation(); toggleFavorite(doc.id); }}
              className={`text-xs flex items-center gap-1 ${
                doc.isFavorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'
              }`}>
              <Star size={14} fill={doc.isFavorite ? 'currentColor' : 'none'} />
              {text('Favorite')}
            </button>
            <div className="flex items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); setShareDoc({ id: doc.id, title: doc.title }); }}
                className={`p-2 rounded-full transition-colors ${
                  isShared ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`} title={text('Share')}>
                <Share2 size={15} />
              </button>
              <button onClick={async (e) => {
                e.stopPropagation();
                if (await dialogs.confirm({ title: text('Delete document'), message: text('Delete "{{title}}"?', { title: doc.title }), confirmLabel: text('Delete'), isDanger: true })) {
                  deleteDocument(doc.id);
                }
              }}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        )}

        {viewMode === 'list' && (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); toggleFavorite(doc.id); }}
              className={`p-2 rounded-full ${
                doc.isFavorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'
              }`}>
              <Star size={16} fill={doc.isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShareDoc({ id: doc.id, title: doc.title }); }}
              className={`p-2 rounded-full transition-colors ${
                isShared ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500'
              }`} title={text('Share')}>
              <Share2 size={16} />
            </button>
            <button onClick={async (e) => {
              e.stopPropagation();
              if (await dialogs.confirm({ title: text('Delete document'), message: text('Delete "{{title}}"?', { title: doc.title }), confirmLabel: text('Delete'), isDanger: true })) {
                deleteDocument(doc.id);
              }
            }}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 p-8 overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{text('Mindmap Documents')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{text('Create and manage your mindmaps')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateMoodboardModal(true)}
            className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm text-sm"
          >
            <Palette size={16} /> {text('New Moodboard')}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={20} /> {text('New Mindmap')}
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={text('Search mindmaps...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-yellow-500 outline-none transition-all text-gray-800 dark:text-white"
          />
        </div>
        <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-all ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-yellow-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-all ${
              viewMode === 'list'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-yellow-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ListIcon size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 space-y-8">
        {/* â”€â”€ Working On â”€â”€ */}
        <section
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, true)}
          className={`min-h-[140px] rounded-2xl border-2 border-dashed transition-colors p-6 ${
            draggedDocId
              ? 'border-yellow-300 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-900/10'
              : 'border-transparent'
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <Star className="text-yellow-500 fill-yellow-500" size={20} />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{text('Working On')}</h2>
            <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{favoriteDocs.length}</span>
          </div>
          {favoriteDocs.length === 0 ? (
            <div className="text-center text-gray-400 py-8 italic text-sm">
              {text('Star a mindmap or drag it here to pin it under "Working On"')}
            </div>
          ) : (
            <div className={viewMode === 'grid' ? gridClass : listClass}>
              {favoriteDocs.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
            </div>
          )}
        </section>

        {/* â”€â”€ All Mindmaps â”€â”€ */}
        <section
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, false)}
          className={`min-h-[140px] rounded-2xl border-2 border-dashed transition-colors p-6 ${
            draggedDocId
              ? 'border-gray-300 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30'
              : 'border-transparent'
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="text-gray-500" size={20} />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{text('All Mindmaps')}</h2>
            <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{otherDocs.length}</span>
          </div>
          {otherDocs.length === 0 ? (
            <div className="text-center text-gray-400 py-8 italic text-sm">{text('No mindmaps yet')}</div>
          ) : (
            <div className={viewMode === 'grid' ? gridClass : listClass}>
              {otherDocs.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
            </div>
          )}
        </section>

        {/* â”€â”€ Shared â”€â”€ */}
        <section className="p-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40">
          <div className="flex items-center gap-2 mb-4">
            <Users className="text-blue-500" size={20} />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{text('Shared')}</h2>
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full">{sharedDocs.length}</span>
            <span className="ml-1 text-xs text-gray-400">{text('Mindmaps linked to a project')}</span>
          </div>
          {sharedDocs.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
              <Share2 size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">{text('No shared mindmaps yet.')}</p>
              <p className="text-xs text-gray-400 mt-1">{text('Click the share icon on any mindmap card to share it with collaborators.')}</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? gridClass : listClass}>
              {sharedDocs.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
            </div>
          )}
        </section>

        {/* â”€â”€ Moodboards â”€â”€ */}
        <section className="p-6 rounded-2xl border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-900/10">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="text-purple-500" size={20} />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{text('Moodboards')}</h2>
            <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 px-2 py-0.5 rounded-full">{moodboardDocs.length}</span>
            <span className="ml-1 text-xs text-gray-400">{text('Visual image boards')}</span>
          </div>
          {moodboardDocs.length === 0 ? (
            <div
              className="text-center py-10 border-2 border-dashed border-purple-200 dark:border-purple-800 rounded-xl cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
              onClick={() => setShowCreateMoodboardModal(true)}
            >
              <Palette size={32} className="mx-auto text-purple-300 dark:text-purple-700 mb-2" />
              <p className="text-sm text-gray-400">{text('No moodboards yet.')}</p>
              <p className="text-xs text-purple-400 mt-1 font-medium">{text('Click here or use "New Moodboard" to create one')}</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? gridClass : listClass}>
              {moodboardDocs.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
            </div>
          )}
        </section>
      </div>

      {showCreateModal && (
        <MindmapTemplateModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
      )}
      {showCreateMoodboardModal && (
        <NewMoodboardModal onClose={() => setShowCreateMoodboardModal(false)} onCreate={handleCreateMoodboard} />
      )}
      {shareDoc && <MindmapShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}
    </div>
  );
}
