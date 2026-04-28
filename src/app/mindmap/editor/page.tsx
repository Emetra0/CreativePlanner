import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, X, Share2, User, FileImage, Lightbulb, Clock, Users } from 'lucide-react';
import { useStore, type MindmapCollabOp } from '@/store/useStore';
import { sanitizeMindmapData, useMindmapStore } from '@/store/useMindmapStore';
import { useMindmapCollabStore } from '@/store/useMindmapCollabStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { getWorkerUrl } from '@/lib/cloudSync';
import MindMap from '@/components/MindMap';
import { MindmapCollaboratorAvatar } from '@/components/MindmapNodePresence';
import SaveTemplateModal from '@/components/SaveTemplateModal';
import MindmapShareModal from '@/components/MindmapShareModal';
import ProjectTeamSidebar from '@/components/ProjectTeamSidebar';
import { useAppTranslation } from '@/lib/appTranslations';

function formatLastUpdated(ts: number | undefined, locale: string, text: (value: string) => string): string {
  if (!ts) return '';
  const diff = Date.now() - ts;

  if (diff < 60_000) return text('just now');

  const relativeTime = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 3_600_000) return relativeTime.format(-Math.floor(diff / 60_000), 'minute');
  if (diff < 86_400_000) return relativeTime.format(-Math.floor(diff / 3_600_000), 'hour');

  const d = new Date(ts);
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }).format(d);
}

function MindmapEditorInner() {
  const { text, language } = useAppTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const documentId = searchParams.get('id');

  const { nodes, edges, categories, mindMapTheme } = useStore();
  const { setMindMapState } = useStore();
  const { loadMindmapData, saveMindmapData, documents, fetchSharedDocumentSnapshot, importDocumentsFromSync } = useMindmapStore();
  const { participants, localSelectedNodeIds, localEditingNodeIds, setParticipants, reset: resetCollabState } = useMindmapCollabStore();
  const { projects, projectResources, fetchProjects, fetchProjectResources, openProject, openProjectById, updateMember } = useProjectStore();
  const { token, user } = useAuthStore();

  const [loaded, setLoaded] = useState(false);
  const [docTitle, setDocTitle] = useState(text('Mindmap'));
  const [showShare, setShowShare] = useState(false);
  const [saveTemplateData, setSaveTemplateData] = useState<{ nodes: any[]; edges: any[]; categories: any[] } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTeamSidebar, setShowTeamSidebar] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<'idle' | 'syncing'>('idle');
  const [liveConnected, setLiveConnected] = useState(false);

  // Current doc metadata for owner / last-editor display
  const currentDoc = documents.find((d) => d.id === documentId);
  const linkedProject = documentId
    ? projects.find((project) => (projectResources[project.id] || []).some((resource) => resource.resource_type === 'mindmap' && resource.resource_id === documentId))
    : null;
  const projectDetail = linkedProject && openProject?.id === linkedProject.id ? openProject : null;
  const activeCollaborators = participants;
  const canEditShared = !linkedProject || linkedProject.is_owner || !!linkedProject.my_is_page_admin || linkedProject.my_permission === 'edit';
  const canShareShared = !linkedProject || linkedProject.is_owner || !!linkedProject.my_is_page_admin || !!linkedProject.my_can_share;
  const teamMembers = projectDetail ? [
    {
      id: '__owner__',
      project_id: projectDetail.id,
      user_id: projectDetail.owner_id,
      username: projectDetail.owner_username,
      role: 'Owner',
      permission: 'edit',
      joined_at: projectDetail.created_at,
      clearance_level: 999,
      is_page_admin: 1,
      can_share: 1,
      can_create_nodes: 1,
      presence: (projectDetail as any).owner_presence || (projectDetail.owner_id === user?.id ? user?.presence : null),
      avatar_url: (projectDetail as any).owner_avatar_url || null,
      banner_color: (projectDetail as any).owner_banner_color || null,
      isOwner: true,
    },
    ...projectDetail.members.map((member) => ({ ...member, isOwner: false })),
  ] : [];
  const stateSignature = JSON.stringify({ nodes, edges, categories, theme: mindMapTheme });
  const stateSignatureRef = useRef(stateSignature);
  const pendingLocalChangesRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const skipNextLiveSnapshotRef = useRef(false);
  const lastAppliedRemoteRef = useRef<string>('');
  const lastSentLiveRef = useRef<string>('');
  const liveSocketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(crypto.randomUUID());

  // Moodboard documents available for import
  const moodboardDocs = documents.filter((d) => d.type === 'moodboard');

  useEffect(() => {
    stateSignatureRef.current = stateSignature;
  }, [stateSignature]);

  useEffect(() => {
    if (!currentDoc?.title) {
      setDocTitle(text('Mindmap'));
    }
  }, [currentDoc?.title, text]);

  useEffect(() => {
    if (documentId && linkedProject) return;
    resetCollabState();
  }, [documentId, linkedProject, resetCollabState]);

  useEffect(() => {
    if (!documentId || !linkedProject || !canEditShared) {
      useStore.getState().setCollabEmitter(null);
      return;
    }

    useStore.getState().setCollabEmitter((op: MindmapCollabOp) => {
      const socket = liveSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: 'op', clientId: clientIdRef.current, op }));
    });

    return () => {
      useStore.getState().setCollabEmitter(null);
    };
  }, [documentId, linkedProject, canEditShared]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (!projects.length) return;
    for (const project of projects) {
      if (!projectResources[project.id]) fetchProjectResources(project.id);
    }
  }, [projects, projectResources, fetchProjectResources]);

  useEffect(() => {
    if (!linkedProject?.id) return;
    void openProjectById(linkedProject.id);
  }, [linkedProject?.id, openProjectById]);

  const handleImportMoodboard = async (mbId: string, mbTitle: string) => {
    setShowImportModal(false);
    const data = await loadMindmapData(mbId);
    if (!data) return;

    const groupId = `group_mb_${Date.now()}`;
    const COLS = 3;
    const COL_W = 280, ROW_H = 340;
    const PADDING = 24;
    const mbNodes = (data.nodes as any[]).filter((n) => n.type === 'moodboardNode');
    const cols = Math.min(mbNodes.length, COLS);
    const rows = Math.ceil(mbNodes.length / COLS);
    const groupW = cols * COL_W + PADDING * 2;
    const groupH = rows * ROW_H + PADDING * 2 + 36; // +36 for group header

    const ORIGIN_X = 240, ORIGIN_Y = 120;

    const groupNode: any = {
      id: groupId,
      type: 'groupNode',
      position: { x: ORIGIN_X, y: ORIGIN_Y },
      style: { width: groupW, height: groupH },
      data: { label: mbTitle, color: '#a78bfa' },
    };

    // Place moodboardNode nodes freely inside the group's visual area (no parentNode)
    const childNodes: any[] = mbNodes.map((n, i) => ({
      id: `mb_img_${i}_${Date.now()}`,
      type: 'moodboardNode',
      position: {
        x: ORIGIN_X + PADDING + (i % COLS) * COL_W,
        y: ORIGIN_Y + PADDING + 36 + Math.floor(i / COLS) * ROW_H,
      },
      data: {
        imageUrl: n.data?.imageUrl || '',
        caption: n.data?.caption || '',
      },
    }));

    setMindMapState([...nodes, groupNode, ...childNodes], edges, categories);
  };

  // Load document data on mount
  useEffect(() => {
    if (!documentId) return;

    const load = async () => {
      const data = await loadMindmapData(documentId);
      if (data) {
        setMindMapState(data.nodes, data.edges, data.categories, data.theme);
        lastAppliedRemoteRef.current = JSON.stringify(data);
        lastSentLiveRef.current = JSON.stringify(data);
      }
      setLoaded(true);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // Update title from documents list
  useEffect(() => {
    if (!documentId) return;
    const doc = documents.find((d) => d.id === documentId);
    if (doc) {
      setDocTitle(doc.title);
      document.title = `${doc.title} — Mindmap`;
    }
    return () => { document.title = 'Creative Planner'; };
  }, [documentId, documents]);

  // Autosave — debounced 2 seconds after any change
  useEffect(() => {
    if (!documentId || !loaded || !canEditShared) return;

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    pendingLocalChangesRef.current = true;

    const timer = setTimeout(() => {
      setRemoteStatus(linkedProject ? 'syncing' : 'idle');
      void saveMindmapData(documentId, { nodes, edges, categories, theme: mindMapTheme }, { skipRemoteSync: !!linkedProject && liveConnected }).finally(() => {
        pendingLocalChangesRef.current = false;
        lastAppliedRemoteRef.current = JSON.stringify({ nodes, edges, categories, theme: mindMapTheme });
        setRemoteStatus('idle');
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [nodes, edges, categories, mindMapTheme, documentId, loaded, saveMindmapData, canEditShared, linkedProject, liveConnected]);

  useEffect(() => {
    if (!documentId || !loaded || !linkedProject || !token) return;

    const baseUrl = getWorkerUrl();
    const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/projects/${linkedProject.id}/resources/${documentId}/live?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientIdRef.current)}`;
    const socket = new WebSocket(wsUrl);
    liveSocketRef.current = socket;

    socket.onopen = () => {
      setLiveConnected(true);
      setRemoteStatus('idle');
      socket.send(JSON.stringify({ type: 'presence', clientId: clientIdRef.current, selectedNodeIds: localSelectedNodeIds, editingNodeIds: localEditingNodeIds }));
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'presence') {
          setParticipants(Array.isArray(message.participants) ? message.participants : []);
          return;
        }
        if (message.type === 'op') {
          if (message.clientId === clientIdRef.current || !message.op) return;
          skipNextSaveRef.current = true;
          skipNextLiveSnapshotRef.current = true;
          setRemoteStatus('syncing');
          useStore.getState().applyCollabOperation(message.op);
          lastAppliedRemoteRef.current = JSON.stringify({
            nodes: useStore.getState().nodes,
            edges: useStore.getState().edges,
            categories: useStore.getState().categories,
            theme: useStore.getState().mindMapTheme,
          });
          window.setTimeout(() => setRemoteStatus('idle'), 120);
          return;
        }
        if (message.type !== 'init' && message.type !== 'snapshot') return;
        if (message.type === 'snapshot' && message.clientId === clientIdRef.current) return;
        if (Array.isArray(message.participants)) setParticipants(message.participants);

        const snapshot = message.snapshot;
        if (!snapshot?.document || !snapshot?.data) return;

        const remoteSignature = JSON.stringify(snapshot.data);
        if (remoteSignature === lastAppliedRemoteRef.current || remoteSignature === stateSignatureRef.current) return;

        skipNextSaveRef.current = true;
        skipNextLiveSnapshotRef.current = true;
        setRemoteStatus('syncing');
        await importDocumentsFromSync({
          documents: [snapshot.document],
          dataById: { [snapshot.document.id]: snapshot.data },
        }, { preferIncoming: true });
        setMindMapState(snapshot.data.nodes, snapshot.data.edges, snapshot.data.categories, snapshot.data.theme);
        lastAppliedRemoteRef.current = remoteSignature;
        lastSentLiveRef.current = remoteSignature;
        window.setTimeout(() => setRemoteStatus('idle'), 120);
      } catch {
        // Ignore malformed frames and keep the fallback polling below.
      }
    };

    socket.onclose = () => {
      if (liveSocketRef.current === socket) liveSocketRef.current = null;
      setLiveConnected(false);
      setParticipants([]);
    };
    socket.onerror = () => {
      setLiveConnected(false);
      setParticipants([]);
    };

    return () => {
      if (liveSocketRef.current === socket) liveSocketRef.current = null;
      setLiveConnected(false);
      setParticipants([]);
      socket.close();
    };
  }, [documentId, linkedProject?.id, loaded, token, importDocumentsFromSync, setMindMapState, setParticipants]);

  useEffect(() => {
    if (!documentId || !loaded || !linkedProject || !liveConnected) return;
    const socket = liveSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'presence', clientId: clientIdRef.current, selectedNodeIds: localSelectedNodeIds, editingNodeIds: localEditingNodeIds }));
  }, [documentId, loaded, linkedProject, liveConnected, localEditingNodeIds, localSelectedNodeIds]);

  useEffect(() => {
    if (!documentId || !loaded || !linkedProject || !canEditShared || !liveConnected) return;
    const socket = liveSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (skipNextLiveSnapshotRef.current) {
      skipNextLiveSnapshotRef.current = false;
      return;
    }

    const snapshotData = sanitizeMindmapData({ nodes, edges, categories, theme: mindMapTheme });
    const snapshot = {
      document: {
        ...(currentDoc || { id: documentId, title: docTitle }),
        id: documentId,
        title: docTitle,
        lastModified: Date.now(),
        lastEditedBy: user?.username || user?.email || currentDoc?.lastEditedBy,
      },
      data: snapshotData,
    };
    const payloadSignature = JSON.stringify(snapshot.data);
    if (payloadSignature === lastSentLiveRef.current) return;

    const timer = window.setTimeout(() => {
      const activeSocket = liveSocketRef.current;
      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
      activeSocket.send(JSON.stringify({ type: 'sync', clientId: clientIdRef.current, snapshot }));
      lastSentLiveRef.current = payloadSignature;
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [documentId, loaded, linkedProject?.id, canEditShared, liveConnected, currentDoc, docTitle, user?.username, user?.email, nodes, edges, categories, mindMapTheme]);

  useEffect(() => {
    if (!documentId || !loaded || !linkedProject || liveConnected) return;

    const poll = window.setInterval(async () => {
      if (pendingLocalChangesRef.current && canEditShared) return;

      const snapshot = await fetchSharedDocumentSnapshot(linkedProject.id, documentId);
      if (!snapshot) return;

      const remoteSignature = JSON.stringify(snapshot.data);
      if (remoteSignature === lastAppliedRemoteRef.current || remoteSignature === stateSignatureRef.current) return;

      skipNextSaveRef.current = true;
      skipNextLiveSnapshotRef.current = true;
      setRemoteStatus('syncing');
      setMindMapState(snapshot.data.nodes, snapshot.data.edges, snapshot.data.categories, snapshot.data.theme);
      lastAppliedRemoteRef.current = remoteSignature;
      window.setTimeout(() => setRemoteStatus('idle'), 150);
    }, 1200);

    return () => window.clearInterval(poll);
  }, [documentId, loaded, linkedProject, fetchSharedDocumentSnapshot, setMindMapState, canEditShared, liveConnected]);

  // Prevent middle-click autoscroll
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, []);

  if (!documentId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        {text('No mindmap selected.')}{' '}
        <button className="ml-2 text-yellow-600 underline" onClick={() => navigate('/mindmap')}>
          {text('Go back')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate('/mindmap')}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          title={text('Back to Mindmaps')}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <Lightbulb size={18} className="text-blue-500 dark:text-blue-400 shrink-0" />
            <h1 className="font-bold text-gray-800 dark:text-white text-sm truncate">{docTitle}</h1>
            <span className="shrink-0 text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-semibold">
              {text('Mindmap')}
            </span>
          </div>
          <span className="text-[11px] text-gray-400 pl-7 flex items-center gap-1 flex-wrap">
            {currentDoc?.createdBy && (
              <><User size={10} className="shrink-0" /> {currentDoc.createdBy}</>
            )}
            {currentDoc?.lastEditedBy && currentDoc.lastEditedBy !== currentDoc.createdBy && (
              <span> · {text('edited by')} <strong>{currentDoc.lastEditedBy}</strong></span>
            )}
            {currentDoc?.lastModified ? (
              <span className="flex items-center gap-0.5">
                {currentDoc.createdBy ? ' · ' : ''}<Clock size={9} className="shrink-0" /> {formatLastUpdated(currentDoc.lastModified, language, text)}
              </span>
            ) : null}
            {linkedProject && (
              <span className="text-blue-500"> · {remoteStatus === 'syncing' ? text('Syncing...') : liveConnected ? text('Live collaboration connected') : text('Shared project')}</span>
            )}
            {linkedProject && !canEditShared && (
              <span className="text-amber-500"> · {text('Read-only access')}</span>
            )}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {linkedProject && (
            <button
              onClick={() => setShowTeamSidebar(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700/70 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={text('Open the shared project team overview')}
            >
              <Users size={14} /> {text('Team')}
            </button>
          )}
          {linkedProject && activeCollaborators.length > 0 && (
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-2.5 py-1.5">
              <div className="flex -space-x-2">
                {activeCollaborators.slice(0, 5).map((participant) => (
                  <MindmapCollaboratorAvatar key={participant.userId} participant={participant} sizeClass="w-7 h-7" textClass="text-[9px]" />
                ))}
                {activeCollaborators.length > 5 && (
                  <span className="w-7 h-7 rounded-full bg-gray-800 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white dark:ring-gray-800">
                    +{activeCollaborators.length - 5}
                  </span>
                )}
              </div>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{activeCollaborators.length} {text('in this doc')}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[170px]">
                  {activeCollaborators.map((participant) => participant.username || participant.email || text('Collaborator')).join(', ')}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
            title={text('Import a moodboard as a group of nodes')}
          >
            <Download size={14} />
            {text('Import Moodboard')}
          </button>
          <button
            onClick={() => canShareShared && setShowShare(true)}
            disabled={!canShareShared}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            title={canShareShared ? text('Share this document') : text('Only the owner or page admins with share rights can invite collaborators')}
          >
            <Share2 size={14} /> {text('Share')}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <MindMap
          documentId={documentId}
          onSaveAsTemplate={(nodes, edges, categories) => setSaveTemplateData({ nodes, edges, categories })}
        />
      </div>

      {/* Import Moodboard Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-800 dark:text-white">{text('Import Moodboard as Group')}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{text('Each image becomes a node inside a group on your mindmap.')}</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            {moodboardDocs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                {text('No moodboards yet. Create one from the Mindmap list page.')}
              </p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {moodboardDocs.map((mb) => (
                  <li key={mb.id}>
                    <button
                      onClick={() => handleImportMoodboard(mb.id, mb.title)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/30 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all"
                    >
                      <FileImage size={18} className="text-purple-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-white">{mb.title}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{text('Moodboard')}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {saveTemplateData && (
        <SaveTemplateModal
          isOpen={!!saveTemplateData}
          onClose={() => setSaveTemplateData(null)}
          onSave={(name: string, description: string, category: 'general' | 'planning' | 'analysis' | 'story' | 'personal' | 'custom') => {
            useMindmapStore.getState().saveAsTemplate(name, description, category, saveTemplateData);
            setSaveTemplateData(null);
          }}
        />
      )}

      {showShare && documentId && (
        <MindmapShareModal
          doc={{ id: documentId, title: docTitle }}
          onClose={() => setShowShare(false)}
        />
      )}

      {linkedProject && projectDetail && (
        <ProjectTeamSidebar
          isOpen={showTeamSidebar}
          onClose={() => setShowTeamSidebar(false)}
          project={linkedProject}
          members={teamMembers}
          currentUserId={user?.id}
          activeParticipantIds={activeCollaborators.map((participant) => participant.userId)}
          canManageRoles={!!projectDetail.is_owner}
          onSaveMember={async (member, role, permission, capabilities) => {
            if (!projectDetail || member.isOwner) return;
            await updateMember(projectDetail.id, member.id, role, permission, capabilities);
            await openProjectById(projectDetail.id);
          }}
        />
      )}
    </div>
  );
}

export default function MindmapEditorPage() {
  const { text } = useAppTranslation();
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-400">{text('Loading...')}</div>}>
      <MindmapEditorInner />
    </Suspense>
  );
}
