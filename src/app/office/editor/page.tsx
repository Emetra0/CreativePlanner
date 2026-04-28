import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, FileText, Layout, Layers, FolderOpen, AlertTriangle, Share2 } from 'lucide-react';
import { useOfficeDocumentStore } from '@/store/useOfficeDocumentStore';
import { useAppTranslation } from '@/lib/appTranslations';
import { useAuthStore } from '@/store/useAuthStore';
import { useProjectStore } from '@/store/useProjectStore';
import { getWorkerUrl } from '@/lib/cloudSync';
import OfficeShareModal from '@/components/office/OfficeShareModal';
import { useSettingsStore } from '@/store/useSettingsStore';

const KIND_ICON = {
  document: FileText,
  spreadsheet: Layout,
  presentation: Layers,
};

export default function OfficeEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { text, language } = useAppTranslation();
  const { token } = useAuthStore();
  const { collaboraUrl } = useSettingsStore();
  const { projectResources, projects, fetchProjects, fetchProjectResources } = useProjectStore();
  const { documents, loadDocuments, getRouteForKind, syncSharedDocument, getDocumentSnapshot } = useOfficeDocumentStore();
  const documentId = searchParams.get('id') || '';
  const [launchState, setLaunchState] = useState<{ configured: boolean; launchUrl?: string; error?: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    for (const project of projects) {
      if (!projectResources[project.id]) {
        fetchProjectResources(project.id);
      }
    }
  }, [projects, projectResources, fetchProjectResources]);

  const currentDocument = documents.find((document) => document.id === documentId);
  const Icon = currentDocument ? KIND_ICON[currentDocument.kind] : FileText;
  const linkedProject = useMemo(() => projects.find((project) =>
    (projectResources[project.id] || []).some((resource) => resource.resource_type === 'document' && resource.resource_id === documentId),
  ) || null, [documentId, projectResources, projects]);

  useEffect(() => {
    if (!currentDocument || !token) return;

    let cancelled = false;
    const run = async () => {
      const snapshot = await getDocumentSnapshot(currentDocument.id);
      if (linkedProject) {
        await syncSharedDocument(linkedProject.id, currentDocument.id);
      }

      try {
        const response = await fetch(`${getWorkerUrl()}/office/launch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            document: snapshot?.document || currentDocument,
            data: snapshot?.data,
            project_id: linkedProject?.id,
            resource_id: linkedProject ? currentDocument.id : undefined,
            collabora: {
              serverUrl: collaboraUrl || undefined,
            },
          }),
        });
        const payload = await response.json();
        if (!cancelled) {
          setLaunchState({ configured: !!payload?.configured, launchUrl: payload?.launchUrl, error: payload?.error });
        }
      } catch {
        if (!cancelled) {
          setLaunchState({ configured: false, error: 'Failed to load Collabora launch configuration' });
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [collaboraUrl, currentDocument, getDocumentSnapshot, linkedProject, syncSharedDocument, token]);

  if (!currentDocument) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
        <div className="max-w-lg rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center shadow-sm">
          <AlertTriangle size={28} className="mx-auto text-amber-500 mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{text('Office document not found')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{text('Go back to the file list and reopen the document from Documents, Spreadsheets, Presentations, or Files.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
            <Icon size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{currentDocument.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{currentDocument.filePath}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(currentDocument.lastModified))}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Share2 size={16} /> {text('Share')}
          </button>
          <button
            onClick={() => navigate('/files')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <FolderOpen size={16} /> {text('Files')}
          </button>
          <button
            onClick={() => navigate(getRouteForKind(currentDocument.kind))}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <ExternalLink size={16} /> {text('Back to list')}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-6">
        {launchState?.configured && launchState.launchUrl ? (
          <div className="h-full rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <iframe
              title={currentDocument.title}
              src={launchState.launchUrl}
              className="w-full h-full border-0"
            />
          </div>
        ) : (
          <div className="h-full rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 flex items-center justify-center">
            <div className="max-w-2xl text-center">
              <Icon size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{text('Collabora host not configured yet')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {launchState?.error
                  ? text(launchState.error)
                  : text('Add your Collabora cool.html endpoint in Settings. The app sends that host directly during office launch, and the worker keeps serving the signed WOPI file metadata and content endpoints for the embedded session.')}
              </p>
              <div className="flex items-center justify-center gap-3 mb-6">
                <button
                  onClick={() => navigate('/settings?section=section-cloud')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <ExternalLink size={16} /> {text('Open Settings')}
                </button>
              </div>
              <div className="rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 text-left text-sm text-gray-600 dark:text-gray-300">
                <div><strong>{text('Expected file')}:</strong> <span className="break-all">{currentDocument.filePath}</span></div>
                <div className="mt-2"><strong>{text('Kind')}:</strong> {currentDocument.kind}</div>
                <div className="mt-2"><strong>{text('Configured through')}:</strong> {text('App settings')} -&gt; /office/launch -&gt; /office/wopi/files/:id</div>
                <div className="mt-2"><strong>{text('Selected host')}:</strong> <span className="break-all">{collaboraUrl || text('Worker default')}</span></div>
              </div>
            </div>
          </div>
        )}
      </main>

      {shareOpen && <OfficeShareModal doc={currentDocument} onClose={() => setShareOpen(false)} />}
    </div>
  );
}